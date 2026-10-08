import type { LeadDistributionChannel, PrismaClient, WhatsappBrand } from '@prisma/client'

export type WhatsappDistributionMethod = 'ROUND_ROBIN' | 'PERCENTAGE'
export type { LeadDistributionChannel }

export const LEAD_DISTRIBUTION_CHANNELS: LeadDistributionChannel[] = ['WHATSAPP', 'EMAIL', 'INSTAGRAM', 'WEBSITE']
// Email and Instagram have one inbox each, so their pool is stored under brand SAMARA only.
export const CHANNELS_WITH_BRANDS: LeadDistributionChannel[] = ['WHATSAPP', 'WEBSITE']

// WhatsApp keeps its original keys so existing settings/counters carry over.
const methodKey = (channel: LeadDistributionChannel, brand: WhatsappBrand) =>
  channel === 'WHATSAPP' ? `whatsapp_distribution_method_${brand}` : `lead_distribution_method_${channel}_${brand}`
const counterKey = (channel: LeadDistributionChannel, brand: WhatsappBrand, scope?: string) =>
  `${channel === 'WHATSAPP' && !scope ? 'whatsapp_sales_round_robin' : `lead_round_robin_${scope ? `${scope}_` : ''}${channel}`}_${brand}`

export async function getWhatsappDistributionMethod(db: PrismaClient, brand: WhatsappBrand, channel: LeadDistributionChannel = 'WHATSAPP'): Promise<WhatsappDistributionMethod> {
  const setting = await db.systemSetting.findUnique({ where: { key: methodKey(channel, brand) } })
  return setting?.textValue === 'PERCENTAGE' ? 'PERCENTAGE' : 'ROUND_ROBIN'
}

export async function setWhatsappDistributionMethod(db: PrismaClient, brand: WhatsappBrand, method: WhatsappDistributionMethod, updatedBy?: string, channel: LeadDistributionChannel = 'WHATSAPP'): Promise<void> {
  const key = methodKey(channel, brand)
  await db.systemSetting.upsert({
    where: { key },
    create: { key, textValue: method, updatedBy },
    update: { textValue: method, updatedBy },
  })
}

function pickWeighted(participants: { userId: string; percentage: number }[]): string {
  const total = participants.reduce((sum, p) => sum + p.percentage, 0)
  if (total <= 0) return participants[Math.floor(Math.random() * participants.length)].userId
  let roll = Math.random() * total
  for (const p of participants) {
    if (roll < p.percentage) return p.userId
    roll -= p.percentage
  }
  return participants[participants.length - 1].userId
}

// The pool + method a channel/brand actually uses. A non-WhatsApp channel nobody has set up
// yet borrows that brand's WhatsApp pool and method (but still keeps its own counter), so
// leads don't go unassigned before the admin configures it.
export async function getDistributionPool(db: PrismaClient, brand: WhatsappBrand, channel: LeadDistributionChannel = 'WHATSAPP') {
  const pool = (c: LeadDistributionChannel) => db.whatsappDistributionParticipant.findMany({
    where: { brand, channel: c },
    orderBy: { createdAt: 'asc' },
    select: { userId: true, percentage: true },
  })
  let participants = await pool(channel)
  let methodChannel = channel
  if (participants.length === 0 && channel !== 'WHATSAPP') {
    participants = await pool('WHATSAPP')
    methodChannel = 'WHATSAPP'
  }
  return { participants, method: await getWhatsappDistributionMethod(db, brand, methodChannel) }
}

// Picks who a brand-new lead/chat on `channel` gets assigned to, per whatever the admin
// configured at Chat > Leads Distribution (see /api/whatsapp/distribution) for that
// channel + brand. Each channel rotates on its own counter; `counterScope` gives a caller
// (e.g. the stagnant sweep) a separate counter so it doesn't use up the channel's turns.
// Returns null if the pool is empty — e.g. nobody's been configured yet.
export async function pickNextSalesUserId(db: PrismaClient, brand: WhatsappBrand, channel: LeadDistributionChannel = 'WHATSAPP', counterScope?: string): Promise<string | null> {
  const { participants, method } = await getDistributionPool(db, brand, channel)
  if (participants.length === 0) return null
  if (method === 'PERCENTAGE') return pickWeighted(participants)

  // ROUND_ROBIN — atomic increment on a shared counter row (one per channel/brand); the
  // UPDATE row-locks in Postgres, so concurrent webhook deliveries still each get a
  // distinct, gapless pointer value.
  const key = counterKey(channel, brand, counterScope)
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" (key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = "Counter".value + 1
    RETURNING value
  `
  const pointer = rows[0]?.value ?? 1
  return participants[(pointer - 1) % participants.length].userId
}

// A SALES rep can open/reply to a chat that's assigned to them, or one nobody holds yet
// (no pool configured for that brand when it came in, or an admin released it) — the
// latter gets claimed by whoever acts on it first, see claimWhatsappConversation.
export function salesCanAccessConversation(conversation: { assignedToId: string | null }, userId: string): boolean {
  return conversation.assignedToId === null || conversation.assignedToId === userId
}

// Instagram list filter: ADMIN sees every DM, SALES their own + unassigned ones (same rule as
// salesCanAccessConversation).
export function instagramConversationScope(role: string, userId: string) {
  return role === 'SALES' ? { OR: [{ assignedToId: userId }, { assignedToId: null }] } : {}
}

// Atomically takes an unassigned conversation for `userId` — the `assignedToId: null`
// guard means two reps clicking at once can't both win. Returns true if `userId` holds
// it afterwards (including when they already did).
export async function claimWhatsappConversation(db: PrismaClient, conversationId: string, userId: string): Promise<boolean> {
  const { count } = await db.whatsappConversation.updateMany({
    where: { id: conversationId, assignedToId: null },
    data: { assignedToId: userId },
  })
  if (count > 0) return true
  const current = await db.whatsappConversation.findUnique({ where: { id: conversationId }, select: { assignedToId: true } })
  return current?.assignedToId === userId
}
