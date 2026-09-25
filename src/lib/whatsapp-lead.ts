import type { LeadAssignmentReason, PrismaClient, WhatsappBrand } from '@prisma/client'
import { pickNextSalesUserId } from '@/lib/whatsapp-distribution'
import { sendPushToUser } from '@/lib/push'

// Links WhatsApp chats into the Lead pipeline. The pipeline stage lives on Lead only —
// a chat just points at its Lead (WhatsappConversation.leadId) and carries a triage
// `category`. A Lead is only created once a chat is categorised SALES, so spam/vendor/
// guest chats never clutter the Leads list. Chat owner = lead owner: whenever a chat's
// assignedToId changes, syncLeadOwner() moves the Lead with it.

export { WHATSAPP_CHAT_CATEGORIES, WHATSAPP_CHAT_CATEGORY_LABEL, isWhatsappChatCategory, type WhatsappChatCategory } from '@/lib/whatsapp-chat-category'

// Phones are stored in whatever format they were typed ("+62 812-...", "0812...", "62812...")
// so matching compares the last 10 digits only — enough to be unique in practice while
// ignoring country-code / leading-zero differences.
function phoneTail(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 8 ? digits.slice(-10) : null
}

async function findLeadIdByPhone(db: PrismaClient, phone: string): Promise<string | null> {
  const tail = phoneTail(phone)
  if (!tail) return null
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Lead"
    WHERE "deletedAt" IS NULL AND phone IS NOT NULL
      AND RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) = ${tail}
    ORDER BY "createdAt" DESC LIMIT 1
  `
  return rows[0]?.id ?? null
}

async function customerExistsByPhone(db: PrismaClient, phone: string): Promise<boolean> {
  const tail = phoneTail(phone)
  if (!tail) return false
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Customer"
    WHERE "deletedAt" IS NULL AND phone IS NOT NULL
      AND RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) = ${tail}
    LIMIT 1
  `
  return rows.length > 0
}

// Writes a Lead's new owner + restarts its 24h stagnant clock + logs the hand-over. No-op
// (returns false) when the owner doesn't actually change. Every owner change goes through here.
export async function recordLeadOwner(db: PrismaClient, leadId: string, toUserId: string | null, reason: LeadAssignmentReason): Promise<boolean> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { ownerId: true } })
  if (!lead || lead.ownerId === toUserId) return false
  await db.lead.update({ where: { id: leadId }, data: { ownerId: toUserId, ownerAssignedAt: toUserId ? new Date() : null } })
  await db.leadAssignmentLog.create({ data: { leadId, fromUserId: lead.ownerId, toUserId, reason } })
  return true
}

// Chat owner = lead owner when a chat gets linked to a Lead: a Lead that already has an
// owner pulls the chat to that owner (the rep already working this person keeps them);
// an unowned Lead takes the chat's holder.
async function reconcileOwnership(db: PrismaClient, conversationId: string, leadId: string): Promise<void> {
  const [lead, conv] = await Promise.all([
    db.lead.findUnique({ where: { id: leadId }, select: { ownerId: true } }),
    db.whatsappConversation.findUnique({ where: { id: conversationId }, select: { assignedToId: true } }),
  ])
  if (!lead || !conv) return
  if (lead.ownerId && lead.ownerId !== conv.assignedToId) {
    await db.whatsappConversation.update({ where: { id: conversationId }, data: { assignedToId: lead.ownerId } })
  } else if (!lead.ownerId && conv.assignedToId) {
    await recordLeadOwner(db, leadId, conv.assignedToId, 'AUTO_DISTRIBUTION')
  }
}

// Run once when a conversation is first created (inbound webhook or "New Chat"). An
// existing Lead with the same number → linked + SALES straight away; an existing Guest →
// GUEST; otherwise it stays UNSORTED for a human to triage. Best-effort by design.
export async function autoLinkNewConversation(db: PrismaClient, conversationId: string): Promise<void> {
  const conv = await db.whatsappConversation.findUnique({
    where: { id: conversationId },
    select: { phone: true, assignedToId: true, category: true, leadId: true },
  })
  if (!conv || conv.leadId || conv.category !== 'UNSORTED') return

  const leadId = await findLeadIdByPhone(db, conv.phone)
  if (leadId) {
    await db.whatsappConversation.update({ where: { id: conversationId }, data: { leadId, category: 'SALES' } })
    await reconcileOwnership(db, conversationId, leadId)
    return
  }
  if (await customerExistsByPhone(db, conv.phone)) {
    await db.whatsappConversation.update({ where: { id: conversationId }, data: { category: 'GUEST' } })
  }
}

// Makes sure a SALES chat has a Lead — reusing one with the same number, else creating a
// new one owned by the chat's holder. If staff already replied, the new Lead starts at
// CONTACTED rather than NEW. Returns the lead id.
export async function ensureLeadForConversation(db: PrismaClient, conversationId: string, actingUserId?: string): Promise<string | null> {
  const conv = await db.whatsappConversation.findUnique({
    where: { id: conversationId },
    select: { phone: true, contactName: true, brand: true, assignedToId: true, leadId: true, firstResponseAt: true },
  })
  if (!conv) return null
  if (conv.leadId) return conv.leadId

  let leadId = await findLeadIdByPhone(db, conv.phone)
  if (!leadId) {
    const name = conv.contactName?.trim() || `+${conv.phone}`
    const parts = name.split(/\s+/)
    const lead = await db.lead.create({
      data: {
        name,
        firstName: conv.contactName?.trim() ? parts[0] : null,
        lastName: conv.contactName?.trim() && parts.length > 1 ? parts.slice(1).join(' ') : null,
        phone: `+${conv.phone}`,
        source: whatsappLeadSource(conv.brand),
        ownerId: conv.assignedToId,
        ownerAssignedAt: conv.assignedToId ? new Date() : null,
        stage: conv.firstResponseAt ? 'CONTACTED' : 'NEW',
        stageUpdatedAt: new Date(),
        stageUpdatedById: actingUserId ?? null,
      },
      select: { id: true },
    })
    leadId = lead.id
    await db.whatsappConversation.update({ where: { id: conversationId }, data: { leadId } })
    if (conv.assignedToId) {
      await db.leadAssignmentLog.create({ data: { leadId, toUserId: conv.assignedToId, reason: 'AUTO_DISTRIBUTION' } })
    }
    return leadId
  }
  await db.whatsappConversation.update({ where: { id: conversationId }, data: { leadId } })
  await reconcileOwnership(db, conversationId, leadId)
  return leadId
}

