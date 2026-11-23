import { createHash } from 'crypto'
import type { LeadStage, Prisma, PrismaClient, WhatsappBrand } from '@prisma/client'
import { CONSENT_BANNER_REGIONS, isEeaUkChNationality, isRealGrant, manualConsentRows } from '@/lib/ad-consent'

// Offline conversion feeds for Google (Data Manager via Sheets) and Meta (Conversions API) —
// go-live parity D. Spec: "Samara Yachting ERP – Google Offline Feed Mapping.xlsx" (Jay, 19 Nov) +
// the IT handover §6–7. Column names are kept EXACTLY as the Freshsales box feed so the existing
// Data Manager connections keep working during dual-write.
//
// Rows (one per deal + action, ever):
//   AC_PC / AC_OT    deal first reaches In Active Communication or any later stage (FU1/FU2, booking,
//                    invoice, won) — fixed value IDR 18,167,000 (PC) / 5,087,000 (OT)
//   INV_PC / INV_OT  deal reaches Send Invoice 1 — deal amount + currency. Only that stage: a deal
//                    that goes Booking Confirmation → Won without an invoice stage gets no INV row (Roy, 23 Nov)
//   BOOKING          deal first reaches Send Booking Confirmation or later — booking value
//   Conversion time = the DealStageChange timestamp (parity C2). No trip type → "Stage unknown".
// Never written (Exclusions tab): 1 consent denied anywhere · 2 deal on the never-upload list ·
//   3 EU/EEA/UK/CH (nationality, consent region, phone prefix, email TLD) without a real banner grant ·
//   4 WhatsApp match Low · 5 no identifier (GCLID/GBRAID/WBRAID/email/phone) · 7 no deal amount (INV).
// 6: a row in the ledger is re-emitted unchanged until 90 days old; a later value / time change is
//   queued as an AdUploadChange for approval, never re-sent silently.

export const FEED_WINDOW_MS = 90 * 24 * 60 * 60 * 1000
export const FEED_COLUMNS = [
  'Conversion_Time', 'Order_ID', 'Stage', 'Google_Click_ID', 'GBRAID', 'WBRAID', 'Email', 'Phone_Number',
  'Conversion_Value', 'Conversion_Currency', 'Ad_User_Data', 'Ad_Personalization', 'User_Agent', 'Session_Attributes',
  'Event_Source', 'IP_Address',
] as const
export type FeedRow = Record<(typeof FEED_COLUMNS)[number], string | number>
export type GoogleAction = 'AC_PC' | 'AC_OT' | 'INV_PC' | 'INV_OT' | 'BOOKING'

/** Conversion actions per brand account (Stage → Action tab). Otium / Mischief IDs: TBD (Jay). */
export const GOOGLE_ACCOUNTS: Record<WhatsappBrand, { account: string; actions: Partial<Record<GoogleAction, string>> }> = {
  SAMARA: { account: 'AW-814620063 (873-186-9919)', actions: { AC_PC: '7893494089', AC_OT: '7893494092', INV_PC: '7894047821', INV_OT: '7894047824', BOOKING: '7883614721' } },
  OTIUM: { account: 'AW-18383019939', actions: {} },
  MISCHIEF: { account: 'AW-11449361649', actions: {} },
} as Record<WhatsappBrand, { account: string; actions: Partial<Record<GoogleAction, string>> }>

const AC_DEFAULT_VALUE = { PRIVATE_CHARTER: 18167000, OPEN_TRIP: 5087000 } as const
/** Freshsales never_upload.json (handover §6) — also Deal.neverUpload. */
export const NEVER_UPLOAD_ORDER_IDS = new Set(['113001507993', '113001505078'])

const AC_STAGES: LeadStage[] = ['ACTIVE_COMMUNICATION', 'FOLLOW_UP_1', 'FOLLOW_UP_2', 'BOOKING_CONFIRMATION', 'INVOICE_SENT', 'CLOSED_WON']
const INV_STAGES: LeadStage[] = ['INVOICE_SENT']
const BOOKING_STAGES: LeadStage[] = ['BOOKING_CONFIRMATION', 'INVOICE_SENT', 'CLOSED_WON']

