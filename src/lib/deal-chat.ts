import type { LeadStage, PrismaClient, WhatsappBrand } from '@prisma/client'
import { OPEN_STAGES, runDealMakerLocked, type DealChannel } from '@/lib/deal-maker'
import { CONVERSATION_STAGES } from '@/lib/lead-pipeline'
import type { WaChatOrigin } from '@/lib/wa-chat-attribution'
import { ensureLowMatchTask } from '@/lib/wa-low-match'
import { inferDealYacht } from '@/lib/deal-product-interest'
import { WA_AD_INQUIRY_SOURCE, WA_DIRECT_INQUIRY_SOURCE } from '@/lib/lead-origin'
import { isDealMakerOn } from '@/lib/deal-maker-switch'

const ORIGIN_LABEL = { AD: 'Click-to-WhatsApp ad', TAP: 'website WhatsApp button', DIRECT: null } as const

/**
 * Deal maker for a chat contact (parity B): called when a Sales chat gets its Lead, or the person
 * writes again after 24h+ quiet (a new contact session), on WhatsApp / Instagram / Messenger.
 *  - no open deal of this brand → a new deal in New Enquiry (contact owner / round-robin) — WhatsApp
 *    ad / website-tap chats only, see below;
 *  - an open deal → a note on it; plus the 4h follow-up task only when the chat came from an ad or
 *    the website WhatsApp button (a real enquiry). A customer simply carrying on an ongoing chat
 *    after a quiet day is not a new enquiry, so it doesn't spawn tasks.
 * WhatsApp: every Sales chat opens a deal by itself — Click-to-WhatsApp ad, website button tap
 * (Ref SL-XXXXX / 30-min timing) AND a chat straight to the number (WHATSAPP_DIRECT), so the pipeline
 * moves on with the conversation (Roy, 24 Nov — reverses the 23 Nov "direct = no deal" rule). Only
 * ad / tap chats count as a real enquiry (4h follow-up task on an open deal). Instagram / Messenger
 * DMs still only get a note on an open deal; sales open the deal with the chat panel's "Create deal"
 * button (POST /api/leads/[id]/deal, createDealFromLead below). A tap that reaches us after the chat
 * started upgrades it then (runLateTapChatDeal).
 * Trip type is unknown from a chat → it joins any open deal of the brand; sales set PC / OT.
 * Only Sales chats count (a WhatsApp chat triaged Vendor / Spam opens no deal). One exception: a
 * WhatsApp number that belongs to an existing Guest (chat category GUEST, no Lead) — a returning
 * guest writing from an ad or a website tap is a new enquiry, so it opens / joins the guest's deal
 * like a website form does (handover §11 no. 13, returning-guest rule). Pass `customerId` then.
 */
