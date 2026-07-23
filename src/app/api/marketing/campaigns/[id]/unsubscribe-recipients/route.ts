import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { UNSUBSCRIBE_URL_MARKER } from '@/lib/campaign-recipients'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

// Suppresses recipients from future campaigns (see the EmailUnsubscribe check
// in marketing.ts's audience resolver). Two distinct cases that must NOT be
// conflated:
// 1. They clicked the unsubscribe link themselves but the status update never
//    landed (mail client's native one-click button silently failed - see the
//    unsubscribe API route) - this is a real unsubscribe, so status flips to
//    SKIPPED_UNSUBSCRIBED and they move to the Unsubscribed tab.
// 2. A hard bounce/failed send - WE are suppressing them, they never asked to
//    unsubscribe, so status and tab stay BOUNCED/FAILED. Only the global
//    EmailUnsubscribe suppression list is touched, so a future campaign skips
//    them without this campaign's history misrepresenting it as a real opt-out.
// Body is `{ recipientIds }` for specific rows (status change is decided per
// row based on whether it actually has an unsubscribe-link click), or
// `{ scope }` to sweep the whole campaign regardless of which page is loaded.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { recipientIds, scope } = await req.json()

  let recipients: { id: string; email: string; hasUnsubscribeClick: boolean }[]
  if (scope === 'clicked') {
    const rows = await db.campaignRecipient.findMany({
      where: { campaignId: id, status: { not: 'SKIPPED_UNSUBSCRIBED' }, clicks: { some: { url: { contains: UNSUBSCRIBE_URL_MARKER } } } },
      select: { id: true, email: true },
    })
    recipients = rows.map(r => ({ ...r, hasUnsubscribeClick: true }))
  } else if (scope === 'bounced' || scope === 'failed') {
    const rows = await db.campaignRecipient.findMany({
      where: { campaignId: id, status: scope === 'bounced' ? 'BOUNCED' : 'FAILED' },
      select: { id: true, email: true },
    })
    recipients = rows.map(r => ({ ...r, hasUnsubscribeClick: false }))
  } else {
    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
      return NextResponse.json({ error: 'recipientIds required' }, { status: 400 })
    }
    const rows = await db.campaignRecipient.findMany({
      where: { id: { in: recipientIds }, campaignId: id, status: { not: 'SKIPPED_UNSUBSCRIBED' } },
      select: { id: true, email: true, clicks: { select: { url: true } } },
    })
    recipients = rows.map(r => ({ id: r.id, email: r.email, hasUnsubscribeClick: r.clicks.some(c => c.url.includes(UNSUBSCRIBE_URL_MARKER)) }))
  }

  if (recipients.length === 0) return NextResponse.json({ unsubscribed: 0 })

  const clickBased = recipients.filter(r => r.hasUnsubscribeClick)
  if (clickBased.length > 0) {
    await db.campaignRecipient.updateMany({
      where: { id: { in: clickBased.map(r => r.id) } },
      data: { status: 'SKIPPED_UNSUBSCRIBED', unsubscribedAt: new Date() },
    })
  }
  // Everyone gets suppressed from future sends regardless of the click check
  // above - only the CampaignRecipient status/tab is gated on it.
  await Promise.all(recipients.map(r =>
    db.emailUnsubscribe.upsert({ where: { email: r.email }, update: {}, create: { email: r.email, campaignId: id } })
  ))

  return NextResponse.json({ unsubscribed: recipients.length })
}
