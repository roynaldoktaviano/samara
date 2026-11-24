// Data for the "Won Attribution" statistics menu: which campaign / source / medium the won
// business came from. Two separate datasets, never summed together (a guest won in Freshsales
// usually also has an ERP booking, so adding them would double count):
//  - Freshsales: won deals from the Freshsales archive, attributed through their contact's
//    first/last/latest touch fields and form custom fields.
//  - ERP: non-cancelled bookings, attributed through the guest's website Inquiry, falling back
//    to the guest's Freshsales contact when there is no inquiry.
// All amounts are USD (Freshsales base currency; Booking.totalPrice is always stored in USD).
//
// Marketing audit 2026-11-24 (src/lib/deal-quality.ts): test deals are left out, agent bookings
// are their own booking type (kept out of ad ROAS), the date is the real Won date, and every win
// says whether an ad ACQUIRED the lead or only ASSISTED it. A stored gclid no longer turns a touch
// into Paid Search, and the deal's own cf_utm_* (overwritten with the last ad click by the old
// export) is no longer used as a touch.
import type { PrismaClient } from '@prisma/client'
import {
  AGENT_CODE_RE, adNetworkOf, loadDealFixes, loadFreshsalesTimelineFacts, looksLikeTest, type AdNetwork, type AdRole,
} from '@/lib/deal-quality'
import {
  computeDealAttribution, dealClickId, earlierDealClickIds, freshsalesContactFirstTouch, inquiryEvents, loadFreshsalesPageViews, previousDealAt, visitEvents, visitTouch,
  type DealAttributionResult, type TouchEvent,
} from '@/lib/deal-attribution'
import { INQUIRY_SELECT } from '@/lib/attribution-touch'

// Per-deal result → the screen's lower-case role
const roleOf = (r: Pick<DealAttributionResult, 'role'>): AdRole => (r.role === 'ACQUIRED' ? 'acquired' : r.role === 'ASSISTED' ? 'assisted' : 'none')

export type TouchKey = 'first' | 'last' | 'latest'
export interface Touch { source: string | null; medium: string | null; campaign: string | null }
export type BookingType = 'Direct' | 'Repeat' | 'Agent'

export interface Win {
  id: string
  name: string
  date: string | null // real Won date (Freshsales: first move into a Won stage; ERP: booking created)
  closedDate: string | null // Freshsales "closed date" as typed by sales — shown only when it disagrees
  amountUsd: number | null
  owner: string | null
  pipeline: string | null // Freshsales pipeline, or ERP booking source (Direct / Agent)
  bookingType: BookingType
  agentReason: string | null
  agent: string | null
  tripType: string | null
  landingPage: string | null
  enquiryVia: string | null // Freshsales contact "Medium" field (Google / WA / Email) — how they reached out
  touches: Record<TouchKey, Touch>
  adRole: AdRole
  adNetwork: AdNetwork | null
  adEvidence: string | null
  issues: string[]
  // Where the touch data came from — the *-match values were found by guest email/phone,
  // not by a stored link, so the UI labels them.
  attributionFrom: 'inquiry' | 'freshsales' | 'lead-match' | 'freshsales-match' | 'agent' | null
}
export interface WinsResult { wins: Win[]; excludedTests: number }

type Json = Record<string, unknown>
const s = (v: unknown) => {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return t && !/^\{.*\}$/.test(t) ? t : null // drop unfilled ad-template macros like "{campaignid}"
}

/**
 * Coarse channel bucket from a messy source/medium pair. Freshsales and the website forms
 * spell the same thing many ways ("google"/"google-ads", "cpc"/"lead-google-ads-…"), so stats
 * group by this first and keep the raw source/medium for drill-down. Only the touch itself
 * decides — a click id stored on the contact may come from a later visit (see adRole).
 */
