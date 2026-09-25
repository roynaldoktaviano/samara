import type { PrismaClient, WhatsappBrand } from '@prisma/client'
import { pickNextSalesUserId } from '@/lib/whatsapp-distribution'
import { sendPushToUser } from '@/lib/push'
import { brandForWebsite, setLeadOwner } from '@/lib/whatsapp-lead'

export const STAGNANT_HOURS = 24

// 24h no-follow-up rule for the Sales Pipeline — polled by src/instrumentation-node.ts via
// /api/leads/stagnant-check. A Lead is stagnant when its current owner has held it 24h
// (clock = Lead.ownerAssignedAt, restarted on every hand-over) and:
//   • it has a SALES WhatsApp chat whose latest customer message has gone 24h unanswered, or
//   • it has no such chat (website form / manual) and is still NEW.
// Stagnant leads move to the next rep in that brand's pool (skipping everyone who already
// lost it this way, so each rep gets one chance); their WhatsApp chats move along. When
// nobody's left, admins are told instead and the clock restarts (reminds again in 24h).
// Leads with no ownerAssignedAt (owned before this rule existed) are exempt from the
// no-chat rule until they next change hands.
export async function runLeadStagnantCheck(db: PrismaClient): Promise<{ reassigned: number; escalated: number }> {
  const cutoff = new Date(Date.now() - STAGNANT_HOURS * 60 * 60 * 1000)
  const openLead = { deletedAt: null, stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] as ('CLOSED_WON' | 'CLOSED_LOST')[] } }

  const stagnant = new Map<string, { brand: WhatsappBrand; why: string }>()

  // Chat-based: customer waiting 24h+ for a reply.
  const chats = await db.whatsappConversation.findMany({
    where: {
      category: 'SALES', leadId: { not: null }, assignedToId: { not: null },
      lastInboundAt: { lt: cutoff },
      lead: { ...openLead, OR: [{ ownerAssignedAt: null }, { ownerAssignedAt: { lt: cutoff } }] },
    },
    select: { leadId: true, brand: true, lastInboundAt: true, lastOutboundAt: true },
  })
  for (const c of chats) {
    if (c.lastOutboundAt && c.lastInboundAt && c.lastOutboundAt >= c.lastInboundAt) continue
    if (c.leadId && !stagnant.has(c.leadId)) stagnant.set(c.leadId, { brand: c.brand, why: `chat WhatsApp belum dibalas ${STAGNANT_HOURS} jam` })
  }

  // No chat: still NEW 24h after being assigned.
  const idle = await db.lead.findMany({
    where: {
      deletedAt: null, stage: 'NEW', ownerId: { not: null }, ownerAssignedAt: { lt: cutoff },
      whatsappConversations: { none: { category: 'SALES' } },
    },
    select: { id: true, inquiries: { orderBy: { createdAt: 'desc' }, take: 1, select: { website: true } } },
  })
  for (const l of idle) {
    if (!stagnant.has(l.id)) stagnant.set(l.id, { brand: brandForWebsite(l.inquiries[0]?.website), why: `masih New ${STAGNANT_HOURS} jam setelah di-assign` })
  }

  if (stagnant.size === 0) return { reassigned: 0, escalated: 0 }
  const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
  let reassigned = 0
  let escalated = 0

  for (const [leadId, { brand, why }] of stagnant) {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      select: {
        name: true, ownerId: true, owner: { select: { name: true, email: true } },
        assignmentLogs: { where: { reason: 'STAGNANT' }, select: { fromUserId: true } },
      },
    })
    if (!lead?.ownerId) continue
    const alreadyTried = new Set([lead.ownerId, ...lead.assignmentLogs.map(l => l.fromUserId).filter((id): id is string => !!id)])

    const nextOwner = await pickFromPoolExcluding(db, brand, alreadyTried)
    const oldOwnerName = lead.owner?.name ?? lead.owner?.email ?? 'sales'

    if (!nextOwner) {
      // Everyone in the pool has had it — hand it to a human decision, remind again in 24h.
      await db.lead.update({ where: { id: leadId }, data: { ownerAssignedAt: new Date() } })
      for (const a of admins) {
        db.notification.create({ data: { userId: a.id, type: 'LEAD_STAGNANT', title: `Lead stagnan: ${lead.name}`, body: `${why} (pegangan ${oldOwnerName}); semua sales di pool sudah pernah memegangnya — perlu keputusan admin` } }).catch(() => {})
      }
      escalated++
      continue
    }

    await setLeadOwner(db, leadId, nextOwner, 'STAGNANT')
    reassigned++

    const newTitle = `Lead dialihkan ke kamu: ${lead.name}`
    const newBody = `Dari ${oldOwnerName} — ${why}. Segera follow up.`
    db.notification.create({ data: { userId: nextOwner, type: 'LEAD_ASSIGNED', title: newTitle, body: newBody } }).catch(() => {})
    sendPushToUser(db, nextOwner, { title: newTitle, body: newBody, url: '/' }).catch(() => {})
    db.notification.create({ data: { userId: lead.ownerId, type: 'LEAD_STAGNANT', title: `Lead dialihkan: ${lead.name}`, body: `${why}, jadi dipindahkan ke sales lain.` } }).catch(() => {})
    for (const a of admins) {
      db.notification.create({ data: { userId: a.id, type: 'LEAD_STAGNANT', title: `Lead dialihkan otomatis: ${lead.name}`, body: `${oldOwnerName} → sales berikutnya (${why})` } }).catch(() => {})
    }
  }

  return { reassigned, escalated }
}

// Next rep from the brand's pool (falling back to Samara's if empty) who isn't excluded.
// Walks the normal rotation so load stays balanced; gives up after one full lap.
async function pickFromPoolExcluding(db: PrismaClient, brand: WhatsappBrand, exclude: Set<string>): Promise<string | null> {
  let poolBrand = brand
  let size = await db.whatsappDistributionParticipant.count({ where: { brand } })
  if (size === 0 && brand !== 'SAMARA') {
    poolBrand = 'SAMARA'
    size = await db.whatsappDistributionParticipant.count({ where: { brand: 'SAMARA' } })
  }
  for (let i = 0; i < size; i++) {
    const candidate = await pickNextSalesUserId(db, poolBrand)
    if (candidate && !exclude.has(candidate)) return candidate
  }
  return null
}
