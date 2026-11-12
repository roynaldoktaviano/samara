/**
 * READ-ONLY reconciliation audit: Freshsales archive (FS) vs ERP.
 * Dimensions: contacts, sales owner, pipeline stage, chat/email history, deals↔bookings.
 * Writes summary.json + CSVs into OUT dir. Changes nothing.
 *   npx tsx scripts/_fs-erp-audit.tmp.ts <outDir>
 */
import { PrismaClient } from '@prisma/client'
import * as fsys from 'fs'
import * as path from 'path'

const db = new PrismaClient()
const OUT = process.argv[2] || './fs-audit-out'
fsys.mkdirSync(OUT, { recursive: true })

type Row = Record<string, unknown>
function csv(name: string, rows: Row[]) {
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))]
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  fsys.writeFileSync(path.join(OUT, name), [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n'))
  return rows.length
}
const normEmail = (e?: string | null) => (e ? e.trim().toLowerCase() || null : null)
function normPhone(p?: string | null) {
  if (!p) return null
  let d = p.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = '62' + d.slice(1)
  return d.length >= 8 ? d.slice(-10) : null
}
const normName = (n?: string | null) => (n ? n.trim().toLowerCase().replace(/\s+/g, ' ') : '')
const inc = (m: Record<string, number>, k: string, n = 1) => { m[k] = (m[k] ?? 0) + n }

// FS stage name → ERP LeadStage (stage names are the same in the Sales Pipeline)
const STAGE_MAP: Record<string, string> = {
  'new enquiry': 'NEW', 'new': 'NEW',
  'initial message sent': 'INITIAL_MESSAGE_SENT',
  'in active communication': 'ACTIVE_COMMUNICATION', 'in communication': 'ACTIVE_COMMUNICATION', 'quote': 'ACTIVE_COMMUNICATION',
  '1st follow-up': 'FOLLOW_UP_1', '2nd follow-up': 'FOLLOW_UP_2',
  'send booking confirmation': 'BOOKING_CONFIRMATION', 'verbally confirmed': 'BOOKING_CONFIRMATION',
  'send invoice 1': 'INVOICE_SENT',
  'won': 'CLOSED_WON', 'closed won': 'CLOSED_WON',
  'lost': 'CLOSED_LOST', 'closed lost': 'CLOSED_LOST',
}
const AGENT_PIPELINE = 'Agent Outreach Pipeline'
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
// "S1-D: Stuart James (2 pax) - 20 Dec 26/2N" → trip date
function tripDateFromName(n: string) {
  const m = n.match(/(\d{1,2})\s*([A-Za-z]{3})[a-z]*\s*'?(\d{2,4})/)
  if (!m) return null
  const mon = MONTHS[m[2].toLowerCase()]
  if (mon === undefined) return null
  let y = Number(m[3]); if (y < 100) y += 2000
  const d = new Date(Date.UTC(y, mon, Number(m[1])))
  return isNaN(+d) || y < 2018 || y > 2030 ? null : d
}
const days = (a: Date, b: Date) => Math.abs(+a - +b) / 86400000

async function main() {
  const t0 = Date.now()
  const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`)

  // ── load ────────────────────────────────────────────────────────────────
  const [fsContacts, fsDeals, lookups, fsUsers, users, leads, customers, bookings] = await Promise.all([
    db.freshsalesContact.findMany({ where: { isDeleted: false }, select: { id: true, name: true, email: true, phone: true, ownerFsId: true, leadId: true, customerId: true, raw: true, lastContactedAt: true, fsCreatedAt: true } }),
    db.freshsalesDeal.findMany({ where: { isDeleted: false }, select: { id: true, name: true, amount: true, baseCurrencyAmount: true, currencyFsId: true, pipelineFsId: true, stageFsId: true, stageUpdatedAt: true, lostReasonFsId: true, ownerFsId: true, contactFsIds: true, fsCreatedAt: true, closedDate: true, customFields: true, paymentStatusFsId: true } }),
    db.freshsalesLookup.findMany(),
    db.freshsalesUser.findMany(),
    db.user.findMany({ select: { id: true, email: true, name: true, role: true } }),
    db.lead.findMany({ where: { deletedAt: null }, select: { id: true, name: true, email: true, phone: true, freshsalesContactId: true, ownerId: true, stage: true, lostReason: true, source: true, bookingId: true, createdAt: true } }),
    db.customer.findMany({ where: { deletedAt: null }, select: { id: true, name: true, email: true, phone: true, freshsalesContactId: true, ownerId: true } }),
    db.booking.findMany({ where: { status: { not: 'cancelled' } }, select: { id: true, bookingCode: true, customerId: true, agentId: true, status: true, tripType: true, startDate: true, totalPrice: true, depositPaid: true, currency: true, salespersonId: true, createdAt: true, yacht: { select: { name: true } }, agent: { select: { name: true } } } }),
  ])
  log(`loaded fsContacts ${fsContacts.length}, fsDeals ${fsDeals.length}, leads ${leads.length}, customers ${customers.length}, bookings ${bookings.length}`)

  const lk = (kind: string, id?: string | null) => (id ? lookups.find(l => l.kind === kind && l.fsId === id)?.name ?? null : null)
  const stageName = new Map(lookups.filter(l => l.kind === 'DEAL_STAGE').map(l => [l.fsId, l.name]))
  const stageForecast = new Map(lookups.filter(l => l.kind === 'DEAL_STAGE').map(l => [l.fsId, (l.extra as any)?.forecast_type ?? null]))
  const pipeName = new Map(lookups.filter(l => l.kind === 'DEAL_PIPELINE').map(l => [l.fsId, l.name]))
  const currencyName = new Map(lookups.filter(l => l.kind === 'CURRENCY').map(l => [l.fsId, l.name]))
  const userById = new Map(users.map(u => [u.id, u]))
  const userByEmail = new Map(users.map(u => [u.email.toLowerCase(), u]))
  // FS user → ERP user (same overrides as the 2026-11-11 owner sync)
  const OVERRIDE: Record<string, string> = { 'indah@samarayachting.com': 'efrinda@samarayachting.com' }
  const fsUserMap = new Map<string, { erpId: string | null; name: string; skip: boolean; inactive: boolean }>()
  for (const u of fsUsers) {
    const em = (u.email ?? '').toLowerCase()
    const erp = u.userId ? userById.get(u.userId) : userByEmail.get(OVERRIDE[em] ?? em)
    fsUserMap.set(u.id, { erpId: erp?.id ?? null, name: u.name ?? u.id, skip: /philippe/i.test(u.name ?? ''), inactive: !u.isActive })
  }
  const userName = (id?: string | null) => (id ? userById.get(id)?.name ?? id : '')
  const fsOwnerName = (id?: string | null) => (id ? fsUserMap.get(id)?.name ?? `FS#${id}` : '')

  // ── indexes ─────────────────────────────────────────────────────────────
  const fsById = new Map(fsContacts.map(c => [c.id, c]))
  const fsEmails = (c: (typeof fsContacts)[number]) => {
    const r = c.raw as any
    return [...new Set([c.email, r?.work_email, ...((r?.emails ?? []) as any[]).map(e => e?.value)].map(normEmail).filter(Boolean) as string[])]
  }
  const fsPhones = (c: (typeof fsContacts)[number]) => {
    const r = c.raw as any
    return [...new Set([c.phone, r?.mobile_number, r?.work_number, ...((r?.phone_numbers ?? []) as any[]).map(p => p?.value)].map(normPhone).filter(Boolean) as string[])]
  }
  const fsByEmail = new Map<string, string[]>(), fsByPhone = new Map<string, string[]>()
  for (const c of fsContacts) {
    for (const e of fsEmails(c)) fsByEmail.set(e, [...(fsByEmail.get(e) ?? []), c.id])
    for (const p of fsPhones(c)) fsByPhone.set(p, [...(fsByPhone.get(p) ?? []), c.id])
  }
  const dealsByContact = new Map<string, typeof fsDeals>()
  for (const d of fsDeals) for (const cid of d.contactFsIds) dealsByContact.set(cid, [...(dealsByContact.get(cid) ?? []), d])

  const leadByFs = new Map(leads.filter(l => l.freshsalesContactId).map(l => [l.freshsalesContactId!, l]))
  const custByFs = new Map(customers.filter(c => c.freshsalesContactId).map(c => [c.freshsalesContactId!, c]))
  const leadByEmail = new Map<string, typeof leads>(), leadByPhone = new Map<string, typeof leads>()
  for (const l of leads) {
    const e = normEmail(l.email), p = normPhone(l.phone)
    if (e) leadByEmail.set(e, [...(leadByEmail.get(e) ?? []), l])
    if (p) leadByPhone.set(p, [...(leadByPhone.get(p) ?? []), l])
  }
  const custByEmail = new Map<string, typeof customers>(), custByPhone = new Map<string, typeof customers>()
  for (const c of customers) {
    const e = normEmail(c.email), p = normPhone(c.phone)
    if (e) custByEmail.set(e, [...(custByEmail.get(e) ?? []), c])
    if (p) custByPhone.set(p, [...(custByPhone.get(p) ?? []), c])
  }

  const S: Record<string, any> = {}

  // ══ 1. CONTACTS ═════════════════════════════════════════════════════════
  const c1: Record<string, number> = {}
  const missingLink: Row[] = [], missingInErp: Row[] = [], fieldDiff: Row[] = []
  for (const c of fsContacts) {
    const lead = leadByFs.get(c.id), cust = custByFs.get(c.id)
    const deals = (dealsByContact.get(c.id) ?? [])
    const salesDeals = deals.filter(d => pipeName.get(d.pipelineFsId ?? '') !== AGENT_PIPELINE)
    const emails = fsEmails(c), phones = fsPhones(c)
    inc(c1, lead && cust ? 'linked_lead_and_guest' : lead ? 'linked_lead_only' : cust ? 'linked_guest_only' : 'not_linked')
    if (!lead && !cust) {
      const ml = [...new Set([...emails.flatMap(e => leadByEmail.get(e) ?? []), ...phones.flatMap(p => leadByPhone.get(p) ?? [])])]
      const mc = [...new Set([...emails.flatMap(e => custByEmail.get(e) ?? []), ...phones.flatMap(p => custByPhone.get(p) ?? [])])]
      if (ml.length || mc.length) {
        inc(c1, 'not_linked_but_matches_erp_by_email_phone')
        missingLink.push({ fsContactId: c.id, fsName: c.name, fsEmail: emails.join(' '), fsPhone: phones.join(' '), fsDeals: salesDeals.length, erpLeads: ml.map(l => `${l.name} [${l.id}]${l.freshsalesContactId ? ' fs=' + l.freshsalesContactId : ''}`).join(' | '), erpGuests: mc.map(x => `${x.name} [${x.id}]${x.freshsalesContactId ? ' fs=' + x.freshsalesContactId : ''}`).join(' | ') })
      } else if (salesDeals.length || emails.length) {
        inc(c1, salesDeals.length ? 'not_in_erp_has_deal' : 'not_in_erp_email_only_no_deal')
        missingInErp.push({ fsContactId: c.id, fsName: c.name, fsEmail: emails.join(' '), fsPhone: phones.join(' '), fsOwner: fsOwnerName(c.ownerFsId), salesDeals: salesDeals.length, agentDeals: deals.length - salesDeals.length, latestDeal: salesDeals.sort((a, b) => +(b.fsCreatedAt ?? 0) - +(a.fsCreatedAt ?? 0))[0]?.name ?? '', fsCreated: c.fsCreatedAt })
      } else if (deals.length) inc(c1, 'not_in_erp_agent_deal_only')
      else inc(c1, 'not_in_erp_archive_only(no deal,no email)')
    }
    for (const [kind, rec] of [['lead', lead], ['guest', cust]] as const) {
      if (!rec) continue
      const diffs: string[] = []
      const re = normEmail(rec.email), rp = normPhone(rec.phone)
      if (emails.length && !re) diffs.push('email missing in ERP')
      else if (emails.length && re && !emails.includes(re)) diffs.push('email differs')
      else if (!emails.length && re) diffs.push('email only in ERP')
      if (phones.length && !rp) diffs.push('phone missing in ERP')
      else if (phones.length && rp && !phones.includes(rp)) diffs.push('phone differs')
      if (c.name && normName(c.name) !== normName(rec.name)) diffs.push('name differs')
      for (const d of diffs) inc(c1, `${kind}_field:${d}`)
      if (diffs.length) fieldDiff.push({ kind, erpId: rec.id, fsContactId: c.id, issues: diffs.join('; '), erpName: rec.name, fsName: c.name, erpEmail: rec.email, fsEmail: emails.join(' '), erpPhone: rec.phone, fsPhone: phones.join(' ') })
    }
  }
  // ERP side
  const orphanFs: Row[] = [], leadsNoFs: Row[] = []
  for (const l of leads) {
    if (l.freshsalesContactId && !fsById.has(l.freshsalesContactId)) { inc(c1, 'erp_lead_fs_id_not_in_fs(deleted/merged)'); orphanFs.push({ kind: 'lead', erpId: l.id, name: l.name, email: l.email, fsContactId: l.freshsalesContactId }) }
    if (!l.freshsalesContactId) {
      const e = normEmail(l.email), p = normPhone(l.phone)
      const m = [...new Set([...(e ? fsByEmail.get(e) ?? [] : []), ...(p ? fsByPhone.get(p) ?? [] : [])])]
      inc(c1, m.length ? 'erp_lead_no_fs_id_but_in_fs' : 'erp_lead_erp_only(not in FS)')
      leadsNoFs.push({ erpId: l.id, name: l.name, email: l.email, phone: l.phone, source: l.source, created: l.createdAt, owner: userName(l.ownerId), fsMatches: m.map(id => `${fsById.get(id)?.name} [${id}]${leadByFs.has(id) ? ' (already linked to lead ' + leadByFs.get(id)!.id + ')' : ''}`).join(' | ') })
    }
  }
  for (const c of customers) {
    if (c.freshsalesContactId && !fsById.has(c.freshsalesContactId)) { inc(c1, 'erp_guest_fs_id_not_in_fs(deleted/merged)'); orphanFs.push({ kind: 'guest', erpId: c.id, name: c.name, email: c.email, fsContactId: c.freshsalesContactId }) }
    if (!c.freshsalesContactId) {
      const e = normEmail(c.email), p = normPhone(c.phone)
      inc(c1, (e && fsByEmail.has(e)) || (p && fsByPhone.has(p)) ? 'erp_guest_no_fs_id_but_in_fs' : 'erp_guest_erp_only(not in FS)')
    }
  }
  // Duplicate ERP leads (same email)
  let dupEmailGroups = 0
  for (const [, ls] of leadByEmail) if (ls.length > 1) dupEmailGroups++
  c1.erp_lead_duplicate_email_groups = dupEmailGroups
  S.contacts = c1
  csv('1a_contacts_unlinked_but_match_erp.csv', missingLink)
  csv('1b_contacts_missing_in_erp.csv', missingInErp)
  csv('1c_contacts_field_diff.csv', fieldDiff)
  csv('1d_erp_fs_id_orphan.csv', orphanFs)
  csv('1e_erp_leads_without_fs_link.csv', leadsNoFs)
  log('contacts done')

  // ══ 2. SALES OWNER ══════════════════════════════════════════════════════
  const o: Record<string, number> = {}
  const ownerDiff: Row[] = []
  const expectedOwner = (fsOwner: string | null) => {
    if (!fsOwner) return { id: null as string | null, why: 'no FS owner' }
    const m = fsUserMap.get(fsOwner)
    if (!m) return { id: null, why: 'unknown FS user' }
    if (m.skip) return { id: undefined as any, why: 'skip (Philippe)' }
    if (m.inactive && !m.erpId) return { id: null, why: 'inactive FS user, no ERP user' }
    return { id: m.erpId, why: m.erpId ? 'mapped' : 'FS user has no ERP user' }
  }
  let ownerKnown = 0
  for (const c of fsContacts) if (c.ownerFsId) ownerKnown++
  o.fs_contacts_with_owner = ownerKnown
  for (const [kind, map] of [['lead', leadByFs], ['guest', custByFs]] as const) {
    for (const [fsId, rec] of map as Map<string, { id: string; name: string; ownerId: string | null }>) {
      const c = fsById.get(fsId); if (!c) continue
      const exp = expectedOwner(c.ownerFsId)
      if (exp.id === undefined) { inc(o, `${kind}:skipped_philippe`); continue }
      if ((exp.id ?? null) === (rec.ownerId ?? null)) { inc(o, `${kind}:match`); continue }
      const what = !rec.ownerId ? 'erp_empty' : !exp.id ? 'erp_has_owner_fs_none' : 'different'
      inc(o, `${kind}:${what}`)
      ownerDiff.push({ kind, erpId: rec.id, name: rec.name, fsContactId: fsId, erpOwner: userName(rec.ownerId), fsOwner: fsOwnerName(c.ownerFsId), expectedErpOwner: userName(exp.id), note: exp.why })
    }
  }
  // FS-internal: deal owner vs contact owner (open sales deals)
  const dealOwnerDiff: Row[] = []
  for (const d of fsDeals) {
    if (stageForecast.get(d.stageFsId ?? '') !== 'Open' || pipeName.get(d.pipelineFsId ?? '') === AGENT_PIPELINE) continue
    for (const cid of d.contactFsIds) {
      const c = fsById.get(cid)
      if (c?.ownerFsId && d.ownerFsId && c.ownerFsId !== d.ownerFsId) { inc(o, 'fs_open_deal_owner_ne_contact_owner'); dealOwnerDiff.push({ dealId: d.id, deal: d.name, dealOwner: fsOwnerName(d.ownerFsId), contactId: cid, contact: c.name, contactOwner: fsOwnerName(c.ownerFsId) }) }
    }
  }
  S.owner = o
  csv('2a_owner_diff.csv', ownerDiff)
  csv('2b_fs_open_deal_owner_vs_contact_owner.csv', dealOwnerDiff)
  log('owner done')

  // ══ 3. PIPELINE STAGE ═══════════════════════════════════════════════════
  // Main deal per contact: newest OPEN sales deal, else newest sales deal (Won/Lost)
  const p: Record<string, number> = {}
  const stageDiff: Row[] = []
  const matrix: Record<string, number> = {}
  const mainDealOf = (cid: string) => {
    const ds = (dealsByContact.get(cid) ?? []).filter(d => pipeName.get(d.pipelineFsId ?? '') !== AGENT_PIPELINE)
    if (!ds.length) return null
    const open = ds.filter(d => stageForecast.get(d.stageFsId ?? '') === 'Open')
    const pick = (open.length ? open : ds).sort((a, b) => +(b.fsCreatedAt ?? 0) - +(a.fsCreatedAt ?? 0))[0]
    return { deal: pick, count: ds.length, open: open.length }
  }
  for (const [fsId, l] of leadByFs) {
    const md = mainDealOf(fsId)
    if (!md) { inc(p, 'lead_no_fs_sales_deal'); if (l.stage !== 'NEW') inc(p, 'lead_no_deal_but_stage_not_new'); continue }
    const sn = stageName.get(md.deal.stageFsId ?? '') ?? '?'
    const exp = STAGE_MAP[sn.toLowerCase()] ?? `UNMAPPED:${sn}`
    inc(matrix, `${pipeName.get(md.deal.pipelineFsId ?? '')} / ${sn} → ERP ${l.stage}`)
    if (md.count > 1) inc(p, 'lead_with_multiple_fs_deals')
    if (md.open > 1) inc(p, 'lead_with_multiple_OPEN_fs_deals')
    if (exp === l.stage) { inc(p, 'stage_match'); continue }
    inc(p, `stage_diff_expected_${exp}`)
    stageDiff.push({ leadId: l.id, lead: l.name, erpStage: l.stage, expectedStage: exp, fsPipeline: pipeName.get(md.deal.pipelineFsId ?? ''), fsStage: sn, fsDeal: md.deal.name, fsDealId: md.deal.id, lostReason: lk('DEAL_REASON', md.deal.lostReasonFsId), fsDeals: md.count, openDeals: md.open, stageUpdated: md.deal.stageUpdatedAt })
  }
  // Leads whose FS contact has only Agent Outreach deals
  for (const [fsId] of leadByFs) {
    const ds = dealsByContact.get(fsId) ?? []
    if (ds.length && ds.every(d => pipeName.get(d.pipelineFsId ?? '') === AGENT_PIPELINE)) inc(p, 'lead_is_agent_outreach_only (should be AgentLead)')
  }
  S.pipeline = p
  S.pipelineMatrix = Object.fromEntries(Object.entries(matrix).sort((a, b) => b[1] - a[1]))
  csv('3a_stage_diff.csv', stageDiff)
  log('pipeline done')

  // ══ 4. HISTORY (emails / chats / timeline) ══════════════════════════════
  const h: Record<string, number> = {}
  const linkedFs = [...new Set([...leadByFs.keys(), ...custByFs.keys()])]
  const [convCounts, actCounts, tlCounts] = await Promise.all([
    db.$queryRaw<{ cid: string; n: bigint }[]>`SELECT unnest("contactFsIds") cid, count(*) n FROM "FreshsalesConversation" GROUP BY 1`,
    db.$queryRaw<{ cid: string; n: bigint; t: string | null }[]>`SELECT unnest(a."contactFsIds") cid, l.name t, count(*) n FROM "FreshsalesActivity" a LEFT JOIN "FreshsalesLookup" l ON l.kind='ACTIVITY_TYPE' AND l."fsId"=a."typeFsId" GROUP BY 1,2`,
    db.$queryRaw<{ cid: string; n: bigint }[]>`SELECT "contactFsId" cid, count(*) n FROM "FreshsalesTimelineEvent" WHERE "actionType" NOT IN ('FM_PAGE_VIEWS','PAGE_VIEWS','FC_PAGE_VIEWS','CONTACT_SUBSCRIBED') GROUP BY 1`,
  ])
  const conv = new Map(convCounts.map(r => [r.cid, Number(r.n)]))
  const tl = new Map(tlCounts.map(r => [r.cid, Number(r.n)]))
  const chat = new Map<string, number>()
  for (const r of actCounts) if (/chat/i.test(r.t ?? '')) chat.set(r.cid, (chat.get(r.cid) ?? 0) + Number(r.n))
  let em = 0, ch = 0, ev = 0, emN = 0, chN = 0
  for (const id of linkedFs) {
    if (conv.get(id)) { em++; emN += conv.get(id)! }
    if (chat.get(id)) { ch++; chN += chat.get(id)! }
    if (tl.get(id)) ev++
  }
  h.erp_records_with_fs_emails = em; h.fs_emails_on_them = emN
  h.erp_records_with_fs_whatsapp_chat_logs = ch; h.fs_chat_logs_on_them = chN
  h.erp_records_with_fs_timeline = ev
  h.fs_emails_total = [...conv.values()].reduce((a, b) => a + b, 0)
  h.fs_emails_on_unlinked_contacts = [...conv.entries()].filter(([id]) => !leadByFs.has(id) && !custByFs.has(id)).reduce((a, [, n]) => a + n, 0)
  h.fs_chat_logs_on_unlinked_contacts = [...chat.entries()].filter(([id]) => !leadByFs.has(id) && !custByFs.has(id)).reduce((a, [, n]) => a + n, 0)
  const [erpChats] = await db.$queryRaw<any[]>`SELECT
    (SELECT count(*) FROM "WhatsappConversation") wa, (SELECT count(*) FROM "WhatsappConversation" w JOIN "Lead" l ON l.id=w."leadId" WHERE l."freshsalesContactId" IS NOT NULL) wa_fs,
    (SELECT count(*) FROM "InstagramConversation") ig, (SELECT count(*) FROM "InstagramConversation" i JOIN "Lead" l ON l.id=i."leadId" WHERE l."freshsalesContactId" IS NOT NULL) ig_fs,
    (SELECT count(*) FROM "EmailInboxConversation") email`
  for (const [k, v] of Object.entries(erpChats)) h[`erp_${k}_conversations`] = Number(v)
  S.history = h
  log('history done')

  // ══ 5. DEALS ↔ BOOKINGS ═════════════════════════════════════════════════
  const b: Record<string, number> = {}
  const bookRows: Row[] = []
  const custById = new Map(customers.map(c => [c.id, c]))
  const matchedDeals = new Set<string>()
  for (const bk of bookings) {
    const cu = custById.get(bk.customerId)
    const cids = new Set<string>()
    if (cu?.freshsalesContactId) cids.add(cu.freshsalesContactId)
    const e = normEmail(cu?.email), ph = normPhone(cu?.phone)
    for (const id of [...(e ? fsByEmail.get(e) ?? [] : []), ...(ph ? fsByPhone.get(ph) ?? [] : [])]) cids.add(id)
    const ds = [...cids].flatMap(id => dealsByContact.get(id) ?? []).filter((d, i, a) => a.findIndex(x => x.id === d.id) === i)
    const scored = ds.map(d => {
      const cf = (d.customFields as any)?.cf_date_window_start
      const td = tripDateFromName(d.name) ?? (cf ? new Date(cf) : null)
      return { d, td, won: stageForecast.get(d.stageFsId ?? '') === 'Closed Won', dd: td && !isNaN(+td) ? days(td, bk.startDate) : null }
    }).sort((x, y) => (x.dd ?? 999) - (y.dd ?? 999) || Number(y.won) - Number(x.won))
    const best = scored.find(s => s.dd !== null && s.dd <= 7) ?? scored.find(s => s.won && s.dd === null) ?? null
    let status: string
    if (!cids.size) status = bk.agentId ? 'no_fs_contact (agent booking)' : 'no_fs_contact'
    else if (!ds.length) status = 'fs_contact_but_no_deal'
    else if (!best) status = 'fs_deals_but_none_match_trip_date'
    else status = best.won ? 'matched_WON_deal' : `matched_deal_not_won(${stageName.get(best.d.stageFsId ?? '')})`
    inc(b, status)
    if (best) matchedDeals.add(best.d.id)
    let ownerNote = ''
    if (best?.d.ownerFsId) {
      const m = fsUserMap.get(best.d.ownerFsId)
      if (m?.erpId && bk.salespersonId && m.erpId !== bk.salespersonId) { ownerNote = 'salesperson≠deal owner'; inc(b, 'salesperson_ne_fs_deal_owner') }
    }
    let amountNote = ''
    if (best?.d.amount != null) {
      const cur = currencyName.get(best.d.currencyFsId ?? '') ?? ''
      if (cur && cur !== bk.currency) amountNote = `currency ${cur} vs ${bk.currency}`
      else if (Math.abs(best.d.amount - bk.totalPrice) > Math.max(5, bk.totalPrice * 0.02)) { amountNote = 'amount differs'; inc(b, 'amount_differs') }
    }
    bookRows.push({ booking: bk.bookingCode, status: bk.status, start: bk.startDate, yacht: bk.yacht?.name, guest: cu?.name, agent: bk.agent?.name, total: `${bk.totalPrice} ${bk.currency}`, salesperson: userName(bk.salespersonId), match: status, fsDeal: best?.d.name, fsDealId: best?.d.id, fsStage: best ? stageName.get(best.d.stageFsId ?? '') : '', fsAmount: best ? `${best.d.amount} ${currencyName.get(best.d.currencyFsId ?? '') ?? ''}` : '', fsOwner: best ? fsOwnerName(best.d.ownerFsId) : '', ownerNote, amountNote, tripDateGapDays: best?.dd?.toFixed(0) ?? '' })
  }
  // FS won deals in the ERP era (trip ≥ 2026-01-01) with no ERP booking matched
  const wonNoBooking: Row[] = []
  for (const d of fsDeals) {
    if (stageForecast.get(d.stageFsId ?? '') !== 'Closed Won' || pipeName.get(d.pipelineFsId ?? '') === AGENT_PIPELINE) continue
    const td = tripDateFromName(d.name)
    const era = td ? td >= new Date('2026-01-01') : (d.closedDate ?? d.fsCreatedAt ?? new Date(0)) >= new Date('2025-10-01')
    if (!era) { inc(b, 'fs_won_before_erp_era'); continue }
    inc(b, 'fs_won_in_erp_era')
    if (matchedDeals.has(d.id)) { inc(b, 'fs_won_in_erp_era_with_booking'); continue }
    inc(b, 'fs_won_in_erp_era_NO_booking')
    const c = fsById.get(d.contactFsIds[0] ?? '')
    wonNoBooking.push({ fsDealId: d.id, deal: d.name, tripDate: td, amount: `${d.amount} ${currencyName.get(d.currencyFsId ?? '') ?? ''}`, owner: fsOwnerName(d.ownerFsId), contact: c?.name, contactEmail: c?.email, erpGuest: c ? custByFs.get(c.id)?.name ?? '' : '', erpLead: c ? leadByFs.get(c.id)?.name ?? '' : '', closed: d.closedDate, paymentStatus: lk('DEAL_PAYMENT_STATUS', d.paymentStatusFsId) })
  }
  b.erp_leads_with_bookingId = leads.filter(l => l.bookingId).length
  S.deals = b
  csv('5a_bookings_vs_fs_deals.csv', bookRows)
  csv('5b_fs_won_no_erp_booking.csv', wonNoBooking)
  log('deals done')

  fsys.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(S, null, 1))
  console.log(JSON.stringify(S, null, 1))
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
