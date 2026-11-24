import type { PrismaClient } from '@prisma/client'
import { renderBlocksToHtml, injectUnsubscribeUrl, injectPreviewText, type EmailBlock } from '@/lib/email-builder'
import { sendBulkEmail } from '@/lib/resend-mailer'
import { leadWebsiteWhere } from '@/lib/lead-website'

export interface CustomerConditions {
  yachtIds?: string[] // guest has at least one booking on ANY of these yachts (OR)
  minSpend?: number // guest's total confirmed-payment amount (USD) is at least this
}

export interface AudienceSourceFilter {
  search?: string
  yachtId?: string // customers only — restricts to guests with a booking on this yacht (legacy single-select, still used by the per-person picker's boat filter)
  conditions?: CustomerConditions // customers only — rule-based membership, independent of the per-person picker
  websites?: string[] // leads only — lead has at least one inquiry submitted from ANY of these sites (Inquiry.website)
  excludeIds?: string[] // individually unchecked in the per-person picker
}

export interface AudienceSources {
  customers?: AudienceSourceFilter | boolean
  leads?: AudienceSourceFilter | boolean
  agents?: AudienceSourceFilter | boolean
  agentLeads?: AudienceSourceFilter | boolean
  internal?: AudienceSourceFilter | boolean
  manualEmails?: string[]
  /** Drop anyone (by email, across ALL sources) who booked / got a payment requested
   * in the CURRENT calendar month — resolved at preview AND send time, so the month
   * rolls over automatically. See guestsBookedThisMonth. */
  excludeBookedThisMonth?: boolean
  /** Fixed months ("YYYY-MM", WITA) to exclude bookers of — on top of / instead of the
   * rolling current month above. */
  excludeBookedMonths?: string[]
}

export interface AudienceMember {
  email: string
  name: string | null
  sourceType: 'CUSTOMER' | 'LEAD' | 'AGENT' | 'AGENT_LEAD_CONTACT' | 'INTERNAL' | 'MANUAL'
  sourceId: string | null
}

// Payment.amount is always stored in USD (currency/exchangeRate are display-only
// metadata for invoice printing — see the comment in /api/payments POST), so this
// is a plain sum, no currency conversion needed. Only 'confirmed' payments count —
// a requested/pending/rejected payment isn't money actually received.
async function customerIdsWithMinSpend(db: PrismaClient, minSpend: number): Promise<string[]> {
  const payments = await db.payment.findMany({
    where: { status: 'confirmed' },
    select: { amount: true, booking: { select: { customerId: true } } },
  })
  const totals = new Map<string, number>()
  for (const p of payments) {
    totals.set(p.booking.customerId, (totals.get(p.booking.customerId) ?? 0) + p.amount)
  }
  return [...totals.entries()].filter(([, amount]) => amount >= minSpend).map(([customerId]) => customerId)
}

// Company runs on Bali time (WITA, UTC+8) — month boundaries follow that, not the server's UTC clock.
const MONTH_TZ_OFFSET_H = 8

