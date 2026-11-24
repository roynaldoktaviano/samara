// Ad attribution PER DEAL (marketing audit 2026-11-24, Roy: "ditempelkan ke dealnya, bukan ke
// kontak — 1 kontak bisa punya 2 deals dari ads yang beda di tahun yang beda").
//
// A deal's window starts after the person's previous deal was opened and ends when this one is
// Won / Lost (open deals: now). Inside it:
//  - FIRST touch = the visit behind this deal's own ERP enquiry (form / WhatsApp / Meta: the enquiry's
//    first-visit capture when it belongs to this window, else that enquiry's own visit); without one,
//    the EARLIEST PAGE VIEW in the window (Freshworks / ERP tracking keep the full landing URL + time —
//    every field then comes from that one visit). Only when that landing carries no utm / click id
//    does a person's very first deal fall back to the Freshsales contact's first source, as is.
//    Freshsales contact fields are NOT trusted over the timeline: Christine Glasson's contact says
//    first source chatgpt.com, her timeline shows a Google Ads landing the second she was created.
//    Inquiries imported from Freshsales (source 'freshsales') are copies of those contact fields and
//    are not used. Stored once, never overwritten — except by the same enquiry being completed
//    (firstInquiryId: a WhatsApp chat's enquiry that gets the website tap's landing seconds later).
//  - The window of a person's FIRST deal opens when the lead came in (contact created / first ERP
//    enquiry), later deals when they were made.
//  - ACQUIRED = that first touch is an ad click, or an ad click happened in the window up to
//    SAME_VISIT_MS after the deal was opened (page views are stamped late, see deal-quality.ts).
//  - ASSISTED = no acquisition, but an ad click happened while the deal was open (or a click id was
//    stored on this deal with no time — Freshsales deal cf_gcl_id; the contact's cf_gclid is
//    person-level and never decides a deal).
//  - LAST PAID = the newest ad click in the window.
// Clicks after the deal closed belong to the person's next deal, never to this one.
import type { LeadStage, Prisma, PrismaClient, WhatsappBrand } from '@prisma/client'
import {
  INQUIRY_SELECT, currentTouchOfInquiry, firstTouchOfInquiry, normalizeUtm, paidNetworkOf, type InquiryRow, type Touch,
} from '@/lib/attribution-touch'
import { SAME_VISIT_MS, gap, type AdNetwork } from '@/lib/deal-quality'

// Brand of a visited site (kept local: importing whatsapp-lead would loop back into the deal maker)
const brandOfHost = (host: string): WhatsappBrand => (/otium/i.test(host) ? 'OTIUM' : /mischief/i.test(host) ? 'MISCHIEF' : 'SAMARA')

type Db = PrismaClient | Prisma.TransactionClient
type Json = Record<string, unknown>
const DAY = 86400000
/** Ad clicks older than this before a deal opened don't count for it. */
export const LOOKBACK_MS = 365 * DAY

export type DealAdRole = 'ACQUIRED' | 'ASSISTED' | 'NONE'
export interface TouchEvent {
  touch: Touch
  kind: 'enquiry-first' | 'enquiry' | 'visit' | 'contact-first'
  // 'visit' = any page view (ad landing or not): the earliest one in a window is its first landing
  inquiryId?: string
  dealId?: string | null
}
export type PaidTouch = Touch & { network: AdNetwork }
export interface DealAttributionResult {
  first: Touch | null
  firstInquiryId: string | null
  lastPaid: PaidTouch | null
  role: DealAdRole
  network: AdNetwork | null
  evidence: string | null
}

const byAt = (a: { touch: Touch }, b: { touch: Touch }) => +a.touch.at - +b.touch.at
// A landing that says where the visit came from: utm tags or a Google click id. A bare fbclid doesn't
// (Facebook adds it to organic shares too).
const hasParams = (t: Touch) => !!(t.source || t.medium || t.campaign || t.gclid || t.gbraid || t.wbraid)
// A thank-you page is never a landing — it's the first page Freshworks saw AFTER the form
const THANK_YOU_RE = /thank[-_]?you|thankyou|thank-investor/i

