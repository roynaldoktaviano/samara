/**
 * Freshsales → ERP sync. Freshsales is still the sales team's main system and the source of
 * truth until cutover (Roy, 2026-11-12). READ-ONLY towards Freshsales: it only reads (GET /
 * filtered_search) and writes nothing but ERP tables — never change anything in Freshsales here.
 *
 * Two layers:
 *  1. pullFreshsalesDelta — contacts/deals changed in Freshsales since the last run go into the
 *     Freshsales* archive tables (src/lib/freshsales-archive.ts), plus their emails/timeline.
 *  2. reconcileFreshsalesToErp — compares the whole archive with Lead/Customer/Deal and writes only
 *     the differences, so anything drifted on the ERP side is put back to the Freshsales value.
 *
 * Mapping rules:
 *  - Person: one Lead per Freshsales contact (name, email, phone, owner); a Guest linked by
 *    email/phone gets the contact owner. A contact with a deal or an email and no ERP lead gets one.
 *  - Deal: one ERP Deal per Freshsales guest deal (go-live parity section B), hung on the lead of
 *    the deal's first contact (a contactless deal with an owner gets a stub person, source
 *    FRESHSALES_DEAL). Order ID = Freshsales deal ID. Lead.stage etc. follow the primary deal by
 *    DB trigger. Agent Outreach and Old Pipeline deals are not guest deals → no ERP deal (B6).
 *  - Dual-write: an ERP deal the deal maker opened for the same person within 30 min of the
 *    Freshsales deal (compatible trip type) is linked to it instead of getting a twin.
 *  - Stage names are the same on both sides (Sales Pipeline); older pipelines map by meaning.
 *  - Owner = an open deal's owner (else the contact owner); for Won/Lost the contact owner (else
 *    the deal owner). Philippe is passed over (Roy's call); no ERP user (Helena) → none.
 *  - Except: a lead a Sales rep is actively chatting with keeps that rep as owner (lead and its
 *    open deals) — src/lib/lead-chat-owner.ts.
 *  - A lead's WhatsApp / Instagram chats follow its owner (chat owner = lead owner).
 *  - No notifications are sent; owner moves are logged as MANUAL assignments.
 */
import type { LeadLostReason, LeadStage, Prisma, PrismaClient, TripType, WhatsappBrand } from '@prisma/client'
import { AGENT_CODE_RE, loadDealFixes, looksLikeTest } from '@/lib/deal-quality'
import { agentEmailSet, enquiryChannelFromFreshsales } from '@/lib/deal-classify'
import { refreshDealAttribution } from '@/lib/deal-attribution'
import { tripTypeFromText } from '@/lib/deal-maker'
import {
  DEAL_DETAIL_INCLUDE, FreshsalesClient, contactRow, dealDetailRow, dealIndexRow, linkContacts, retryDb,
  syncContactConversations, syncContactTimeline, upsertActivity, upsertContactRows,
} from './freshsales-archive'
import { OWNER_EMAIL_OVERRIDE, chatOwnersByLead } from './lead-chat-owner'
import { CONVERSATION_STAGES } from './lead-pipeline'
import { yachtFromFreshsales } from './deal-product-interest'

type Json = Record<string, any>
type Log = (m: string) => void

export const AGENT_PIPELINE = 'Agent Outreach Pipeline'
// Freshsales pipelines that are not guest deals (handover: Old Pipeline 13000016199, Agent Outreach 113000000045)
export const NON_GUEST_PIPELINES = /^(agent outreach pipeline|old pipeline)$/i
/** Lead.source of the stub person row of a Freshsales deal that has no contact (pre-Deal model: also
 *  every 2nd+ deal card; those are retired now that a person can hold many Deals). */
export const DEAL_CARD_SOURCE = 'FRESHSALES_DEAL'
// Won/Lost cards stay on the Sales Pipeline board this long (matches CLOSED_LOOKBACK_DAYS there)
const BOARD_CLOSED_DAYS = 90
const DAY_MS = 86400000

const STAGE_MAP: Record<string, LeadStage> = {
  'new enquiry': 'NEW', 'new': 'NEW',
  'initial message sent': 'INITIAL_MESSAGE_SENT',
  'in active communication': 'ACTIVE_COMMUNICATION', 'in communication': 'ACTIVE_COMMUNICATION', 'quote': 'ACTIVE_COMMUNICATION',
  '1st follow-up': 'FOLLOW_UP_1', '2nd follow-up': 'FOLLOW_UP_2',
  'send booking confirmation': 'BOOKING_CONFIRMATION', 'verbally confirmed': 'BOOKING_CONFIRMATION',
  'send invoice 1': 'INVOICE_SENT',
  'won': 'CLOSED_WON', 'closed won': 'CLOSED_WON',
  'lost': 'CLOSED_LOST', 'closed lost': 'CLOSED_LOST',
  // Qualified Deals Pipeline. Won = deposit received in the ERP (Roy, 20 Nov), so "Deposit Received
  // / Booking Confirmed" is Won here, same as "Won/Full Payment Received".
  'qualified leads': 'ACTIVE_COMMUNICATION', 'proposal sent': 'ACTIVE_COMMUNICATION', 'negotiation': 'ACTIVE_COMMUNICATION',
  'unresponsive': 'FOLLOW_UP_2',
  'deposit received / booking confirmed': 'CLOSED_WON', 'won/full payment received': 'CLOSED_WON',
}
// Freshsales payment status name → Deal.paymentStatus
const PAYMENT_MAP: Record<string, string> = { 'deposit paid': 'DEPOSIT_PAID', 'paid': 'PAID', 'not paid': 'NOT_PAID' }
// Implied payment status of a Freshsales stage when the deal has none set
const STAGE_PAYMENT: Record<string, string> = { 'deposit received / booking confirmed': 'DEPOSIT_PAID', 'won/full payment received': 'PAID' }
const LOST_MAP: Record<string, LeadLostReason> = {
  'opted our rival': 'COMPETITOR',
  'no inventory (no date available)': 'DATES',
  'price is too high': 'PRICE',
  'no response': 'NO_RESPONSE',
}
// FS user email → ERP user email where they differ (Efrinda logs into Freshsales as indah@)
const SKIP_OWNER = /philippe/i

// ─── small helpers ──────────────────────────────────────────────────────────

export const normEmail = (e?: string | null) => (e ? e.trim().toLowerCase() || null : null)
export function normPhone(p?: string | null) {
  if (!p) return null
  let d = p.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = '62' + d.slice(1)
  return d.length >= 8 ? d.slice(-10) : null
}
const sameDay = (a: Date | null | undefined, b: Date | null | undefined) =>
  (a ? a.toISOString().slice(0, 10) : null) === (b ? b.toISOString().slice(0, 10) : null)