function monthRangeFor(y: number, m: number): { start: Date; end: Date; label: string; key: string } {
  const start = new Date(Date.UTC(y, m, 1) - MONTH_TZ_OFFSET_H * 3600_000)
  const end = new Date(Date.UTC(y, m + 1, 1) - MONTH_TZ_OFFSET_H * 3600_000)
  const label = new Date(Date.UTC(y, m, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const key = `${y}-${String(m + 1).padStart(2, '0')}`
  return { start, end, label, key }
}

export function currentMonthRange(now = new Date()): { start: Date; end: Date; label: string; key: string } {
  const local = new Date(now.getTime() + MONTH_TZ_OFFSET_H * 3600_000)
  return monthRangeFor(local.getUTCFullYear(), local.getUTCMonth())
}

/** "YYYY-MM" → WITA month range, null if malformed. */
export function monthRangeFromKey(key: string): { start: Date; end: Date; label: string; key: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return null
  const month = Number(m[2]) - 1
  if (month < 0 || month > 11) return null
  return monthRangeFor(Number(m[1]), month)
}

export interface BookedThisMonthGuest {
  customerId: string
  name: string | null
  email: string
  reason: string // e.g. "Booking confirmed · 12 Nov" / "Payment requested · 15 Nov"
  at: string // ISO of the triggering event
}

const BOOKED_STATUSES = ['confirmed', 'partially_paid', 'fully_paid', 'completed'] as const
const LIVE_PAYMENT_STATUSES = ['requested', 'invoice_ready', 'pending_confirmation', 'confirmed'] as const

/**
 * Guests who already committed this month — a booking created this month that's at
 * least confirmed, OR any (non-rejected/cancelled) payment requested this month on
 * one of their bookings. Marketing doesn't want to pitch them again right after.
 */
export async function guestsBookedThisMonth(db: PrismaClient, now = new Date()): Promise<{ label: string; guests: BookedThisMonthGuest[] }> {
  return guestsBookedInMonths(db, { current: true }, now)
}

/** Same rule as guestsBookedThisMonth (plus: a confirmed+ booking whose trip starts in the month), over the rolling current month and/or fixed "YYYY-MM" months. */
export async function guestsBookedInMonths(
  db: PrismaClient,
  opts: { current?: boolean; months?: string[] },
  now = new Date(),
): Promise<{ label: string; guests: BookedThisMonthGuest[] }> {
  const ranges = new Map<string, { start: Date; end: Date; label: string }>()
  if (opts.current) { const r = currentMonthRange(now); ranges.set(r.key, r) }
  for (const k of opts.months ?? []) { const r = monthRangeFromKey(k); if (r) ranges.set(r.key, r) }
  const sorted = [...ranges.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([, r]) => r)
  const label = sorted.map(r => r.label).join(', ')
  if (sorted.length === 0) return { label, guests: [] }

  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: sorted.length > 1 ? 'numeric' : undefined, timeZone: 'Asia/Makassar' })
  const inRanges = { OR: sorted.map(r => ({ createdAt: { gte: r.start, lt: r.end } })) }

  // Trip date in the month — a guest sailing in December shouldn't get a December pitch
  // even if they booked months earlier.
  const tripInRanges = { OR: sorted.map(r => ({ startDate: { gte: r.start, lt: r.end } })) }

  const [bookings, payments, trips] = await Promise.all([
    db.booking.findMany({
      where: { ...inRanges, status: { in: [...BOOKED_STATUSES] } },
      select: { createdAt: true, status: true, customer: { select: { id: true, name: true, email: true } } },
    }),
    db.payment.findMany({
      where: { ...inRanges, status: { in: [...LIVE_PAYMENT_STATUSES] } },
      select: { createdAt: true, booking: { select: { customer: { select: { id: true, name: true, email: true } } } } },
    }),
    db.booking.findMany({
      where: { ...tripInRanges, status: { in: [...BOOKED_STATUSES] } },
      select: { startDate: true, customer: { select: { id: true, name: true, email: true } } },
    }),
  ])

  const byId = new Map<string, BookedThisMonthGuest>()
  const add = (c: { id: string; name: string | null; email: string | null }, reason: string, at: Date) => {
    if (!c.email || !c.email.includes('@')) return
    const prev = byId.get(c.id)
    // keep the earliest trigger in the month — that's when they "converted"
    if (!prev || new Date(prev.at) > at) byId.set(c.id, { customerId: c.id, name: c.name, email: c.email, reason: `${reason} · ${fmt(at)}`, at: at.toISOString() })
  }
  for (const b of bookings) add(b.customer, 'Booking confirmed', b.createdAt)
  for (const p of payments) add(p.booking.customer, 'Payment requested', p.createdAt)
  for (const t of trips) add(t.customer, 'Trip', t.startDate)

  const guests = [...byId.values()].sort((a, b) => b.at.localeCompare(a.at))
  return { label, guests }
}

/**
 * Resolves an audience spec into a deduplicated recipient list, excluding
 * anyone on the tenant's unsubscribe suppression list. First match wins on
 * duplicate emails across sources (customers > leads > agents > agent leads > manual).
 */
