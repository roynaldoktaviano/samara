import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

// Manual recovery action for the "clicked unsubscribe but never got marked"
// list on the campaign detail page — lets staff push through recipients whose
// one-click unsubscribe silently failed (see marketing.ts) without waiting on
// them to click the link again.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { recipientIds } = await req.json()
  if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
    return NextResponse.json({ error: 'recipientIds required' }, { status: 400 })
  }

  const recipients = await db.campaignRecipient.findMany({
    where: { id: { in: recipientIds }, campaignId: id, status: { not: 'SKIPPED_UNSUBSCRIBED' } },
    select: { id: true, email: true },
  })
  if (recipients.length === 0) return NextResponse.json({ unsubscribed: 0 })

  await db.campaignRecipient.updateMany({
    where: { id: { in: recipients.map(r => r.id) } },
    data: { status: 'SKIPPED_UNSUBSCRIBED', unsubscribedAt: new Date() },
  })
  await Promise.all(recipients.map(r =>
    db.emailUnsubscribe.upsert({ where: { email: r.email }, update: {}, create: { email: r.email, campaignId: id } })
  ))

  return NextResponse.json({ unsubscribed: recipients.length })
}
