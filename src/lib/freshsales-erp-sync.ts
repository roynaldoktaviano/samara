/**
 * Freshsales → ERP sync. Freshsales is still the sales team's main system and the source of
 * truth (Roy, 2026-11-12): every ERP Lead mirrors its Freshsales contact + deal — stage, sales
 * owner, value, lost reason, trip dates/pax — and every Guest mirrors its contact owner.
 *
 * Two layers:
 *  1. pullFreshsalesDelta — contacts/deals changed in Freshsales since the last run go into the
 *     Freshsales* archive tables (src/lib/freshsales-archive.ts), plus their emails/timeline.
 *  2. reconcileFreshsalesToErp — compares the whole archive with Lead/Customer and writes only
 *     the differences, so anything drifted on either side is put back to the Freshsales value.
 *
 * Mapping rules:
 *  - One pipeline card per Freshsales deal: a deal belongs to the first of its contacts, and a
 *    contact's lead mirrors its newest OPEN sales deal, else its newest deal (Won/Lost).
 *    Agent Outreach deals are agents, not guests — ignored here.
 *  - Stage names are the same on both sides (Sales Pipeline); older pipelines map by meaning.
 *  - Owner = an open deal's owner; for Won/Lost the contact owner (else the deal owner). Philippe is skipped (Roy's
 *    call — he isn't a sales rep in the ERP); owners with no ERP user (Helena, no owner) → none.
 *  - A Freshsales contact with a deal or an email and no ERP lead gets one (matched to an
 *    unlinked lead by email/phone first). Guests are linked by email/phone, owner only.
 *  - A lead's WhatsApp / Instagram chats follow its owner (chat owner = lead owner).
 *  - No notifications are sent; owner moves are logged as MANUAL assignments.
 */
import type { LeadLostReason, LeadStage, Prisma, PrismaClient, TripType } from '@prisma/client'
import {
  DEAL_DETAIL_INCLUDE, FreshsalesClient, contactRow, dealDetailRow, dealIndexRow, linkContacts, retryDb,
  syncContactConversations, syncContactTimeline, upsertActivity, upsertContactRows,
} from './freshsales-archive'

type Json = Record<string, any>
type Log = (m: string) => void

export const AGENT_PIPELINE = 'Agent Outreach Pipeline'

const STAGE_MAP: Record<string, LeadStage> = {
  'new enquiry': 'NEW', 'new': 'NEW',
  'initial message sent': 'INITIAL_MESSAGE_SENT',
  'in active communication': 'ACTIVE_COMMUNICATION', 'in communication': 'ACTIVE_COMMUNICATION', 'quote': 'ACTIVE_COMMUNICATION',
  '1st follow-up': 'FOLLOW_UP_1', '2nd follow-up': 'FOLLOW_UP_2',
  'send booking confirmation': 'BOOKING_CONFIRMATION', 'verbally confirmed': 'BOOKING_CONFIRMATION',
  'send invoice 1': 'INVOICE_SENT',
  'won': 'CLOSED_WON', 'closed won': 'CLOSED_WON',
  'lost': 'CLOSED_LOST', 'closed lost': 'CLOSED_LOST',
}
const LOST_MAP: Record<string, LeadLostReason> = {
  'opted our rival': 'COMPETITOR',
  'no inventory (no date available)': 'DATES',
  'price is too high': 'PRICE',
  'no response': 'NO_RESPONSE',
}
// FS user email → ERP user email where they differ (Efrinda logs into Freshsales as indah@)
const OWNER_EMAIL_OVERRIDE: Record<string, string> = { 'indah@samarayachting.com': 'efrinda@samarayachting.com' }
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
  select: { id: true, name: true, amount: true, currencyFsId: true, pipelineFsId: true, stageFsId: true, stageUpdatedAt: true, lostReasonFsId: true, ownerFsId: true, contactFsIds: true, fsCreatedAt: true, closedDate: true, customFields: true },
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
    : /^(OT|ST)\b/.test(pi) || /^(OT|ST)\s*\//.test(prefix) ? 'OPEN_TRIP' : null
  return { start, end: end && start && end >= start ? end : null, pax: pax && pax > 0 && pax < 500 ? Math.round(pax) : null, tripType }
}