export const BRAND_TAB: Record<string, string> = { SAMARA: 'Samara', OTIUM: 'Otium', MISCHIEF: 'Mischief' }

// ── identity / consent helpers ──────────────────────────────────────────────────

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const hashEmail = (e: string | null | undefined) => { const t = e?.trim().toLowerCase(); return t && t.includes('@') ? sha256(t) : '' }
/** E.164 only — never guesses a country code. */
export const hashPhone = (p: string | null | undefined) => { const t = (p ?? '').replace(/[^\d+]/g, '').replace(/^00/, '+'); return /^\+[1-9]\d{6,14}$/.test(t) ? sha256(t) : '' }

const EEA_PHONE_PREFIXES = ['+30', '+31', '+32', '+33', '+34', '+351', '+352', '+353', '+354', '+356', '+357', '+358', '+359', '+36', '+370', '+371', '+372', '+385', '+386', '+39', '+40', '+41', '+420', '+421', '+423', '+43', '+44', '+45', '+46', '+47', '+48', '+49']
const EEA_EMAIL_TLDS = new Set(['at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'fr', 'de', 'gr', 'hu', 'ie', 'it', 'lv', 'lt', 'lu', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se', 'uk', 'ch', 'is', 'li', 'no', 'eu'])

/** EU / EEA / UK / CH guest — from nationality, consent region, phone prefix or email TLD (handover §6 rule 3). */
export function isEeaContact(p: { nationality?: string | null; phoneE164?: string | null; email?: string | null; regions: (string | null)[] }): boolean {
  if (isEeaUkChNationality(p.nationality)) return true
  if (p.regions.some(r => r && CONSENT_BANNER_REGIONS.has(r))) return true
  const ph = p.phoneE164 ?? ''
  if (ph && EEA_PHONE_PREFIXES.some(x => ph.startsWith(x))) return true
  const tld = p.email?.trim().toLowerCase().split('.').pop()
  return !!tld && p.email!.includes('@') && EEA_EMAIL_TLDS.has(tld)
}

const WITA_MS = 8 * 60 * 60 * 1000
/** "2026-11-17T06:15:00+08:00" */
export function feedTime(d: Date): string {
  return new Date(d.getTime() + WITA_MS).toISOString().slice(0, 19) + '+08:00'
}

// ── building ────────────────────────────────────────────────────────────────────

export interface FeedCandidate {
  platform: 'GOOGLE'
  action: GoogleAction
  brand: WhatsappBrand
  dealId: string
  orderId: string
  conversionTime: Date
  row: FeedRow
}
export interface FeedExclusion { orderId: string; stage: string; brand: string; conversionTime: string; reason: string }
export interface MetaEvent {
  brand: WhatsappBrand; dealId: string; orderId: string; eventName: 'QualifiedLead' | 'Purchase'; eventTime: Date
  em: string; ph: string; fbc: string; fbp: string; value: number | null; currency: string | null; userAgent: string
}

type InqLite = { dealId: string | null; leadId: string | null; customerId: string | null; createdAt: Date; adConsent: string | null; consentRegion: string | null; matchConfidence: string | null; matchConfidenceById: string | null; gclid: string | null; lastGclid: string | null; gbraid: string | null; lastGbraid: string | null; wbraid: string | null; lastWbraid: string | null; fbc: string | null; fbp: string | null; userAgent: string | null; sessionAttributes: string | null; ipAddress: string | null }

const firstOf = <T,>(xs: T[], f: (x: T) => string | null | undefined) => { for (const x of xs) { const v = f(x)?.trim(); if (v) return v } return '' }

/**
 * Every row the feed would write now (before the ledger), plus exclusions and the Meta draft events.
 * Looks at deals with a stage change in the last 90 days.
 */