export function channelGroup(t: Touch): string {
  const src = (t.source ?? '').toLowerCase()
  const med = (t.medium ?? '').toLowerCase()
  const both = `${src} ${med}`
  if (med === 'agent') return 'Agent'
  if (!src && !med) return 'Not tracked'
  const network = adNetworkOf(src, med)
  if (network === 'Meta Ads') return 'Paid Social'
  if (network === 'Google Ads') return 'Paid Search'
  const social = /facebook|instagram|\bfb\b|\big\b|\bwa\b|meta|tiktok|linkedin|pinterest|twitter|\bx\.com/.test(both)
  const paid = /cpc|ppc|paid|\bads?\b|-ads|ads-|adwords|display|sem\b/.test(both)
  if (social) return paid ? 'Paid Social' : 'Organic Social'
  if (paid) return 'Paid Search'
  if (/organic/.test(med) || (/google|bing|yahoo|duckduckgo|ecosia|yandex|baidu/.test(src) && !med)) return 'Organic Search'
  if (/chatgpt|openai|copilot|perplexity|gemini|claude\.ai/.test(src)) return 'AI Assistant'
  if (/direct|\(none\)/.test(both)) return 'Direct'
  if (/e-?mail|newsletter|mailchimp|brevo|klaviyo/.test(both)) return 'Email'
  if (/referr?al/.test(med)) return 'Referral'
  return 'Other'
}