export function computeDealAttribution(p: {
  dealId: string
  createdAt: Date
  closedAt: Date | null
  /** The person's newest OTHER deal opened before this one — the window starts after it. */
  previousDealAt: Date | null
  events: TouchEvent[]
  /** Click id stored on THIS deal without a visit time (Freshsales deal cf_gcl_id) — never the contact's. */
  clickIdLater?: { network: AdNetwork; id: string } | null
  /** Click ids the person's EARLIER deals already carried (their Freshsales cf_gcl_id …). */
  earlierClickIds?: string[]
  now?: Date
}): DealAttributionResult {
  const prev = p.previousDealAt ? +p.previousDealAt : -Infinity
  // A person's first deal opens when the lead came in (Freshsales contact created / first ERP enquiry)
  const leadIn = p.previousDealAt ? [] : p.events.filter(e => e.kind === 'contact-first' || e.kind === 'enquiry').map(e => +e.touch.at)
  const created = Math.min(+p.createdAt, ...leadIn)
  const lower = Math.max(prev, created - LOOKBACK_MS)
  const acquireEnd = created + SAME_VISIT_MS
  const end = p.closedAt ? Math.max(+p.closedAt, acquireEnd) : +(p.now ?? new Date())
  // A click id first seen before this deal's window is the old click carried along by the cookie /
  // copied onto the new deal (Bridget Ehrman-Solberg: deal 2 in Aug kept June's gclid) — it belongs to
  // the earlier deal, so it neither acquires nor assists this one.
  const earlierIds = new Set<string>(p.earlierClickIds ?? [])
  for (const e of p.events) if (+e.touch.at <= prev) for (const id of [e.touch.gclid, e.touch.gbraid, e.touch.wbraid, e.touch.ctwaClid]) if (id) earlierIds.add(id)
  const stale = (t: Touch) => [t.gclid, t.gbraid, t.wbraid, t.ctwaClid].some(id => !!id && earlierIds.has(id))
  // A new ad click always carries a new click id — a touch with an old one is the old visit
  const freshNetwork = (t: Touch) => (stale(t) ? null : paidNetworkOf(t))

  // First touch: this deal's own ERP enquiry, else the person's first ERP enquiry inside this window
  const enquiries = p.events.filter(e => e.kind === 'enquiry').sort(byAt)
  const own = enquiries.find(e => e.dealId === p.dealId)
    ?? enquiries.find(e => (!e.dealId || e.dealId === p.dealId) && +e.touch.at > prev && +e.touch.at <= acquireEnd)
  let first: Touch | null = null
  let firstInquiryId: string | null = null
  if (own) {
    const ft = p.events.find(e => e.kind === 'enquiry-first' && e.inquiryId === own.inquiryId)
    first = ft && +ft.touch.at > prev ? ft.touch : own.touch
    firstInquiryId = own.inquiryId ?? null
  } else {
    // …else the first landing of this window, all fields from that one visit
    const landing = p.events.filter(e => e.kind === 'visit' && +e.touch.at > prev && +e.touch.at <= acquireEnd && !THANK_YOU_RE.test(e.touch.landingUrl ?? ''))
      .sort(byAt)[0]?.touch ?? null
    // The Freshsales contact's own first source, when that contact came in within this deal's window
    const contactFirst = p.events.filter(e => e.kind === 'contact-first' && (!p.previousDealAt || (+e.touch.at > prev && +e.touch.at <= acquireEnd)))
      .sort(byAt)[0]?.touch ?? null
    first = landing && hasParams(landing) ? landing : contactFirst ?? landing
  }

  const paid = p.events
    .map(e => ({ e, network: freshNetwork(e.touch) }))
    .filter((x): x is { e: TouchEvent; network: AdNetwork } => !!x.network && +x.e.touch.at > lower && +x.e.touch.at <= end)
    .sort((a, b) => +a.e.touch.at - +b.e.touch.at)
  if (!first) first = paid.find(x => +x.e.touch.at <= acquireEnd)?.e.touch ?? null
  const last = paid[paid.length - 1]
  const lastPaid = last ? { ...last.e.touch, network: last.network } : null

  const ftNet = first ? freshNetwork(first) : null
  if (first && ftNet) {
    const label = [first.source, first.medium].filter(Boolean).join(' / ') || (first.gclid ? 'gclid' : 'ad click')
    return { first, firstInquiryId, lastPaid, role: 'ACQUIRED', network: ftNet, evidence: `First touch ${label}` }
  }
  const acq = paid.find(x => +x.e.touch.at <= acquireEnd)
  if (acq) {
    const t = +acq.e.touch.at
    const when = t < created - SAME_VISIT_MS ? `${gap(created - t)} before the deal opened` : 'when the deal opened'
    return { first, firstInquiryId, lastPaid, role: 'ACQUIRED', network: acq.network, evidence: `${acq.network} visit ${when}` }
  }
  const asst = paid.find(x => +x.e.touch.at > acquireEnd)
  if (asst) return { first, firstInquiryId, lastPaid, role: 'ASSISTED', network: asst.network, evidence: `${asst.network} visit ${gap(+asst.e.touch.at - created)} after the deal opened` }
  if (p.clickIdLater && !earlierIds.has(p.clickIdLater.id)) {
    return { first, firstInquiryId, lastPaid, role: 'ASSISTED', network: p.clickIdLater.network, evidence: `${p.clickIdLater.network} click id stored on the deal, no ad visit before it` }
  }
  return { first, firstInquiryId, lastPaid, role: 'NONE', network: null, evidence: null }
}

