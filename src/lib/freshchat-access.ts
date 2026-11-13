import type { Prisma, PrismaClient } from '@prisma/client'
import { isOwnLeadsOnly } from '@/lib/lead-access'

// Who sees which imported Freshchat conversation — same rule as leads: a SALES rep only the
// chats of the leads / guests they own, every other role that can open Chat or Leads all of them.
export function freshchatScope(role: string | null | undefined, userId: string): Prisma.FreshchatConversationWhereInput {
  return isOwnLeadsOnly(role) ? { OR: [{ lead: { ownerId: userId } }, { customer: { ownerId: userId } }] } : {}
}

export async function canAccessFreshchat(db: PrismaClient, role: string | null | undefined, userId: string, id: string) {
  return !!(await db.freshchatConversation.findFirst({ where: { id, ...freshchatScope(role, userId) }, select: { id: true } }))
}

export const FRESHCHAT_SOURCE_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp', INSTA: 'Instagram', FB_NATIVE: 'Messenger', FRESHCHAT: 'Website chat',
}
