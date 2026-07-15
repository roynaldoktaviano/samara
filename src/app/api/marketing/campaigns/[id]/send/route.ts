import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { sendCampaign } from '@/lib/marketing'
import { logActivity } from '@/lib/activity'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  if (!process.env.RESEND_API_KEY) {
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

  try {
    await sendCampaign(db, id)
  } catch (err: any) {
    await db.emailCampaign.update({ where: { id }, data: { status: 'FAILED', errorMessage: err?.message ?? 'Send failed' } })
    return NextResponse.json({ error: err?.message ?? 'Send failed' }, { status: 500 })
  }

  const result = await db.emailCampaign.findUnique({ where: { id } })

  logActivity({
    userId: session!.user.id,
    userName: session!.user.name ?? session!.user.email ?? 'Unknown',
    userRole: role,
    action: 'SEND', entity: 'EmailCampaign', entityId: id,
    detail: `Send campaign: ${result?.name} (${result?.sentCount} sent, ${result?.failedCount} failed)`,
  }, db).catch(() => {})

  return NextResponse.json({ ok: true, campaign: result })
}