// ─── event builders ─────────────────────────────────────────────────────────

export function inquiryEvents(i: InquiryRow & { dealId?: string | null }): TouchEvent[] {
  // Imported from Freshsales = copies of the contact's (mixed) fields, not an enquiry the ERP saw
  if (i.source === 'freshsales') return []
  return [
    { kind: 'enquiry-first', touch: firstTouchOfInquiry(i), inquiryId: i.id, dealId: i.dealId ?? null },
    { kind: 'enquiry', touch: currentTouchOfInquiry(i), inquiryId: i.id, dealId: i.dealId ?? null },
  ]
}

/** A visited URL → a touch, every field from that URL (null only for an unparsable URL). */
export function visitTouch(url: string, at: Date, origin: string): Touch | null {
  let u: URL
  try { u = new URL(url.includes('://') ? url : `https://${url}`) } catch { return null }
  const g = (k: string) => u.searchParams.get(k)?.trim() || null
  // A Google Ads landing without utm tags (auto-tagging: gclid / gbraid / wbraid / gad_source, or the
  // tracking template's ap=gads) is still google / cpc — campaign from gad_campaignid
  const googleAd = !g('utm_source') && !!(g('gclid') || g('gbraid') || g('wbraid') || g('gad_source') || g('ap') === 'gads')
  const n = googleAd ? { source: 'google', medium: 'cpc', campaignFromMedium: null } : normalizeUtm(g('utm_source'), g('utm_medium'))
  const t: Touch = {
    source: n.source, medium: n.medium, campaign: g('utm_campaign') ?? n.campaignFromMedium ?? (googleAd ? g('gad_campaignid') : null), term: g('utm_term'), content: g('utm_content'),
    landingUrl: url.slice(0, 2000), referrer: null,
    gclid: g('gclid'), gbraid: g('gbraid'), wbraid: g('wbraid'), fbclid: g('fbclid'),
    brand: brandOfHost(u.hostname), at, origin,
  }
  return t
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** A Freshsales contact's own first source (mixed fields — only for a person's very first deal). */
export function freshsalesContactFirstTouch(c: { fsCreatedAt: Date | null; raw: unknown }): Touch | null {
  if (!c.fsCreatedAt) return null
  const r = (c.raw ?? {}) as Json
  const n = normalizeUtm(str(r.first_source), str(r.first_medium))
  return {
    // As stored — never patched with cf_utm_term (that's the form's visit, often a later Google ad)
    source: n.source, medium: n.medium, campaign: str(r.first_campaign) ?? n.campaignFromMedium, term: null, content: null,
    landingUrl: null, referrer: null, gclid: null, gbraid: null, wbraid: null, fbclid: null, brand: null, at: c.fsCreatedAt, origin: 'FRESHSALES',
  }
}

export const visitEvents = (visits: { at: Date; url?: string | null }[], origin: string): TouchEvent[] =>
  visits.flatMap(v => {
    const t = v.url ? visitTouch(v.url, v.at, origin) : null
    return t ? [{ kind: 'visit' as const, touch: t }] : []
  })

