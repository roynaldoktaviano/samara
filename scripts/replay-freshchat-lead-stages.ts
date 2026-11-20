/**
 * One-off catch-up (Roy, 2026-11-20): leads still at New Enquiry although the team already chatted
 * with them from Freshchat — those replies reached the ERP through the Freshchat mirror, which did
 * not move the pipeline until now (src/lib/freshchat-mirror.ts replays new messages from here on).
 *
 * For every lead whose open conversation deals are all still NEW and whose WhatsApp / IG /
 * Messenger thread has a Freshchat-sent reply in the last DAYS days, the thread's messages of that
 * window are replayed oldest first through src/lib/lead-stage-auto.ts.
 *
 * Run AFTER the Deal migration (scripts/migrate-deals-parity-b.ts) and the deploy that carries the
 * Freshsales "never back to an earlier conversation stage" guard — otherwise the 15-min Freshsales
 * sync puts the stage straight back.
 *   npx tsx scripts/replay-freshchat-lead-stages.ts [--days=7]          dry run
 *   npx tsx scripts/replay-freshchat-lead-stages.ts [--days=7] --apply
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { CONVERSATION_STAGES } from '../src/lib/lead-pipeline'
import { replayLeadChatEvents, type LeadChatEvent } from '../src/lib/lead-stage-auto'

const db = new PrismaClient()

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const days = Number(args.find(a => a.startsWith('--days='))?.split('=')[1]) || 7
  const since = new Date(Date.now() - days * 86400000)

  const [waOut, igOut] = await Promise.all([
    db.whatsappMessage.findMany({
      where: { direction: 'OUT', providerMessageId: { startsWith: 'freshchat:' }, createdAt: { gte: since }, conversation: { leadId: { not: null } } },
      select: { conversationId: true, conversation: { select: { leadId: true } } }, distinct: ['conversationId'],
    }),
    db.instagramMessage.findMany({
      where: { direction: 'OUT', providerMessageId: { startsWith: 'freshchat:' }, createdAt: { gte: since }, conversation: { leadId: { not: null } } },
      select: { conversationId: true, conversation: { select: { leadId: true } } }, distinct: ['conversationId'],
    }),
  ])
  const threadsByLead = new Map<string, { wa: string[]; ig: string[] }>()
  const add = (leadId: string, kind: 'wa' | 'ig', id: string) => {
    const t = threadsByLead.get(leadId) ?? { wa: [], ig: [] }
    t[kind].push(id)
    threadsByLead.set(leadId, t)
  }
  waOut.forEach(m => add(m.conversation.leadId!, 'wa', m.conversationId))
  igOut.forEach(m => add(m.conversation.leadId!, 'ig', m.conversationId))

  // Only people with nothing past New Enquiry yet — replaying old messages onto a deal that has
  // already moved could undo a later move.
  const deals = await db.deal.findMany({
    where: { leadId: { in: [...threadsByLead.keys()] }, deletedAt: null, stage: { in: [...CONVERSATION_STAGES] } },
    select: { leadId: true, stage: true },
  })
  const stagesOf = new Map<string, string[]>()
  for (const d of deals) if (d.leadId) stagesOf.set(d.leadId, [...(stagesOf.get(d.leadId) ?? []), d.stage])
  const targets = [...threadsByLead.keys()].filter(id => {
    const s = stagesOf.get(id)
    return !!s?.length && s.every(x => x === 'NEW')
  })
  console.log(`${threadsByLead.size} leads with Freshchat replies in the last ${days} days, ${targets.length} still at New Enquiry${apply ? '' : ' (dry run)'}`)

  const users = await db.user.findMany({ select: { id: true, name: true } })
  const userByName = new Map(users.filter(u => u.name).map(u => [u.name!.trim().toLowerCase(), u.id]))

  let moved = 0
  for (const leadId of targets) {
    const t = threadsByLead.get(leadId)!
    const [wa, ig] = await Promise.all([
      db.whatsappMessage.findMany({ where: { conversationId: { in: t.wa }, createdAt: { gte: since } }, select: { direction: true, createdAt: true, sentByUserId: true, sentByName: true } }),
      db.instagramMessage.findMany({ where: { conversationId: { in: t.ig }, createdAt: { gte: since } }, select: { direction: true, createdAt: true, sentByUserId: true, sentByName: true } }),
    ])
    const events: LeadChatEvent[] = [...wa, ...ig].map(m => ({
      direction: m.direction as 'IN' | 'OUT', at: m.createdAt,
      userId: m.sentByUserId ?? (m.sentByName ? userByName.get(m.sentByName.trim().toLowerCase()) ?? null : null),
    }))
    const lead = await db.lead.findUnique({ where: { id: leadId }, select: { name: true } })
    if (!apply) { console.log(`  would replay ${events.length} messages → ${lead?.name}`); continue }
    await replayLeadChatEvents(db, leadId, events)
    const after = await db.lead.findUnique({ where: { id: leadId }, select: { stage: true } })
    console.log(`  ${lead?.name}: NEW → ${after?.stage}`)
    if (after?.stage !== 'NEW') moved++
  }
  if (apply) console.log(`done: ${moved}/${targets.length} leads moved`)
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
