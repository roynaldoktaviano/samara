import type { PrismaClient, WhatsappBrand } from '@prisma/client'

export type WhatsappDistributionMethod = 'ROUND_ROBIN' | 'PERCENTAGE'

const methodKey = (brand: WhatsappBrand) => `whatsapp_distribution_method_${brand}`
const counterKey = (brand: WhatsappBrand) => `whatsapp_sales_round_robin_${brand}`

export async function getWhatsappDistributionMethod(db: PrismaClient, brand: WhatsappBrand): Promise<WhatsappDistributionMethod> {
  const setting = await db.systemSetting.findUnique({ where: { key: methodKey(brand) } })
  return setting?.textValue === 'PERCENTAGE' ? 'PERCENTAGE' : 'ROUND_ROBIN'
}

export async function setWhatsappDistributionMethod(db: PrismaClient, brand: WhatsappBrand, method: WhatsappDistributionMethod, updatedBy?: string): Promise<void> {
  await db.systemSetting.upsert({
    where: { key: methodKey(brand) },
    create: { key: methodKey(brand), textValue: method, updatedBy },
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

// Picks who a brand-new WhatsApp conversation gets assigned to (see POST
// /api/webhooks/whatsapp), per whatever the admin configured at Settings > Chat >
// Pembagian WhatsApp (see /api/whatsapp/distribution) for that specific brand/number.
// Returns null if that brand's pool is empty — e.g. nobody's been configured yet.
export async function pickNextSalesUserId(db: PrismaClient, brand: WhatsappBrand): Promise<string | null> {
  const participants = await db.whatsappDistributionParticipant.findMany({
    where: { brand },
    orderBy: { createdAt: 'asc' },
    select: { userId: true, percentage: true },
  })
  if (participants.length === 0) return null

  const method = await getWhatsappDistributionMethod(db, brand)
  if (method === 'PERCENTAGE') return pickWeighted(participants)

  // ROUND_ROBIN — atomic increment on a shared counter row (one per brand); the
  // UPDATE row-locks in Postgres, so concurrent webhook deliveries still each get a
  // distinct, gapless pointer value.
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" (key, value) VALUES (${counterKey(brand)}, 1)
    ON CONFLICT (key) DO UPDATE SET value = "Counter".value + 1
    RETURNING value
  `
  const pointer = rows[0]?.value ?? 1
  return participants[(pointer - 1) % participants.length].userId
}