const tidyTripType = (v: unknown) => {
  const t = s(v)?.replace(/\s*\(#\w+\)\s*$/, '').trim()
  return !t || /^select/i.test(t) ? null : t
}

// cf_referer_field holds either a page title or ":referer: <url>\n:Request *: …" — keep the page.
function tidyLanding(v: unknown) {
  const t = s(v)
  if (!t) return null
  const m = t.match(/:referer:\s*(\S+)/)
  if (!m) return t.split('\n')[0].slice(0, 120)
  try {
    const u = new URL(m[1])
    return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')}`
  } catch {
    return m[1].slice(0, 120)
  }
}

function contactTouches(raw: Json | null): Record<TouchKey, Touch> {
  const r = raw ?? {}
  const cf = (r.custom_field as Json | null) ?? {}
  // Website forms often only filled utm_term with the campaign name — that is the form's own visit, so
  // it may stand in only for the "created from" touch, never for the first touch (a chatgpt.com first
  // visit must not show the Google campaign of a later form).
  const term = s(cf.cf_utm_term)
  const t = (p: string): Touch => ({ source: s(r[`${p}_source`]), medium: s(r[`${p}_medium`]), campaign: s(r[`${p}_campaign`]) ?? (p === 'last' ? term : null) })
  return { first: t('first'), last: t('last'), latest: t('latest') }
}
const hasAnyTouch = (t: Record<TouchKey, Touch>) => Object.values(t).some(x => x.source || x.medium || x.campaign)
const AGENT_TOUCH = (name: string | null): Record<TouchKey, Touch> => {
  const t = { source: name ?? 'agent', medium: 'agent', campaign: null }
  return { first: t, last: t, latest: t }
}
const earliest = (...ds: (Date | null | undefined)[]) => {
  const v = ds.filter((d): d is Date => !!d).map(d => +d)
  return v.length ? new Date(Math.min(...v)) : null
}
const DAY = 86400000
const dayOf = (d: Date) => Math.floor((+d + 8 * 3600000) / DAY) // WITA calendar day

async function agentEmails(db: PrismaClient) {
  const [agents, contacts] = await Promise.all([
    db.agent.findMany({ where: { email: { not: null } }, select: { email: true } }),
    db.agentContact.findMany({ where: { email: { not: null } }, select: { email: true } }),
  ])
  return new Set([...agents, ...contacts].map(a => a.email?.trim().toLowerCase()).filter((e): e is string => !!e))
}

// ─── Freshsales won deals ───────────────────────────────────────────────────

export async function freshsalesWins(db: PrismaClient): Promise<WinsResult> {
  const [lookups, users, fixes, agentMail] = await Promise.all([
    db.freshsalesLookup.findMany({ where: { kind: { in: ['DEAL_STAGE', 'DEAL_PIPELINE'] } } }),
    db.freshsalesUser.findMany({ select: { id: true, name: true, email: true } }),
    loadDealFixes(db),
    agentEmails(db),
  ])
  const wonStages = lookups.filter(l => l.kind === 'DEAL_STAGE' && (l.extra as Json | null)?.forecast_type === 'Closed Won').map(l => l.fsId)
  const pipelineName = new Map(lookups.filter(l => l.kind === 'DEAL_PIPELINE').map(l => [l.fsId, l.name]))
  const ownerName = new Map(users.map(u => [u.id, u.name ?? u.email ?? u.id]))

  const deals = (await db.freshsalesDeal.findMany({
    where: { stageFsId: { in: wonStages }, isDeleted: false },
    select: { id: true, name: true, baseCurrencyAmount: true, amount: true, ownerFsId: true, pipelineFsId: true, contactFsIds: true, closedDate: true, stageUpdatedAt: true, fsCreatedAt: true, customFields: true },
  }))
    // Agent Outreach deals are agent partnerships, not guest bookings
    .filter(d => !/agent outreach/i.test(pipelineName.get(d.pipelineFsId ?? '') ?? ''))
  const contactIds = [...new Set(deals.flatMap(d => d.contactFsIds))]
  const contacts = await db.freshsalesContact.findMany({
    where: { id: { in: contactIds } },
    select: { id: true, name: true, email: true, fsCreatedAt: true, raw: true },
  })
  const contactById = new Map(contacts.map(c => [c.id, c]))
  const facts = await loadFreshsalesTimelineFacts(db, deals.map(d => d.id), contactIds, wonStages)
  const pageViews = await loadFreshsalesPageViews(db, contactIds)
  // Every deal of these contacts (any stage) — each deal's ad window starts after the previous one
  const dealTimesByContact = new Map<string, number[]>()
  const dealClicksByContact = new Map<string, { at: number; id: string }[]>()
  for (const x of await db.freshsalesDeal.findMany({ where: { isDeleted: false, contactFsIds: { hasSome: contactIds } }, select: { contactFsIds: true, fsCreatedAt: true, customFields: true } })) {
    if (!x.fsCreatedAt) continue
    const click = dealClickId(x.customFields)
    for (const cid of x.contactFsIds) {
      dealTimesByContact.set(cid, [...(dealTimesByContact.get(cid) ?? []), +x.fsCreatedAt])
      if (click) dealClicksByContact.set(cid, [...(dealClicksByContact.get(cid) ?? []), { at: +x.fsCreatedAt, id: click }])
    }
  }

  // Repeat guest: one of the deal's contacts already won an earlier deal before this one was opened
  const wonTimesByContact = new Map<string, number[]>()
  for (const d of deals) {
    const t = +(fixes.get(d.id)?.wonAt ?? facts.wonAt.get(d.id) ?? d.stageUpdatedAt ?? d.closedDate ?? d.fsCreatedAt ?? 0)
    for (const cid of d.contactFsIds) wonTimesByContact.set(cid, [...(wonTimesByContact.get(cid) ?? []), t])
  }

  let excludedTests = 0
  const wins: Win[] = []
  for (const d of deals) {
    const fix = fixes.get(d.id)
    const cs = d.contactFsIds.map(id => contactById.get(id)).filter((c): c is NonNullable<typeof c> => !!c)
    if (fix?.isTest ?? looksLikeTest(d.name, ...cs.map(c => c.name))) { excludedTests++; continue }

    // A deal can have several contacts — attribute to the first one that carries touch data
    const raws = cs.map(c => (c.raw as Json | null) ?? null)
    const raw = raws.find(r => hasAnyTouch(contactTouches(r))) ?? raws[0] ?? null
    const cf = ((raw?.custom_field as Json | null) ?? {})
    const dcf = (d.customFields as Json | null) ?? {}

    const tagged = raws.some(r => Array.isArray(r?.tags) && (r!.tags as unknown[]).includes('Agents')
      || ((r?.custom_field as Json | null)?.cf_contact_type === 'Agent'))
    const agentReason = fix?.isAgent === false ? null
      : fix?.isAgent ? 'Marked as agent booking'
      : AGENT_CODE_RE.test(d.name) ? 'Deal name code A'
      : tagged ? 'Contact tagged Agents'
      : cs.some(c => c.email && agentMail.has(c.email.trim().toLowerCase())) ? 'Contact is an ERP agent'
      : null
    const isAgent = !!agentReason
    const opened = +(d.fsCreatedAt ?? 0)
    const isRepeat = !isAgent && d.contactFsIds.some(id => (wonTimesByContact.get(id) ?? []).some(t => t < opened))

    const wonAt = fix?.wonAt ?? facts.wonAt.get(d.id) ?? d.stageUpdatedAt ?? d.closedDate ?? d.fsCreatedAt
    // Only the deal's own click id (the contact's cf_gclid is person-level, no time)
    const ownClick = dealClickId(dcf)
    const clickIdLater = ownClick ? { network: 'Google Ads' as AdNetwork, id: ownClick } : null
    // Per-deal attribution: only this deal's window (after the contact's previous deal, until Won)
    const created = d.fsCreatedAt ?? wonAt ?? new Date()
    const events: TouchEvent[] = [
      ...cs.flatMap(c => { const t = freshsalesContactFirstTouch(c); return t ? [{ kind: 'contact-first' as const, touch: t }] : [] }),
      ...visitEvents(cs.flatMap(c => pageViews.get(c.id) ?? []), 'FRESHSALES_WEB'),
    ]
    const per = computeDealAttribution({
      dealId: d.id, createdAt: created, closedAt: wonAt ?? null, events, clickIdLater,
      earlierClickIds: earlierDealClickIds(d.contactFsIds.flatMap(id => dealClicksByContact.get(id) ?? []), created),
      previousDealAt: previousDealAt(d.contactFsIds.flatMap(id => dealTimesByContact.get(id) ?? []), created),
    })
    const contactLevel = contactTouches(raw)
    const touches: Record<TouchKey, Touch> = isAgent ? AGENT_TOUCH(null) : {
      ...contactLevel,
      // First touch is the deal's own (a returning contact's 2nd deal doesn't inherit the contact's first source)
      first: per.first ? { source: per.first.source, medium: per.first.medium, campaign: per.first.campaign } : { source: null, medium: null, campaign: null },
    }
    const ad = isAgent
      ? { role: 'none' as const, network: null, evidence: 'Agent booking — not counted for ads' }
      : { role: roleOf(per), network: per.network, evidence: per.evidence }

    const amountUsd = fix?.amount != null && (!fix.currency || fix.currency === 'USD') ? fix.amount : (d.baseCurrencyAmount ?? d.amount)
    const issues: string[] = []
    if (!amountUsd || amountUsd <= 0) issues.push('Amount 0')
    const contactCreated = earliest(...cs.map(c => c.fsCreatedAt))
    if (d.closedDate && contactCreated && dayOf(d.closedDate) < dayOf(contactCreated)) issues.push('Closed date before the contact was created')
    if (d.closedDate && wonAt && Math.abs(+d.closedDate - +wonAt) > 7 * DAY) issues.push('Closed date ≠ real won date')

    wins.push({
      id: d.id,
      name: d.name,
      date: wonAt?.toISOString() ?? null,
      closedDate: d.closedDate?.toISOString() ?? null,
      amountUsd,
      owner: d.ownerFsId ? ownerName.get(d.ownerFsId) ?? null : null,
      pipeline: d.pipelineFsId ? pipelineName.get(d.pipelineFsId) ?? null : null,
      bookingType: isAgent ? 'Agent' : isRepeat ? 'Repeat' : 'Direct',
      agentReason,
      agent: null,
      tripType: tidyTripType(cf.cf_trip_type),
      landingPage: tidyLanding(cf.cf_referer_field),
      enquiryVia: s(raw?.medium),
      touches,
      adRole: ad.role,
      adNetwork: ad.network,
      adEvidence: ad.evidence,
      issues,
      attributionFrom: isAgent ? 'agent' : hasAnyTouch(touches) ? 'freshsales' : null,
    })
  }
  return { wins, excludedTests }
}

// ─── ERP bookings ───────────────────────────────────────────────────────────

const TRIP_TYPE_LABEL: Record<string, string> = { PRIVATE_CHARTER: 'Private Charter', OPEN_TRIP: 'Open Trip' }

type InquiryTouchFields = {
  createdAt: Date
  utmSource: string | null; utmMedium: string | null; utmCampaign: string | null
  lastSource: string | null; lastMedium: string | null; lastCampaign: string | null
  latestSource: string | null; latestMedium: string | null; latestCampaign: string | null
  gclid: string | null; lastGclid: string | null; gbraid: string | null; lastGbraid: string | null; wbraid: string | null; lastWbraid: string | null
  url: string | null
}
const INQUIRY_TOUCH_SELECT = {
  createdAt: true,
  utmSource: true, utmMedium: true, utmCampaign: true, lastSource: true, lastMedium: true, lastCampaign: true,
  latestSource: true, latestMedium: true, latestCampaign: true,
  gclid: true, lastGclid: true, gbraid: true, lastGbraid: true, wbraid: true, lastWbraid: true, url: true,
} as const

// Inquiries oldest-first. first = earliest inquiry's first-touch; last = latest inquiry's own
// traffic ("created from"); latest = latest inquiry's "latest" touch.
function inquiryTouches(inq: InquiryTouchFields[]): Record<TouchKey, Touch> {
  const firstInq = inq.find(i => i.utmSource || i.utmMedium || i.utmCampaign) ?? inq[0]
  const lastInq = inq[inq.length - 1]
  return {
    first: { source: s(firstInq?.utmSource), medium: s(firstInq?.utmMedium), campaign: s(firstInq?.utmCampaign) },
    last: { source: s(lastInq?.lastSource), medium: s(lastInq?.lastMedium), campaign: s(lastInq?.lastCampaign) },
    latest: { source: s(lastInq?.latestSource), medium: s(lastInq?.latestMedium), campaign: s(lastInq?.latestCampaign) },
  }
}

const normEmail = (e: string | null | undefined) => e?.trim().toLowerCase() || null
// Digits only, local "08…" → "628…" so "+62 812-…" and "0812…" match. Too-short numbers are ignored.
function normPhone(p: string | null | undefined) {
  let d = (p ?? '').replace(/\D/g, '')
  if (d.startsWith('0')) d = `62${d.slice(1)}`
  return d.length >= 8 ? d : null
}

/**
 * Touch data for guests whose booking has no linked inquiry/contact, found by email or phone:
 * Leads with tracked inquiries, then Freshsales contacts with tracked source fields.
 */
async function loadMatchIndex(db: PrismaClient) {
  const inquiries = await db.inquiry.findMany({
    where: {
      leadId: { not: null },
      OR: [
        { utmSource: { not: null } }, { utmMedium: { not: null } }, { utmCampaign: { not: null } },
        { lastSource: { not: null } }, { latestSource: { not: null } }, { gclid: { not: null } }, { lastGclid: { not: null } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: { ...INQUIRY_TOUCH_SELECT, leadId: true, lead: { select: { email: true, phone: true } } },
  })
  const byLead = new Map<string, { email: string | null; phone: string | null; inq: InquiryTouchFields[] }>()
  for (const i of inquiries) {
    const e = byLead.get(i.leadId!) ?? { email: normEmail(i.lead?.email), phone: normPhone(i.lead?.phone), inq: [] }
    e.inq.push(i)
    byLead.set(i.leadId!, e)
  }
  const leadByKey = new Map<string, InquiryTouchFields[]>()
  for (const l of byLead.values()) {
    if (l.email && !leadByKey.has(`e:${l.email}`)) leadByKey.set(`e:${l.email}`, l.inq)
    if (l.phone && !leadByKey.has(`p:${l.phone}`)) leadByKey.set(`p:${l.phone}`, l.inq)
  }

  // Only the fields attribution needs, rebuilt as a mini contact `raw` for contactTouches()
  const contacts = await db.$queryRaw<{ id: string; email: string | null; phone: string | null; created: Date | null; raw: Json }[]>`
    SELECT id, email, phone, "fsCreatedAt" AS created, jsonb_build_object(
      'first_source', raw->>'first_source', 'first_medium', raw->>'first_medium', 'first_campaign', raw->>'first_campaign',
      'last_source', raw->>'last_source', 'last_medium', raw->>'last_medium', 'last_campaign', raw->>'last_campaign',
      'latest_source', raw->>'latest_source', 'latest_medium', raw->>'latest_medium', 'latest_campaign', raw->>'latest_campaign',
      'medium', raw->>'medium',
      'custom_field', jsonb_build_object('cf_utm_term', raw->'custom_field'->>'cf_utm_term', 'cf_gclid', raw->'custom_field'->>'cf_gclid', 'cf_referer_field', raw->'custom_field'->>'cf_referer_field')
    ) AS raw
    FROM "FreshsalesContact"
    WHERE "isDeleted" = false AND (email IS NOT NULL OR phone IS NOT NULL)
      AND coalesce(nullif(raw->>'first_source', ''), nullif(raw->>'last_source', ''), nullif(raw->>'latest_source', ''),
                   nullif(raw->>'first_campaign', ''), nullif(raw->'custom_field'->>'cf_utm_term', '')) IS NOT NULL`
  type MatchedContact = { id: string; created: Date | null; raw: Json }
  const contactByKey = new Map<string, MatchedContact>()
  for (const c of contacts) {
    const e = normEmail(c.email), p = normPhone(c.phone)
    const v = { id: c.id, created: c.created, raw: c.raw }
    if (e && !contactByKey.has(`e:${e}`)) contactByKey.set(`e:${e}`, v)
    if (p && !contactByKey.has(`p:${p}`)) contactByKey.set(`p:${p}`, v)
  }
  const keys = (email: string | null, phone: string | null) =>
    [normEmail(email) && `e:${normEmail(email)}`, normPhone(phone) && `p:${normPhone(phone)}`].filter((k): k is string => !!k)
  return {
    lead: (email: string | null, phone: string | null) => keys(email, phone).map(k => leadByKey.get(k)).find(Boolean) ?? null,
    contact: (email: string | null, phone: string | null) => keys(email, phone).map(k => contactByKey.get(k)).find(Boolean) ?? null,
  }
}

export async function erpWins(db: PrismaClient): Promise<WinsResult> {
  const [allBookings, match] = await Promise.all([
    db.booking.findMany({
      where: { status: { not: 'cancelled' } },
      select: {
        id: true, bookingCode: true, createdAt: true, totalPrice: true, source: true, tripType: true, salesperson: true,
        salespersonUser: { select: { name: true } },
        agent: { select: { name: true } },
        deals: { where: { deletedAt: null }, select: { isTest: true, bookingType: true, attribution: { select: { adRole: true, adNetwork: true, adEvidence: true, firstSource: true, firstMedium: true, firstCampaign: true } } } },
        customer: {
          select: {
            id: true, name: true, email: true, phone: true, freshsalesContactId: true, createdAt: true,
            inquiries: { orderBy: { createdAt: 'asc' }, select: { ...INQUIRY_SELECT, ...INQUIRY_TOUCH_SELECT, dealId: true } },
          },
        },
      },
    }),
    loadMatchIndex(db),
  ])
  const bookings = allBookings.filter(b => !b.deals.some(d => d.isTest))
  const excludedTests = allBookings.length - bookings.length
  // Repeat guest: the same guest already had a booking before this one (or sales marked the deal so)
  const firstBookingAt = new Map<string, number>()
  for (const b of bookings) firstBookingAt.set(b.customer.id, Math.min(firstBookingAt.get(b.customer.id) ?? Infinity, +b.createdAt))
  const bookingTimes = new Map<string, number[]>()
  for (const b of bookings) bookingTimes.set(b.customer.id, [...(bookingTimes.get(b.customer.id) ?? []), +b.createdAt])

  const fsIds = [...new Set(bookings.map(b => b.customer.freshsalesContactId).filter((x): x is string => !!x))]
  const fsContacts = fsIds.length
    ? await db.freshsalesContact.findMany({ where: { id: { in: fsIds } }, select: { id: true, raw: true, fsCreatedAt: true } })
    : []
  const fsById = new Map(fsContacts.map(c => [c.id, c]))

  // Resolve each booking's touch source first, so the paid-visit lookups can be batched
  const resolved = bookings.map(b => {
    const c = b.customer
    let inq: InquiryTouchFields[] = c.inquiries
    const linked = c.freshsalesContactId ? fsById.get(c.freshsalesContactId) ?? null : null
    let fs: { id: string; created: Date | null; raw: Json | null } | null = linked ? { id: linked.id, created: linked.fsCreatedAt, raw: (linked.raw as Json | null) ?? null } : null
    let touches = inquiryTouches(inq)
    let from: Win['attributionFrom'] = hasAnyTouch(touches) ? 'inquiry' : null

    // An agent booking's source IS the agent — no UTM applies, so it never counts as untracked
    if (b.source === 'AGENT') { touches = AGENT_TOUCH(b.agent?.name ?? null); from = 'agent' }
    if (!from && fs?.raw && hasAnyTouch(contactTouches(fs.raw))) { touches = contactTouches(fs.raw); from = 'freshsales' }
    // No stored link carries touch data — look the guest up by email/phone
    if (!from) {
      const leadInq = match.lead(c.email, c.phone)
      if (leadInq) { inq = leadInq; touches = inquiryTouches(leadInq); from = 'lead-match' }
    }
    if (!from) {
      const m = match.contact(c.email, c.phone)
      if (m && hasAnyTouch(contactTouches(m.raw))) { fs = m; touches = contactTouches(m.raw); from = 'freshsales-match' }
    }
    return { b, inq, fs, touches, from }
  })

  const fsContactIds = [...new Set(resolved.map(r => r.fs?.id).filter((x): x is string => !!x))]
  const fsViews = await loadFreshsalesPageViews(db, fsContactIds)
  // The ERP's own page tracking (WordPress pageview beacon) — guests only, paid landings only
  const customerIds = resolved.map(r => r.b.customer.id)
  const pageViews = customerIds.length ? await db.$queryRaw<{ customerId: string; at: Date; url: string }[]>`
    SELECT "customerId", "occurredAt" AS at, url FROM "PageView" WHERE "customerId" = ANY(${customerIds})` : []
  const erpVisits = new Map<string, TouchEvent[]>()
  for (const v of pageViews) {
    const t = visitTouch(v.url, v.at, 'PAGE_VIEW')
    if (t) erpVisits.set(v.customerId, [...(erpVisits.get(v.customerId) ?? []), { kind: 'visit', touch: t }])
  }

  const wins = resolved.map(({ b, inq, fs, touches: resolvedTouches, from }) => {
    let touches = resolvedTouches
    const c = b.customer
    const cf = ((fs?.raw?.custom_field as Json | null) ?? {})
    const pageUrl = inq.find(i => i.url)?.url
    const isAgent = b.source === 'AGENT' || b.deals.some(d => d.bookingType === 'AGENT')
    const isRepeat = !isAgent && (b.deals.some(d => d.bookingType === 'REPEAT') || (firstBookingAt.get(c.id) ?? Infinity) < +b.createdAt)
    // Ad attribution of THIS booking's deal (src/lib/deal-attribution.ts); a booking without a deal is
    // treated as one: its window runs from the guest's previous booking to this one.
    const da = b.deals.map(d => d.attribution).find(a => a?.adRole)
    let per: { role: AdRole; network: string | null; evidence: string | null; first: Touch | null }
    if (da) {
      per = { role: roleOf({ role: da.adRole as DealAttributionResult['role'] }), network: da.adNetwork, evidence: da.adEvidence,
        first: da.firstSource || da.firstMedium || da.firstCampaign ? { source: da.firstSource, medium: da.firstMedium, campaign: da.firstCampaign } : null }
    } else {
      const prev = previousDealAt((bookingTimes.get(c.id) ?? []).filter(t => t !== +b.createdAt), b.createdAt)
      const windowInq = c.inquiries.filter(i => +i.createdAt > (prev ? +prev : -Infinity) && +i.createdAt <= +b.createdAt)
      const opened = windowInq[0]?.createdAt ?? b.createdAt
      const linkedFs = c.freshsalesContactId ? fsById.get(c.freshsalesContactId) : null
      const events: TouchEvent[] = [
        ...c.inquiries.flatMap(i => inquiryEvents(i)),
        ...visitEvents(fs ? fsViews.get(fs.id) ?? [] : [], 'FRESHSALES_WEB'),
        ...(erpVisits.get(c.id) ?? []),
        ...(linkedFs ? [freshsalesContactFirstTouch(linkedFs)].filter((t): t is NonNullable<typeof t> => !!t).map(t => ({ kind: 'contact-first' as const, touch: t })) : []),
      ]
      const r = computeDealAttribution({ dealId: `booking:${b.id}`, createdAt: opened, closedAt: b.createdAt, previousDealAt: prev, events })
      per = { role: roleOf(r), network: r.network, evidence: r.evidence, first: r.first ? { source: r.first.source, medium: r.first.medium, campaign: r.first.campaign } : null }
    }
    if (!isAgent && per.first) touches = { ...touches, first: per.first }
    const ad = isAgent
      ? { role: 'none' as const, network: null, evidence: 'Agent booking — not counted for ads' }
      : { role: per.role, network: per.network as AdNetwork | null, evidence: per.evidence }
    const win: Win = {
      id: b.id,
      name: `${b.bookingCode} · ${c.name}`,
      date: b.createdAt.toISOString(),
      closedDate: null,
      amountUsd: b.totalPrice,
      owner: b.salespersonUser?.name ?? s(b.salesperson),
      pipeline: isAgent ? 'Agent' : 'Direct',
      bookingType: isAgent ? 'Agent' : isRepeat ? 'Repeat' : 'Direct',
      agentReason: isAgent ? (b.source === 'AGENT' ? 'Agent booking' : 'Deal marked as agent booking') : null,
      agent: b.agent?.name ?? null,
      tripType: TRIP_TYPE_LABEL[b.tripType] ?? b.tripType,
      landingPage: tidyLanding(pageUrl ? `:referer: ${pageUrl}` : cf.cf_referer_field),
      enquiryVia: s(fs?.raw?.medium),
      touches,
      adRole: ad.role,
      adNetwork: ad.network,
      adEvidence: ad.evidence,
      issues: !b.totalPrice || b.totalPrice <= 0 ? ['Amount 0'] : [],
      attributionFrom: from,
    }
    return win
  })
  return { wins, excludedTests }
}