export async function computeOfflineFeed(db: PrismaClient, now = new Date()) {
  const since = new Date(now.getTime() - FEED_WINDOW_MS)
  const deals = await db.deal.findMany({
    where: { OR: [{ stageChanges: { some: { changedAt: { gte: since } } } }, { stageUpdatedAt: { gte: since } }] },
    select: {
      id: true, orderId: true, freshsalesDealId: true, brand: true, tripType: true, stage: true, stageUpdatedAt: true,
      amount: true, currency: true, neverUpload: true, deletedAt: true, leadId: true, customerId: true,
      stageChanges: { select: { toStage: true, changedAt: true }, orderBy: { changedAt: 'asc' } },
      booking: { select: { totalPrice: true, currency: true } },
      lead: { select: { email: true, phoneE164: true, nationality: true, freshsalesContactId: true, adConsent: true } },
      customer: { select: { email: true, phoneE164: true, nationality: true, freshsalesContactId: true } },
    },
  })

  const leadIds = [...new Set(deals.map(d => d.leadId).filter((x): x is string => !!x))]
  const custIds = [...new Set(deals.map(d => d.customerId).filter((x): x is string => !!x))]
  const inquiries: InqLite[] = leadIds.length || custIds.length ? await db.inquiry.findMany({
    where: { OR: [...(leadIds.length ? [{ leadId: { in: leadIds } }] : []), ...(custIds.length ? [{ customerId: { in: custIds } }] : [])] },
    select: { dealId: true, leadId: true, customerId: true, createdAt: true, adConsent: true, consentRegion: true, matchConfidence: true, matchConfidenceById: true, gclid: true, lastGclid: true, gbraid: true, lastGbraid: true, wbraid: true, lastWbraid: true, fbc: true, fbp: true, userAgent: true, sessionAttributes: true, ipAddress: true },
    orderBy: { createdAt: 'asc' },
  }) : []
  const inqByLead = new Map<string, InqLite[]>(), inqByCust = new Map<string, InqLite[]>()
  for (const q of inquiries) {
    if (q.leadId) inqByLead.set(q.leadId, [...(inqByLead.get(q.leadId) ?? []), q])
    if (q.customerId) inqByCust.set(q.customerId, [...(inqByCust.get(q.customerId) ?? []), q])
  }

  // Freshsales-born deals: click IDs on the Freshsales deal, consent on the Freshsales contact (cutover item 1).
  const fsDealIds = deals.map(d => d.freshsalesDealId).filter((x): x is string => !!x)
  const fsDeals = fsDealIds.length ? await db.$queryRaw<{ id: string; gclid: string | null; gbraid: string | null; wbraid: string | null; ua: string | null; sa: string | null; fbc: string | null; fbp: string | null }[]>`
    SELECT id, "customFields"->>'cf_gcl_id' gclid, "customFields"->>'cf_gbraid' gbraid, "customFields"->>'cf_wbraid' wbraid,
           "customFields"->>'cf_browser_user_agent' ua, "customFields"->>'cf_google_session_attributes' sa,
           "customFields"->>'cf_meta_fbc' fbc, "customFields"->>'cf_meta_fbp' fbp
      FROM "FreshsalesDeal" WHERE id = ANY(${fsDealIds})` : []
  const fsDeal = new Map(fsDeals.map(r => [r.id, r]))
  const fsContactIds = [...new Set(deals.flatMap(d => [d.lead?.freshsalesContactId, d.customer?.freshsalesContactId]).filter((x): x is string => !!x))]
  const fsContacts = fsContactIds.length ? await db.$queryRaw<{ id: string; consent: string | null; region: string | null; gclid: string | null }[]>`
    SELECT id, raw->'custom_field'->>'cf_ad_consent' consent, raw->'custom_field'->>'cf_consent_region' region, raw->'custom_field'->>'cf_gclid' gclid
      FROM "FreshsalesContact" WHERE id = ANY(${fsContactIds})` : []
  const fsContact = new Map(fsContacts.map(r => [r.id, r]))

  const candidates: FeedCandidate[] = []
  const stageUnknown: FeedRow[] = []
  const excluded: FeedExclusion[] = []
  const meta: MetaEvent[] = []
  // Deals that fail a consent / confidence gate on THIS run (handover §6 gates 1, 2, 3, 5 — checked
  // every run, "uploads read the current value at run time"): rows prepared for them earlier stop
  // being re-emitted (buildGoogleFeed), but nothing is retracted from Google (gate 6).
  const held = new Map<string, string>()

  for (const d of deals) {
    if (d.deletedAt) continue
    const orderId = d.orderId ?? d.freshsalesDealId ?? `ERP-${d.id}`
    const firstAt = (stages: LeadStage[]): Date | null => {
      const ch = d.stageChanges.find(c => stages.includes(c.toStage))
      if (ch) return ch.changedAt
      // Migrated deal without history: its current stage's timestamp.
      return !d.stageChanges.length && stages.includes(d.stage) && d.stageUpdatedAt ? d.stageUpdatedAt : null
    }
    const acAt = firstAt(AC_STAGES), invAt = firstAt(INV_STAGES), bookAt = firstAt(BOOKING_STAGES)
    if (!acAt && !invAt && !bookAt) continue

    const person = d.lead ?? d.customer
    const email = d.lead?.email ?? d.customer?.email ?? null
    const phoneE164 = d.lead?.phoneE164 ?? d.customer?.phoneE164 ?? null
    const personInq = [...(d.leadId ? inqByLead.get(d.leadId) ?? [] : []), ...(d.customerId ? inqByCust.get(d.customerId) ?? [] : [])]
    const dealInq = personInq.filter(q => q.dealId === d.id)
    // No enquiry linked to this deal → the person's other enquiries, minus Low WhatsApp matches (their
    // click IDs may be someone else's — handover §2 "Low never uploaded").
    const ids = dealInq.length ? dealInq : personInq.filter(q => q.matchConfidence !== 'LOW')
    const fsc = [d.lead?.freshsalesContactId, d.customer?.freshsalesContactId].map(id => (id ? fsContact.get(id) : undefined)).filter(Boolean) as typeof fsContacts
    const fsd = d.freshsalesDealId ? fsDeal.get(d.freshsalesDealId) : undefined

    // + consent sales recorded by hand on the lead (phone / email / agent leads — ad-consent.ts).
    const consents = [
      ...personInq.map(q => ({ c: q.adConsent, r: q.consentRegion })), ...fsc.map(c => ({ c: c.consent, r: c.region })),
      ...manualConsentRows(d.lead).map(m => ({ c: m.adConsent, r: m.consentRegion })),
    ]
    const denied = consents.some(x => x.c === 'denied')
    const eea = isEeaContact({ nationality: person?.nationality, phoneE164, email, regions: consents.map(x => x.r) })
    const realGrant = consents.some(x => isRealGrant({ adConsent: x.c, consentRegion: x.r }))
    const granted = consents.some(x => x.c === 'granted')
    const low = dealInq.some(q => q.matchConfidence === 'LOW')

    const gclid = firstOf(ids, q => q.gclid ?? q.lastGclid) || fsd?.gclid?.trim() || firstOf(fsc, c => c.gclid)
    const gbraid = firstOf(ids, q => q.gbraid ?? q.lastGbraid) || fsd?.gbraid?.trim() || ''
    const wbraid = firstOf(ids, q => q.wbraid ?? q.lastWbraid) || fsd?.wbraid?.trim() || ''
    const em = hashEmail(email), ph = hashPhone(phoneE164)
    const consentCol = granted && !denied ? 'GRANTED' : ''
    const base = {
      Google_Click_ID: gclid, GBRAID: gbraid, WBRAID: wbraid, Email: em, Phone_Number: ph,
      Ad_User_Data: consentCol, Ad_Personalization: consentCol,
      User_Agent: firstOf([...ids].reverse(), q => q.userAgent) || fsd?.ua?.trim() || '',
      Session_Attributes: firstOf([...ids].reverse(), q => q.sessionAttributes) || fsd?.sa?.trim() || '',
      Event_Source: 'WEB', IP_Address: '', // IP column off until Marc approves
    }
    const brandTab = BRAND_TAB[d.brand] ?? d.brand
    const exclusion = denied ? '1 · Consent denied'
      : (d.neverUpload || NEVER_UPLOAD_ORDER_IDS.has(orderId)) ? '2 · Never-upload list'
      : eea && !realGrant ? '3 · EU/EEA/UK/CH without opt-in'
      : low ? '4 · WhatsApp match Low'
      : !(gclid || gbraid || wbraid || em || ph) ? '5 · No identifier'
      : null
    if (exclusion && !exclusion.startsWith('5 ·')) held.set(d.id, exclusion)

    const events: { action: GoogleAction | null; at: Date | null; value: number | null; currency: string | null; stageLabel: string }[] = []
    const tt = d.tripType
    const suffix = tt === 'PRIVATE_CHARTER' ? 'PC' : tt === 'OPEN_TRIP' ? 'OT' : null
    if (acAt) events.push({ action: suffix ? (`AC_${suffix}` as GoogleAction) : null, at: acAt, value: tt ? AC_DEFAULT_VALUE[tt] : null, currency: 'IDR', stageLabel: suffix ? `AC_${suffix}` : '' })
    if (invAt) events.push({ action: suffix ? (`INV_${suffix}` as GoogleAction) : null, at: invAt, value: d.amount, currency: d.currency, stageLabel: suffix ? `INV_${suffix}` : '' })
    if (bookAt) events.push({ action: 'BOOKING', at: bookAt, value: d.booking?.totalPrice ?? d.amount, currency: d.booking?.currency ?? d.currency, stageLabel: 'BOOKING' })

    for (const ev of events) {
      if (!ev.at || ev.at < since) continue
      const row: FeedRow = {
        Conversion_Time: feedTime(ev.at), Order_ID: orderId, Stage: ev.stageLabel, ...base,
        Conversion_Value: ev.value ?? '', Conversion_Currency: ev.value != null ? (ev.currency ?? '') : '',
      }
      if (exclusion) { excluded.push({ orderId, stage: ev.stageLabel, brand: brandTab, conversionTime: row.Conversion_Time as string, reason: exclusion }); continue }
      if (!ev.action) { stageUnknown.push(row); continue }
      if (ev.value == null || !ev.currency) { excluded.push({ orderId, stage: ev.stageLabel, brand: brandTab, conversionTime: row.Conversion_Time as string, reason: '7 · No deal amount' }); continue }
      candidates.push({ platform: 'GOOGLE', action: ev.action, brand: d.brand, dealId: d.id, orderId, conversionTime: ev.at, row })
    }

    // Meta CRM draft (handover §7): no EU / UK guest data at all until consent is decided.
    if (!exclusion && !eea && (em || ph)) {
      const fbc = firstOf([...ids].reverse(), q => q.fbc) || fsd?.fbc?.trim() || ''
      const fbp = firstOf([...ids].reverse(), q => q.fbp) || fsd?.fbp?.trim() || ''
      if (acAt && acAt >= since) meta.push({ brand: d.brand, dealId: d.id, orderId, eventName: 'QualifiedLead', eventTime: acAt, em, ph, fbc, fbp, value: tt ? AC_DEFAULT_VALUE[tt] : null, currency: tt ? 'IDR' : null, userAgent: base.User_Agent })
      const bv = d.booking?.totalPrice ?? d.amount
      if (bookAt && bookAt >= since && bv != null) meta.push({ brand: d.brand, dealId: d.id, orderId, eventName: 'Purchase', eventTime: bookAt, em, ph, fbc, fbp, value: bv, currency: d.booking?.currency ?? d.currency ?? 'USD', userAgent: base.User_Agent })
    }
  }
  return { candidates, stageUnknown, excluded, meta, held }
}

