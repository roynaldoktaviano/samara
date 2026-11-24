import type { Prisma, PrismaClient, WaTap, WhatsappBrand } from '@prisma/client'
import { consentRegionFrom, correctLegacyConsent, normalizeAdConsent } from '@/lib/ad-consent'
import { cleanValue, dropMetaCookies, pickClean, stripMetaCookies } from '@/lib/inquiry-tracking'
import { findCustomerIdByPhone, toE164 } from '@/lib/contact-identity'
import { isHttpUrl } from '@/lib/url-safety'
import type { MatchConfidence } from '@/lib/wa-match-confidence'
import { WA_AD_INQUIRY_SOURCE, WA_DIRECT_INQUIRY_SOURCE } from '@/lib/lead-origin'
import { ensureLowMatchTask } from '@/lib/wa-low-match'
import { finalizeInquiry } from '@/lib/contact-attribution'

// WhatsApp click → chat attribution, the rule the Freshsales deal maker used (handover 17 Nov):
//  • Every tap on a website WhatsApp button is logged with a ref code that the site also puts
//    in the pre-filled message: "Ref SL-7KQ2M" (SL = Samara, OT = Otium, MV = Mischief; 5 chars
//    from [2-9A-HJ-NP-Z] — the alphabet must not change or matching breaks).
//  • When a chat starts (first message, or first after 24h quiet) it's matched to its tap:
//      CONFIDENT — the message carries a ref that was logged as a tap
//      MEDIUM    — no ref, but exactly one unmatched tap on that brand in the 30 min before
//      LOW       — no ref and several taps in that window (the nearest one is used)
//  • The tap's click IDs / UTMs / consent become a WHATSAPP Inquiry on the lead (or guest).
//    LOW is never uploaded to Google/Meta until sales change the dropdown (ad-consent.ts).
// Taps can arrive after the chat (forwarded by the site), so matching runs from both sides.

export const WA_MATCH_WINDOW_MS = 30 * 60 * 1000
const SESSION_GAP_MS = 24 * 60 * 60 * 1000

export { MATCH_CONFIDENCES, MATCH_CONFIDENCE_LABEL, isMatchConfidence, type MatchConfidence } from '@/lib/wa-match-confidence'

const REF_RE = /\b(SL|OT|MV)-([2-9A-HJ-NP-Z]{5})\b/i
const REF_PREFIX_BRAND: Record<string, WhatsappBrand> = { SL: 'SAMARA', OT: 'OTIUM', MV: 'MISCHIEF' }

export function parseWaRef(text: string | null | undefined): { ref: string; brand: WhatsappBrand } | null {
  const m = text?.match(REF_RE)
  if (!m) return null
  const prefix = m[1].toUpperCase()
  return { ref: `${prefix}-${m[2].toUpperCase()}`, brand: REF_PREFIX_BRAND[prefix] }
}

type Db = PrismaClient

// ── Ingest ───────────────────────────────────────────────────────────────────────

// Some taps log UTMs straight from the query string, still URL-encoded ("Samara+1+/+Australia+++Singapure"),
// others already decoded ("Samara 1 / Bali + Jakarta/ 50%"). A value with a space is already decoded —
// its '+' is a real plus. Otherwise '+' is a space, and "+++" was " + " (a literal plus between spaces);
// a stray '%' ("50%") can't be URI-decoded, so that value keeps the '+' fix only.
function utmValue(p: Record<string, unknown>, keys: string[]): string | null {
  const v = pickClean(p, keys, 300)
  if (!v || v.includes(' ') || !/[+%]/.test(v)) return v
  const spaced = v.replace(/\+\+\+/g, ' \u0000 ').replace(/\+/g, ' ').replace(/\u0000/g, '+')
  try { return decodeURIComponent(spaced).trim() || null } catch { return spaced.trim() || null }
}

function parseTime(v: unknown): Date | null {
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v)
  const s = cleanValue(v)
  if (!s) return null
  if (/^\d{9,13}$/.test(s)) { const n = Number(s); return new Date(n < 1e12 ? n * 1000 : n) }
  // MySQL "2026-11-19 10:15:00" without a zone — the WordPress tap table stores UTC.
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s) ? `${s.replace(' ', 'T')}Z` : s)
  return isNaN(d.getTime()) ? null : d
}

