import type { Prisma, PrismaClient } from '@prisma/client'
import { WA_AD_INQUIRY_SOURCE, WA_DIRECT_INQUIRY_SOURCE } from '@/lib/lead-origin'
import { chatInquiryOwner, matchWhatsappSession, sessionInquiry, type Session } from '@/lib/wa-tap'
import { isHttpUrl } from '@/lib/url-safety'

// Where every WhatsApp chat came from, as an Inquiry on its Lead (or Guest) — one per chat session
// (first message, or first after 24h quiet):
//  1. Click-to-WhatsApp — the message carries Meta's `referral` block (chat opened from a FB/IG ad,
//     or a post's WhatsApp button). Source "WHATSAPP_AD": the ad/post ID, headline, text, media,
//     link and ctwa_clid, plus utm facebook|instagram / paid|social so stats group it right.
//  2. Website button tap — matched by "Ref SL-XXXXX" or timing (src/lib/wa-tap.ts). Source "WHATSAPP".
//  3. Neither — someone typed straight to the number. Source "WHATSAPP_DIRECT", utm whatsapp / direct.
//     A tap that reaches us after the chat started turns this row into case 2 (wa-tap linkTap).
// Meta never sends UTMs / gclid over WhatsApp — those only exist when the chat came via the website.

/** Meta's `referral` on an inbound message (Cloud API webhook). */
export interface WhatsappReferral {
  source_url?: string
  source_id?: string
  source_type?: string
  headline?: string
  body?: string
  media_type?: string
  image_url?: string
  video_url?: string
  thumbnail_url?: string
  ctwa_clid?: string
}

// A returning customer keeps chatting with the same thread — a direct inquiry per 24h-quiet restart
// would bury the lead's history, so one direct row per thread per month is enough.
const DIRECT_REPEAT_MS = 30 * 24 * 60 * 60 * 1000

const clip = (v: string | null | undefined, max: number) => {
  const t = v?.trim()
  return t ? t.slice(0, max) : null
}

/** "facebook" / "instagram" from the ad/post link (fb.me, instagram.com…), else "meta". */
function metaPlatform(url: string | null): string {
  const u = (url ?? '').toLowerCase()
  if (/instagram\.com|instagr\.am/.test(u)) return 'instagram'
  if (/facebook\.com|fb\.me|fb\.com|fb\.watch/.test(u)) return 'facebook'
  return 'meta'
}

function adAttribution(r: WhatsappReferral) {
  const sourceUrl = clip(r.source_url, 2000)
  const platform = metaPlatform(sourceUrl)
  const paid = (r.source_type ?? '').toLowerCase() === 'ad'
  const medium = paid ? 'paid' : 'social'
  const mediaUrl = clip(r.image_url ?? r.video_url ?? r.thumbnail_url, 2000)
  return {
    ctwaClid: clip(r.ctwa_clid, 500),
    adSourceId: clip(r.source_id, 100),
    adSourceType: clip(r.source_type, 20),
    adSourceUrl: sourceUrl && isHttpUrl(sourceUrl) ? sourceUrl : null,
    adHeadline: clip(r.headline, 500),
    adBody: clip(r.body, 2000),
    adMediaType: clip(r.media_type, 20),
    adMediaUrl: mediaUrl && isHttpUrl(mediaUrl) ? mediaUrl : null,
    utmSource: platform, utmMedium: medium,
    lastSource: platform, lastMedium: medium,
  }
}

const hasReferral = (r: WhatsappReferral | null | undefined): r is WhatsappReferral =>
  !!r && !!(r.ctwa_clid || r.source_id || r.source_url)

async function recordAdChat(db: PrismaClient, session: Session, referral: WhatsappReferral): Promise<string | null> {
  const data = adAttribution(referral)
  // Meta re-sends a webhook it thinks we missed — same click, same row.
  if (data.ctwaClid && await db.inquiry.findFirst({ where: { ctwaClid: data.ctwaClid }, select: { id: true } })) return null
  const owner = await chatInquiryOwner(db, session.conversationId)
  if (!owner) return null
  const rawPayload = JSON.parse(JSON.stringify({ referral })) as Prisma.InputJsonValue
  // A "direct chat" row written moments ago for this same start (webhook retry / batch order) → it becomes the ad.
  const placeholder = await sessionInquiry(db, session.conversationId, session.startedAt, WA_DIRECT_INQUIRY_SOURCE)
  if (placeholder) {
    await db.inquiry.update({ where: { id: placeholder.id }, data: { ...data, source: WA_AD_INQUIRY_SOURCE, rawPayload } })
    return placeholder.id
  }
  const row = await db.inquiry.create({
    select: { id: true },
    data: {
      source: WA_AD_INQUIRY_SOURCE,
      ...owner,
      whatsappConversationId: session.conversationId,
      message: session.text?.slice(0, 2000) || null,
      ...data,
      rawPayload,
      createdAt: session.startedAt,
    },
  })
  return row.id
}

async function recordDirectChat(db: PrismaClient, session: Session): Promise<string | null> {
  const recent = await db.inquiry.findFirst({
    where: { whatsappConversationId: session.conversationId, createdAt: { gte: new Date(session.startedAt.getTime() - DIRECT_REPEAT_MS) } },
    select: { id: true },
  })
  if (recent) return null
  const owner = await chatInquiryOwner(db, session.conversationId)
  if (!owner) return null
  const row = await db.inquiry.create({
    select: { id: true },
    data: {
      source: WA_DIRECT_INQUIRY_SOURCE,
      ...owner,
      whatsappConversationId: session.conversationId,
      message: session.text?.slice(0, 2000) || null,
      utmSource: 'whatsapp', utmMedium: 'direct',
      lastSource: 'whatsapp', lastMedium: 'direct',
      createdAt: session.startedAt,
    },
  })
  return row.id
}

/** What started this chat session — AD / TAP are real enquiries for the deal maker (src/lib/deal-maker.ts). */
export type WaChatOrigin = { kind: 'AD' | 'TAP' | 'DIRECT'; inquiryId: string | null } | null

/**
 * Called by the WhatsApp webhook for an inbound message that starts a chat session, or that carries
 * an ad `referral` (a customer mid-session can still click an ad). Runs after the chat got its Lead.
 * Best-effort — never throws into the webhook.
 */
export async function recordWhatsappChatAttribution(db: PrismaClient, session: Session & {
  isSessionStart: boolean
  referral?: WhatsappReferral | null
}): Promise<WaChatOrigin> {
  const s: Session = { conversationId: session.conversationId, startedAt: session.startedAt, text: session.text }
  try {
    if (hasReferral(session.referral)) {
      return { kind: 'AD', inquiryId: await recordAdChat(db, s, session.referral) }
    }
    if (!session.isSessionStart) return null
    if (await matchWhatsappSession(db, s)) {
      const row = await db.inquiry.findFirst({ where: { whatsappConversationId: s.conversationId }, orderBy: { createdAt: 'desc' }, select: { id: true } })
      return { kind: 'TAP', inquiryId: row?.id ?? null }
    }
    return { kind: 'DIRECT', inquiryId: await recordDirectChat(db, s) }
  } catch (e) {
    console.error('[whatsapp webhook] chat attribution failed', session.conversationId, e)
    return null
  }
}
