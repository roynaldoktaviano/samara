// Every enquiry goes through finalizeInquiry() right after it is written (marketing audit
// 2026-11-24): its UTMs are normalised (the raw values stay in rawPayload), its acquisition brand
// and standard trip type are filled, and the ad attribution of the person's deals is refreshed —
// attribution lives per DEAL (src/lib/deal-attribution.ts), not per contact.
import type { Prisma, PrismaClient, WhatsappBrand } from '@prisma/client'
import { INQUIRY_SELECT, UTM_PAIRS, normalizeUtm, type InquiryRow } from '@/lib/attribution-touch'
import { refreshPersonDeals } from '@/lib/deal-attribution'
import { tripTypeFromText } from '@/lib/deal-maker'
import { brandForInquiry } from '@/lib/whatsapp-lead'

export * from '@/lib/attribution-touch'

type Db = PrismaClient | Prisma.TransactionClient

async function brandOfInquiry(db: Db, i: InquiryRow): Promise<WhatsappBrand | null> {
  if (i.brand) return i.brand
  if (i.whatsappConversationId) {
    const conv = await db.whatsappConversation.findUnique({ where: { id: i.whatsappConversationId }, select: { brand: true } }).catch(() => null)
    if (conv?.brand) return conv.brand
  }
  let host = i.website
  if (!host && i.url) { try { host = new URL(i.url).hostname } catch { host = null } }
  return host || i.tripType ? brandForInquiry(host, i.tripType) : null
}

/**
 * Run right after an Inquiry is created or re-pointed (form, Meta lead form, WhatsApp tap / ad /
 * direct chat): normalises its source / medium pairs, fills its acquisition brand and standard
 * trip type, and refreshes the ad attribution of the person's deals. Best-effort — callers
 * outside a transaction should .catch() it.
 */
export async function finalizeInquiry(db: Db, inquiryId: string, opts: { brand?: WhatsappBrand | null } = {}): Promise<void> {
  const i = await db.inquiry.findUnique({ where: { id: inquiryId }, select: INQUIRY_SELECT })
  if (!i) return
  const data: Prisma.InquiryUncheckedUpdateInput = {}
  for (const [sk, mk, ck] of UTM_PAIRS) {
    const n = normalizeUtm(i[sk], i[mk])
    if (n.campaignFromMedium && !i[ck]) { data[ck] = n.campaignFromMedium; i[ck] = n.campaignFromMedium }
    if (n.source !== i[sk]) { data[sk] = n.source; i[sk] = n.source }
    if (n.medium !== i[mk]) { data[mk] = n.medium; i[mk] = n.medium }
  }
  const brand = opts.brand ?? await brandOfInquiry(db, i)
  if (brand && brand !== i.brand) { data.brand = brand; i.brand = brand }
  if (!i.tripTypeStd) {
    const std = tripTypeFromText(i.tripType)
    if (std) { data.tripTypeStd = std; i.tripTypeStd = std }
  }
  if (Object.keys(data).length) await db.inquiry.update({ where: { id: i.id }, data })

  // This person's deals pick the new touch up (per-deal attribution, src/lib/deal-attribution.ts)
  if (i.leadId || i.customerId) await refreshPersonDeals(db, { leadId: i.leadId, customerId: i.customerId })
}