const sameTime = (a: Date | null | undefined, b: Date | null | undefined) => (a ? +a : null) === (b ? +b : null)
const numOrNull = (v: unknown) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
/** "S1-D: Stuart James (2 pax) - 20 Dec 26/2N" → 2026-12-20 */
export function tripDateFromDealName(n: string) {
  const re = /(\d{1,2})\s*([A-Za-z]{3})[a-z]*\.?\s*'?(\d{2,4})\b/g
  for (let m; (m = re.exec(n));) {
    const mon = MONTHS[m[2].toLowerCase()]
    if (mon === undefined) continue
    let y = Number(m[3]); if (y < 100) y += 2000
    if (y < 2018 || y > 2035) continue
    const d = new Date(Date.UTC(y, mon, Number(m[1])))
    if (!isNaN(+d) && d.getUTCDate() === Number(m[1])) return d
  }
  return null
}
function dateOnly(v: unknown) {
  if (!v) return null
  const d = new Date(String(v))
  return isNaN(+d) ? null : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

type ArchiveDeal = Awaited<ReturnType<typeof loadDeals>>[number]
const loadDeals = (db: PrismaClient) => db.freshsalesDeal.findMany({
  where: { isDeleted: false },
  select: { id: true, name: true, amount: true, baseCurrencyAmount: true, currencyFsId: true, pipelineFsId: true, stageFsId: true, stageUpdatedAt: true, lostReasonFsId: true, ownerFsId: true, contactFsIds: true, fsCreatedAt: true, closedDate: true, customFields: true, paymentStatusFsId: true },
})

/** Trip details Freshsales knows about a deal — only what it actually has (null = unknown). */
export function dealTripInfo(d: Pick<ArchiveDeal, 'name' | 'customFields'>) {
  const cf = (d.customFields ?? {}) as Json
  const start = dateOnly(cf.cf_date_window_start) ?? tripDateFromDealName(d.name)
  const nights = numOrNull(cf.cf_number_of_nights) ?? numOrNull(d.name.match(/(\d+)\s*N\b/i)?.[1])
  const end = dateOnly(cf.cf_date_window_end) ?? (start && nights ? new Date(+start + nights * 86400000) : null)
  const adults = numOrNull(cf.cf_pax_adults), kids = numOrNull(cf.cf_pax_kids)
  const pax = adults !== null || kids !== null ? (adults ?? 0) + (kids ?? 0)
    : numOrNull(d.name.match(/\(?\s*(\d+)\s*pax\b/i)?.[1]) ?? numOrNull(cf.cf_number_of_guestss)
  const pi = String(cf.cf_product_interest ?? cf.cf_product_category ?? '').trim().toUpperCase()
  const prefix = d.name.trim().toUpperCase()
  const tripType: TripType | null = /^PC\b/.test(pi) || /^PC\s*\//.test(prefix) ? 'PRIVATE_CHARTER'
    // SV = Otium Signature Voyage, sold per cabin → Open Trip (Jay, 20 Nov)
    : /^(OT|ST|SV)\b/.test(pi) || /^(OT|ST|SV)\s*\//.test(prefix) ? 'OPEN_TRIP' : null
  return { start, end: end && start && end >= start ? end : null, pax: pax && pax > 0 && pax < 500 ? Math.round(pax) : null, tripType }
}

// ─── reconcile ──────────────────────────────────────────────────────────────

export type SyncChange = { kind: 'lead' | 'guest' | 'deal'; action: 'create' | 'link' | 'update' | 'retire'; id: string; fsContactId: string; name: string; fields: Record<string, [unknown, unknown]> }
export type ReconcileResult = { counts: Record<string, number>; changes: SyncChange[] }

const LEAD_SELECT = {
  id: true, name: true, firstName: true, lastName: true, email: true, phone: true, freshsalesContactId: true, freshsalesDealId: true,
  ownerId: true, source: true, deletedAt: true, bookingId: true,
} satisfies Prisma.LeadSelect
type LeadRow = Prisma.LeadGetPayload<{ select: typeof LEAD_SELECT }>

const DEAL_SELECT = {
  id: true, freshsalesDealId: true, orderId: true, leadId: true, customerId: true, brand: true, tripType: true, productInterest: true, stage: true, stageUpdatedAt: true,
  lostReason: true, lostNote: true, amount: true, currency: true, travelStartDate: true, travelEndDate: true, guestCount: true,
  ownerId: true, createdAt: true, deletedAt: true, channel: true, paymentStatus: true,
  bookingType: true, enquiryChannel: true, enquiryTripType: true, amountUsd: true, fxRate: true,
} satisfies Prisma.DealSelect
// Marketing classification is only filled in where the ERP deal has none — sales may have set it.
const FILL_ONLY_DEAL_FIELDS = new Set(['bookingType', 'enquiryChannel', 'enquiryTripType'])
type DealRow = Prisma.DealGetPayload<{ select: typeof DEAL_SELECT }>
type DealWant = Partial<Omit<DealRow, 'id'>>

// An ERP deal born during dual-write (website form / chat) is the same deal as the Freshsales one
// the deal maker made for that enquiry when both were opened this close together — it then takes
// the Freshsales deal ID as its Order ID instead of a second card being created.
const DUAL_WRITE_MATCH_MS = 30 * 60_000

/** Brand of a Freshsales deal: Otium / Mischief product interest or name, else Samara. */
export function dealBrandFromFs(d: Pick<ArchiveDeal, 'name' | 'customFields'>): WhatsappBrand {
  const cf = (d.customFields ?? {}) as Json
  const t = `${cf.cf_product_interest ?? ''} ${cf.cf_product_category ?? ''} ${d.name}`
  if (/otium/i.test(t)) return 'OTIUM'
  if (/mischief/i.test(t)) return 'MISCHIEF'
  return 'SAMARA'
}

export async function reconcileFreshsalesToErp(db: PrismaClient, opts: { apply: boolean; log?: Log }): Promise<ReconcileResult> {
  const log = opts.log ?? console.log
  const counts: Record<string, number> = {}
  const inc = (k: string, n = 1) => { counts[k] = (counts[k] ?? 0) + n }
  const changes: SyncChange[] = []

  const [contacts, allDeals, lookups, fsUsers, users, leads, customers, erpDeals, fixes] = await retryDb(db, () => Promise.all([
    db.freshsalesContact.findMany({ where: { isDeleted: false }, select: { id: true, name: true, email: true, phone: true, ownerFsId: true, raw: true, fsCreatedAt: true } }),
    loadDeals(db),
    db.freshsalesLookup.findMany({ where: { kind: { in: ['DEAL_STAGE', 'DEAL_PIPELINE', 'DEAL_REASON', 'CURRENCY', 'DEAL_PAYMENT_STATUS'] } } }),
    db.freshsalesUser.findMany(),
    db.user.findMany({ select: { id: true, email: true } }),
    db.lead.findMany({ select: LEAD_SELECT }),
    db.customer.findMany({ select: { id: true, name: true, email: true, phone: true, freshsalesContactId: true, ownerId: true, deletedAt: true } }),
    db.deal.findMany({ select: DEAL_SELECT }),
    loadDealFixes(db),
  ]))
  // Leads a Sales rep is chatting with: that rep is the owner, whatever Freshsales says
  const chatOwners = await retryDb(db, () => chatOwnersByLead(db))

  const name = (kind: string, id?: string | null) => (id ? lookups.find(l => l.kind === kind && l.fsId === id)?.name ?? null : null)
  const stageOf = new Map(lookups.filter(l => l.kind === 'DEAL_STAGE').map(l => [l.fsId, l]))
  const pipelineName = new Map(lookups.filter(l => l.kind === 'DEAL_PIPELINE').map(l => [l.fsId, l.name]))
  const isOpen = (d: ArchiveDeal) => ((stageOf.get(d.stageFsId ?? '')?.extra as Json | null)?.forecast_type ?? 'Open') === 'Open'
  // Agent Outreach and Old Pipeline deals are not guest deals (parity B6) — no ERP deal, and they
  // don't decide a contact's owner.
  const guestDeals = allDeals.filter(d => !NON_GUEST_PIPELINES.test(pipelineName.get(d.pipelineFsId ?? '') ?? ''))
  inc('FS deals skipped (Agent Outreach / Old Pipeline)', allDeals.length - guestDeals.length)
  // Test deals (Abel, Ursula Wastian, "Test" …) are never migrated; an ERP deal already made for one
  // is retired below like any other ineligible deal (marketing audit 2026-11-24, src/lib/deal-quality.ts).
  const contactNameById = new Map(contacts.map(c => [c.id, c.name]))
  const deals = guestDeals.filter(d => !(fixes.get(d.id)?.isTest ?? looksLikeTest(d.name, ...d.contactFsIds.map(id => contactNameById.get(id)))))
  inc('FS deals skipped (test deal)', guestDeals.length - deals.length)

  // Marketing classification of a Freshsales deal (marketing audit 2026-11-24, src/lib/deal-classify.ts)
  const wonStageIds = new Set(lookups.filter(l => l.kind === 'DEAL_STAGE' && (l.extra as Json | null)?.forecast_type === 'Closed Won').map(l => l.fsId))
  const contactRawById = new Map(contacts.map(c => [c.id, ((c.raw ?? {}) as Json)]))
  const contactEmailById = new Map(contacts.map(c => [c.id, c.email?.trim().toLowerCase() ?? '']))
  const agentMails = await retryDb(db, () => agentEmailSet(db))
  // First Freshchat conversation per contact → its channel (WhatsApp / Instagram / Messenger / web chat)
  const firstChatChannel = new Map<string, 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'WEB_FORM'>()
  for (const c of await retryDb(db, () => db.freshchatConversation.findMany({ where: { contactFsId: { not: null } }, select: { contactFsId: true, channelSource: true }, orderBy: { fcCreatedAt: 'asc' } }))) {
    if (firstChatChannel.has(c.contactFsId!)) continue
    const ch = c.channelSource === 'WHATSAPP' ? 'WHATSAPP' : c.channelSource === 'INSTA' ? 'INSTAGRAM' : c.channelSource === 'FB_NATIVE' ? 'MESSENGER' : c.channelSource === 'FRESHCHAT' ? 'WEB_FORM' : null
    if (ch) firstChatChannel.set(c.contactFsId!, ch)
  }
  const wonAtByContact = new Map<string, number[]>()
  for (const d of allDeals) {
    if (!wonStageIds.has(d.stageFsId ?? '')) continue
    const t = +(d.stageUpdatedAt ?? d.closedDate ?? d.fsCreatedAt ?? 0)
    for (const cid of d.contactFsIds) wonAtByContact.set(cid, [...(wonAtByContact.get(cid) ?? []), t])
  }
  const classifyFsDeal = (d: ArchiveDeal) => {
    const raws = d.contactFsIds.map(id => contactRawById.get(id)).filter((r): r is Json => !!r)
    const tagged = raws.some(r => (Array.isArray(r.tags) && r.tags.includes('Agents')) || r.custom_field?.cf_contact_type === 'Agent')
    const agentMail = d.contactFsIds.some(id => agentMails.has(contactEmailById.get(id) ?? ''))
    const isAgent = fixes.get(d.id)?.isAgent ?? (AGENT_CODE_RE.test(d.name) || tagged || agentMail)
    const created = +(d.fsCreatedAt ?? 0)
    const repeat = d.contactFsIds.some(id => (wonAtByContact.get(id) ?? []).some(t => t < created))
    const medium = raws.map(r => r.medium as string | null).find(Boolean)
    const formTrip = raws.map(r => r.custom_field?.cf_trip_type as string | null).find(Boolean)
    // The website form fills Trip Type / Referer on the contact it creates
    const viaForm = raws.some(r => r.custom_field?.cf_trip_type || r.custom_field?.cf_referer_field)
    const chat = d.contactFsIds.map(id => firstChatChannel.get(id)).find(Boolean) ?? null
    return {
      bookingType: (isAgent ? 'AGENT' : repeat ? 'REPEAT' : 'DIRECT') as 'AGENT' | 'REPEAT' | 'DIRECT',
      enquiryChannel: isAgent ? 'AGENT' as const : enquiryChannelFromFreshsales(medium, d.name) ?? (viaForm ? 'WEB_FORM' as const : chat),
      enquiryTripType: tripTypeFromText(formTrip) ?? dealTripInfo(d).tripType,
    }
  }

  // FS owner → ERP user id; undefined = leave the ERP owner alone (Philippe)
  const userByEmail = new Map(users.map(u => [u.email.toLowerCase(), u.id]))
  const userIds = new Set(users.map(u => u.id))
  const ownerMap = new Map<string, string | null | undefined>()
  for (const u of fsUsers) {
    if (SKIP_OWNER.test(u.name ?? '')) { ownerMap.set(u.id, undefined); continue }
    const em = (u.email ?? '').toLowerCase()
    ownerMap.set(u.id, (u.userId && userIds.has(u.userId) ? u.userId : null) ?? userByEmail.get(OWNER_EMAIL_OVERRIDE[em] ?? em) ?? null)
  }
  const erpOwner = (fsOwner: string | null | undefined): string | null | undefined => (fsOwner ? (ownerMap.has(fsOwner) ? ownerMap.get(fsOwner) : null) : null)

  const fsEmails = (c: (typeof contacts)[number]) => {
    const r = c.raw as Json | null
    return [...new Set([c.email, r?.work_email, ...((r?.emails ?? []) as Json[]).map(e => e?.value)].map(normEmail).filter((x): x is string => !!x))]
  }
  const fsPhones = (c: (typeof contacts)[number]) => {
    const r = c.raw as Json | null
    return [...new Set([c.phone, r?.mobile_number, r?.work_number, ...((r?.phone_numbers ?? []) as Json[]).map(p => p?.value)].map(normPhone).filter((x): x is string => !!x))]
  }

  // Each deal belongs to ONE contact: the first of its contacts that is already an ERP lead, else
  // simply its first contact. That contact's lead is the person the ERP deal hangs on.
  const leadByFs = new Map(leads.filter(l => l.freshsalesContactId).map(l => [l.freshsalesContactId!, l]))
  const contactIds = new Set(contacts.map(c => c.id))
  const dealsByContact = new Map<string, ArchiveDeal[]>()
  const dealHolder = new Map<string, string>()
  // Person owner keeps the pre-Deal rule (every non-Agent deal counts, Old Pipeline too), so
  // excluding Old Pipeline from ERP deals never clears or moves a contact's owner.
  const ownerDealsByContact = new Map<string, ArchiveDeal[]>()
  const eligible = new Set(deals.map(d => d.id))
  for (const d of allDeals) {
    if (pipelineName.get(d.pipelineFsId ?? '') === AGENT_PIPELINE) continue
    const holder = d.contactFsIds.find(id => leadByFs.has(id) && contactIds.has(id)) ?? d.contactFsIds.find(id => contactIds.has(id))
    if (!holder) continue
    ownerDealsByContact.set(holder, [...(ownerDealsByContact.get(holder) ?? []), d])
    if (!eligible.has(d.id)) continue
    dealHolder.set(d.id, holder)
    dealsByContact.set(holder, [...(dealsByContact.get(holder) ?? []), d])
  }
  const mainDeal = (cid: string, byContact = ownerDealsByContact) => {
    const ds = byContact.get(cid)
    if (!ds?.length) return null
    const open = ds.filter(isOpen)
    if (open.length > 1) inc('contacts with >1 open deal')
    return [...(open.length ? open : ds)].sort((a, b) => +(b.fsCreatedAt ?? 0) - +(a.fsCreatedAt ?? 0))[0]
  }

  // Unlinked ERP records, for linking FS contacts that have no lead/guest yet
  const freeLeadByEmail = new Map<string, LeadRow[]>(), freeLeadByPhone = new Map<string, LeadRow[]>()
  for (const l of leads) {
    if (l.freshsalesContactId || l.deletedAt || l.source === DEAL_CARD_SOURCE) continue
    const e = normEmail(l.email), p = normPhone(l.phone)
    if (e) freeLeadByEmail.set(e, [...(freeLeadByEmail.get(e) ?? []), l])
    if (p) freeLeadByPhone.set(p, [...(freeLeadByPhone.get(p) ?? []), l])
  }
  const custByFs = new Map(customers.filter(c => c.freshsalesContactId).map(c => [c.freshsalesContactId!, c]))
  const freeCustByEmail = new Map<string, (typeof customers)[number][]>(), freeCustByPhone = new Map<string, (typeof customers)[number][]>()
  for (const c of customers) {
    if (c.freshsalesContactId || c.deletedAt) continue
    const e = normEmail(c.email), p = normPhone(c.phone)
    if (e) freeCustByEmail.set(e, [...(freeCustByEmail.get(e) ?? []), c])
    if (p) freeCustByPhone.set(p, [...(freeCustByPhone.get(p) ?? []), c])
  }
  const usedLead = new Set<string>(), usedCust = new Set<string>()
  const pickFree = <T extends { id: string }>(emails: string[], phones: string[], byE: Map<string, T[]>, byP: Map<string, T[]>, used: Set<string>) =>
    [...emails.flatMap(e => byE.get(e) ?? []), ...phones.flatMap(p => byP.get(p) ?? [])].find(x => !used.has(x.id)) ?? null

  const leadUpdates = new Map<string, Prisma.LeadUncheckedUpdateInput>()
  const leadChange = new Map<string, SyncChange>()
  const leadCreates: Prisma.LeadCreateManyInput[] = []
  const custUpdates: { id: string; data: Prisma.CustomerUncheckedUpdateInput }[] = []
  const ownerMoves: { leadId: string; from: string | null; to: string | null }[] = []
  // FS contact id → the guest it is linked to (for deal.customerId)
  const custOfContact = new Map<string, string>()
  const now = new Date()

  const visibleOnBoard = (d: ArchiveDeal) => isOpen(d) || +(d.stageUpdatedAt ?? d.closedDate ?? 0) >= Date.now() - BOARD_CLOSED_DAYS * DAY_MS
  // Open deal → its sales rep, else the contact owner. Won/Lost → the contact owner (who handles
  // the person now), else the deal owner. Philippe (undefined) is passed over; if nobody usable
  // is left and Philippe was one of them, the ERP owner is left alone.
  const pickOwner = (d: ArchiveDeal | null, contactOwner: string | null | undefined): string | null | undefined => {
    const dealOwner = d?.ownerFsId ? erpOwner(d.ownerFsId) : null
    const order = d && isOpen(d) ? [dealOwner, contactOwner] : [contactOwner, dealOwner]
    return order.find(o => !!o) ?? (order.some(o => o === undefined) ? undefined : null)
  }
  // Queue the fields of `want` that differ from `lead` (person data only — deal data lives on Deal)
  const diffLead = (lead: LeadRow, want: Partial<LeadRow>, fsContactId: string) => {
    if (chatOwners.has(lead.id)) {
      if ('ownerId' in want && want.ownerId !== chatOwners.get(lead.id)) inc('lead owner: kept (rep who chats)')
      want = { ...want, ownerId: chatOwners.get(lead.id) }
    }
    const data: Prisma.LeadUncheckedUpdateInput = {}
    const fields: Record<string, [unknown, unknown]> = {}
    for (const [k, v] of Object.entries(want) as [keyof LeadRow, unknown][]) {
      const cur = lead[k] as unknown
      const same = v instanceof Date || cur instanceof Date ? sameTime(cur as Date, v as Date) : (cur ?? null) === (v ?? null)
      if (same) continue
      ;(data as Json)[k] = v
      fields[k] = [cur ?? null, v ?? null]
    }
    if ('ownerId' in data) {
      data.ownerAssignedAt = now
      ownerMoves.push({ leadId: lead.id, from: lead.ownerId, to: (data.ownerId as string | null) ?? null })
      inc(!lead.ownerId ? 'lead owner: filled' : !data.ownerId ? 'lead owner: cleared (FS has none / no ERP user)' : 'lead owner: changed')
    }
    for (const k of ['name', 'email', 'phone', 'deletedAt']) if (k in data) inc(`lead field: ${k}`)
    if (!Object.keys(data).length) { inc('lead: already in sync'); return }
    leadUpdates.set(lead.id, { ...(leadUpdates.get(lead.id) ?? {}), ...data })
    const ch = leadChange.get(lead.id)
    if (ch) Object.assign(ch.fields, fields)
    else leadChange.set(lead.id, { kind: 'lead', action: 'update', id: lead.id, fsContactId, name: lead.name, fields })
    if (lead.deletedAt && !('deletedAt' in data)) inc('lead: updated but soft-deleted in ERP (left deleted)')
  }

  // ── persons: one lead (+ guest link) per Freshsales contact ──
  const contactOwnerOf = new Map<string, string | null | undefined>()
  for (const c of contacts) {
    const emails = fsEmails(c), phones = fsPhones(c)
    const deal = mainDeal(c.id)
    const raw = (c.raw ?? {}) as Json
    const fsName = (c.name || [raw.first_name, raw.last_name].filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim() || null
    const cleanName = fsName && !fsName.includes('/') ? fsName : null
    const contactOwner = erpOwner(c.ownerFsId)
    contactOwnerOf.set(c.id, contactOwner)

    const want: Partial<LeadRow> = {}
    // A contact "name" that is really a deal title (PC/Mischief/Raja Ampat/Guest) isn't copied over
    if (cleanName) { want.name = cleanName; want.firstName = raw.first_name?.trim() || null; want.lastName = raw.last_name?.trim() || null }
    const ownerWanted = pickOwner(deal, contactOwner)
    if (ownerWanted !== undefined) want.ownerId = ownerWanted

    let lead = leadByFs.get(c.id) ?? null
    if (!lead && (deal || emails.length)) {
      const free = pickFree(emails, phones, freeLeadByEmail, freeLeadByPhone, usedLead)
      if (free) {
        usedLead.add(free.id)
        lead = free
        leadUpdates.set(free.id, { freshsalesContactId: c.id })
        leadChange.set(free.id, { kind: 'lead', action: 'link', id: free.id, fsContactId: c.id, name: free.name, fields: { freshsalesContactId: [null, c.id] } })
        inc('lead: linked existing ERP lead by email/phone')
      } else {
        const data: Prisma.LeadCreateManyInput = {
          name: fsName ?? emails[0] ?? phones[0] ?? `Freshsales ${c.id}`,
          firstName: want.firstName ?? null, lastName: want.lastName ?? null,
          email: c.email ?? emails[0] ?? null, phone: c.phone ?? null, freshsalesContactId: c.id,
          ownerId: want.ownerId ?? null, ownerAssignedAt: want.ownerId ? now : null,
          ...(c.fsCreatedAt ? { createdAt: c.fsCreatedAt } : {}),
        }
        leadCreates.push(data)
        changes.push({ kind: 'lead', action: 'create', id: '', fsContactId: c.id, name: data.name, fields: { owner: [null, data.ownerId] } })
        inc(deal ? 'lead: created (has FS deal)' : 'lead: created (FS contact with email, no deal)')
      }
    }
    if (lead) {
      // Email / phone: Freshsales wins when it has one and it really differs (not just formatting)
      if (emails.length && !emails.includes(normEmail(lead.email) ?? '')) want.email = c.email ?? emails[0]
      if (phones.length && !phones.includes(normPhone(lead.phone) ?? '')) want.phone = c.phone ?? raw.mobile_number ?? raw.work_number ?? null
      diffLead(lead, want, c.id)
    }

    // ── guest ──
    let cust = custByFs.get(c.id) ?? null
    const cdata: Prisma.CustomerUncheckedUpdateInput = {}
    if (!cust) {
      const free = pickFree(emails, phones, freeCustByEmail, freeCustByPhone, usedCust)
      if (free) { usedCust.add(free.id); cust = free; cdata.freshsalesContactId = c.id; inc('guest: linked by email/phone') }
    }
    if (cust) {
      custOfContact.set(c.id, cust.id)
      if (contactOwner !== undefined && (cust.ownerId ?? null) !== (contactOwner ?? null)) {
        cdata.ownerId = contactOwner
        inc(!cust.ownerId ? 'guest owner: filled' : !contactOwner ? 'guest owner: cleared' : 'guest owner: changed')
      }
      // Guest names/contacts are booking data — only fill blanks, never overwrite
      if (!cust.email && emails.length) cdata.email = c.email ?? emails[0]
      if (!cust.phone && c.phone) cdata.phone = c.phone
      if (Object.keys(cdata).length) {
        custUpdates.push({ id: cust.id, data: cdata })
        changes.push({ kind: 'guest', action: 'freshsalesContactId' in cdata ? 'link' : 'update', id: cust.id, fsContactId: c.id, name: cust.name, fields: Object.fromEntries(Object.entries(cdata).map(([k, v]) => [k, [(cust as Json)[k] ?? null, v]])) })
      }
    }
  }

  // Old per-deal card leads (pre-Deal model, source FRESHSALES_DEAL) whose deal has a contact:
  // the deal now hangs on that contact's own lead, so the duplicate person row is retired.
  for (const l of leads) {
    if (l.source !== DEAL_CARD_SOURCE || l.deletedAt) continue
    if (l.freshsalesDealId && !dealHolder.has(l.freshsalesDealId) && deals.some(d => d.id === l.freshsalesDealId)) continue // contactless: keeps its stub
    leadUpdates.set(l.id, { ...(leadUpdates.get(l.id) ?? {}), deletedAt: now })
    inc('deal card lead: retired (deal now on its contact\'s lead / not a guest deal)')
  }

  changes.push(...leadChange.values())
  log(`reconcile: ${leadCreates.length} leads to create, ${leadUpdates.size} to update, ${custUpdates.length} guests, ${ownerMoves.length} owner moves`)

  // ── write persons ──
  if (opts.apply) {
    for (let i = 0; i < leadCreates.length; i += 500) {
      await retryDb(db, () => db.lead.createMany({ data: leadCreates.slice(i, i + 500), skipDuplicates: true }))
    }
    const updates = [...leadUpdates].map(([id, data]) => ({ id, data }))
    for (let i = 0; i < updates.length; i += 100) {
      const chunk = updates.slice(i, i + 100)
      await retryDb(db, () => db.$transaction(chunk.map(u => db.lead.update({ where: { id: u.id }, data: u.data, select: { id: true } }))))
      if (i % 2000 === 0 && i) log(`  leads ${i}/${updates.length}`)
    }
    for (let i = 0; i < custUpdates.length; i += 100) {
      const chunk = custUpdates.slice(i, i + 100)
      await retryDb(db, () => db.$transaction(chunk.map(u => db.customer.update({ where: { id: u.id }, data: u.data, select: { id: true } }))))
    }
    if (ownerMoves.length) {
      for (let i = 0; i < ownerMoves.length; i += 1000) {
        await retryDb(db, () => db.leadAssignmentLog.createMany({ data: ownerMoves.slice(i, i + 1000).map(m => ({ leadId: m.leadId, fromUserId: m.from, toUserId: m.to, reason: 'MANUAL' as const })) }))
      }
      // Chats follow their lead's owner
      const byOwner = new Map<string | null, string[]>()
      for (const m of ownerMoves) byOwner.set(m.to, [...(byOwner.get(m.to) ?? []), m.leadId])
      for (const [to, ids] of byOwner) {
        for (let i = 0; i < ids.length; i += 1000) {
          const leadId = { in: ids.slice(i, i + 1000) }
          // spelled out: NOT(assignedToId = x) would skip unassigned (NULL) chats
          const differs = to ? { OR: [{ assignedToId: null }, { assignedToId: { not: to } }] } : { assignedToId: { not: null } }
          const [wa, ig] = await retryDb(db, () => Promise.all([
            db.whatsappConversation.updateMany({ where: { leadId, ...differs }, data: { assignedToId: to } }),
            db.instagramConversation.updateMany({ where: { leadId, ...differs }, data: { assignedToId: to } }),
          ]))
          inc('chats reassigned', wa.count + ig.count)
        }
      }
    }
  }

  // ── deals: one ERP Deal per Freshsales guest deal ──
  // Re-read the person rows so leads created above have ids (dry run: they just count as new).
  const leadsNow = opts.apply ? await retryDb(db, () => db.lead.findMany({ where: { OR: [{ freshsalesContactId: { not: null } }, { source: DEAL_CARD_SOURCE }] }, select: LEAD_SELECT })) : leads
  const leadOfContact = new Map(leadsNow.filter(l => l.freshsalesContactId).map(l => [l.freshsalesContactId!, l]))
  const stubByDeal = new Map(leadsNow.filter(l => l.source === DEAL_CARD_SOURCE && l.freshsalesDealId && !l.deletedAt).map(l => [l.freshsalesDealId!, l]))
  const dealByFs = new Map(erpDeals.filter(d => d.freshsalesDealId).map(d => [d.freshsalesDealId!, d]))
  // Unlinked ERP deals per lead, for the dual-write match
  const unlinkedByLead = new Map<string, DealRow[]>()
  for (const d of erpDeals) {
    if (d.freshsalesDealId || d.deletedAt || !d.leadId) continue
    unlinkedByLead.set(d.leadId, [...(unlinkedByLead.get(d.leadId) ?? []), d])
  }
  const usedUnlinked = new Set<string>()

  const dealCreates: Prisma.DealCreateManyInput[] = []
  const dealUpdates: { id: string; data: Prisma.DealUncheckedUpdateInput }[] = []
  const stubCreates: { lead: Prisma.LeadCreateManyInput; deal: Prisma.DealCreateManyInput }[] = []
  const eligibleIds = new Set(deals.map(d => d.id))

  const desired = (d: ArchiveDeal, leadId: string | null, contactOwner: string | null | undefined): DealWant => {
    const sn = stageOf.get(d.stageFsId ?? '')?.name ?? ''
    const stage = STAGE_MAP[sn.toLowerCase()]
    if (!stage) inc(`unmapped FS stage "${sn}"`)
    const want: DealWant = { freshsalesDealId: d.id, orderId: d.id, deletedAt: null, brand: dealBrandFromFs(d) }
    if (leadId) want.leadId = leadId
    if (stage) {
      want.stage = stage
      want.stageUpdatedAt = (stage === 'CLOSED_WON' ? fixes.get(d.id)?.wonAt : null) ?? d.stageUpdatedAt ?? d.closedDate ?? d.fsCreatedAt ?? null
      const reason = stage === 'CLOSED_LOST' ? name('DEAL_REASON', d.lostReasonFsId) : null
      want.lostReason = stage === 'CLOSED_LOST' && reason ? LOST_MAP[reason.toLowerCase()] ?? 'OTHER' : null
      want.lostNote = want.lostReason === 'OTHER' ? reason : null
    }
    if (d.amount !== null) { want.amount = d.amount; want.currency = name('CURRENCY', d.currencyFsId) }
    // ERP-side correction (FreshsalesDealFix) beats the Freshsales value
    const fixAmount = fixes.get(d.id)?.amount
    if (fixAmount != null) { want.amount = fixAmount; want.currency = fixes.get(d.id)?.currency ?? 'USD' }
    // USD value: Freshsales converts to its base currency (USD) itself; a USD correction is its own value
    const usd = fixAmount != null && (!fixes.get(d.id)?.currency || fixes.get(d.id)?.currency === 'USD') ? fixAmount : d.baseCurrencyAmount
    if (usd != null) { want.amountUsd = usd; want.fxRate = want.amount ? usd / want.amount : null }
    const cls = classifyFsDeal(d)
    want.bookingType = cls.bookingType
    if (cls.enquiryChannel) want.enquiryChannel = cls.enquiryChannel
    if (cls.enquiryTripType) want.enquiryTripType = cls.enquiryTripType
    const pay = name('DEAL_PAYMENT_STATUS', d.paymentStatusFsId)
    const payWanted = (pay && PAYMENT_MAP[pay.toLowerCase()]) || STAGE_PAYMENT[sn.toLowerCase()]
    if (payWanted) want.paymentStatus = payWanted
    const trip = dealTripInfo(d)
    if (trip.start) want.travelStartDate = trip.start
    if (trip.end) want.travelEndDate = trip.end
    if (trip.pax) want.guestCount = trip.pax
    if (trip.tripType) want.tripType = trip.tripType
    // Product Interest "PC / S2" → yacht "Samara II" (the PC / OT half is tripType above)
    const yacht = yachtFromFreshsales(String(((d.customFields ?? {}) as Json).cf_product_interest ?? ''))
    if (yacht) want.productInterest = yacht
    let owner = pickOwner(d, contactOwner)
    // The rep who chats with this person keeps the open deal (same rule as the lead owner)
    if (leadId && isOpen(d) && chatOwners.has(leadId)) owner = chatOwners.get(leadId)
    if (owner !== undefined) want.ownerId = owner
    return want
  }
  const diffDeal = (cur: DealRow, want: DealWant) => {
    // Chat activity the ERP sees (incl. replies sent from Freshchat, src/lib/freshchat-mirror.ts)
    // moves open deals along the conversation stages before sales drag the card in Freshsales.
    // Freshsales may move a deal forward or out of those stages, but never back to an earlier
    // conversation stage (Roy, 2026-11-20: "kok masih New Enquiry padahal dah komunikasi").
    const fsRank = want.stage ? CONVERSATION_STAGES.indexOf(want.stage) : -1
    const erpRank = cur.stage ? CONVERSATION_STAGES.indexOf(cur.stage) : -1
    if (fsRank >= 0 && erpRank > fsRank) {
      want = { ...want }
      delete want.stage; delete want.stageUpdatedAt; delete want.lostReason; delete want.lostNote
      inc('deal: ERP conversation stage ahead of Freshsales — kept')
    }
    const data: Json = {}
    const fields: Record<string, [unknown, unknown]> = {}
    for (const [k, v] of Object.entries(want) as [keyof DealRow, unknown][]) {
      const c = cur[k] as unknown
      if (FILL_ONLY_DEAL_FIELDS.has(k) && c != null) continue
      const same = v instanceof Date || c instanceof Date
        ? (k === 'stageUpdatedAt' || k === 'deletedAt' ? sameTime(c as Date, v as Date) : sameDay(c as Date, v as Date))
        : (c ?? null) === (v ?? null)
      if (same) continue
      data[k] = v
      fields[k] = [c ?? null, v ?? null]
    }
    if ('ownerId' in data) data.ownerAssignedAt = now
    if (!Object.keys(fields).length) { inc('deal: already in sync'); return }
    if ('stage' in fields) inc(`deal stage → ${data.stage}`)
    for (const k of ['leadId', 'ownerId', 'amount', 'lostReason', 'travelStartDate', 'guestCount', 'tripType', 'productInterest', 'brand', 'freshsalesDealId', 'deletedAt', 'paymentStatus']) if (k in fields) inc(`deal field: ${k}`)
    dealUpdates.push({ id: cur.id, data })
    changes.push({ kind: 'deal', action: 'freshsalesDealId' in fields ? 'link' : 'update', id: cur.id, fsContactId: '', name: String(want.freshsalesDealId ?? cur.freshsalesDealId ?? ''), fields })
  }

  for (const d of deals) {
    const holder = dealHolder.get(d.id) ?? null
    const lead = holder ? leadOfContact.get(holder) ?? null : stubByDeal.get(d.id) ?? null
    const contactOwner = holder ? contactOwnerOf.get(holder) : null
    const want = desired(d, lead?.id ?? null, contactOwner)
    if (holder && custOfContact.has(holder)) want.customerId = custOfContact.get(holder)!
    const existing = dealByFs.get(d.id)
    if (existing) { diffDeal(existing, want); continue }

    // Born in the ERP during dual-write (deal maker) — same person, compatible type, opened within 30 min
    const fsAt = +(d.fsCreatedAt ?? 0)
    const twin = lead ? (unlinkedByLead.get(lead.id) ?? []).find(e =>
      !usedUnlinked.has(e.id) && Math.abs(+e.createdAt - fsAt) <= DUAL_WRITE_MATCH_MS
      && (!e.tripType || !want.tripType || e.tripType === want.tripType)) : undefined
    if (twin) {
      usedUnlinked.add(twin.id)
      inc('deal: ERP deal matched to its Freshsales twin (dual-write)')
      diffDeal(twin, want)
      continue
    }

    if (!holder) {
      // A deal with no contact: needs an owner (else it's form spam) and to be on the board
      if (!lead && (!visibleOnBoard(d) || !want.ownerId)) { inc('deal: skipped (no contact, no owner / off the board)'); continue }
      if (!lead) {
        const stubId = `fsdeal_${d.id}`
        stubCreates.push({
          lead: { id: stubId, name: d.name, source: DEAL_CARD_SOURCE, ownerId: want.ownerId ?? null, ownerAssignedAt: want.ownerId ? now : null, ...(d.fsCreatedAt ? { createdAt: d.fsCreatedAt } : {}) },
          deal: { ...(want as Prisma.DealCreateManyInput), leadId: stubId, channel: 'FRESHSALES', ...(d.fsCreatedAt ? { createdAt: d.fsCreatedAt } : {}) },
        })
        inc('deal: created (deal without contact, stub person)')
        continue
      }
    } else if (!lead) {
      inc(opts.apply ? 'deal: skipped (contact has no lead)' : 'deal: created (for a lead created this run)')
      continue
    }
    dealCreates.push({ ...(want as Prisma.DealCreateManyInput), channel: 'FRESHSALES', ...(d.fsCreatedAt ? { createdAt: d.fsCreatedAt } : {}) })
    changes.push({ kind: 'deal', action: 'create', id: '', fsContactId: holder ?? '', name: d.name, fields: { stage: [null, want.stage], owner: [null, want.ownerId] } })
    inc('deal: created')
  }
  // Deals whose Freshsales deal is gone, or is not a guest deal (moved to Old Pipeline / Agent Outreach)
  for (const d of erpDeals) {
    if (!d.freshsalesDealId || d.deletedAt || eligibleIds.has(d.freshsalesDealId)) continue
    dealUpdates.push({ id: d.id, data: { deletedAt: now } })
    changes.push({ kind: 'deal', action: 'retire', id: d.id, fsContactId: '', name: d.freshsalesDealId, fields: { deletedAt: [null, now] } })
    inc('deal: retired (FS deal deleted / not a guest deal)')
  }

  log(`reconcile: ${dealCreates.length + stubCreates.length} deals to create, ${dealUpdates.length} to update`)
  if (!opts.apply) return { counts, changes }

  // Stage history rows these writes trigger are labelled FRESHSALES (deal_stage_history trigger)
  const asFreshsales = () => db.$executeRaw`SELECT set_config('app.stage_source', 'FRESHSALES', true)`
  for (let i = 0; i < stubCreates.length; i += 200) {
    const chunk = stubCreates.slice(i, i + 200)
    await retryDb(db, () => db.lead.createMany({ data: chunk.map(s => s.lead), skipDuplicates: true }))
    await retryDb(db, () => db.$transaction([asFreshsales(), db.deal.createMany({ data: chunk.map(s => s.deal), skipDuplicates: true })]))
  }
  for (let i = 0; i < dealCreates.length; i += 500) {
    await retryDb(db, () => db.$transaction([asFreshsales(), db.deal.createMany({ data: dealCreates.slice(i, i + 500), skipDuplicates: true })]))
    if (i % 2000 === 0 && i) log(`  deals created ${i}/${dealCreates.length}`)
  }
  for (let i = 0; i < dealUpdates.length; i += 100) {
    const chunk = dealUpdates.slice(i, i + 100)
    await retryDb(db, () => db.$transaction([asFreshsales(), ...chunk.map(u => db.deal.update({ where: { id: u.id }, data: u.data, select: { id: true } }))]))
    if (i % 2000 === 0 && i) log(`  deals updated ${i}/${dealUpdates.length}`)
  }
  inc('stage history rows imported from Freshsales timeline', await importFreshsalesStageHistory(db))
  await linkContacts(db)
  // Per-deal ad attribution (src/lib/deal-attribution.ts) for deals this sync made, or closed (their
  // window ends at Won / Lost)
  const attrIds = new Set(dealUpdates.filter(u => 'stage' in u.data).map(u => u.id))
  for (const d of await retryDb(db, () => db.deal.findMany({ where: { deletedAt: null, attribution: null }, select: { id: true }, take: 2000 }))) attrIds.add(d.id)
  const ids = [...attrIds]
  for (let i = 0; i < ids.length; i += 50) {
    await retryDb(db, () => refreshDealAttribution(db, ids.slice(i, i + 50))).catch(e => log(`  deal attribution failed: ${e}`))
  }
  if (ids.length) inc('deal ad attribution refreshed', ids.length)
  log('reconcile: written')
  return { counts, changes }
}

/**
 * Stage history of Freshsales-linked deals from the Freshsales timeline (STAGE_CHANGE / CREATE events
 * carry the stage name and time) → DealStageChange, source FRESHSALES. Idempotent: an event already
 * imported, or matching a row the trigger wrote within 2 minutes, is skipped. Read-only on Freshsales.
 */
export async function importFreshsalesStageHistory(db: PrismaClient): Promise<number> {
  const map = Object.entries(STAGE_MAP).map(([n, st]) => `('${n.replace(/'/g, "''")}', '${st}')`).join(', ')
  return db.$executeRawUnsafe(`
    INSERT INTO "DealStageChange" (id, "dealId", "fromStage", "toStage", "changedAt", source)
    SELECT 'fs_' || e.id, d.id, NULL, m.stage::"LeadStage", e."occurredAt", 'FRESHSALES'
      FROM "FreshsalesTimelineEvent" e
      JOIN "Deal" d ON d."freshsalesDealId" = e."targetFsId"
      JOIN (VALUES ${map}) AS m(name, stage) ON m.name = lower(e."actionData"->>'stage_name')
     WHERE e."targetType" = 'Deal' AND e."actionType" IN ('STAGE_CHANGE', 'CREATE') AND e."occurredAt" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "DealStageChange" x WHERE x."dealId" = d.id AND x."toStage" = m.stage::"LeadStage"
                         AND abs(extract(epoch FROM x."changedAt" - e."occurredAt")) < 120)
    ON CONFLICT DO NOTHING`)
}

// ─── delta pull from Freshsales ─────────────────────────────────────────────

const DELTA = 'erpSyncDelta'
const OVERLAP_MS = 10 * 60_000

async function deltaCursor(db: PrismaClient) {
  const s = await db.freshsalesSyncState.findUnique({ where: { entity: DELTA } })
  const c = (s?.cursor ?? {}) as Json
  return { contactsSince: c.contactsSince ? new Date(c.contactsSince) : null, dealsSince: c.dealsSince ? new Date(c.dealsSince) : null, fullDealsAt: c.fullDealsAt ? new Date(c.fullDealsAt) : null }
}

/**
 * Pulls contacts and deals changed since the last run (with their emails + timeline) into the
 * archive. Once a day it also walks the full deal list to catch deletions — Freshsales'
 * search never returns deleted deals.
 */
export async function pullFreshsalesDelta(db: PrismaClient, fs: FreshsalesClient, log: Log = console.log) {
  const cur = await deltaCursor(db)
  const startedAt = new Date()
  const fallback = async (field: 'contacts' | 'deals') => {
    const r = field === 'contacts'
      ? await db.freshsalesContact.aggregate({ _max: { fsUpdatedAt: true } })
      : await db.freshsalesDeal.aggregate({ _max: { fsUpdatedAt: true } })
    return r._max.fsUpdatedAt ?? new Date(Date.now() - DAY_MS)
  }
  const contactsSince = new Date(+(cur.contactsSince ?? await fallback('contacts')) - OVERLAP_MS)
  const dealsSince = new Date(+(cur.dealsSince ?? await fallback('deals')) - OVERLAP_MS)
  const touched = new Set<string>()

  // Contacts, newest change first, until we pass the cursor
  let nContacts = 0
  for (let page = 1; page <= 400; page++) {
    const data = await fs.get(`/api/contacts/view/13000726037?page=${page}&per_page=100&sort=updated_at&sort_type=desc&include=owner`)
    const list: Json[] = data?.contacts ?? []
    const fresh = list.filter(c => !c.updated_at || new Date(c.updated_at) >= contactsSince)
    await upsertContactRows(db, fresh.map(c => ({ id: String(c.id), ...contactRow(c) })))
    fresh.forEach(c => touched.add(String(c.id)))
    nContacts += fresh.length
    if (fresh.length < list.length || list.length < 100) break
  }

  // Deals changed since the cursor
  const stages = await db.freshsalesLookup.findMany({ where: { kind: 'DEAL_STAGE' }, select: { fsId: true, parentFsId: true } })
  const pipelineOf = new Map(stages.map(s => [s.fsId, s.parentFsId]))
  const changedDeals: string[] = []
  for (let page = 1; page <= 200; page++) {
    const data = await fs.post(`/api/filtered_search/deal?page=${page}&per_page=100&sort=updated_at&sort_type=desc&include=owner,contacts,deal_stage,currency`,
      { filter_rule: [{ attribute: 'updated_at', operator: 'is_after', value: dealsSince.toISOString() }] })
    const list: Json[] = data?.deals ?? []
    const stub: Json[] = data?.contacts ?? []
    if (stub.length) await retryDb(db, () => db.freshsalesContact.createMany({ data: stub.map(c => ({ id: String(c.id), ...contactRow(c) })), skipDuplicates: true }))
    for (const d of list) {
      const row = dealIndexRow(d, pipelineOf)
      const { id, ...rest } = row
      await retryDb(db, () => db.freshsalesDeal.upsert({ where: { id }, create: row, update: rest }))
      changedDeals.push(id)
      row.contactFsIds.forEach(c => touched.add(c))
    }
    if (list.length < 100) break
  }
  // Full detail (custom fields, lost reason, closed date, notes) for each changed deal
  for (const id of changedDeals) {
    const data = await fs.get(`/api/deals/${id}?include=${DEAL_DETAIL_INCLUDE}`)
    if (!data?.deal) { await db.freshsalesDeal.update({ where: { id }, data: { isDeleted: true, detailSyncedAt: new Date() } }); continue }
    await retryDb(db, () => db.freshsalesDeal.update({ where: { id }, data: { ...dealDetailRow(data.deal), detailSyncedAt: new Date() } }))
    for (const note of (data.notes ?? []) as Json[]) await upsertActivity(db, 'NOTE', note, { dealFsIds: [id] })
  }

  // Emails + timeline of everything that changed (capped; the rest is left to the archive crawl)
  const ids = [...touched]
  const now = ids.slice(0, 150), later = ids.slice(150)
  for (const id of now) {
    if (!(await db.freshsalesContact.findUnique({ where: { id }, select: { id: true } }))) continue
    await syncContactConversations(db, fs, id)
    await syncContactTimeline(db, fs, id)
    await db.freshsalesContact.update({ where: { id }, data: { conversationsSyncedAt: new Date(), timelineSyncedAt: new Date() } })
  }
  if (later.length) await db.freshsalesContact.updateMany({ where: { id: { in: later } }, data: { conversationsSyncedAt: null, timelineSyncedAt: null } })

  // Daily: full deal list → anything not in it was deleted in Freshsales
  let deleted = 0
  if (!cur.fullDealsAt || Date.now() - +cur.fullDealsAt > DAY_MS) {
    const seen = new Set<string>()
    let total: number | null = null
    for (let page = 1; page <= 500; page++) {
      const data = await fs.post(`/api/filtered_search/deal?page=${page}&per_page=100&sort=created_at&sort_type=asc`, { filter_rule: [] })
      const list: Json[] = data?.deals ?? []
      total = data?.meta?.total ?? total
      list.forEach(d => seen.add(String(d.id)))
      if (list.length < 100) break
    }
    if (total !== null && seen.size >= total) {
      const live = await db.freshsalesDeal.findMany({ where: { isDeleted: false }, select: { id: true } })
      const gone = live.map(d => d.id).filter(id => !seen.has(id))
      if (gone.length && gone.length < 500) {
        deleted = (await db.freshsalesDeal.updateMany({ where: { id: { in: gone } }, data: { isDeleted: true } })).count
      } else if (gone.length) log(`  ${gone.length} deals missing from the full list — too many, not marking deleted`)
    }
    cur.fullDealsAt = new Date()
  }

  await db.freshsalesSyncState.upsert({
    where: { entity: DELTA },
    create: { entity: DELTA, status: 'DONE', cursor: { contactsSince: startedAt.toISOString(), dealsSince: startedAt.toISOString(), fullDealsAt: cur.fullDealsAt?.toISOString() ?? null }, finishedAt: new Date() },
    update: { status: 'DONE', cursor: { contactsSince: startedAt.toISOString(), dealsSince: startedAt.toISOString(), fullDealsAt: cur.fullDealsAt?.toISOString() ?? null }, finishedAt: new Date(), processed: nContacts + changedDeals.length },
  })
  log(`delta: ${nContacts} contacts, ${changedDeals.length} deals changed, ${deleted} deals deleted, ${now.length} histories refreshed (${fs.requests} req)`)
  return { contacts: nContacts, deals: changedDeals.length, deleted }
}

// ─── one run (lease-protected) ──────────────────────────────────────────────

const LEASE = 'erpSyncLease'
const LEASE_STALE_MS = 30 * 60_000

/** delta pull + reconcile under a lease, so the server and a manual script never overlap. */
export async function runFreshsalesErpSync(db: PrismaClient, fs: FreshsalesClient, owner: string, log: Log = console.log) {
  await db.freshsalesSyncState.upsert({ where: { entity: LEASE }, create: { entity: LEASE, status: 'IDLE' }, update: {} })
  const got = await db.freshsalesSyncState.updateMany({
    where: { entity: LEASE, OR: [{ status: { not: 'RUNNING' } }, { updatedAt: { lt: new Date(Date.now() - LEASE_STALE_MS) } }] },
    data: { status: 'RUNNING', cursor: { owner }, startedAt: new Date(), lastError: null },
  })
  if (got.count !== 1) return 'locked' as const
  try {
    await pullFreshsalesDelta(db, fs, log)
    const r = await reconcileFreshsalesToErp(db, { apply: true, log })
    await db.freshsalesSyncState.update({ where: { entity: LEASE }, data: { status: 'DONE', finishedAt: new Date(), cursor: { owner, counts: r.counts } } })
    return r
  } catch (e) {
    await db.freshsalesSyncState.update({ where: { entity: LEASE }, data: { status: 'ERROR', lastError: String((e as Error)?.message ?? e).slice(0, 1000) } }).catch(() => {})
    throw e
  }
}
