import type { LeadContactChannel, PrismaClient, WhatsappBrand } from '@prisma/client'
import { recordLeadOwner } from '@/lib/whatsapp-lead'
import { findChatLeadByName } from '@/lib/lead-name-match'

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
  const byHandle = handle
    ? await db.lead.findFirst({
        where: { deletedAt: null, instagram: { equals: handle, mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, ownerId: true },
      })
    : null
  // Same person already a lead from another channel/brand (WA, Messenger, another IG account)?
  const existing = byHandle ?? await findChatLeadByName(db, conv.displayName, conv.platform, conv.brand)

  if (existing) {
    const { count } = await db.instagramConversation.updateMany({ where: { id: conversationId, leadId: null }, data: { leadId: existing.id } })
    if (count === 0) return { leadId: (await db.instagramConversation.findUnique({ where: { id: conversationId }, select: { leadId: true } }))?.leadId ?? null, created: false }
    // Joined by name — remember the handle so this account matches by @handle from now on.
    if (handle) await db.lead.updateMany({ where: { id: existing.id, instagram: null }, data: { instagram: handle } })
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

// Meta never shares a DM sender's email or phone (profile = name, @handle, photo only), so we
// pick them up when the customer types them in a chat — "my email is …", "WA me at +61 4…".
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i
// "+61 412 345 678", "+62-812-3456-7890", "0812 3456 7890" — must start with + or 0 so prices,
// dates and booking numbers ("15000000", "2026-11-12") don't count.
const PHONE_RE = /(?:^|[^\w+])((?:\+|0)\d[\d\s().-]{6,18}\d)(?!\w)/

export function extractContactFromText(text: string | null | undefined): { email: string | null; phone: string | null } {
  if (!text) return { email: null, phone: null }
  const email = text.match(EMAIL_RE)?.[0].toLowerCase() ?? null
  const raw = text.replace(EMAIL_RE, ' ').match(PHONE_RE)?.[1] ?? null
  const digits = raw?.replace(/\D/g, '') ?? ''
  const phone = raw && digits.length >= 9 && digits.length <= 15 && (raw.startsWith('+') || digits.length >= 10)
    ? (raw.startsWith('+') ? `+${digits}` : digits)
    : null
  return { email, phone }
}

/** Fills the lead's empty email / phone from a customer message. Never overwrites what's there. */
export async function fillLeadContactFromText(db: PrismaClient, leadId: string, text: string | null | undefined): Promise<void> {
  const { email, phone } = extractContactFromText(text)
  if (email) await db.lead.updateMany({ where: { id: leadId, email: null }, data: { email } })
  if (phone) await db.lead.updateMany({ where: { id: leadId, phone: null }, data: { phone } })
}