// ── ledger ──────────────────────────────────────────────────────────────────────

const CHANGE_KEYS = ['Conversion_Time', 'Conversion_Value', 'Conversion_Currency'] as const

/**
 * Applies the ledger: prepared rows come out exactly as first prepared (until 90 days old); new rows
 * are added (persist=true) or shown as new (persist=false, preview); value / time changes on a
 * prepared row become PENDING AdUploadChanges.
 */
export async function buildGoogleFeed(db: PrismaClient, opts: { persist: boolean; now?: Date }) {
  const now = opts.now ?? new Date()
  const since = new Date(now.getTime() - FEED_WINDOW_MS)
  const { candidates, stageUnknown, excluded, meta, held } = await computeOfflineFeed(db, now)
  const ledger = await db.adUploadLedger.findMany({ where: { platform: 'GOOGLE' }, include: { changes: { select: { newRow: true, status: true } } } })
  const byKey = new Map(ledger.map(l => [`${l.action}|${l.orderId}`, l]))
  let added = 0, queued = 0

  for (const c of candidates) {
    const cur = byKey.get(`${c.action}|${c.orderId}`)
    if (!cur) {
      if (opts.persist) {
        const created = await db.adUploadLedger.create({
          data: { platform: 'GOOGLE', action: c.action, brand: c.brand, orderId: c.orderId, dealId: c.dealId, row: c.row as Prisma.InputJsonValue, conversionTime: c.conversionTime },
          include: { changes: { select: { newRow: true, status: true } } },
        }).catch(() => null) // raced with another run
        if (created) { byKey.set(`${c.action}|${c.orderId}`, created); added++ }
      } else {
        byKey.set(`${c.action}|${c.orderId}`, { id: '', platform: 'GOOGLE', action: c.action, brand: c.brand, orderId: c.orderId, dealId: c.dealId, row: c.row as Prisma.JsonValue, conversionTime: c.conversionTime, preparedAt: now, changes: [] })
        added++
      }
      continue
    }
    const old = cur.row as FeedRow
    const diff = CHANGE_KEYS.filter(k => String(old[k] ?? '') !== String(c.row[k] ?? ''))
    if (!diff.length) continue
    const newJson = JSON.stringify(c.row)
    if (cur.changes.some(ch => JSON.stringify(ch.newRow) === newJson)) continue // already queued / decided
    if (opts.persist && cur.id) {
      await db.adUploadChange.updateMany({ where: { ledgerId: cur.id, status: 'PENDING' }, data: { status: 'SUPERSEDED', decidedAt: now } })
      await db.adUploadChange.create({ data: { ledgerId: cur.id, oldRow: old as Prisma.InputJsonValue, newRow: c.row as Prisma.InputJsonValue, reason: diff.join(', ') } })
    }
    queued++
  }

  const tabs: Record<string, FeedRow[]> = { Samara: [], Otium: [], Mischief: [] }
  for (const l of byKey.values()) {
    if (l.conversionTime < since) continue
    // Prepared earlier, but the deal now fails a gate (denied, never-upload, EEA without opt-in, Low):
    // held — not re-emitted — and not retracted (handover §6 gates 1–6). It is already listed under
    // Excluded with that reason; say there that it had been prepared.
    const heldReason = l.dealId ? held.get(l.dealId) : undefined
    if (heldReason) {
      for (const x of excluded) {
        if (x.orderId === l.orderId && x.stage === (l.row as FeedRow).Stage && !x.reason.includes('prepared earlier')) {
          x.reason += ' — prepared earlier: held, not retracted'
        }
      }
      continue
    }
    const tab = BRAND_TAB[l.brand] ?? l.brand
    ;(tabs[tab] ??= []).push(l.row as FeedRow)
  }
  for (const t of Object.values(tabs)) t.sort((a, b) => String(b.Conversion_Time).localeCompare(String(a.Conversion_Time)))
  const pending = await db.adUploadChange.findMany({ where: { status: 'PENDING' }, include: { ledger: { select: { action: true, orderId: true, brand: true } } }, orderBy: { createdAt: 'desc' } })
  return { tabs, stageUnknown, excluded, meta, pending, added, queued }
}