// ─── reconcile ──────────────────────────────────────────────────────────────

export type SyncChange = { kind: 'lead' | 'guest'; action: 'create' | 'link' | 'update'; id: string; fsContactId: string; name: string; fields: Record<string, [unknown, unknown]> }
export type ReconcileResult = { counts: Record<string, number>; changes: SyncChange[] }

const LEAD_SELECT = {
  id: true, name: true, firstName: true, lastName: true, email: true, phone: true, freshsalesContactId: true, freshsalesDealId: true,
  ownerId: true, stage: true, stageUpdatedAt: true, lostReason: true, lostNote: true, tripAmount: true, tripAmountCurrency: true,
  travelStartDate: true, travelEndDate: true, guestCount: true, tripType: true, source: true, deletedAt: true, bookingId: true,
} satisfies Prisma.LeadSelect
type LeadRow = Prisma.LeadGetPayload<{ select: typeof LEAD_SELECT }>

export async function reconcileFreshsalesToErp(db: PrismaClient, opts: { apply: boolean; log?: Log }): Promise<ReconcileResult> {
  const log = opts.log ?? console.log
  const counts: Record<string, number> = {}
  const inc = (k: string, n = 1) => { counts[k] = (counts[k] ?? 0) + n }
  const changes: SyncChange[] = []

  const [contacts, deals, lookups, fsUsers, users, leads, customers] = await retryDb(db, () => Promise.all([
    db.freshsalesContact.findMany({ where: { isDeleted: false }, select: { id: true, name: true, email: true, phone: true, ownerFsId: true, raw: true, fsCreatedAt: true } }),
    loadDeals(db),
    db.freshsalesLookup.findMany({ where: { kind: { in: ['DEAL_STAGE', 'DEAL_PIPELINE', 'DEAL_REASON', 'CURRENCY'] } } }),
    db.freshsalesUser.findMany(),
    db.user.findMany({ select: { id: true, email: true } }),
    db.lead.findMany({ select: LEAD_SELECT }),
    db.customer.findMany({ select: { id: true, name: true, email: true, phone: true, freshsalesContactId: true, ownerId: true, deletedAt: true } }),
  ]))

  const name = (kind: string, id?: string | null) => (id ? lookups.find(l => l.kind === kind && l.fsId === id)?.name ?? null : null)
  const stageOf = new Map(lookups.filter(l => l.kind === 'DEAL_STAGE').map(l => [l.fsId, l]))
  const pipelineName = new Map(lookups.filter(l => l.kind === 'DEAL_PIPELINE').map(l => [l.fsId, l.name]))
  const isOpen = (d: ArchiveDeal) => ((stageOf.get(d.stageFsId ?? '')?.extra as Json | null)?.forecast_type ?? 'Open') === 'Open'

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

  // Each deal belongs to ONE contact (one card per deal): the first of its contacts that is
  // already an ERP lead, else simply its first contact.
  const leadByFs = new Map(leads.filter(l => l.freshsalesContactId).map(l => [l.freshsalesContactId!, l]))
  const contactIds = new Set(contacts.map(c => c.id))
  const dealsByContact = new Map<string, ArchiveDeal[]>()
  for (const d of deals) {
    if (pipelineName.get(d.pipelineFsId ?? '') === AGENT_PIPELINE) continue
    const holder = d.contactFsIds.find(id => leadByFs.has(id) && contactIds.has(id)) ?? d.contactFsIds.find(id => contactIds.has(id))
    if (!holder) continue
    dealsByContact.set(holder, [...(dealsByContact.get(holder) ?? []), d])
  }
  const mainDeal = (cid: string) => {
    const ds = dealsByContact.get(cid)
    if (!ds?.length) return null
    const open = ds.filter(isOpen)
    if (open.length > 1) inc('contacts with >1 open deal (newest shown)')
    return [...(open.length ? open : ds)].sort((a, b) => +(b.fsCreatedAt ?? 0) - +(a.fsCreatedAt ?? 0))[0]
  }

  // Unlinked ERP records, for linking FS contacts that have no lead/guest yet
  const freeLeadByEmail = new Map<string, LeadRow[]>(), freeLeadByPhone = new Map<string, LeadRow[]>()
  for (const l of leads) {
    if (l.freshsalesContactId || l.deletedAt) continue
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
  const now = new Date()

  for (const c of contacts) {
    const emails = fsEmails(c), phones = fsPhones(c)
    const deal = mainDeal(c.id)
    const raw = (c.raw ?? {}) as Json
    const fsName = (c.name || [raw.first_name, raw.last_name].filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim() || null

    // ── desired lead state ──
    const want: Partial<LeadRow> = {}
    // A contact "name" that is really a deal title (PC/Mischief/Raja Ampat/Guest) isn't copied over
    if (fsName && !fsName.includes('/')) { want.name = fsName; want.firstName = raw.first_name?.trim() || null; want.lastName = raw.last_name?.trim() || null }
    const contactOwner = erpOwner(c.ownerFsId)
    // An open deal's sales rep owns the card. Closed deals (Won/Lost) keep the contact owner —
    // whoever handles the person now — and fall back to the deal owner when the contact has none.
    const dealOwner = deal?.ownerFsId ? erpOwner(deal.ownerFsId) : null
    const [primary, backup] = deal && isOpen(deal) ? [dealOwner, contactOwner] : [contactOwner, dealOwner]
    const ownerWanted = primary === undefined ? undefined : primary ?? backup
    if (ownerWanted !== undefined) want.ownerId = ownerWanted
    if (deal) {
      const sn = stageOf.get(deal.stageFsId ?? '')?.name ?? ''
      const stage = STAGE_MAP[sn.toLowerCase()]
      if (!stage) inc(`unmapped FS stage "${sn}"`)
      want.freshsalesDealId = deal.id
      if (stage) {
        want.stage = stage
        want.stageUpdatedAt = deal.stageUpdatedAt ?? deal.closedDate ?? deal.fsCreatedAt ?? null
        const reason = stage === 'CLOSED_LOST' ? name('DEAL_REASON', deal.lostReasonFsId) : null
        want.lostReason = stage === 'CLOSED_LOST' && reason ? LOST_MAP[reason.toLowerCase()] ?? 'OTHER' : null
        want.lostNote = want.lostReason === 'OTHER' ? reason : null
      }
      if (deal.amount !== null) { want.tripAmount = deal.amount; want.tripAmountCurrency = name('CURRENCY', deal.currencyFsId) }
      const trip = dealTripInfo(deal)
      if (trip.start) want.travelStartDate = trip.start
      if (trip.end) want.travelEndDate = trip.end
      if (trip.pax) want.guestCount = trip.pax
      if (trip.tripType) want.tripType = trip.tripType
    } else {
      want.freshsalesDealId = null
    }

    // ── find / link / create the lead ──
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
          email: c.email ?? emails[0] ?? null, phone: c.phone ?? null,
          freshsalesContactId: c.id, freshsalesDealId: want.freshsalesDealId ?? null,
          ownerId: want.ownerId ?? null, ownerAssignedAt: want.ownerId ? now : null,
          stage: want.stage ?? 'NEW', stageUpdatedAt: want.stageUpdatedAt ?? null,
          lostReason: want.lostReason ?? null, lostNote: want.lostNote ?? null,
          tripAmount: want.tripAmount ?? null, tripAmountCurrency: want.tripAmountCurrency ?? null,
          travelStartDate: want.travelStartDate ?? null, travelEndDate: want.travelEndDate ?? null,
          guestCount: want.guestCount ?? null, tripType: want.tripType ?? null,
          ...(c.fsCreatedAt ? { createdAt: c.fsCreatedAt } : {}),
        }
        leadCreates.push(data)
        changes.push({ kind: 'lead', action: 'create', id: '', fsContactId: c.id, name: data.name, fields: { stage: [null, data.stage], owner: [null, data.ownerId], deal: [null, data.freshsalesDealId] } })
        inc(deal ? 'lead: created (has FS deal)' : 'lead: created (FS contact with email, no deal)')
      }
    }

    if (lead) {
      // Chat-born leads (WhatsApp/IG/Messenger) and booking-driven ones keep their ERP stage while
      // Freshsales has no deal for them
      if (!deal && (lead.source || lead.bookingId)) { delete want.stage; delete want.stageUpdatedAt; delete want.lostReason; delete want.lostNote }
      else if (!deal) { want.stage = 'NEW'; want.lostReason = null; want.lostNote = null }
      // Email / phone: Freshsales wins when it has one and it really differs (not just formatting)
      if (emails.length && !emails.includes(normEmail(lead.email) ?? '')) want.email = c.email ?? emails[0]
      if (phones.length && !phones.includes(normPhone(lead.phone) ?? '')) want.phone = c.phone ?? raw.mobile_number ?? raw.work_number ?? null

      const data: Prisma.LeadUncheckedUpdateInput = {}
      const fields: Record<string, [unknown, unknown]> = {}
      for (const [k, v] of Object.entries(want) as [keyof LeadRow, unknown][]) {
        const cur = lead[k] as unknown
        const same = v instanceof Date || cur instanceof Date
          ? (k === 'stageUpdatedAt' ? sameTime(cur as Date, v as Date) : sameDay(cur as Date, v as Date))
          : (cur ?? null) === (v ?? null)
        if (same) continue
        ;(data as Json)[k] = v
        fields[k] = [cur ?? null, v ?? null]
      }
      if ('ownerId' in data) {
        data.ownerAssignedAt = now
        ownerMoves.push({ leadId: lead.id, from: lead.ownerId, to: (data.ownerId as string | null) ?? null })
        inc(!lead.ownerId ? 'lead owner: filled' : !data.ownerId ? 'lead owner: cleared (FS has none / no ERP user)' : 'lead owner: changed')
      }
      if ('stage' in data) inc(`lead stage → ${data.stage}`)
      for (const k of ['freshsalesDealId', 'tripAmount', 'lostReason', 'travelStartDate', 'guestCount', 'tripType', 'name', 'email', 'phone']) if (k in data) inc(`lead field: ${k}`)
      if (Object.keys(data).length) {
        leadUpdates.set(lead.id, { ...(leadUpdates.get(lead.id) ?? {}), ...data })
        const ch = leadChange.get(lead.id)
        if (ch) Object.assign(ch.fields, fields)
        else leadChange.set(lead.id, { kind: 'lead', action: 'update', id: lead.id, fsContactId: c.id, name: lead.name, fields })
        if (lead.deletedAt) inc('lead: updated but soft-deleted in ERP (left deleted)')
      } else inc('lead: already in sync')
    }

    // ── guest ──
    let cust = custByFs.get(c.id) ?? null
    const cdata: Prisma.CustomerUncheckedUpdateInput = {}
    if (!cust) {
      const free = pickFree(emails, phones, freeCustByEmail, freeCustByPhone, usedCust)
      if (free) { usedCust.add(free.id); cust = free; cdata.freshsalesContactId = c.id; inc('guest: linked by email/phone') }
    }
    if (cust) {
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

  // Leads pointing at a Freshsales contact that no longer exists (deleted/merged there) leave the board
  for (const l of leads) {
    if (l.freshsalesContactId && !contactIds.has(l.freshsalesContactId) && l.freshsalesDealId) {
      leadUpdates.set(l.id, { ...(leadUpdates.get(l.id) ?? {}), freshsalesDealId: null })
      inc('lead: FS contact gone → unlinked from deal')
    }
  }

  changes.push(...leadChange.values())
  log(`reconcile: ${leadCreates.length} leads to create, ${leadUpdates.size} to update, ${custUpdates.length} guests, ${ownerMoves.length} owner moves`)
  if (!opts.apply) return { counts, changes }

  // ── write ──
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
  await linkContacts(db)
  log('reconcile: written')
  return { counts, changes }
}

// ─── delta pull from Freshsales ─────────────────────────────────────────────

const DELTA = 'erpSyncDelta'
const OVERLAP_MS = 10 * 60_000
const DAY_MS = 86400000

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
