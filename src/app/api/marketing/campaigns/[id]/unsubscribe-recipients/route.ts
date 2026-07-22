import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { UNSUBSCRIBE_URL_MARKER } from '@/lib/campaign-recipients'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

// Marks recipients unsubscribed so future campaigns skip them (see the
// EmailUnsubscribe check in marketing.ts's audience resolver). Two uses:
// 1. Recovery for "clicked unsubscribe but never got marked" — the mail
//    client's native one-click button silently failed before that flow
//    accepted it (see the unsubscribe API route).
// 2. Suppressing hard bounces/failed sends, which should never be retried on
//    a future blast regardless of whether anyone clicked anything.
// Body is `{ recipientIds }` for specific rows, or `{ scope }` to sweep the
// whole campaign regardless of which page is currently loaded — 'clicked' for
// case 1, 'bounced'/'failed' for case 2.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { recipientIds, scope } = await req.json()

  let recipients: { id: string; email: string }[]
  if (scope === 'clicked') {
    recipients = await db.campaignRecipient.findMany({
      where: { campaignId: id, status: { not: 'SKIPPED_UNSUBSCRIBED' }, clicks: { some: { url: { contains: UNSUBSCRIBE_URL_MARKER } } } },
      select: { id: true, email: true },
    })
  } else if (scope === 'bounced' || scope === 'failed') {
    recipients = await db.campaignRecipient.findMany({
      where: { campaignId: id, status: scope === 'bounced' ? 'BOUNCED' : 'FAILED' },
      select: { id: true, email: true },
    })
  } else {
    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
      return NextResponse.json({ error: 'recipientIds required' }, { status: 400 })
    }
    recipients = await db.campaignRecipient.findMany({
      where: { id: { in: recipientIds }, campaignId: id, status: { not: 'SKIPPED_UNSUBSCRIBED' } },
      select: { id: true, email: true },
    })
  }

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
