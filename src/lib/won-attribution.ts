// Data for the "Won Attribution" statistics menu: which campaign / source / medium the won
// business came from. Two separate datasets, never summed together (a guest won in Freshsales
// usually also has an ERP booking, so adding them would double count):
//  - Freshsales: won deals from the Freshsales archive, attributed through their contact's
//    first/last/latest touch fields and form custom fields.
//  - ERP: non-cancelled bookings, attributed through the guest's website Inquiry, falling back
//    to the guest's Freshsales contact when there is no inquiry.
// All amounts are USD (Freshsales base currency; Booking.totalPrice is always stored in USD).
import type { PrismaClient } from '@prisma/client'

export type TouchKey = 'first' | 'last' | 'latest'
export interface Touch { source: string | null; medium: string | null; campaign: string | null }

export interface Win {
  id: string
  name: string
  date: string | null
  amountUsd: number | null
  owner: string | null
  pipeline: string | null // Freshsales pipeline, or ERP booking source (Direct / Agent)
  agent: string | null
  tripType: string | null
  landingPage: string | null
  enquiryVia: string | null // Freshsales contact "Medium" field (Google / WA / Email) — how they reached out
  hasGclid: boolean
  hasFbclid: boolean
  touches: Record<TouchKey, Touch>
  // Where the touch data came from — the *-match values were found by guest email/phone,
  // not by a stored link, so the UI labels them.
  attributionFrom: 'inquiry' | 'freshsales' | 'lead-match' | 'freshsales-match' | 'agent' | null
}

type Json = Record<string, unknown>
const s = (v: unknown) => {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return t && !/^\{.*\}$/.test(t) ? t : null // drop unfilled ad-template macros like "{campaignid}"
}

/**
 * Coarse channel bucket from a messy source/medium pair. Freshsales and the website forms
 * spell the same thing many ways ("google"/"google-ads", "cpc"/"lead-google-ads-…"), so stats
 * group by this first and keep the raw source/medium for drill-down.
 */
export function channelGroup(t: Touch, ids: { gclid?: boolean; fbclid?: boolean } = {}): string {
  const src = (t.source ?? '').toLowerCase()
  const med = (t.medium ?? '').toLowerCase()
  const both = `${src} ${med}`
  if (med === 'agent') return 'Agent'
  if (!src && !med) return ids.gclid ? 'Paid Search' : ids.fbclid ? 'Paid Social' : 'Not tracked'
  const social = /facebook|instagram|\bfb\b|\big\b|meta|tiktok|linkedin|pinterest|twitter|\bx\.com/.test(both)
  const paid = /cpc|ppc|paid|\bads?\b|-ads|ads-|adwords|display|sem\b/.test(both)
  if (social) return paid || ids.fbclid ? 'Paid Social' : 'Organic Social'
  if (paid || ids.gclid) return 'Paid Search'
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
  // Website forms often only filled utm_term with the campaign name — use it when campaign is empty
  const term = s(cf.cf_utm_term)
  const t = (p: string): Touch => ({ source: s(r[`${p}_source`]), medium: s(r[`${p}_medium`]), campaign: s(r[`${p}_campaign`]) ?? term })
  return { first: t('first'), last: t('last'), latest: t('latest') }
}
const hasAnyTouch = (t: Record<TouchKey, Touch>) => Object.values(t).some(x => x.source || x.medium || x.campaign)

// ─── Freshsales won deals ───────────────────────────────────────────────────