export function whatsappLeadSource(brand: WhatsappBrand): string {
  return `WHATSAPP_${brand}`
}

// Chat owner = lead owner — call after any change to a conversation's assignedToId. Moves
// the Lead (and the Lead's other chats, e.g. on another brand's number) to the same person.
export async function syncLeadOwner(db: PrismaClient, conversationId: string, reason: LeadAssignmentReason): Promise<void> {
  const conv = await db.whatsappConversation.findUnique({ where: { id: conversationId }, select: { leadId: true, assignedToId: true } })
  if (!conv?.leadId) return
  if (await recordLeadOwner(db, conv.leadId, conv.assignedToId, reason)) {
    await db.whatsappConversation.updateMany({ where: { leadId: conv.leadId, id: { not: conversationId } }, data: { assignedToId: conv.assignedToId } })
  }
}

// Called after every successful staff send. Stamps the reply timestamps and, the first
// time staff answers a SALES chat whose Lead is still NEW, moves it to CONTACTED.
export async function recordStaffReply(db: PrismaClient, conversationId: string, userId: string): Promise<void> {
  const now = new Date()
  const conv = await db.whatsappConversation.findUnique({ where: { id: conversationId }, select: { firstResponseAt: true, leadId: true } })
  if (!conv) return
  await db.whatsappConversation.update({
    where: { id: conversationId },
    data: { lastOutboundAt: now, ...(conv.firstResponseAt ? {} : { firstResponseAt: now }) },
  })
  if (conv.leadId) {
    await db.lead.updateMany({
      where: { id: conv.leadId, stage: 'NEW' },
      data: { stage: 'CONTACTED', stageUpdatedAt: now, stageUpdatedById: userId },
    })
  }
}

// The other direction of chat owner = lead owner: when a Lead changes hands (claimed or
// reassigned from the Sales Pipeline), its WhatsApp chats move with it so the new owner
// can reply. Returns false when `onlyIfUnowned` and someone else got it first.
export async function setLeadOwner(db: PrismaClient, leadId: string, ownerId: string | null, reason: LeadAssignmentReason, onlyIfUnowned = false): Promise<boolean> {
  if (onlyIfUnowned) {
    // Atomic claim — two reps clicking at once can't both win.
    const { count } = await db.lead.updateMany({ where: { id: leadId, ownerId: null }, data: { ownerId, ownerAssignedAt: new Date() } })
    if (count === 0) {
      const current = await db.lead.findUnique({ where: { id: leadId }, select: { ownerId: true } })
      if (current?.ownerId !== ownerId) return false
    } else {
      await db.leadAssignmentLog.create({ data: { leadId, toUserId: ownerId, reason } })
    }
  } else {
    await recordLeadOwner(db, leadId, ownerId, reason)
  }
  await db.whatsappConversation.updateMany({ where: { leadId }, data: { assignedToId: ownerId } })
  return true
}

// Which brand's sales pool a website form belongs to, from the page's hostname. Unknown
// or missing hosts (older forms don't send a URL) fall back to Samara, the main brand.
export function brandForWebsite(hostname: string | null | undefined): WhatsappBrand {
  const host = (hostname ?? '').toLowerCase()
  if (host.includes('otium')) return 'OTIUM'
  if (host.includes('mischief')) return 'MISCHIEF'
  return 'SAMARA'
}

// Auto-assigns a website-form Lead that has no owner yet, rotating through the same
// per-brand sales pool (and round-robin counter) as new WhatsApp chats — configured at
// Chat > WhatsApp Distribution. If that brand's pool is empty it falls back to Samara's so
// leads never sit unowned just because a pool hasn't been set up. Notifies the new owner.
// Returns the assigned user id, or null if the lead already had one / no pool at all.
export async function autoAssignWebsiteLead(db: PrismaClient, leadId: string, hostname: string | null | undefined, leadName: string): Promise<string | null> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { ownerId: true } })
  if (!lead || lead.ownerId) return null

  const brand = brandForWebsite(hostname)
  const ownerId = await pickNextSalesUserId(db, brand) ?? (brand !== 'SAMARA' ? await pickNextSalesUserId(db, 'SAMARA') : null)
  if (!ownerId) return null
  // Guarded so a concurrent claim/assignment isn't overwritten.
  const { count } = await db.lead.updateMany({ where: { id: leadId, ownerId: null }, data: { ownerId, ownerAssignedAt: new Date() } })
  if (count === 0) return null
  await db.leadAssignmentLog.create({ data: { leadId, toUserId: ownerId, reason: 'AUTO_DISTRIBUTION' } })

  const title = `Lead baru dari website: ${leadName}`
  const body = hostname ? `via ${hostname}` : 'via form website'
  db.notification.create({ data: { userId: ownerId, type: 'LEAD_ASSIGNED', title, body } }).catch(() => {})
  sendPushToUser(db, ownerId, { title, body, url: '/' }).catch(() => {})
  return ownerId
}