export async function runChatDealMaker(db: PrismaClient, p: {
  /** The chat's Lead — or, for a returning guest's chat with no Lead, `customerId`. */
  leadId?: string | null
  customerId?: string | null
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
  const guestOnly = !p.leadId && !!p.customerId
  if (!p.leadId && !guestOnly) return
  const fromAdOrTap = p.channel === 'WHATSAPP' && (p.origin?.kind === 'AD' || p.origin?.kind === 'TAP')
  if (p.whatsappConversationId) {
    const conv = await db.whatsappConversation.findUnique({ where: { id: p.whatsappConversationId }, select: { category: true } })
    // A chat triaged Guest (returning guest, with or without a Lead) only counts when it came from an
    // ad or a website tap — a real new enquiry. Everything else needs a Sales chat.
    const ok = guestOnly ? conv?.category === 'GUEST' && fromAdOrTap
      : conv?.category === 'SALES' || (conv?.category === 'GUEST' && fromAdOrTap)
    if (!ok) return
  }
  // WhatsApp deal maker switched off by an admin (src/lib/deal-maker-switch.ts) — the chat stays a lead.
  if (p.channel === 'WHATSAPP' && !(await isDealMakerOn(db, 'WHATSAPP'))) return
  const lead = p.leadId ? await db.lead.findUnique({ where: { id: p.leadId }, select: { stage: true, deletedAt: true } }) : null
  if (p.leadId && !lead) return
  if (guestOnly && !(await db.customer.findFirst({ where: { id: p.customerId!, deletedAt: null }, select: { id: true } }))) return
  const personDeal = p.leadId ? { leadId: p.leadId } : { customerId: p.customerId! }
  const brand = p.brand ?? 'SAMARA'
  const openDeal = await db.deal.findFirst({ where: { ...personDeal, brand, deletedAt: null, stage: { in: OPEN_STAGES } }, select: { id: true } })
  if (p.ensureOnly && openDeal) return
  // Manual "Sales" triage / "Create lead" on a WhatsApp chat: the chat's own origin decides.
  if (p.ensureOnly && p.channel === 'WHATSAPP' && p.whatsappConversationId && !p.origin) {
    p = { ...p, origin: await whatsappChatOrigin(db, p.whatsappConversationId) }
  }
  // Every WhatsApp Sales chat (ad, website tap or direct) opens a deal by itself (Roy, 24 Nov). Instagram /
  // Messenger DMs get at most a note on an open deal — sales use "Create deal".
  const opensDeal = p.channel === 'WHATSAPP'
  if (!opensDeal && (p.ensureOnly || !openDeal)) return
  const originLabel = p.origin ? ORIGIN_LABEL[p.origin.kind] : null
  // A lead just made from a chat staff already answered (its first deal) starts at Initial Message
  // Sent — ensureLeadForConversation set that stage on the lead. Any later deal starts at New Enquiry.
  const hasDeals = !!(await db.deal.findFirst({ where: personDeal, select: { id: true } }))
  const initialStage: LeadStage = lead && !hasDeals && !lead.deletedAt && (CONVERSATION_STAGES as readonly LeadStage[]).includes(lead.stage) ? lead.stage : 'NEW'
  // Yacht from the website page the WhatsApp button was tapped on (or the ad's link), else the brand.
  const origInq = p.origin?.inquiryId
    ? await db.inquiry.findUnique({ where: { id: p.origin.inquiryId }, select: { url: true, landingUrl: true } })
    : null
  await runDealMakerLocked(db, {
    leadId: p.leadId ?? null,
    customerId: guestOnly ? p.customerId : null,
    brand,
    tripType: null,
    productInterest: inferDealYacht({ text: p.text, url: origInq?.url ?? origInq?.landingUrl, brand }),
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

/** Where a WhatsApp chat came from, from its newest attribution inquiry (src/lib/wa-chat-attribution.ts). */
export async function whatsappChatOrigin(db: PrismaClient, conversationId: string): Promise<WaChatOrigin> {
  const inq = await db.inquiry.findFirst({
    where: { whatsappConversationId: conversationId, source: { in: ['WHATSAPP', WA_AD_INQUIRY_SOURCE, WA_DIRECT_INQUIRY_SOURCE] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, source: true },
  })
  if (!inq) return null
  return { kind: inq.source === WA_AD_INQUIRY_SOURCE ? 'AD' : inq.source === 'WHATSAPP' ? 'TAP' : 'DIRECT', inquiryId: inq.id }
}

/**
 * A website tap matched to its chat AFTER the chat started (the tap relay arrived late): the chat was
 * "direct" when it came in, so no deal was opened — open it now, as the Freshsales poller would.
 */
export async function runLateTapChatDeal(db: PrismaClient, conversationId: string): Promise<void> {
  const conv = await db.whatsappConversation.findUnique({ where: { id: conversationId }, select: { leadId: true, brand: true, category: true } })
  // A Sales chat with its Lead, or a returning guest's chat (GUEST, with or without a Lead) — see runChatDealMaker.
  if (!conv || !(conv.category === 'SALES' ? !!conv.leadId : conv.category === 'GUEST')) return
  const origin = await whatsappChatOrigin(db, conversationId)
  if (origin?.kind !== 'TAP' || !origin.inquiryId) return
  const inq = await db.inquiry.findUnique({ where: { id: origin.inquiryId }, select: { message: true, createdAt: true, customerId: true } })
  if (!conv.leadId && !inq?.customerId) return
  await runChatDealMaker(db, { leadId: conv.leadId, customerId: conv.leadId ? null : inq?.customerId, brand: conv.brand, channel: 'WHATSAPP', whatsappConversationId: conversationId, origin, text: inq?.message, at: inq?.createdAt })
}

export type CreateDealResult = { ok: true; dealId: string; created: boolean } | { ok: false; status: number; error: string }

/**
 * The chat panel's "Create deal" button: a deal for this lead built from what sales filled in on the
 * lead (trip type, yacht, dates, pax, amount). The deal's name is never typed — every screen formats
 * it from these fields + the guest (src/lib/deal-name.ts). An open deal of the brand already there →
 * that one is returned instead of a second.
 */
export async function createDealFromLead(db: PrismaClient, p: {
  leadId: string
  brand: WhatsappBrand
  channel: Extract<DealChannel, 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'MANUAL'>
  whatsappConversationId?: string | null
  /** Who pressed "Create deal" — null from a backfill script (the deal owner is then notified). */
  actingUserId: string | null
}): Promise<CreateDealResult> {
  const lead = await db.lead.findUnique({
    where: { id: p.leadId },
    select: {
      deletedAt: true, tripType: true, tripAmount: true, tripAmountCurrency: true, productInterest: true,
      travelStartDate: true, travelEndDate: true, guestCount: true, lastInboundAt: true, lastOutboundAt: true,
    },
  })
  if (!lead || lead.deletedAt) return { ok: false, status: 404, error: 'Lead not found' }
  const open = await db.deal.findFirst({ where: { leadId: p.leadId, brand: p.brand, deletedAt: null, stage: { in: OPEN_STAGES } }, select: { id: true } })
  if (open) return { ok: true, dealId: open.id, created: false }

  // Where the conversation already is: we wrote → Initial Message Sent; they answered us → In Active
  // Communication (only with a trip type, parity C3); else New Enquiry.
  // The chat thread's own timestamps count too — replies copied in from Freshchat don't touch the lead's.
  const conv = p.whatsappConversationId
    ? await db.whatsappConversation.findUnique({ where: { id: p.whatsappConversationId }, select: { lastInboundAt: true, lastOutboundAt: true } })
    : null
  const later = (a?: Date | null, b?: Date | null) => (a && b ? (a > b ? a : b) : a ?? b ?? null)
  const out = later(lead.lastOutboundAt, conv?.lastOutboundAt), inb = later(lead.lastInboundAt, conv?.lastInboundAt)
  const initialStage: LeadStage = !out ? 'NEW' : inb && inb > out && lead.tripType ? 'ACTIVE_COMMUNICATION' : 'INITIAL_MESSAGE_SENT'
  const origin = p.whatsappConversationId ? await whatsappChatOrigin(db, p.whatsappConversationId) : null
  const made = await runDealMakerLocked(db, {
    leadId: p.leadId,
    brand: p.brand,
    tripType: lead.tripType,
    productInterest: lead.productInterest || inferDealYacht({ brand: p.brand, tripType: lead.tripType }),
    travelStartDate: lead.travelStartDate,
    travelEndDate: lead.travelEndDate,
    guestCount: lead.guestCount,
    channel: p.channel,
    enquiry: false,
    inquiryId: origin?.inquiryId ?? null,
    summary: 'Deal created from the chat',
    initialStage,
    actingUserId: p.actingUserId,
  })
  if (lead.tripAmount != null) {
    await db.deal.updateMany({ where: { id: made.dealId, amount: null }, data: { amount: lead.tripAmount, currency: lead.tripAmountCurrency || 'USD' } })
  }
  return { ok: true, dealId: made.dealId, created: made.action === 'created' }
}
