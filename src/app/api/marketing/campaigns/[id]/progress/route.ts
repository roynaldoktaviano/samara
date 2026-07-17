import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

// Lightweight polling endpoint for the "sending in progress" UI — returns counts only
// (not the recipient rows themselves), so it stays cheap to poll every few seconds
// regardless of audience size.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const campaign = await db.emailCampaign.findUnique({ where: { id }, select: { status: true, updatedAt: true } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [total, sent, failed] = await Promise.all([
    db.campaignRecipient.count({ where: { campaignId: id } }),
    db.campaignRecipient.count({ where: { campaignId: id, status: 'SENT' } }),
    db.campaignRecipient.count({ where: { campaignId: id, status: 'FAILED' } }),
  ])

  return NextResponse.json({
    status: campaign.status,
    startedAt: campaign.updatedAt,
    total,
    sent,
    failed,
    done: sent + failed,
  })
}