// ─── ERP deals ──────────────────────────────────────────────────────────────

/** Every lead / guest that is this person (exact email / E.164), plus their Freshsales contacts. */
async function personOf(db: Db, p: { leadId: string | null; customerId: string | null }) {
  const [lead, cust] = await Promise.all([
    p.leadId ? db.lead.findUnique({ where: { id: p.leadId }, select: { email: true, phoneE164: true } }) : null,
    p.customerId ? db.customer.findUnique({ where: { id: p.customerId }, select: { email: true, phoneE164: true } }) : null,
  ])
  const emails = [...new Set([lead?.email, cust?.email].map(e => e?.trim().toLowerCase()).filter((e): e is string => !!e))]
  const phones = [...new Set([lead?.phoneE164, cust?.phoneE164].filter((x): x is string => !!x))]
  const ident = [...emails.map(e => ({ email: { equals: e, mode: 'insensitive' as const } })), ...phones.map(ph => ({ phoneE164: ph }))]
  const [leads, custs] = await Promise.all([
    ident.length ? db.lead.findMany({ where: { OR: ident }, select: { id: true, freshsalesContactId: true }, take: 20 }) : [],
    ident.length ? db.customer.findMany({ where: { OR: ident as Prisma.CustomerWhereInput[] }, select: { id: true, freshsalesContactId: true }, take: 20 }) : [],
  ])
  const own = await Promise.all([
    p.leadId ? db.lead.findUnique({ where: { id: p.leadId }, select: { id: true, freshsalesContactId: true } }) : null,
    p.customerId ? db.customer.findUnique({ where: { id: p.customerId }, select: { id: true, freshsalesContactId: true } }) : null,
  ])
  const leadIds = [...new Set([...(own[0] ? [own[0].id] : []), ...leads.map(l => l.id)])]
  const customerIds = [...new Set([...(own[1] ? [own[1].id] : []), ...custs.map(c => c.id)])]
  const fsContactIds = [...new Set([own[0], own[1], ...leads, ...custs].map(x => x?.freshsalesContactId).filter((x): x is string => !!x))]
  return { leadIds, customerIds, fsContactIds }
}

async function loadPersonFacts(db: Db, person: { leadIds: string[]; customerIds: string[]; fsContactIds: string[] }) {
  const who: Prisma.InquiryWhereInput[] = [
    ...(person.leadIds.length ? [{ leadId: { in: person.leadIds } }] : []),
    ...(person.customerIds.length ? [{ customerId: { in: person.customerIds } }] : []),
  ]
  const [inquiries, views, deals, fsContacts, fsVisits, fsDeals] = await Promise.all([
    who.length ? db.inquiry.findMany({ where: { OR: who }, select: { ...INQUIRY_SELECT, dealId: true } }) : [],
    who.length ? db.$queryRaw<{ url: string; at: Date }[]>`
      SELECT url, "occurredAt" AS at FROM "PageView"
      WHERE ("leadId" = ANY(${person.leadIds}) OR "customerId" = ANY(${person.customerIds}))` : [],
    who.length ? db.deal.findMany({ where: { OR: who as Prisma.DealWhereInput[] }, select: { id: true, createdAt: true } }) : [],
    person.fsContactIds.length ? db.freshsalesContact.findMany({ where: { id: { in: person.fsContactIds } }, select: { id: true, fsCreatedAt: true, raw: true } }) : [],
    person.fsContactIds.length ? db.$queryRaw<{ url: string; at: Date }[]>`
      SELECT "actionData"->>'property_value' AS url, "occurredAt" AS at FROM "FreshsalesTimelineEvent"
      WHERE "contactFsId" = ANY(${person.fsContactIds}) AND "actionType" = 'FM_PAGE_VIEWS'` : [],
    person.fsContactIds.length ? db.freshsalesDeal.findMany({ where: { isDeleted: false, contactFsIds: { hasSome: person.fsContactIds } }, select: { id: true, fsCreatedAt: true, customFields: true } }) : [],
  ])
  const events: TouchEvent[] = [
    ...inquiries.flatMap(i => inquiryEvents(i)),
    ...views.flatMap(v => { const t = visitTouch(v.url, v.at, 'PAGE_VIEW'); return t ? [{ kind: 'visit' as const, touch: t }] : [] }),
    ...fsVisits.flatMap(v => { const t = visitTouch(v.url, v.at, 'FRESHSALES_WEB'); return t ? [{ kind: 'visit' as const, touch: t }] : [] }),
    ...fsContacts.flatMap(c => { const t = freshsalesContactFirstTouch(c); return t ? [{ kind: 'contact-first' as const, touch: t }] : [] }),
  ]
  const dealTimes = [...deals.map(d => +d.createdAt), ...fsDeals.map(d => +(d.fsCreatedAt ?? 0)).filter(Boolean)]
  const fsDealClicks = fsDeals.flatMap(d => { const id = dealClickId(d.customFields); return id && d.fsCreatedAt ? [{ at: +d.fsCreatedAt, id }] : [] })
  return { events, dealTimes, fsDealClicks }
}