export async function resolveAudience(db: PrismaClient, sources: AudienceSources): Promise<AudienceMember[]> {
  const byEmail = new Map<string, AudienceMember>()

  const asFilter = (v: AudienceSourceFilter | boolean | undefined): AudienceSourceFilter | null =>
    v === true ? {} : (v && typeof v === 'object') ? v : null

  const excludeSet = (ids?: string[]) => new Set(ids ?? [])

  const customerFilter = asFilter(sources.customers)
  if (customerFilter) {
    const excluded = excludeSet(customerFilter.excludeIds)
    // Only the actual lead/primary booker on a booking counts as a "Guest" subscriber —
    // companions a lead typed into the multi-guest form (see booking-form/[token]) never
    // opted in themselves, so they're excluded via BookingGuest.isLead.
    const where: Record<string, unknown> = { deletedAt: null, email: { not: null, contains: '@' }, guestOf: { some: { isLead: true } } }
    if (customerFilter.search) {
      where.OR = [
        { name: { contains: customerFilter.search, mode: 'insensitive' } },
        { email: { contains: customerFilter.search, mode: 'insensitive' } },
      ]
    }
    if (customerFilter.yachtId) where.bookings = { some: { yachtId: customerFilter.yachtId } }
    if (customerFilter.conditions?.yachtIds?.length) {
      where.bookings = { some: { yachtId: { in: customerFilter.conditions.yachtIds } } }
    }
    if (customerFilter.conditions?.minSpend) {
      where.id = { in: await customerIdsWithMinSpend(db, customerFilter.conditions.minSpend) }
    }
    const customers = await db.customer.findMany({ where, select: { id: true, name: true, email: true } })
    for (const c of customers) {
      if (c.email && !excluded.has(c.id) && !byEmail.has(c.email.toLowerCase())) {
        byEmail.set(c.email.toLowerCase(), { email: c.email, name: c.name, sourceType: 'CUSTOMER', sourceId: c.id })
      }
    }
  }

  const leadFilter = asFilter(sources.leads)
  if (leadFilter) {
    const excluded = excludeSet(leadFilter.excludeIds)
    const where: Record<string, unknown> = { deletedAt: null, email: { not: null, contains: '@' } }
    if (leadFilter.search) {
      where.OR = [
        { name: { contains: leadFilter.search, mode: 'insensitive' } },
        { email: { contains: leadFilter.search, mode: 'insensitive' } },
      ]
    }
    if (leadFilter.websites?.length) where.AND = [leadWebsiteWhere(leadFilter.websites)]
    const leads = await db.lead.findMany({ where, select: { id: true, name: true, email: true } })
    for (const l of leads) {
      if (l.email && !excluded.has(l.id) && !byEmail.has(l.email.toLowerCase())) {
        byEmail.set(l.email.toLowerCase(), { email: l.email, name: l.name, sourceType: 'LEAD', sourceId: l.id })
      }
    }
  }

  const agentFilter = asFilter(sources.agents)
  if (agentFilter) {
    const excluded = excludeSet(agentFilter.excludeIds)
    const where: Record<string, unknown> = { email: { not: null, contains: '@' } }
    if (agentFilter.search) {
      where.OR = [
        { name: { contains: agentFilter.search, mode: 'insensitive' } },
        { email: { contains: agentFilter.search, mode: 'insensitive' } },
      ]
    }
    const agents = await db.agent.findMany({ where, select: { id: true, name: true, email: true } })
    for (const a of agents) {
      if (a.email && !excluded.has(a.id) && !byEmail.has(a.email.toLowerCase())) {
        byEmail.set(a.email.toLowerCase(), { email: a.email, name: a.name, sourceType: 'AGENT', sourceId: a.id })
      }
    }
  }

  const agentLeadFilter = asFilter(sources.agentLeads)
  if (agentLeadFilter) {
    const excluded = excludeSet(agentLeadFilter.excludeIds)
    const where: Record<string, unknown> = { email: { not: null, contains: '@' } }
    if (agentLeadFilter.search) {
      where.OR = [
        { name: { contains: agentLeadFilter.search, mode: 'insensitive' } },
        { email: { contains: agentLeadFilter.search, mode: 'insensitive' } },
      ]
    }
    const contacts = await db.agentLeadContact.findMany({ where, select: { id: true, name: true, email: true } })
    for (const c of contacts) {
      if (c.email && !excluded.has(c.id) && !byEmail.has(c.email.toLowerCase())) {
        byEmail.set(c.email.toLowerCase(), { email: c.email, name: c.name, sourceType: 'AGENT_LEAD_CONTACT', sourceId: c.id })
      }
    }
  }

  // Internal staff (User) — e.g. an all-hands announcement. User.email is required
  // and unique, so no null/blank-email filtering needed here unlike the other sources.
  const internalFilter = asFilter(sources.internal)
  if (internalFilter) {
    const excluded = excludeSet(internalFilter.excludeIds)
    const where: Record<string, unknown> = {}
    if (internalFilter.search) {
      where.OR = [
        { name: { contains: internalFilter.search, mode: 'insensitive' } },
        { email: { contains: internalFilter.search, mode: 'insensitive' } },
      ]
    }
    const users = await db.user.findMany({ where, select: { id: true, name: true, email: true } })
    for (const u of users) {
      if (u.email && !excluded.has(u.id) && !byEmail.has(u.email.toLowerCase())) {
        byEmail.set(u.email.toLowerCase(), { email: u.email, name: u.name, sourceType: 'INTERNAL', sourceId: u.id })
      }
    }
  }

  for (const raw of sources.manualEmails ?? []) {
    const email = raw.trim()
    if (email && !byEmail.has(email.toLowerCase())) {
      byEmail.set(email.toLowerCase(), { email, name: null, sourceType: 'MANUAL', sourceId: null })
    }
  }

  if ((sources.excludeBookedThisMonth || sources.excludeBookedMonths?.length) && byEmail.size > 0) {
    const { guests } = await guestsBookedInMonths(db, { current: !!sources.excludeBookedThisMonth, months: sources.excludeBookedMonths })
    for (const g of guests) byEmail.delete(g.email.toLowerCase())
  }

  if (byEmail.size === 0) return []

  const unsubscribed = await db.emailUnsubscribe.findMany({
    where: { email: { in: [...byEmail.values()].map(m => m.email) } },
    select: { email: true },
  })
  const suppressed = new Set(unsubscribed.map(u => u.email.toLowerCase()))

  return [...byEmail.values()].filter(m => !suppressed.has(m.email.toLowerCase()))
}