/** One tap from the website (snippet 63 / the samara-erp-tracking plugin) → WaTap columns. */
export function tapFromPayload(p: Record<string, unknown>): Omit<Prisma.WaTapCreateInput, 'rawPayload'> | null {
  const parsed = parseWaRef(pickClean(p, ['ref', 'wa_ref', 'code']))
  if (!parsed) return null
  const tappedAt = parseTime(p.tapped_at ?? p.ts ?? p.time ?? p.created_at ?? p.createdAt) ?? new Date()
  const consentRegion = consentRegionFrom(p, ['consent_region', 'region'])
  // Same pre-15-Nov fix as the website forms: "granted" without a banner was really "not_required".
  const adConsent = correctLegacyConsent(normalizeAdConsent(pickClean(p, ['ad_consent', 'consent'])), consentRegion, tappedAt)
  const dropMeta = dropMetaCookies(adConsent, consentRegion)
  const page = pickClean(p, ['page', 'page_url', 'url', 'landing_url'], 2000)
  return {
    ref: parsed.ref,
    brand: parsed.brand,
    tappedAt,
    pageUrl: page && isHttpUrl(page) ? page : null,
    lang: pickClean(p, ['lang', 'language'], 16),
    visitorId: pickClean(p, ['vid', 'visitorId', 'visitor_id'], 64),
    gclid: pickClean(p, ['gclid'], 500),
    gbraid: pickClean(p, ['gbraid'], 500),
    wbraid: pickClean(p, ['wbraid'], 500),
    fbclid: pickClean(p, ['fbclid'], 500),
    msclkid: pickClean(p, ['msclkid'], 500),
    fbc: dropMeta ? null : pickClean(p, ['_fbc', 'fbc'], 500),
    fbp: dropMeta ? null : pickClean(p, ['_fbp', 'fbp'], 500),
    utmSource: utmValue(p, ['utm_source']),
    utmMedium: utmValue(p, ['utm_medium']),
    utmCampaign: utmValue(p, ['utm_campaign']),
    utmTerm: utmValue(p, ['utm_term']),
    utmContent: utmValue(p, ['utm_content']),
    ftUtmSource: utmValue(p, ['ft_utm_source']),
    ftUtmMedium: utmValue(p, ['ft_utm_medium']),
    ftUtmCampaign: utmValue(p, ['ft_utm_campaign']),
    ftGclid: pickClean(p, ['ft_gclid'], 500),
    referrer: pickClean(p, ['referrer', 'ref_url'], 2000),
    adConsent,
    consentRegion,
    ipAddress: pickClean(p, ['ip', 'visitor_ip', 'ip_address'], 64),
    userAgent: pickClean(p, ['ua', 'user_agent'], 1000),
  }
}

/** Stores a tap (a repeat delivery of the same ref only fills gaps), then tries to match it. */
export async function recordWaTap(db: Db, payload: Record<string, unknown>): Promise<{ ok: boolean; tapId?: string; matched?: boolean; lateMatchConversationId?: string | null }> {
  const data = tapFromPayload(payload)
  if (!data) return { ok: false }
  // Raw copy follows the same Meta-cookie rule as the columns (consent already legacy-corrected).
  const rawPayload = JSON.parse(JSON.stringify(stripMetaCookies(payload, dropMetaCookies(data.adConsent ?? null, data.consentRegion ?? null)))) as Prisma.InputJsonValue
  const existing = await db.waTap.findUnique({ where: { ref: data.ref } })
  let tap: WaTap
  if (existing) {
    const fill: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data)) {
      if (v != null && (existing as Record<string, unknown>)[k] == null) fill[k] = v
    }
    tap = Object.keys(fill).length ? await db.waTap.update({ where: { id: existing.id }, data: fill }) : existing
  } else {
    tap = await db.waTap.create({ data: { ...data, rawPayload } }).catch(async e => {
      // Same tap delivered twice at once.
      const raced = await db.waTap.findUnique({ where: { ref: data.ref } })
      if (!raced) throw e
      return raced
    })
  }
  if (tap.matchedConversationId) return { ok: true, tapId: tap.id, matched: true }
  const matched = await matchTapToChat(db, tap.id)
  // Matched just now to a chat that already started → the caller opens its deal (runLateTapChatDeal).
  const lateMatchConversationId = matched ? (await db.waTap.findUnique({ where: { id: tap.id }, select: { matchedConversationId: true } }))?.matchedConversationId ?? null : null
  return { ok: true, tapId: tap.id, matched, lateMatchConversationId }
}

