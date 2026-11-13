/**
 * READ-ONLY: live Freshsales (API) vs archive vs ERP — counts, sales owner, stage.
 * Owner expectation uses the same rules as src/lib/freshsales-erp-sync.ts, but from LIVE data.
 *   npx tsx scripts/_fs-verify.tmp.ts <outDir> [--cached]   (--cached reuses live.json from outDir)
 * Writes nothing to the database.
 */
import { PrismaClient } from '@prisma/client'
import * as fsys from 'fs'
import * as path from 'path'
import { FreshsalesClient } from '../src/lib/freshsales-archive'
import { AGENT_PIPELINE } from '../src/lib/freshsales-erp-sync'

type Json = Record<string, any>
const db = new PrismaClient()
const OUT = process.argv[2] || './fs-verify-out'
const CACHED = process.argv.includes('--cached')
fsys.mkdirSync(OUT, { recursive: true })

function csv(name: string, rows: Json[]) {
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))]
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  fsys.writeFileSync(path.join(OUT, name), [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n'))
  return rows.length
}
const s = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v))

type LiveContact = { id: string; owner: string | null; name: string | null; updatedAt: string | null }
type LiveDeal = { id: string; owner: string | null; stage: string | null; contacts: string[]; createdAt: string | null; updatedAt: string | null; name: string | null }

async function pullLive(): Promise<{ contacts: LiveContact[]; deals: LiveDeal[]; contactTotal: number | null; dealTotal: number | null }> {
  const file = path.join(OUT, 'live.json')
  const prev = fsys.existsSync(file) ? JSON.parse(fsys.readFileSync(file, 'utf8')) : null
  if (CACHED && prev && prev.deals?.some((d: LiveDeal) => d.contacts.length)) return prev
  const domain = process.env.FRESHSALES_DOMAIN, key = process.env.FRESHSALES_API_KEY
  if (!domain || !key) throw new Error('FRESHSALES_DOMAIN / FRESHSALES_API_KEY missing')
  const fs = new FreshsalesClient(domain, key, m => console.log(m))
  // --cached with contacts only: reuse them and re-pull just the deals
  const reuseContacts = CACHED && prev?.contacts?.length
  const contacts: LiveContact[] = reuseContacts ? prev.contacts : [], deals: LiveDeal[] = []
  let contactTotal: number | null = reuseContacts ? prev.contactTotal : null, dealTotal: number | null = null
  for (let page = 1; !reuseContacts; page++) {
    const d = await fs.get(`/api/contacts/view/13000726037?page=${page}&per_page=100&sort=created_at&sort_type=asc&include=owner`)
    const list: Json[] = d?.contacts ?? []
    contactTotal = d?.meta?.total ?? contactTotal
    for (const c of list) contacts.push({ id: String(c.id), owner: s(c.owner_id), name: s(c.display_name), updatedAt: s(c.updated_at) })
    if (page % 50 === 0) console.log(`contacts ${contacts.length}/${contactTotal}`)
    if (list.length < 100) break
  }
  for (let page = 1; ; page++) {
    const d = await fs.post(`/api/filtered_search/deal?page=${page}&per_page=100&sort=created_at&sort_type=asc&include=owner,contacts,deal_stage`, { filter_rule: [] })
    const list: Json[] = d?.deals ?? []
    dealTotal = d?.meta?.total ?? dealTotal
    for (const x of list) deals.push({ id: String(x.id), owner: s(x.owner_id), stage: s(x.deal_stage_id), contacts: (x.contact_ids ?? []).map(String), createdAt: s(x.created_at), updatedAt: s(x.updated_at), name: s(x.name) })
    if (page % 50 === 0) console.log(`deals ${deals.length}/${dealTotal}`)
    if (list.length < 100) break
  }
  console.log(`live pulled with ${fs.requests} requests`)
  const r = { contacts, deals, contactTotal, dealTotal }
  fsys.writeFileSync(file, JSON.stringify(r))
  return r
}