/** Approve / reject a queued change. Approve = the ledger row becomes the new values (next feed run re-emits it). */
export async function decideAdUploadChange(db: PrismaClient, changeId: string, approve: boolean, userId: string) {
  const ch = await db.adUploadChange.findUnique({ where: { id: changeId } })
  if (!ch || ch.status !== 'PENDING') return { ok: false as const, error: 'Not pending' }
  await db.$transaction([
    db.adUploadChange.update({ where: { id: changeId }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: userId, decidedAt: new Date() } }),
    ...(approve ? [db.adUploadLedger.update({
      where: { id: ch.ledgerId },
      data: { row: ch.newRow as Prisma.InputJsonValue, conversionTime: parseFeedTime(String((ch.newRow as FeedRow).Conversion_Time)) },
    })] : []),
  ])
  return { ok: true as const }
}

const parseFeedTime = (s: string) => new Date(s)

// ── Meta Conversions API ─────────────────────────────────────────────────────────

export const META_COLUMNS = ['event_name', 'event_time', 'event_id', 'order_id', 'brand', 'action_source', 'em', 'ph', 'fbc', 'fbp', 'value', 'currency', 'client_user_agent'] as const
export function metaRow(e: MetaEvent): Record<(typeof META_COLUMNS)[number], string | number> {
  return {
    event_name: e.eventName, event_time: Math.floor(e.eventTime.getTime() / 1000), event_id: `${e.orderId}-${e.eventName}`, order_id: e.orderId,
    brand: BRAND_TAB[e.brand] ?? e.brand, action_source: 'system_generated', em: e.em, ph: e.ph, fbc: e.fbc, fbp: e.fbp,
    value: e.value ?? '', currency: e.currency ?? '', client_user_agent: e.userAgent,
  }
}

