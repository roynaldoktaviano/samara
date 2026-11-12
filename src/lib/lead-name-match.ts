import type { Prisma, PrismaClient, WhatsappBrand } from '@prisma/client'

/**
 * Cross-channel fallback for chat leads: one person who DMs us on Instagram, Messenger and
 * WhatsApp (any brand) should be ONE lead with ONE sales owner. The strong keys come first —
 * phone for WhatsApp, @handle for Instagram — but Messenger has neither (PSIDs are per Page and
 * Meta's ID-matching API needs Advanced Access), and an IG handle never matches a WA number. So
 * when the strong key finds nothing, join a chat-created lead carrying exactly the same name.
 *
 * Guards against joining two different people who share a name:
 * - the name needs at least two words ("Andi" / "Mom" are too common);
 * - a lead that already has a thread on this same channel + brand is skipped — that account
 *   would have matched by its own id/phone, so it's someone else;
 * - more than one candidate → ambiguous → no join.
 */
export type ChatChannel = 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER'

const CHAT_LEAD_SOURCES = ['WHATSAPP_', 'INSTAGRAM_', 'MESSENGER_']

export function matchableName(name: string | null | undefined): string | null {
  const n = name?.trim().replace(/\s+/g, ' ')
  if (!n || n.split(' ').length < 2 || n.length < 5) return null
  // Placeholder names the app gives unnamed chats ("+62812…", "Messenger user", "@handle").
  if (/^[+@\d]/.test(n) || /^(instagram|messenger) user$/i.test(n)) return null
  return n
}

export async function findChatLeadByName(
  db: PrismaClient,
  rawName: string | null | undefined,
  channel: ChatChannel,
  brand: WhatsappBrand | null,
): Promise<{ id: string; ownerId: string | null } | null> {
  const name = matchableName(rawName)
  if (!name) return null
  const eq = { equals: name, mode: 'insensitive' as const }

  const sameAccount: Prisma.LeadWhereInput = channel === 'WHATSAPP'
    ? { whatsappConversations: { some: brand ? { brand } : {} } }
    : { instagramConversations: { some: { platform: channel, ...(brand && { brand }) } } }

  const candidates = await db.lead.findMany({
    where: {
      deletedAt: null,
      OR: CHAT_LEAD_SOURCES.map(p => ({ source: { startsWith: p } })),
      AND: [
        { OR: [
          { name: eq },
          { instagramConversations: { some: { displayName: eq } } },
          { whatsappConversations: { some: { contactName: eq } } },
        ] },
        { NOT: sameAccount },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 2,
    select: { id: true, ownerId: true },
  })
  return candidates.length === 1 ? candidates[0] : null
}