async function main() {
  const live = await pullLive()
  const summary: Json = {
    live: { contacts: live.contacts.length, contactsMetaTotal: live.contactTotal, deals: live.deals.length, dealsMetaTotal: live.dealTotal },
  }

  const [aContacts, aDeals, lookups, fsUsers, users, leads, customers] = await Promise.all([
    db.freshsalesContact.findMany({ where: { isDeleted: false }, select: { id: true, ownerFsId: true } }),
    db.freshsalesDeal.findMany({ where: { isDeleted: false }, select: { id: true, ownerFsId: true, stageFsId: true, contactFsIds: true } }),
    db.freshsalesLookup.findMany({ where: { kind: { in: ['DEAL_STAGE', 'DEAL_PIPELINE'] } } }),
    db.freshsalesUser.findMany(),
    db.user.findMany({ select: { id: true, email: true, name: true } }),
    db.lead.findMany({ select: { id: true, name: true, freshsalesContactId: true, freshsalesDealId: true, ownerId: true, stage: true, deletedAt: true } }),
    db.customer.findMany({ select: { id: true, name: true, freshsalesContactId: true, ownerId: true, deletedAt: true } }),
  ])
  summary.archive = { contacts: aContacts.length, deals: aDeals.length }

  const fsUserName = new Map(fsUsers.map(u => [u.id, u.name ?? u.email ?? u.id]))
  const erpUserName = new Map(users.map(u => [u.id, u.name ?? u.email]))
  const fsName = (id: string | null | undefined) => (id ? fsUserName.get(id) ?? `FS#${id}` : '(none)')
  const erpName = (id: string | null | undefined) => (id ? erpUserName.get(id) ?? `ERP#${id}` : '(none)')

  // ── 1. live vs archive ──
  const liveC = new Map(live.contacts.map(c => [c.id, c])), liveD = new Map(live.deals.map(d => [d.id, d]))
  const arcC = new Map(aContacts.map(c => [c.id, c])), arcD = new Map(aDeals.map(d => [d.id, d]))
  const contactDiff: Json[] = [], dealDiff: Json[] = []
  for (const c of live.contacts) {
    const a = arcC.get(c.id)
    if (!a) contactDiff.push({ id: c.id, name: c.name, issue: 'in FS, missing in archive', fsOwner: fsName(c.owner), updatedAt: c.updatedAt })
    else if ((a.ownerFsId ?? null) !== c.owner) contactDiff.push({ id: c.id, name: c.name, issue: 'owner differs', fsOwner: fsName(c.owner), archiveOwner: fsName(a.ownerFsId), updatedAt: c.updatedAt })
  }
  for (const a of aContacts) if (!liveC.has(a.id)) contactDiff.push({ id: a.id, issue: 'in archive, not in FS contacts view', archiveOwner: fsName(a.ownerFsId) })
  for (const d of live.deals) {
    const a = arcD.get(d.id)
    if (!a) { dealDiff.push({ id: d.id, name: d.name, issue: 'in FS, missing in archive', updatedAt: d.updatedAt }); continue }
    const issues = []
    if ((a.ownerFsId ?? null) !== d.owner) issues.push(`owner ${fsName(a.ownerFsId)} → ${fsName(d.owner)}`)
    if ((a.stageFsId ?? null) !== d.stage) issues.push(`stage ${a.stageFsId} → ${d.stage}`)
    if ([...a.contactFsIds].sort().join() !== [...d.contacts].sort().join()) issues.push('contacts differ')
    if (issues.length) dealDiff.push({ id: d.id, name: d.name, issue: issues.join('; '), updatedAt: d.updatedAt })
  }
  for (const a of aDeals) if (!liveD.has(a.id)) dealDiff.push({ id: a.id, issue: 'in archive, deleted in FS' })
  const tally = (rows: Json[]) => rows.reduce((m: Json, r) => { const k = String(r.issue).replace(/ [^;]* → [^;]*/g, '').replace(/stage|owner/g, x => x); m[k] = (m[k] ?? 0) + 1; return m }, {})
  summary.liveVsArchive = { contactDiffs: csv('live_vs_archive_contacts.csv', contactDiff), dealDiffs: csv('live_vs_archive_deals.csv', dealDiff), contactIssues: tally(contactDiff), dealIssues: tally(dealDiff.map(r => ({ issue: String(r.issue).split('; ').map(x => x.split(' ')[0]).join('+') }))) }

  // ── 2. live vs ERP: owner per lead / guest (sync rules, from live data) ──
  const stageOf = new Map(lookups.filter(l => l.kind === 'DEAL_STAGE').map(l => [l.fsId, l]))
  const pipelineName = new Map(lookups.filter(l => l.kind === 'DEAL_PIPELINE').map(l => [l.fsId, l.name]))
  const isOpen = (d: LiveDeal) => ((stageOf.get(d.stage ?? '')?.extra as Json | null)?.forecast_type ?? 'Open') === 'Open'
  const userByEmail = new Map(users.map(u => [u.email.toLowerCase(), u.id])), userIds = new Set(users.map(u => u.id))
  const OVERRIDE: Record<string, string> = { 'indah@samarayachting.com': 'efrinda@samarayachting.com' }
  const ownerMap = new Map<string, string | null | undefined>()
  for (const u of fsUsers) {
    if (/philippe/i.test(u.name ?? '')) { ownerMap.set(u.id, undefined); continue }
    const em = (u.email ?? '').toLowerCase()
    ownerMap.set(u.id, (u.userId && userIds.has(u.userId) ? u.userId : null) ?? userByEmail.get(OVERRIDE[em] ?? em) ?? null)
  }
  const erpOwner = (o: string | null) => (o ? (ownerMap.has(o) ? ownerMap.get(o) : null) : null)
  summary.ownerMapping = fsUsers.map(u => ({ fsUser: u.name ?? u.email, erpUser: ownerMap.get(u.id) === undefined ? 'SKIPPED (left alone)' : erpName(ownerMap.get(u.id) ?? null) }))

  const leadsByFs = new Map<string, typeof leads>()
  for (const l of leads) if (l.freshsalesContactId) leadsByFs.set(l.freshsalesContactId, [...(leadsByFs.get(l.freshsalesContactId) ?? []), l])
  summary.erpLeads = { total: leads.length, active: leads.filter(l => !l.deletedAt).length, linkedToFs: leads.filter(l => l.freshsalesContactId).length, fsContactsWithMultipleLeads: [...leadsByFs.values()].filter(v => v.length > 1).length }

  const dealsByContact = new Map<string, LiveDeal[]>()
  let agentDeals = 0, orphanDeals = 0
  for (const d of live.deals) {
    if (pipelineName.get(stageOf.get(d.stage ?? '')?.parentFsId ?? '') === AGENT_PIPELINE) { agentDeals++; continue }
    const holder = d.contacts.find(id => leadsByFs.has(id) && liveC.has(id)) ?? d.contacts.find(id => liveC.has(id))
    if (!holder) { orphanDeals++; continue }
    dealsByContact.set(holder, [...(dealsByContact.get(holder) ?? []), d])
  }
  summary.liveDeals = { agentOutreachIgnored: agentDeals, withoutLiveContact: orphanDeals, contactsWithDeals: dealsByContact.size }

  const leadOwnerDiff: Json[] = [], guestOwnerDiff: Json[] = [], missingLead: Json[] = [], dealLinkDiff: Json[] = []
  const perOwner = new Map<string, { expected: number; erp: number }>()
  const bump = (k: string, f: 'expected' | 'erp') => { const r = perOwner.get(k) ?? { expected: 0, erp: 0 }; r[f]++; perOwner.set(k, r) }
  let checked = 0, ownerOk = 0, skippedPhilippe = 0
  for (const c of live.contacts) {
    const ds = dealsByContact.get(c.id) ?? []
    const open = ds.filter(isOpen)
    const deal = [...(open.length ? open : ds)].sort((a, b) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0))[0] ?? null
    const contactOwner = erpOwner(c.owner)
    const dealOwner = deal?.owner ? erpOwner(deal.owner) : null
    const [primary, backup] = deal && isOpen(deal) ? [dealOwner, contactOwner] : [contactOwner, dealOwner]
    const want = primary === undefined ? undefined : primary ?? backup
    const ls = (leadsByFs.get(c.id) ?? []).filter(l => !l.deletedAt)
    if (!ls.length) {
      if (deal) missingLead.push({ fsContactId: c.id, name: c.name, fsDeal: deal.id, fsOwner: fsName(deal.owner ?? c.owner) })
    }
    for (const l of ls) {
      checked++
      if (want === undefined) { skippedPhilippe++; continue }
      bump(erpName(want ?? null), 'expected'); bump(erpName(l.ownerId), 'erp')
      if ((l.ownerId ?? null) === (want ?? null)) ownerOk++
      else leadOwnerDiff.push({ leadId: l.id, lead: l.name, fsContactId: c.id, fsDeal: deal?.id ?? null, dealOpen: deal ? isOpen(deal) : null, fsContactOwner: fsName(c.owner), fsDealOwner: fsName(deal?.owner), erpOwnerNow: erpName(l.ownerId), erpOwnerExpected: erpName(want ?? null) })
      if ((l.freshsalesDealId ?? null) !== (deal?.id ?? null)) dealLinkDiff.push({ leadId: l.id, lead: l.name, fsContactId: c.id, erpDeal: l.freshsalesDealId, fsDeal: deal?.id ?? null })
    }
  }
  for (const cu of customers) {
    if (!cu.freshsalesContactId || cu.deletedAt) continue
    const c = liveC.get(cu.freshsalesContactId)
    if (!c) continue
    const want = erpOwner(c.owner)
    if (want === undefined) continue
    if ((cu.ownerId ?? null) !== (want ?? null)) guestOwnerDiff.push({ guestId: cu.id, guest: cu.name, fsContactId: c.id, fsOwner: fsName(c.owner), erpOwnerNow: erpName(cu.ownerId), erpOwnerExpected: erpName(want ?? null) })
  }
  summary.liveVsErp = {
    activeLeadsLinkedToLiveContact: checked, ownerMatch: ownerOk, ownerMismatch: csv('lead_owner_mismatch.csv', leadOwnerDiff), skippedPhilippe,
    dealLinkMismatch: csv('lead_deal_mismatch.csv', dealLinkDiff),
    fsContactsWithDealButNoActiveLead: csv('missing_leads.csv', missingLead),
    guestOwnerMismatch: csv('guest_owner_mismatch.csv', guestOwnerDiff),
  }
  summary.leadsPerOwner = Object.fromEntries([...perOwner].sort((a, b) => b[1].expected - a[1].expected).map(([k, v]) => [k, `FS ${v.expected} | ERP ${v.erp}`]))
  fsys.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