export async function freshsalesWins(db: PrismaClient): Promise<Win[]> {
  const [lookups, users] = await Promise.all([
    db.freshsalesLookup.findMany({ where: { kind: { in: ['DEAL_STAGE', 'DEAL_PIPELINE'] } } }),
    db.freshsalesUser.findMany({ select: { id: true, name: true, email: true } }),
  ])
  const wonStages = lookups.filter(l => l.kind === 'DEAL_STAGE' && (l.extra as Json | null)?.forecast_type === 'Closed Won').map(l => l.fsId)
  const pipelineName = new Map(lookups.filter(l => l.kind === 'DEAL_PIPELINE').map(l => [l.fsId, l.name]))
  const ownerName = new Map(users.map(u => [u.id, u.name ?? u.email ?? u.id]))

  const deals = await db.freshsalesDeal.findMany({
    where: { stageFsId: { in: wonStages }, isDeleted: false },
    select: { id: true, name: true, baseCurrencyAmount: true, amount: true, ownerFsId: true, pipelineFsId: true, contactFsIds: true, closedDate: true, stageUpdatedAt: true, fsCreatedAt: true, customFields: true },
  })
  const contacts = await db.freshsalesContact.findMany({
    where: { id: { in: [...new Set(deals.flatMap(d => d.contactFsIds))] } },
    select: { id: true, raw: true },
  })
  const rawById = new Map(contacts.map(c => [c.id, (c.raw as Json | null) ?? null]))

  return deals
    // Agent Outreach deals are agent partnerships, not guest bookings
    .filter(d => !/agent outreach/i.test(pipelineName.get(d.pipelineFsId ?? '') ?? ''))
    .map(d => {
      // A deal can have several contacts — attribute to the first one that carries touch data
      const raws = d.contactFsIds.map(id => rawById.get(id) ?? null)
      const raw = raws.find(r => hasAnyTouch(contactTouches(r))) ?? raws[0] ?? null
      const cf = ((raw?.custom_field as Json | null) ?? {})
      let touches = contactTouches(raw)
      // Fallback: the deal's own UTM custom fields (only present once its detail has been pulled)
      const dcf = (d.customFields as Json | null) ?? {}
      if (!hasAnyTouch(touches) && (s(dcf.cf_utm_source) || s(dcf.cf_utm_medium) || s(dcf.cf_utm_campaign))) {
        const t = { source: s(dcf.cf_utm_source), medium: s(dcf.cf_utm_medium), campaign: s(dcf.cf_utm_campaign) }
        touches = { first: t, last: t, latest: t }
      }
      return {
        id: d.id,
        name: d.name,
        date: (d.closedDate ?? d.stageUpdatedAt ?? d.fsCreatedAt)?.toISOString() ?? null,
        amountUsd: d.baseCurrencyAmount ?? d.amount,
        owner: d.ownerFsId ? ownerName.get(d.ownerFsId) ?? null : null,
        pipeline: d.pipelineFsId ? pipelineName.get(d.pipelineFsId) ?? null : null,
        agent: null,
        tripType: tidyTripType(cf.cf_trip_type),
        landingPage: tidyLanding(cf.cf_referer_field),
        enquiryVia: s(raw?.medium),
        hasGclid: !!s(cf.cf_gclid) || !!s(dcf.cf_gcl_id),
        hasFbclid: false,
        touches,
        attributionFrom: hasAnyTouch(touches) ? 'freshsales' : null,
      }
    })
}

// ─── ERP bookings ───────────────────────────────────────────────────────────

const TRIP_TYPE_LABEL: Record<string, string> = { PRIVATE_CHARTER: 'Private Charter', OPEN_TRIP: 'Open Trip' }

