/**
 * Backfill for the 24 Nov rule "every WhatsApp Sales chat opens a deal" (src/lib/deal-chat.ts).
 * Before it, a chat straight to the number (WHATSAPP_DIRECT) — and chats that came in before the ERP
 * deal maker went live — got a Lead but no deal, so their pipeline sat at New Enquiry forever.
 *
 * Picks Sales WhatsApp chats active in the last N days whose Lead has NO deal at all for the chat's
 * brand (a lead whose deal was closed Won/Lost is left alone — sales already decided on it) and opens
 * one via createDealFromLead: stage from the conversation (we wrote → Initial Message Sent; they
 * answered and trip type set → In Active Communication; else New Enquiry). Deal owner = the lead's
 * owner (else round-robin, like the live deal maker); actingUserId = the chat holder so they aren't
 * notified about every backfilled deal.
 *
 *   npx tsx scripts/backfill-wa-chat-deals.ts [--days=30] [--apply]
 */
import { PrismaClient } from '@prisma/client'
import { createDealFromLead } from '../src/lib/deal-chat'

const db = new PrismaClient()
const apply = process.argv.includes('--apply')
const days = Number(process.argv.find(a => a.startsWith('--days='))?.split('=')[1] ?? 30)

async function main() {
  const since = new Date(Date.now() - days * 86400_000)
  const convs = await db.whatsappConversation.findMany({
    where: { category: 'SALES', leadId: { not: null }, lastMessageAt: { gte: since }, lead: { deletedAt: null } },
    select: {
      id: true, brand: true, phone: true, lastMessageAt: true, assignedToId: true, leadId: true, lastInboundAt: true, lastOutboundAt: true,
      lead: { select: { firstName: true, lastName: true, ownerId: true, tripType: true, lastInboundAt: true, lastOutboundAt: true } },
    },
    orderBy: { lastMessageAt: 'desc' },
  })
  const seen = new Set<string>()
  const todo: typeof convs = []
  for (const c of convs) {
    const key = `${c.leadId}|${c.brand}`
    if (seen.has(key)) continue
    seen.add(key)
    const anyDeal = await db.deal.findFirst({ where: { leadId: c.leadId!, brand: c.brand, deletedAt: null }, select: { id: true } })
    if (!anyDeal) todo.push(c)
  }
  console.log(`${convs.length} Sales WA chats active in the last ${days} days → ${todo.length} leads without any deal for the chat's brand${apply ? '' : ' (dry run — pass --apply)'}`)
  let made = 0
  for (const c of todo) {
    const l = c.lead!
    const name = [l.firstName, l.lastName].filter(Boolean).join(' ')
    // Preview only — createDealFromLead decides (same rule, lead + chat timestamps).
    const later = (a?: Date | null, b?: Date | null) => (a && b ? (a > b ? a : b) : a ?? b ?? null)
    const out = later(l.lastOutboundAt, c.lastOutboundAt), inb = later(l.lastInboundAt, c.lastInboundAt)
    const stage = !out ? 'NEW' : inb && inb > out && l.tripType ? 'ACTIVE_COMMUNICATION' : 'INITIAL_MESSAGE_SENT'
    console.log(`  ${c.lastMessageAt.toISOString().slice(0, 16)} ${c.brand.padEnd(8)} ${c.phone.padEnd(16)} ${name.slice(0, 28).padEnd(28)} → ${stage}${l.ownerId ? '' : ' (no lead owner → round-robin)'}`)
    if (!apply) continue
    const r = await createDealFromLead(db, { leadId: c.leadId!, brand: c.brand, channel: 'WHATSAPP', whatsappConversationId: c.id, actingUserId: c.assignedToId ?? l.ownerId ?? null })
    if (r.ok && r.created) made++
    else if (!r.ok) console.error(`    ✗ ${r.error}`)
  }
  if (apply) console.log(`Created ${made} deals.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