/**
 * Fast, synchronous phase of sending: validates the campaign, flips it to SENDING,
 * resolves the audience, and bulk-inserts a PENDING CampaignRecipient row per
 * recipient (idempotent via skipDuplicates — re-running a partially-failed send
 * won't duplicate rows). Safe to await from an HTTP handler since it does no
 * outbound email calls itself and inserts in chunks (not one row at a time, which
 * for a large audience took long enough to trip the reverse proxy's request
 * timeout) — the actual dispatch (the slow part) is a separate step, see
 * `dispatchCampaignEmails`.
 */
export async function prepareCampaignSend(db: PrismaClient, campaignId: string, apiKey: string): Promise<{ totalRecipients: number }> {
  const campaign = await db.emailCampaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new Error('Campaign not found')
  if (campaign.status === 'SENT' || campaign.status === 'SENDING') throw new Error('Campaign already sent')

  if (!apiKey) throw new Error('RESEND_API_KEY not configured')

  await db.emailCampaign.update({ where: { id: campaignId }, data: { status: 'SENDING' } })

  const audience = await resolveAudience(db, campaign.audienceSources as AudienceSources)

  // Bulk-insert in chunks rather than one upsert per recipient — for a large audience
  // (tens of thousands), a round-trip per row can take minutes and blow past the
  // reverse-proxy's request timeout before this function (which the HTTP handler
  // awaits) ever returns. skipDuplicates keeps this idempotent for a re-run, same as
  // the upsert it replaces (campaignId+email is unique).
  const CHUNK_SIZE = 2000
  for (let i = 0; i < audience.length; i += CHUNK_SIZE) {
    const chunk = audience.slice(i, i + CHUNK_SIZE)
    await db.campaignRecipient.createMany({
      data: chunk.map(member => ({
        campaignId,
        email: member.email,
        name: member.name,
        sourceType: member.sourceType,
        sourceId: member.sourceId,
      })),
      skipDuplicates: true,
    })
  }

  return { totalRecipients: audience.length }
}