/**
 * Sends Meta CRM events once each (ledger platform META). OFF unless META_CAPI_ENABLED=1 — Marc has
 * to approve the event set first, and each brand needs META_CAPI_PIXEL_<BRAND> + META_CAPI_TOKEN_<BRAND>.
 * META_CAPI_TEST_CODE routes events to Events Manager › Test Events instead of the live pixel.
 */
export async function sendMetaEvents(db: PrismaClient, events: MetaEvent[]): Promise<{ sent: number; skipped: string }> {
  if (process.env.META_CAPI_ENABLED !== '1') return { sent: 0, skipped: 'META_CAPI_ENABLED is not 1' }
  const done = new Set((await db.adUploadLedger.findMany({ where: { platform: 'META' }, select: { action: true, orderId: true } })).map(l => `${l.action}|${l.orderId}`))
  let sent = 0
  for (const brand of ['SAMARA', 'OTIUM', 'MISCHIEF'] as WhatsappBrand[]) {
    const pixel = process.env[`META_CAPI_PIXEL_${brand}`], token = process.env[`META_CAPI_TOKEN_${brand}`]
    if (!pixel || !token) continue
    const todo = events.filter(e => e.brand === brand && !done.has(`${e.eventName}|${e.orderId}`)).slice(0, 500)
    if (!todo.length) continue
    const data = todo.map(e => ({
      event_name: e.eventName, event_time: Math.floor(e.eventTime.getTime() / 1000), event_id: `${e.orderId}-${e.eventName}`, action_source: 'system_generated',
      user_data: { ...(e.em && { em: [e.em] }), ...(e.ph && { ph: [e.ph] }), ...(e.fbc && { fbc: e.fbc }), ...(e.fbp && { fbp: e.fbp }), ...(e.userAgent && { client_user_agent: e.userAgent }) },
      custom_data: { order_id: e.orderId, ...(e.value != null && { value: e.value, currency: e.currency ?? 'USD' }) },
    }))
    const res = await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, ...(process.env.META_CAPI_TEST_CODE && { test_event_code: process.env.META_CAPI_TEST_CODE }) }),
    })
    if (!res.ok) { console.error('[meta-capi]', brand, res.status, (await res.text()).slice(0, 300)); continue }
    for (const e of todo) {
      await db.adUploadLedger.create({ data: { platform: 'META', action: e.eventName, brand, orderId: e.orderId, dealId: e.dealId, row: metaRow(e) as Prisma.InputJsonValue, conversionTime: e.eventTime } }).catch(() => {})
    }
    sent += todo.length
  }
  return { sent, skipped: '' }
}
