import type { Prisma } from '@prisma/client'

// Recipient table tabs — 'OPENED' is a subset of SENT (status stays SENT once
// opened; openedAt is what actually flags it), not its own recipient status.
export type RecipientTab = 'ALL' | 'SENT' | 'OPENED' | 'PENDING' | 'BOUNCED' | 'FAILED' | 'UNSUBSCRIBED'

// Resend wraps every <a> in the email for click tracking, including the
// unsubscribe link itself — so a click here is a real signal of unsubscribe
// intent, independent of whether the actual status update went through (e.g.
// mail clients' native one-click button, before that flow accepted it — see
// marketing.ts / the unsubscribe API route).
export const UNSUBSCRIBE_URL_MARKER = '/unsubscribe?token='

export function whereForTab(campaignId: string, tab: RecipientTab, search: string): Prisma.CampaignRecipientWhereInput {
  const base: Prisma.CampaignRecipientWhereInput = { campaignId }
  if (search) base.email = { contains: search, mode: 'insensitive' }
  switch (tab) {
    case 'SENT': return { ...base, status: 'SENT' }
    case 'OPENED': return { ...base, status: 'SENT', openedAt: { not: null } }
    case 'PENDING': return { ...base, status: 'PENDING' }
    case 'BOUNCED': return { ...base, status: 'BOUNCED' }
    case 'FAILED': return { ...base, status: 'FAILED' }
    // Confirmed unsubscribes, plus anyone who clicked the unsubscribe link but
    // whose status update never landed — surfaced here so staff can review and
    // confirm them manually instead of the click silently going nowhere.
    case 'UNSUBSCRIBED': return {
      ...base,
      OR: [
        { status: 'SKIPPED_UNSUBSCRIBED' },
        { clicks: { some: { url: { contains: UNSUBSCRIBE_URL_MARKER } } } },
      ],
    }
    default: return base
  }
}

// Newest-first by whatever's most relevant to the tab being viewed — most
// recent opens when reviewing engagement, most recent sends otherwise.
export function orderByForTab(tab: RecipientTab): Prisma.CampaignRecipientOrderByWithRelationInput[] {
  if (tab === 'OPENED') return [{ openedAt: 'desc' }, { createdAt: 'desc' }]
  // Unconfirmed clicks (unsubscribedAt still null) surface above confirmed
  // unsubscribes so staff see what still needs action first.
  if (tab === 'UNSUBSCRIBED') return [{ unsubscribedAt: { sort: 'desc', nulls: 'first' } }, { sentAt: 'desc' }]
  return [{ sentAt: 'desc' }, { createdAt: 'desc' }]
}

/**
 * Heuristic flag for automated engagement — corporate email-security scanners
 * (Microsoft Safe Links, Proofpoint, Mimecast, etc.) pre-fetch every link in an
 * email within seconds of delivery, before a human ever sees it. A real person
 * clicking several unrelated links back-to-back that fast is rare, so: 2+
 * clicks landing within a 30-second window are flagged as likely automated.
 * Not exact — a genuinely fast human could get flagged, a slower bot could
 * slip through — but it's a useful signal to separate raw vs. real engagement.
 */
export function isLikelyAutomated(clicks: { clickedAt: Date }[]): boolean {
  if (clicks.length < 2) return false
  const times = clicks.map(c => c.clickedAt.getTime()).sort((a, b) => a - b)
  return times[times.length - 1] - times[0] <= 30_000
}