/**
 * Slow phase: actually sends via Resend, updating each CampaignRecipient's status
 * the moment its send resolves (so a poller can show live progress), then rolls up
 * final counts onto the campaign. Meant to be called after `prepareCampaignSend` —
 * split out so the API route can respond to the browser as soon as prepare finishes
 * and let this run in the background rather than holding the request open for the
 * whole batch (which, at Resend's ~2 req/s rate limit, can take minutes for a large
 * audience).
 */
export async function dispatchCampaignEmails(db: PrismaClient, campaignId: string, apiKey: string): Promise<void> {
  const campaign = await db.emailCampaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new Error('Campaign not found')

  if (!apiKey) throw new Error('RESEND_API_KEY not configured')

  const pending = await db.campaignRecipient.findMany({ where: { campaignId, status: 'PENDING' } })
  // O(1) lookup in onSent below instead of a linear pending.find() per recipient —
  // that's O(n) per call otherwise, O(n²) overall for a large audience.
  const pendingByEmail = new Map(pending.map(r => [r.email, r]))

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://erp.samarayachting.com'
  await sendBulkEmail({
    apiKey,
    from: campaign.fromEmail,
    fromName: campaign.fromName ?? undefined,
    subject: campaign.subject,
    // htmlFor is a thunk (not a pre-rendered string) so a large audience (thousands
    // of recipients) doesn't require holding every recipient's fully-rendered HTML
    // body in memory at once for the whole send — see sendBulkEmail/BulkRecipient.
    recipients: pending.map(r => ({
      email: r.email,
      htmlFor: () => {
        const unsubscribePageUrl = `${appUrl}/unsubscribe?token=${r.unsubscribeToken}`
        let html = injectUnsubscribeUrl(campaign.bodyHtml, unsubscribePageUrl)
        if (campaign.previewText) html = injectPreviewText(html, campaign.previewText)
        return html
      },
      // List-Unsubscribe header must point at the API route, not the confirm page —
      // Gmail/Outlook's native one-click button POSTs straight to this URL with no
      // page load, so a page component (no POST handler) would 405 and silently fail.
      unsubscribeUrl: `${appUrl}/api/marketing/unsubscribe?token=${r.unsubscribeToken}`,
    })),
    onSent: async (email, itemResult) => {
      const r = pendingByEmail.get(email)
      if (!r) return
      if (itemResult.resendId) {
        await db.campaignRecipient.update({
          where: { id: r.id },
          data: { status: 'SENT', resendId: itemResult.resendId, sentAt: new Date() },
        })
      } else {
        await db.campaignRecipient.update({
          where: { id: r.id },
          data: { status: 'FAILED', errorMessage: itemResult.error ?? 'unknown error' },
        })
      }
    },
  })

  const [totalSent, totalFailed, totalRecipients] = await Promise.all([
    db.campaignRecipient.count({ where: { campaignId, status: 'SENT' } }),
    db.campaignRecipient.count({ where: { campaignId, status: 'FAILED' } }),
    db.campaignRecipient.count({ where: { campaignId } }),
  ])

  await db.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: totalFailed > 0 && totalSent === 0 ? 'FAILED' : 'SENT',
      totalRecipients,
      sentCount: totalSent,
      failedCount: totalFailed,
      sentAt: new Date(),
    },
  })
}

/**
 * Convenience wrapper that runs both phases back-to-back and awaits full
 * completion — used by the scheduled-dispatch cron route, which isn't blocking
 * a browser request and so has no reason to split the phases apart.
 */
export async function sendCampaign(db: PrismaClient, campaignId: string, apiKey: string): Promise<void> {
  await prepareCampaignSend(db, campaignId, apiKey)
  await dispatchCampaignEmails(db, campaignId, apiKey)
}

export function previewHtml(blocks: EmailBlock[]): string {
  return renderBlocksToHtml(blocks)
}
