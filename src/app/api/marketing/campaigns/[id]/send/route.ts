import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { prepareCampaignSend, dispatchCampaignEmails } from '@/lib/marketing'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { logActivity } from '@/lib/activity'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const tenantId = (session.user as { tenantId?: string }).tenantId ?? ''
  const apiKey = await getTenantSecret(tenantId, 'resendApiKey')
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const campaign = await db.emailCampaign.findUnique({ where: { id } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (campaign.status === 'SENT' || campaign.status === 'SENDING') {
    return NextResponse.json({ error: 'Campaign already sent' }, { status: 409 })
  }

  const { scheduledAt } = await req.json().catch(() => ({ scheduledAt: undefined }))

  if (scheduledAt && new Date(scheduledAt).getTime() > Date.now()) {
    const updated = await db.emailCampaign.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduledAt: new Date(scheduledAt) },
    })
    return NextResponse.json({ ok: true, scheduled: true, campaign: updated })
  }

  let prepared: { totalRecipients: number }
  try {
    prepared = await prepareCampaignSend(db, id, apiKey)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Send failed' }, { status: 500 })
  }

  // Dispatch (the slow, rate-limited part) runs in the background — don't hold the
  // response open for it. This process is a long-running standalone Node server
  // (not a short-lived serverless function), so the promise keeps executing after
  // the response is flushed.
  dispatchCampaignEmails(db, id, apiKey).catch(async err => {
    await db.emailCampaign.update({ where: { id }, data: { status: 'FAILED', errorMessage: err?.message ?? 'Send failed' } }).catch(() => {})
  })

  const result = await db.emailCampaign.findUnique({ where: { id } })

  logActivity({
    userId: session!.user.id,
    userName: session!.user.name ?? session!.user.email ?? 'Unknown',
    userRole: role,
    action: 'SEND', entity: 'EmailCampaign', entityId: id,
    detail: `Start sending campaign: ${result?.name} (${prepared.totalRecipients} recipients)`,
  }, db).catch(() => {})

  return NextResponse.json({ ok: true, campaign: result })
}
