import type { LeadContactChannel, PrismaClient, WhatsappBrand } from '@prisma/client'
import { recordLeadOwner } from '@/lib/whatsapp-lead'

// Every chat that reaches us becomes (or joins) a Lead, and each time that person contacts us
// again it's logged as a LeadContact so the lead's history shows when — and on which channel —
// they reached out. WhatsApp chats get their Lead from src/lib/whatsapp-lead.ts (matched by
// phone); Instagram/Messenger DMs get theirs here (matched by IG handle).

// A message counts as a new contact when the person had been silent for this long — the same
// 24h window Meta uses for a WhatsApp/IG "conversation".
const CONTACT_SESSION_GAP_MS = 24 * 60 * 60 * 1000

export function isNewContactSession(previousInboundAt: Date | null | undefined, now = new Date()): boolean {
  return !previousInboundAt || now.getTime() - previousInboundAt.getTime() >= CONTACT_SESSION_GAP_MS
}

export async function recordLeadContact(db: PrismaClient, data: {
  leadId: string
  channel: LeadContactChannel
  brand?: WhatsappBrand | null
  whatsappConversationId?: string
  instagramConversationId?: string
  message?: string | null
  isFirstContact?: boolean
}): Promise<void> {
  await db.leadContact.create({ data: { ...data, message: data.message?.slice(0, 2000) || null } })
}

// Makes sure an Instagram/Messenger DM has a Lead: an existing Lead with the same IG handle is
// reused (chat owner = lead owner, as for WhatsApp), otherwise a new one is created from the
// DM profile and owned by whoever holds the chat. Returns the lead and whether it was just made.
export async function ensureLeadForMetaDm(db: PrismaClient, conversationId: string): Promise<{ leadId: string | null; created: boolean }> {
  const conv = await db.instagramConversation.findUnique({
    where: { id: conversationId },
    select: { platform: true, brand: true, igUsername: true, displayName: true, assignedToId: true, leadId: true },
  })
  if (!conv) return { leadId: null, created: false }
  if (conv.leadId) return { leadId: conv.leadId, created: false }

  const handle = conv.igUsername?.trim().replace(/^@/, '') || null
  const existing = handle
    ? await db.lead.findFirst({
        where: { deletedAt: null, instagram: { equals: handle, mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, ownerId: true },
      })
    : null

  if (existing) {
    const { count } = await db.instagramConversation.updateMany({ where: { id: conversationId, leadId: null }, data: { leadId: existing.id } })
    if (count === 0) return { leadId: (await db.instagramConversation.findUnique({ where: { id: conversationId }, select: { leadId: true } }))?.leadId ?? null, created: false }
    if (existing.ownerId && existing.ownerId !== conv.assignedToId) {
      await db.instagramConversation.update({ where: { id: conversationId }, data: { assignedToId: existing.ownerId } })
    } else if (!existing.ownerId && conv.assignedToId) {
      await recordLeadOwner(db, existing.id, conv.assignedToId, 'AUTO_DISTRIBUTION')
    }
    return { leadId: existing.id, created: false }
  }

  const displayName = conv.displayName?.trim() || null
  const parts = displayName?.split(/\s+/) ?? []
  const lead = await db.lead.create({
    data: {
      name: displayName || (handle ? `@${handle}` : `${conv.platform === 'INSTAGRAM' ? 'Instagram' : 'Messenger'} user`),
      firstName: displayName ? parts[0] : null,
      lastName: displayName && parts.length > 1 ? parts.slice(1).join(' ') : null,
      instagram: handle,
      source: `${conv.platform}_${conv.brand ?? 'SAMARA'}`,
      ownerId: conv.assignedToId,
      ownerAssignedAt: conv.assignedToId ? new Date() : null,
      stage: 'NEW',
      stageUpdatedAt: new Date(),
    },
    select: { id: true },
  })
  // Two first messages processed at once — keep whichever lead got linked first.
  const { count } = await db.instagramConversation.updateMany({ where: { id: conversationId, leadId: null }, data: { leadId: lead.id } })
  if (count === 0) {
    await db.lead.delete({ where: { id: lead.id } })
    return { leadId: (await db.instagramConversation.findUnique({ where: { id: conversationId }, select: { leadId: true } }))?.leadId ?? null, created: false }
  }
  if (conv.assignedToId) {
    await db.leadAssignmentLog.create({ data: { leadId: lead.id, toUserId: conv.assignedToId, reason: 'AUTO_DISTRIBUTION' } })
  }
  return { leadId: lead.id, created: true }
}
