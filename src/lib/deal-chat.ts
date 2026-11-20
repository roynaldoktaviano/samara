import type { LeadStage, PrismaClient, WhatsappBrand } from '@prisma/client'
import { OPEN_STAGES, runDealMakerLocked, type DealChannel } from '@/lib/deal-maker'
import { CONVERSATION_STAGES } from '@/lib/lead-pipeline'
import type { WaChatOrigin } from '@/lib/wa-chat-attribution'
import { ensureLowMatchTask } from '@/lib/wa-low-match'
import { inferDealYacht } from '@/lib/deal-product-interest'

const ORIGIN_LABEL = { AD: 'Click-to-WhatsApp ad', TAP: 'website WhatsApp button', DIRECT: null } as const

/**
 * Deal maker for a chat contact (parity B): called when a Sales chat gets its Lead, or the person
 * writes again after 24h+ quiet (a new contact session), on WhatsApp / Instagram / Messenger.
 *  - no open deal of this brand → a new deal in New Enquiry (contact owner / round-robin);
 *  - an open deal → a note on it; plus the 4h follow-up task only when the chat came from an ad or
 *    the website WhatsApp button (a real enquiry). A customer simply carrying on an ongoing chat
 *    after a quiet day is not a new enquiry, so it doesn't spawn tasks.
 * Trip type is unknown from a chat → it joins any open deal of the brand; sales set PC / OT.
 * Only Sales chats count (a WhatsApp chat triaged Guest / Vendor / Spam opens no deal).
 */
export async function runChatDealMaker(db: PrismaClient, p: {
  leadId: string
  brand: WhatsappBrand | null | undefined
  channel: Extract<DealChannel, 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER'>
  whatsappConversationId?: string
  origin?: WaChatOrigin
  text?: string | null
  at?: Date
  actingUserId?: string | null
  /** Manual "Sales" triage / "Create lead": only make sure the lead has an open deal for this brand — no note. */
  ensureOnly?: boolean
}): Promise<void> {
  if (p.whatsappConversationId) {
    const conv = await db.whatsappConversation.findUnique({ where: { id: p.whatsappConversationId }, select: { category: true } })
    if (conv?.category !== 'SALES') return
  }
  const lead = await db.lead.findUnique({ where: { id: p.leadId }, select: { stage: true, deletedAt: true } })
  if (!lead) return
  if (p.ensureOnly && await db.deal.findFirst({ where: { leadId: p.leadId, brand: p.brand ?? 'SAMARA', deletedAt: null, stage: { in: OPEN_STAGES } }, select: { id: true } })) return
  const originLabel = p.origin ? ORIGIN_LABEL[p.origin.kind] : null
  // A lead just made from a chat staff already answered (its first deal) starts at Initial Message
  // Sent — ensureLeadForConversation set that stage on the lead. Any later deal starts at New Enquiry.
  const hasDeals = !!(await db.deal.findFirst({ where: { leadId: p.leadId }, select: { id: true } }))
  const initialStage: LeadStage = !hasDeals && !lead.deletedAt && (CONVERSATION_STAGES as readonly LeadStage[]).includes(lead.stage) ? lead.stage : 'NEW'
  // Yacht from the website page the WhatsApp button was tapped on (or the ad's link), else the brand.
  const origInq = p.origin?.inquiryId
    ? await db.inquiry.findUnique({ where: { id: p.origin.inquiryId }, select: { url: true, landingUrl: true } })
    : null
  await runDealMakerLocked(db, {
    leadId: p.leadId,
    brand: p.brand ?? 'SAMARA',
    tripType: null,
    productInterest: inferDealYacht({ text: p.text, url: origInq?.url ?? origInq?.landingUrl, brand: p.brand ?? 'SAMARA' }),
    channel: p.channel,
    enquiry: p.origin?.kind === 'AD' || p.origin?.kind === 'TAP',
    inquiryId: p.origin?.inquiryId ?? null,
    summary: [originLabel, p.text?.replace(/\s+/g, ' ').trim().slice(0, 300) || null].filter(Boolean).join(' · ') || null,
    initialStage,
    actingUserId: p.actingUserId ?? null,
    at: p.at,
  })
  // Website tap matched by timing with 2+ candidates → a "check by hand" task for the deal owner.
  if (p.origin?.kind === 'TAP') await ensureLowMatchTask(db, p.origin.inquiryId).catch(e => console.error('[deal-chat] low-match task failed', e))
}