// ── Matching ─────────────────────────────────────────────────────────────────────

export interface Session { conversationId: string; startedAt: Date; text: string | null }

/** Who a chat's attribution inquiry belongs to: its Lead, else the Guest with that exact number. */
export async function chatInquiryOwner(db: Db, conversationId: string): Promise<{ leadId: string } | { customerId: string } | null> {
  const conv = await db.whatsappConversation.findUnique({ where: { id: conversationId }, select: { leadId: true, phone: true } })
  if (!conv) return null
  if (conv.leadId) return { leadId: conv.leadId }
  const customerId = await findCustomerIdByPhone(db, toE164(conv.phone, { international: true }))
  return customerId ? { customerId } : null
}

// The webhook stamps a session's inquiry with the message's own timestamp, the tap side with the
// row's createdAt — both the same first message, so a few minutes either way is the same session.
const SESSION_START_SLACK_MS = 10 * 60_000

/** This session's attribution inquiry of `source` (direct placeholder / ad), if any. */
export function sessionInquiry(db: Db, conversationId: string, startedAt: Date, source: string) {
  return db.inquiry.findFirst({
    where: {
      whatsappConversationId: conversationId, source,
      createdAt: { gte: new Date(startedAt.getTime() - SESSION_START_SLACK_MS), lte: new Date(startedAt.getTime() + SESSION_START_SLACK_MS) },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
}

/** Taps of `brand` not matched to any chat yet, tapped in the 30 min up to `at`. */
function unmatchedTapsBefore(db: Db, brand: WhatsappBrand, at: Date) {
  return db.waTap.findMany({
    where: { brand, matchedConversationId: null, tappedAt: { gte: new Date(at.getTime() - WA_MATCH_WINDOW_MS), lte: new Date(at.getTime() + 60_000) } },
    orderBy: { tappedAt: 'desc' },
  })
}

/** The tap already matched to this chat session (a session = up to 24h before `at`). */
function sessionMatch(db: Db, conversationId: string, at: Date) {
  return db.waTap.findFirst({
    where: { matchedConversationId: conversationId, tappedAt: { gte: new Date(at.getTime() - SESSION_GAP_MS - WA_MATCH_WINDOW_MS), lte: new Date(at.getTime() + 60_000) } },
    include: { inquiry: { select: { id: true, matchConfidence: true, matchConfidenceById: true } } },
  })
}

/**
 * Called by the WhatsApp webhook when a chat session starts (new thread, or first message
 * after 24h quiet) — after the chat got its Lead. Best-effort; returns the confidence used.
 */
export async function matchWhatsappSession(db: Db, session: Session): Promise<MatchConfidence | null> {
  const conv = await db.whatsappConversation.findUnique({ where: { id: session.conversationId }, select: { brand: true } })
  if (!conv) return null
  if (await sessionMatch(db, session.conversationId, session.startedAt)) return null

  const parsed = parseWaRef(session.text)
  if (parsed) {
    const tap = await db.waTap.findUnique({ where: { ref: parsed.ref } })
    // Ref typed but the tap hasn't reached us yet → matched when it arrives (matchTapToChat).
    if (!tap) return null
    if (tap.matchedConversationId && tap.matchedConversationId !== session.conversationId) return null
    await linkTap(db, tap, session, 'CONFIDENT')
    return 'CONFIDENT'
  }

  const taps = await unmatchedTapsBefore(db, conv.brand, session.startedAt)
  // A tap with its own ref still pending could be someone else's chat-to-be — but without a
  // ref in this message the timing is all we have; ambiguity shows up as LOW.
  if (taps.length === 0) return null
  const nearest = taps[0]
  const confidence: MatchConfidence = taps.length === 1 ? 'MEDIUM' : 'LOW'
  await linkTap(db, nearest, session, confidence)
  return confidence
}

/** A tap that arrived after its chat started: find the chat by ref, else by timing. */
export async function matchTapToChat(db: Db, tapId: string): Promise<boolean> {
  const tap = await db.waTap.findUnique({ where: { id: tapId } })
  if (!tap || tap.matchedConversationId) return !!tap?.matchedConversationId

  // 1. The ref in an inbound message (up to 24h after the tap). Any of our numbers: the ref is unique,
  //    and a site's button may open another brand's number (otiumyacht.com opens Samara's, Nov 2026).
  const byRef = await db.whatsappMessage.findFirst({
    where: {
      direction: 'IN',
      body: { contains: tap.ref, mode: 'insensitive' },
      createdAt: { gte: new Date(tap.tappedAt.getTime() - 5 * 60_000), lte: new Date(tap.tappedAt.getTime() + SESSION_GAP_MS) },
    },
    orderBy: { createdAt: 'asc' },
    select: { conversationId: true, createdAt: true, body: true },
  })
  if (byRef) {
    const existing = await sessionMatch(db, byRef.conversationId, byRef.createdAt)
    // The session was timing-matched to another tap — the ref is the stronger signal, unless a
    // person already set the confidence by hand.
    if (existing && (existing.inquiry?.matchConfidence === 'CONFIDENT' || existing.inquiry?.matchConfidenceById)) return false
    if (existing) await unlinkTap(db, existing.id)
    await linkTap(db, tap, { conversationId: byRef.conversationId, startedAt: byRef.createdAt, text: byRef.body }, 'CONFIDENT', existing?.inquiry?.id)
    return true
  }

  // 2. Timing: chat sessions of that brand that started in the 30 min after the tap.
  const starts = await db.$queryRaw<{ conversationId: string; createdAt: Date; body: string | null }[]>`
    SELECT m."conversationId", m."createdAt", m.body
    FROM "WhatsappMessage" m
    JOIN "WhatsappConversation" c ON c.id = m."conversationId"
    WHERE m.direction = 'IN' AND c.brand::text = ${tap.brand}
      AND m."createdAt" >= ${tap.tappedAt} AND m."createdAt" <= ${new Date(tap.tappedAt.getTime() + WA_MATCH_WINDOW_MS)}
      AND NOT EXISTS (
        SELECT 1 FROM "WhatsappMessage" p
        WHERE p."conversationId" = m."conversationId" AND p.direction = 'IN'
          AND p."createdAt" < m."createdAt" AND p."createdAt" >= m."createdAt" - interval '24 hours'
      )
    ORDER BY m."createdAt" ASC`
  const open: typeof starts = []
  for (const s of starts) {
    if (parseWaRef(s.body)) continue // carries its own ref — matched by that, not by timing
    // Opened from a Click-to-WhatsApp ad/post — Meta told us the source, a website tap didn't start it.
    if (await sessionInquiry(db, s.conversationId, s.createdAt, WA_AD_INQUIRY_SOURCE)) continue
    if (!(await sessionMatch(db, s.conversationId, s.createdAt))) open.push(s)
  }
  // Two chats started after this tap — can't tell whose it was.
  if (open.length !== 1) return false
  const s = open[0]
  const competing = await unmatchedTapsBefore(db, tap.brand, s.createdAt)
  await linkTap(db, tap, { conversationId: s.conversationId, startedAt: s.createdAt, text: s.body }, competing.length <= 1 ? 'MEDIUM' : 'LOW')
  return true
}

async function unlinkTap(db: Db, tapId: string): Promise<void> {
  await db.waTap.update({ where: { id: tapId }, data: { matchedConversationId: null, matchedAt: null } })
}

/** Inquiry columns carried over from a tap. */
function tapAttribution(tap: WaTap) {
  let website: string | null = null
  try { website = tap.pageUrl ? new URL(tap.pageUrl).hostname : null } catch { website = null }
  return {
    website,
    url: tap.pageUrl,
    landingUrl: tap.pageUrl,
    utmSource: tap.ftUtmSource ?? tap.utmSource,
    utmMedium: tap.ftUtmMedium ?? tap.utmMedium,
    utmCampaign: tap.ftUtmCampaign ?? tap.utmCampaign,
    utmTerm: tap.utmTerm,
    utmContent: tap.utmContent,
    gclid: tap.ftGclid ?? tap.gclid,
    gbraid: tap.gbraid,
    wbraid: tap.wbraid,
    fbclid: tap.fbclid,
    msclkid: tap.msclkid,
    lastSource: tap.utmSource,
    lastMedium: tap.utmMedium,
    lastCampaign: tap.utmCampaign,
    lastTerm: tap.utmTerm,
    lastContent: tap.utmContent,
    lastGclid: tap.gclid,
    lastGbraid: tap.gbraid,
    lastWbraid: tap.wbraid,
    lastFbclid: tap.fbclid,
    lastMsclkid: tap.msclkid,
    fbc: tap.fbc,
    fbp: tap.fbp,
    referrer: tap.referrer,
    ipAddress: tap.ipAddress,
    userAgent: tap.userAgent,
    adConsent: tap.adConsent,
    consentRegion: tap.consentRegion,
    waRef: tap.ref,
  }
}

/**
 * Marks the tap as this chat's and writes its attribution as a WHATSAPP Inquiry on the chat's
 * Lead (or, for a returning guest, the Guest with that exact number). `reuseInquiryId` re-points
 * an inquiry that was timing-matched to a weaker tap.
 */
async function linkTap(db: Db, tap: WaTap, session: Session, confidence: MatchConfidence, reuseInquiryId?: string): Promise<void> {
  const { count } = await db.waTap.updateMany({
    where: { id: tap.id, OR: [{ matchedConversationId: null }, { matchedConversationId: session.conversationId }] },
    data: { matchedConversationId: session.conversationId, matchedAt: new Date() },
  })
  if (count === 0) return // matched to another chat a moment ago

  const owner = await chatInquiryOwner(db, session.conversationId)
  if (!owner) return // nobody to attach to yet — the tap stays marked as this chat's

  const data = {
    ...tapAttribution(tap),
    waTapId: tap.id,
    whatsappConversationId: session.conversationId,
    matchConfidence: confidence,
    matchConfidenceById: null,
    matchConfidenceAt: new Date(),
  }
  // The tap reached us after the chat started, which then got a "direct chat" inquiry — that
  // row becomes this tap's rather than leaving a second, wrong one (src/lib/wa-chat-attribution.ts).
  const inquiryId = reuseInquiryId ?? (await sessionInquiry(db, session.conversationId, session.startedAt, WA_DIRECT_INQUIRY_SOURCE))?.id
  if (inquiryId) {
    await db.inquiry.update({ where: { id: inquiryId }, data: { ...data, source: 'WHATSAPP', rawPayload: (tap.rawPayload ?? undefined) as Prisma.InputJsonValue | undefined } })
    await finalizeInquiry(db, inquiryId).catch(e => console.error('[wa-tap] attribution', e))
    if (confidence === 'LOW') await lateLowMatchTask(db, inquiryId)
    return
  }
  const created = await db.inquiry.create({
    data: {
      source: 'WHATSAPP',
      ...owner,
      message: session.text?.slice(0, 2000) || null,
      ...data,
      rawPayload: (tap.rawPayload ?? undefined) as Prisma.InputJsonValue | undefined,
      createdAt: session.startedAt,
    },
    select: { id: true },
  })
  await finalizeInquiry(db, created.id).catch(e => console.error('[wa-tap] attribution', e))
  if (confidence === 'LOW') await lateLowMatchTask(db, created.id)
}

/** LOW linked to a chat that may already have its deal → the owner's "check by hand" task (src/lib/wa-low-match.ts).
 *  When the deal doesn't exist yet the chat deal maker creates the task right after it makes the deal. */
async function lateLowMatchTask(db: Db, inquiryId: string): Promise<void> {
  await ensureLowMatchTask(db, inquiryId).catch(e => console.error('[wa-tap] low-match task failed', e))
}