type InquiryTouchFields = {
  utmSource: string | null; utmMedium: string | null; utmCampaign: string | null
  lastSource: string | null; lastMedium: string | null; lastCampaign: string | null
  latestSource: string | null; latestMedium: string | null; latestCampaign: string | null
  gclid: string | null; lastGclid: string | null; fbclid: string | null; lastFbclid: string | null; url: string | null
}
const INQUIRY_TOUCH_SELECT = {
  utmSource: true, utmMedium: true, utmCampaign: true, lastSource: true, lastMedium: true, lastCampaign: true,
  latestSource: true, latestMedium: true, latestCampaign: true, gclid: true, lastGclid: true, fbclid: true, lastFbclid: true, url: true,
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
const inquiryHasClick = (inq: InquiryTouchFields[], k: 'gclid' | 'fbclid') =>
  inq.some(i => (k === 'gclid' ? i.gclid || i.lastGclid : i.fbclid || i.lastFbclid))

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
  const contacts = await db.$queryRaw<{ email: string | null; phone: string | null; raw: Json }[]>`
    SELECT email, phone, jsonb_build_object(
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
  const contactByKey = new Map<string, Json>()
  for (const c of contacts) {
    const e = normEmail(c.email), p = normPhone(c.phone)
    if (e && !contactByKey.has(`e:${e}`)) contactByKey.set(`e:${e}`, c.raw)
    if (p && !contactByKey.has(`p:${p}`)) contactByKey.set(`p:${p}`, c.raw)
  }
  const keys = (email: string | null, phone: string | null) =>
    [normEmail(email) && `e:${normEmail(email)}`, normPhone(phone) && `p:${normPhone(phone)}`].filter((k): k is string => !!k)
  return {
    lead: (email: string | null, phone: string | null) => keys(email, phone).map(k => leadByKey.get(k)).find(Boolean) ?? null,
    contact: (email: string | null, phone: string | null) => keys(email, phone).map(k => contactByKey.get(k)).find(Boolean) ?? null,
  }
}

export async function erpWins(db: PrismaClient): Promise<Win[]> {
  const [bookings, match] = await Promise.all([
    db.booking.findMany({
      where: { status: { not: 'cancelled' } },
      select: {
        id: true, bookingCode: true, createdAt: true, totalPrice: true, source: true, tripType: true, salesperson: true,
        salespersonUser: { select: { name: true } },
        agent: { select: { name: true } },
        customer: {
          select: {
            name: true, email: true, phone: true, freshsalesContactId: true,
            inquiries: { orderBy: { createdAt: 'asc' }, select: INQUIRY_TOUCH_SELECT },
          },
        },
      },
    }),
    loadMatchIndex(db),
  ])
  const fsIds = [...new Set(bookings.map(b => b.customer.freshsalesContactId).filter((x): x is string => !!x))]
  const fsContacts = fsIds.length
    ? await db.freshsalesContact.findMany({ where: { id: { in: fsIds } }, select: { id: true, raw: true } })
    : []
  const fsRaw = new Map(fsContacts.map(c => [c.id, (c.raw as Json | null) ?? null]))

  return bookings.map(b => {
    const c = b.customer
    let inq: InquiryTouchFields[] = c.inquiries
    let raw = c.freshsalesContactId ? fsRaw.get(c.freshsalesContactId) ?? null : null
    let touches = inquiryTouches(inq)
    let from: Win['attributionFrom'] = hasAnyTouch(touches) ? 'inquiry' : null

    // An agent booking's source IS the agent — no UTM applies, so it never counts as untracked
    if (b.source === 'AGENT') {
      const t = { source: b.agent?.name ?? 'agent', medium: 'agent', campaign: null }
      touches = { first: t, last: t, latest: t }
      from = 'agent'
    }
    if (!from && raw && hasAnyTouch(contactTouches(raw))) { touches = contactTouches(raw); from = 'freshsales' }
    // No stored link carries touch data — look the guest up by email/phone
    if (!from) {
      const leadInq = match.lead(c.email, c.phone)
      if (leadInq) { inq = leadInq; touches = inquiryTouches(leadInq); from = 'lead-match' }
    }
    if (!from) {
      const mraw = match.contact(c.email, c.phone)
      if (mraw && hasAnyTouch(contactTouches(mraw))) { raw = mraw; touches = contactTouches(mraw); from = 'freshsales-match' }
    }
    const cf = ((raw?.custom_field as Json | null) ?? {})
    const pageUrl = inq.find(i => i.url)?.url
    return {
      id: b.id,
      name: `${b.bookingCode} · ${c.name}`,
      date: b.createdAt.toISOString(),
      amountUsd: b.totalPrice,
      owner: b.salespersonUser?.name ?? s(b.salesperson),
      pipeline: b.source === 'AGENT' ? 'Agent' : 'Direct',
      agent: b.agent?.name ?? null,
      tripType: TRIP_TYPE_LABEL[b.tripType] ?? b.tripType,
      landingPage: tidyLanding(pageUrl ? `:referer: ${pageUrl}` : cf.cf_referer_field),
      enquiryVia: s(raw?.medium),
      hasGclid: from !== 'agent' && (inquiryHasClick(inq, 'gclid') || !!s(cf.cf_gclid)),
      hasFbclid: from !== 'agent' && inquiryHasClick(inq, 'fbclid'),
      touches,
      attributionFrom: from,
    }
  })
}