/** A Freshsales deal's own click id (cf_gcl_id / gbraid / wbraid), if any. */
export function dealClickId(customFields: unknown): string | null {
  const cf = (customFields ?? {}) as Json
  return str(cf.cf_gcl_id) ?? str(cf.cf_gbraid) ?? str(cf.cf_wbraid)
}

/** Click ids carried by the person's deals opened before this one. */
export function earlierDealClickIds(clicks: { at: number; id: string }[], createdAt: Date): string[] {
  return clicks.filter(c => c.at < +createdAt - 60_000).map(c => c.id)
}

/** The person's newest other deal opened before this one (a minute's slack: an FS-mirrored deal is the same deal). */
export function previousDealAt(dealTimes: number[], createdAt: Date): Date | null {
  const before = dealTimes.filter(t => t < +createdAt - 60_000)
  return before.length ? new Date(Math.max(...before)) : null
}

const CLOSED: LeadStage[] = ['CLOSED_WON', 'CLOSED_LOST']

/** Recompute and store DealAttribution for these deals. First touch is never overwritten once set. */
export async function refreshDealAttribution(db: Db, dealIds: string[]): Promise<void> {
  if (!dealIds.length) return
  const deals = await db.deal.findMany({
    where: { id: { in: dealIds } },
    select: {
      id: true, createdAt: true, stage: true, stageUpdatedAt: true, leadId: true, customerId: true, freshsalesDealId: true,
      stageChanges: { where: { toStage: { in: CLOSED } }, orderBy: { changedAt: 'asc' }, take: 1, select: { changedAt: true } },
      attribution: { select: { firstAt: true, firstInquiryId: true } },
    },
  })
  const fsDealIds = deals.map(d => d.freshsalesDealId).filter((x): x is string => !!x)
  const fsDeals = fsDealIds.length ? await db.freshsalesDeal.findMany({ where: { id: { in: fsDealIds } }, select: { id: true, customFields: true } }) : []
  const fsClick = new Map(fsDeals.map(d => [d.id, dealClickId(d.customFields)]))

  const cache = new Map<string, Awaited<ReturnType<typeof loadPersonFacts>>>()
  for (const d of deals) {
    const key = `${d.leadId ?? ''}|${d.customerId ?? ''}`
    let facts = cache.get(key)
    if (!facts) { facts = await loadPersonFacts(db, await personOf(db, d)); cache.set(key, facts) }
    const closedAt = CLOSED.includes(d.stage) ? d.stageChanges[0]?.changedAt ?? d.stageUpdatedAt ?? null : null
    const r = computeDealAttribution({
      dealId: d.id, createdAt: d.createdAt, closedAt,
      previousDealAt: previousDealAt(facts.dealTimes, d.createdAt),
      events: facts.events,
      clickIdLater: d.freshsalesDealId && fsClick.get(d.freshsalesDealId) ? { network: 'Google Ads', id: fsClick.get(d.freshsalesDealId)! } : null,
      earlierClickIds: earlierDealClickIds(facts.fsDealClicks, d.createdAt),
    })
    // First touch: set once; only the same enquiry may complete it later
    const a = d.attribution
    await writeDealAttribution(db, d.id, r, !a?.firstAt || (!!a.firstInquiryId && a.firstInquiryId === r.firstInquiryId))
  }
}

