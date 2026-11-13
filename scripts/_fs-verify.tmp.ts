/** READ-ONLY: Freshsales board vs ERP board, deal by deal + contacts/guests/owners summary. */
import { PrismaClient } from '@prisma/client'
import * as fsys from 'fs'
const db = new PrismaClient()
const OUT = process.argv[2] || '.'
const STAGE: Record<string, string> = {
  'new enquiry': 'NEW', 'new': 'NEW', 'initial message sent': 'INITIAL_MESSAGE_SENT', 'in active communication': 'ACTIVE_COMMUNICATION',
  'in communication': 'ACTIVE_COMMUNICATION', 'quote': 'ACTIVE_COMMUNICATION', '1st follow-up': 'FOLLOW_UP_1', '2nd follow-up': 'FOLLOW_UP_2',
  'send booking confirmation': 'BOOKING_CONFIRMATION', 'verbally confirmed': 'BOOKING_CONFIRMATION', 'send invoice 1': 'INVOICE_SENT',
  'won': 'CLOSED_WON', 'closed won': 'CLOSED_WON', 'lost': 'CLOSED_LOST', 'closed lost': 'CLOSED_LOST',
}
async function main() {
  const [deals, lookups, fsUsers, users, leads, contacts, customers] = await Promise.all([
    db.freshsalesDeal.findMany({ where: { isDeleted: false }, select: { id: true, name: true, amount: true, stageFsId: true, pipelineFsId: true, ownerFsId: true, contactFsIds: true, stageUpdatedAt: true, closedDate: true } }),
    db.freshsalesLookup.findMany({ where: { kind: { in: ['DEAL_STAGE', 'DEAL_PIPELINE'] } } }),
    db.freshsalesUser.findMany(), db.user.findMany({ select: { id: true, email: true, name: true } }),
    db.lead.findMany({ select: { id: true, name: true, stage: true, ownerId: true, tripAmount: true, freshsalesDealId: true, freshsalesContactId: true, deletedAt: true, email: true } }),
    db.freshsalesContact.findMany({ where: { isDeleted: false }, select: { id: true, ownerFsId: true, email: true } }),
    db.customer.findMany({ where: { deletedAt: null }, select: { id: true, ownerId: true, freshsalesContactId: true } }),
  ])
  const stage = new Map(lookups.filter(l => l.kind === 'DEAL_STAGE').map(l => [l.fsId, l]))
  const pipe = new Map(lookups.filter(l => l.kind === 'DEAL_PIPELINE').map(l => [l.fsId, l.name]))
  const byEmail = new Map(users.map(u => [u.email.toLowerCase(), u]))
  const uname = new Map(users.map(u => [u.id, u.name]))
  const fsU = new Map(fsUsers.map(u => {
    const em = (u.email ?? '').toLowerCase()
    const erp = u.userId ?? byEmail.get(em === 'indah@samarayachting.com' ? 'efrinda@samarayachting.com' : em)?.id ?? null
    return [u.id, { name: u.name, erp, philippe: /philippe/i.test(u.name ?? '') }]
  }))
  const leadByDeal = new Map<string, typeof leads>()
  for (const l of leads) if (l.freshsalesDealId) leadByDeal.set(l.freshsalesDealId, [...(leadByDeal.get(l.freshsalesDealId) ?? []), l])
  const leadByFs = new Map(leads.filter(l => l.freshsalesContactId).map(l => [l.freshsalesContactId!, l]))
  const contactOwner = new Map(contacts.map(c => [c.id, c.ownerFsId]))
  const R: Record<string, number> = {}
  const inc = (k: string) => { R[k] = (R[k] ?? 0) + 1 }
  const issues: string[] = ['dealId,deal,fsStage,fsOwner,issue,erpLead,erpStage,erpOwner']
  const cutoff = new Date(Date.now() - 90 * 86400000)
  const board: Record<string, { fs: number; erp: number }> = {}

  for (const d of deals) {
    if (pipe.get(d.pipelineFsId ?? '') === 'Agent Outreach Pipeline') continue
    const st = stage.get(d.stageFsId ?? '')
    const ft = (st?.extra as any)?.forecast_type ?? 'Open'
    const open = ft === 'Open'
    const recent = (d.stageUpdatedAt ?? d.closedDate ?? new Date(0)) >= cutoff
    if (!open && !recent) continue // not on either board
    const want = STAGE[(st?.name ?? '').toLowerCase()]
    const group = open ? 'open deals' : 'won/lost (last 90d)'
    inc(`${group}: total`)
    const ls = (leadByDeal.get(d.id) ?? [])
    const l = ls.find(x => !x.deletedAt) ?? ls[0]
    const fsOwner = fsU.get(d.ownerFsId ?? '')
    const k = `${want}`
    board[k] = board[k] ?? { fs: 0, erp: 0 }; board[k].fs++
    const row = (issue: string) => { inc(`${group}: ${issue}`); issues.push([d.id, d.name, st?.name, fsOwner?.name, issue, l?.name, l?.stage, uname.get(l?.ownerId ?? '')].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')) }
    if (!l) {
      // is this deal another contact's secondary deal? (contact already shows a newer open deal)
      const holderLead = d.contactFsIds.map(c => leadByFs.get(c)).find(Boolean)
      row(holderLead ? 'no card: contact shows another (newer) deal' : 'no ERP lead for this deal'); continue
    }
    if (l.deletedAt && want !== 'CLOSED_WON') { row('ERP lead soft-deleted'); continue }
    if (ls.filter(x => !x.deletedAt).length > 1) row('duplicate cards')
    board[k].erp++
    if (l.stage !== want) row('stage differs')
    // owner rule: open → deal owner (fallback contact owner); closed → contact owner (fallback deal owner)
    const co = fsU.get(contactOwner.get(d.contactFsIds.find(c => leadByFs.get(c)?.id === l.id) ?? d.contactFsIds[0] ?? '') ?? '')
    const [p, b] = open ? [fsOwner, co] : [co, fsOwner]
    const usable = [p, b].find(x => x && !x.philippe && x.erp)
    if (!usable && [p, b].some(x => x?.philippe)) inc(`${group}: owner = Philippe only (left as is)`)
    else {
      if (p?.philippe) inc(`${group}: Philippe deal → contact's sales rep`)
      const expected = usable?.erp ?? null
      if ((expected ?? null) !== (l.ownerId ?? null)) row('owner differs')
      else inc(`${group}: owner OK`)
    }
    if (d.amount != null && l.tripAmount !== d.amount) row('amount differs')
  }

  // Contacts & guests
  let cNoLead = 0, gOwnerDiff = 0, gPhil = 0
  for (const c of contacts) if (c.email && !leadByFs.has(c.id)) cNoLead++
  for (const g of customers) {
    if (!g.freshsalesContactId) continue
    const o = fsU.get(contactOwner.get(g.freshsalesContactId) ?? '')
    if (o?.philippe) { gPhil++; continue }
    if ((o?.erp ?? null) !== (g.ownerId ?? null)) gOwnerDiff++
  }
  R['contacts with email but no ERP lead'] = cNoLead
  R['guests linked to FS'] = customers.filter(g => g.freshsalesContactId).length
  R['guests owner ≠ FS contact owner'] = gOwnerDiff
  R['guests owned by Philippe in FS (skipped)'] = gPhil
  fsys.writeFileSync(`${OUT}/verify_issues.csv`, issues.join('\n'))
  console.log(JSON.stringify({ result: R, boardPerStage_FS_vs_ERP: board }, null, 1))
}
main().finally(() => db.$disconnect())