export function dealAttributionData(r: DealAttributionResult, withFirst: boolean): Prisma.DealAttributionUncheckedUpdateInput {
  const f = r.first, p = r.lastPaid
  return {
    ...(withFirst && f ? {
      firstSource: f.source, firstMedium: f.medium, firstCampaign: f.campaign, firstTerm: f.term, firstContent: f.content,
      firstLandingUrl: f.landingUrl, firstReferrer: f.referrer, firstGclid: f.gclid, firstGbraid: f.gbraid, firstWbraid: f.wbraid,
      firstFbclid: f.fbclid, firstBrand: f.brand, firstAt: f.at, firstOrigin: f.origin, firstInquiryId: r.firstInquiryId,
    } : {}),
    lastPaidNetwork: p?.network ?? null, lastPaidSource: p?.source ?? null, lastPaidMedium: p?.medium ?? null, lastPaidCampaign: p?.campaign ?? null,
    lastPaidTerm: p?.term ?? null, lastPaidContent: p?.content ?? null, lastPaidLandingUrl: p?.landingUrl ?? null,
    lastPaidGclid: p?.gclid ?? null, lastPaidGbraid: p?.gbraid ?? null, lastPaidWbraid: p?.wbraid ?? null, lastPaidFbclid: p?.fbclid ?? null,
    lastPaidCtwaClid: p?.ctwaClid ?? null, lastPaidBrand: p?.brand ?? null, lastPaidAt: p?.at ?? null, lastPaidOrigin: p?.origin ?? null,
    adRole: r.role, adNetwork: r.network, adEvidence: r.evidence,
  }
}

async function writeDealAttribution(db: Db, dealId: string, r: DealAttributionResult, withFirst: boolean) {
  const data = dealAttributionData(r, withFirst)
  await db.dealAttribution.upsert({
    where: { dealId },
    create: { ...(dealAttributionData(r, true) as Omit<Prisma.DealAttributionUncheckedCreateInput, 'dealId'>), dealId },
    update: data,
  })
}

/** Every live deal of this person (lead / guest + same email / phone) — after a new touch arrived. */
export async function refreshPersonDeals(db: Db, owner: { leadId?: string | null; customerId?: string | null }): Promise<void> {
  if (!owner.leadId && !owner.customerId) return
  const person = await personOf(db, { leadId: owner.leadId ?? null, customerId: owner.customerId ?? null })
  const who: Prisma.DealWhereInput[] = [
    ...(person.leadIds.length ? [{ leadId: { in: person.leadIds } }] : []),
    ...(person.customerIds.length ? [{ customerId: { in: person.customerIds } }] : []),
  ]
  if (!who.length) return
  const deals = await db.deal.findMany({ where: { deletedAt: null, OR: who }, select: { id: true } })
  await refreshDealAttribution(db, deals.map(d => d.id))
}

/** What the Lead / Guest detail shows per deal. */
export const DEAL_ATTRIBUTION_SELECT = {
  id: true, orderId: true, tripType: true, productInterest: true, stage: true, createdAt: true, brand: true, bookingType: true, enquiryChannel: true,
  attribution: true,
} satisfies Prisma.DealSelect

/** Every Freshworks page view (URL + time) of these Freshsales contacts. */
export async function loadFreshsalesPageViews(db: Db, contactIds: string[]): Promise<Map<string, { at: Date; url: string }[]>> {
  const out = new Map<string, { at: Date; url: string }[]>()
  if (!contactIds.length) return out
  const rows = await db.$queryRaw<{ contact: string; at: Date; url: string }[]>`
    SELECT "contactFsId" AS contact, "occurredAt" AS at, "actionData"->>'property_value' AS url FROM "FreshsalesTimelineEvent"
    WHERE "contactFsId" = ANY(${contactIds}) AND "actionType" = 'FM_PAGE_VIEWS' AND "actionData"->>'property_value' IS NOT NULL`
  for (const r of rows) { const a = out.get(r.contact); if (a) a.push({ at: r.at, url: r.url }); else out.set(r.contact, [{ at: r.at, url: r.url }]) }
  return out
}
