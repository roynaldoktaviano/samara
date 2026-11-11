import { Prisma, type MetaDmPlatform, type PrismaClient, type WhatsappBrand } from '@prisma/client'
import { getTenantSecret } from '@/lib/tenant-secrets'
import type { TenantSecretKey } from '@/lib/tenant-secrets-definitions'
import { WHATSAPP_BRANDS, WHATSAPP_BRAND_LABELS, WHATSAPP_GRAPH_VERSION } from '@/lib/whatsapp-brands'
import { isR2Configured, putToR2 } from '@/lib/r2'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { pickNextSalesUserId } from '@/lib/whatsapp-distribution'
import { sendPushToUser } from '@/lib/push'
import { isViewing } from '@/lib/chat-presence'
import { ensureLeadForMetaDm, isNewContactSession, recordLeadContact } from '@/lib/lead-contact'
import { recordLeadInbound, recordLeadOutbound } from '@/lib/lead-stage-auto'
import { IG_GRAPH, getIgLoginToken } from '@/lib/instagram-login'

// Facebook Messenger + Instagram Direct, both through the Messenger Platform (one Meta
// App, each brand's Facebook Page with its linked Instagram account). Inbound events come
// in on /api/webhooks/meta-messaging; replies go out through the Page's Send API. Both
// platforms are stored in InstagramConversation/InstagramMessage, told apart by `platform`.

const GRAPH = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}`
const DAY_MS = 24 * 60 * 60 * 1000

export const META_DM_BRAND_SECRET_KEYS: Record<WhatsappBrand, { pageId: TenantSecretKey; igAccountId: TenantSecretKey; pageToken: TenantSecretKey }> = {
  SAMARA:   { pageId: 'metaDmSamaraPageId',   igAccountId: 'metaDmSamaraIgAccountId',   pageToken: 'metaDmSamaraPageToken' },
  MISCHIEF: { pageId: 'metaDmMischiefPageId', igAccountId: 'metaDmMischiefIgAccountId', pageToken: 'metaDmMischiefPageToken' },
  OTIUM:    { pageId: 'metaDmOtiumPageId',    igAccountId: 'metaDmOtiumIgAccountId',    pageToken: 'metaDmOtiumPageToken' },
}

export const META_DM_PLATFORM_LABELS: Record<MetaDmPlatform, string> = { INSTAGRAM: 'Instagram', MESSENGER: 'Messenger' }

async function brandConfig(tenantId: string, brand: WhatsappBrand) {
  const keys = META_DM_BRAND_SECRET_KEYS[brand]
  const [pageId, igAccountId, pageToken] = await Promise.all([
    getTenantSecret(tenantId, keys.pageId),
    getTenantSecret(tenantId, keys.igAccountId),
    getTenantSecret(tenantId, keys.pageToken),
  ])
  return { pageId, igAccountId, pageToken }
}

/** Which brand owns our Page id (Messenger) / IG account id (Instagram). */
export async function resolveMetaDmBrand(tenantId: string, platform: MetaDmPlatform, ourAccountId: string | null): Promise<WhatsappBrand | null> {
  if (!ourAccountId) return null
  for (const brand of WHATSAPP_BRANDS) {
    const cfg = await brandConfig(tenantId, brand)
    if ((platform === 'INSTAGRAM' ? cfg.igAccountId : cfg.pageId) === ourAccountId) return brand
  }
  return null
}

// ── Sending ─────────────────────────────────────────────────────────────────────

export interface SendMetaDmResult { ok: boolean; providerMessageId?: string; error?: string }

function attachmentType(mediaType: string | null | undefined): 'image' | 'video' | 'audio' | 'file' {
  if (mediaType?.startsWith('image/')) return 'image'
  if (mediaType?.startsWith('video/')) return 'video'
  if (mediaType?.startsWith('audio/')) return 'audio'
  return 'file'
}

/**
 * Replies to a Messenger/Instagram DM from the brand's Page. Meta allows a standard reply
 * within 24h of the customer's last message; up to 7 days it goes out with the HUMAN_AGENT
 * tag (needs that permission approved on the app); after that Meta refuses it.
 */
export async function sendMetaDm(
  tenantId: string,
  conversation: { platform: MetaDmPlatform; externalUserId: string | null; ourAccountId: string | null; brand: WhatsappBrand | null; lastInboundAt: Date | null },
  message: { text?: string; mediaUrl?: string | null; mediaType?: string | null; replyToMid?: string | null },
): Promise<SendMetaDmResult> {
  if (!conversation.externalUserId) return { ok: false, error: 'This conversation did not come in through Meta, so it cannot be replied to' }
  const brand = conversation.brand ?? await resolveMetaDmBrand(tenantId, conversation.platform, conversation.ourAccountId)
  if (!brand) return { ok: false, error: 'This Page / Instagram account is not configured for any brand (Super Admin → Secrets → Facebook & Instagram DM)' }
  // Instagram with an Instagram Login token goes out from the IG account itself; everything
  // else through the brand's Page (see src/lib/instagram-login.ts).
  const igToken = conversation.platform === 'INSTAGRAM' ? await getIgLoginToken(tenantId, brand) : null
  const { pageId, pageToken } = await brandConfig(tenantId, brand)
  if (!igToken && (!pageId || !pageToken)) return { ok: false, error: `Facebook Page ID / Page Access Token for ${WHATSAPP_BRAND_LABELS[brand]} is not set${conversation.platform === 'INSTAGRAM' ? ' (or connect Instagram Login in Super Admin)' : ''}` }
  const sendUrl = igToken ? `${IG_GRAPH}/me/messages` : `${GRAPH}/${pageId}/messages`
  const sendToken = igToken ?? pageToken

  const sinceInbound = conversation.lastInboundAt ? Date.now() - conversation.lastInboundAt.getTime() : Infinity
  if (sinceInbound > 7 * DAY_MS) return { ok: false, error: 'More than 7 days since the customer last messaged — Meta does not allow a reply until they message again' }
  const messaging = sinceInbound <= DAY_MS ? { messaging_type: 'RESPONSE' } : { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' }

  const parts: Record<string, unknown>[] = []
  if (message.mediaUrl) parts.push({ attachment: { type: attachmentType(message.mediaType), payload: { url: message.mediaUrl } } })
  if (message.text) parts.push({ text: message.text })
  if (parts.length === 0) return { ok: false, error: 'Nothing to send' }

  const post = async (part: Record<string, unknown>, replyToMid: string | null) => {
    const res = await fetch(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sendToken}` },
      body: JSON.stringify({
        recipient: { id: conversation.externalUserId }, ...messaging,
        // Quoted reply ("swipe to reply") — shows the quoted bubble in the IG / Messenger app.
        ...(replyToMid && { reply_to: { mid: replyToMid } }),
        message: part,
      }),
    })
    const data = await res.json().catch(() => ({})) as { message_id?: string; error?: { message?: string; code?: number; error_subcode?: number } }
    return { res, data }
  }

  let providerMessageId: string | undefined
  for (const [i, part] of parts.entries()) {
    try {
      // The quote rides on the first part only (attachment + text = two Meta messages).
      const replyToMid = i === 0 ? message.replyToMid ?? null : null
      let { res, data } = await post(part, replyToMid)
      // Meta can refuse the quote (old/unknown mid) — still deliver the message, just unquoted.
      if ((!res.ok || !data.message_id) && replyToMid) ({ res, data } = await post(part, null))
      if (!res.ok || !data.message_id) {
        const err = data.error
        return { ok: false, providerMessageId, error: err ? `(#${err.code}${err.error_subcode ? `/${err.error_subcode}` : ''}) ${err.message ?? 'Send failed'}` : `Meta returned ${res.status}` }
      }
      providerMessageId = data.message_id
    } catch (e) {
      return { ok: false, providerMessageId, error: e instanceof Error ? e.message : 'Failed to reach Meta' }
    }
  }
  return { ok: true, providerMessageId }
}

/**
 * Instagram hands out two encodings of the same message id: the Send API returns
 * "ig_dm_item:1:IGMessageID:…" while the echo webhook carries "new_ig_dm_item:1:IGMessageID:…"
 * (both base64, with Meta's Z-escapes: ZA='Z', ZB='+', ZC='/', ZD='='). Reduce either to the
 * shared IGMessageID tail so an echo can be matched to the row the ERP already stored.
 */
export function canonicalMetaMid(mid: string): string {
  try {
    const b64 = mid.replace(/Z([A-D])/g, (_, c: string) => ({ A: 'Z', B: '+', C: '/', D: '=' } as Record<string, string>)[c])
    const decoded = Buffer.from(b64, 'base64').toString('utf8')
    const at = decoded.indexOf('IGMessageID:')
    if (at >= 0) return decoded.slice(at)
  } catch { /* not Meta's encoding — fall through */ }
  return mid
}

// ── Inbound webhook events ──────────────────────────────────────────────────────

// The same DM can arrive twice, once per subscription (Page app + Instagram Login app),
// each carrying its own mid encoding ("ig_dm_item:…" vs "new_ig_dm_item:…"), ~1s apart.
// The DB check below catches the later one; this in-process claim catches the case where
// both are being handled at the same time (before either row is written).
const MID_CLAIM_TTL_MS = 10 * 60_000
const claimedMids = new Map<string, number>()
function claimMid(key: string): boolean {
  const now = Date.now()
  for (const [k, at] of claimedMids) if (now - at > MID_CLAIM_TTL_MS) claimedMids.delete(k)
  if (claimedMids.has(key)) return false
  claimedMids.set(key, now)
  return true
}

/**
 * The stored message a reply_to.mid points at — exact id first, else the same message stored
 * under Meta's other mid encoding (see canonicalMetaMid).
 */
async function findQuotedMessage(db: PrismaClient, conversationId: string, mid: string): Promise<{ id: string } | null> {
  const exact = await db.instagramMessage.findUnique({ where: { providerMessageId: mid }, select: { id: true, conversationId: true } })
  if (exact) return exact.conversationId === conversationId ? { id: exact.id } : null
  const canon = canonicalMetaMid(mid)
  const recent = await db.instagramMessage.findMany({
    where: { conversationId, providerMessageId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, providerMessageId: true },
  })
  const hit = recent.find(r => !r.providerMessageId!.includes('#') && canonicalMetaMid(r.providerMessageId!) === canon)
  return hit ? { id: hit.id } : null
}

/** True if this conversation already has a message whose mid is the same message in another encoding. */
async function hasMessageWithCanonicalMid(db: PrismaClient, conversationKey: { platform_externalUserId: { platform: MetaDmPlatform; externalUserId: string } }, canon: string) {
  const conv = await db.instagramConversation.findUnique({ where: conversationKey, select: { id: true } })
  if (!conv) return false
  const recent = await db.instagramMessage.findMany({
    where: { conversationId: conv.id, providerMessageId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { providerMessageId: true },
  })
  // Extra attachment rows carry "<mid>#<n>" — only the main row's plain mid is comparable.
  return recent.some(r => !r.providerMessageId!.includes('#') && canonicalMetaMid(r.providerMessageId!) === canon)
}

interface MetaAttachment { type?: string; payload?: { url?: string; title?: string } | null }
export interface MetaMessagingEvent {
  sender: { id: string }
  recipient: { id: string }
  timestamp?: number
  message?: {
    mid: string
    text?: string
    attachments?: MetaAttachment[]
    is_echo?: boolean
    is_deleted?: boolean
    is_unsupported?: boolean
    reply_to?: { mid?: string; story?: { url?: string; id?: string } }
    quick_reply?: { payload?: string }
  }
  postback?: { mid?: string; title?: string; payload?: string }
  reaction?: { mid?: string; action?: string; emoji?: string; reaction?: string }
  read?: { mid?: string; watermark?: number }
  delivery?: { mids?: string[]; watermark?: number }
  /** Not from Meta — set by the Messenger poller (src/lib/messenger-sync.ts), which already has the name. */
  customerName?: string
}
export interface MetaMessagingBody {
  object?: string
  entry?: { id: string; time?: number; messaging?: MetaMessagingEvent[] }[]
}

/** True if the payload carries Messenger/Instagram DM events (vs. e.g. leadgen changes). */
export function hasMetaMessagingEvents(body: MetaMessagingBody): boolean {
  return (body.object === 'page' || body.object === 'instagram') && !!body.entry?.some(e => e.messaging?.length)
}

async function fetchProfile(platform: MetaDmPlatform, userId: string, auth: { token: string; graph: string } | null) {
  if (!auth) return null
  const fields = platform === 'INSTAGRAM' ? 'name,username,profile_pic' : 'first_name,last_name,profile_pic'
  try {
    const res = await fetch(`${auth.graph}/${userId}?fields=${fields}`, { headers: { Authorization: `Bearer ${auth.token}` } })
    if (!res.ok) return null
    const p = await res.json() as { name?: string; username?: string; first_name?: string; last_name?: string; profile_pic?: string }
    return {
      displayName: p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
      username: p.username ?? null,
      profilePicUrl: p.profile_pic ?? null,
    }
  } catch {
    return null
  }
}

// Meta's attachment URLs are signed CDN links that expire — re-host them on R2 so the
// thread keeps showing them. Without R2 the original link is kept (works for a while).
async function storeAttachment(url: string, key: string): Promise<{ url: string; mimeType: string | null }> {
  if (!isR2Configured()) return { url, mimeType: null }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Attachment download returned ${res.status}`)
  const mimeType = res.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream'
  const ext = mimeType.split('/')[1] ?? 'bin'
  return { url: await putToR2(`meta-dm-media/${key}.${ext}`, Buffer.from(await res.arrayBuffer()), mimeType), mimeType }
}

const GUESSED_MIME: Record<string, string> = { image: 'image/jpeg', video: 'video/mp4', audio: 'audio/mpeg', file: 'application/octet-stream', story_mention: 'image/jpeg' }

/** One stored row per attachment: text, plus a media URL to fetch (or a link folded into the text). */
function describeMessage(msg: NonNullable<MetaMessagingEvent['message']>): { text: string | null; media: { url: string; mediaType: string }[] } {
  const lines: string[] = []
  const media: { url: string; mediaType: string }[] = []
  if (msg.reply_to?.story) lines.push('↩️ Replied to your story')
  for (const a of msg.attachments ?? []) {
    const url = a.payload?.url
    if (a.type === 'story_mention') lines.push('📣 Mentioned you in their story')
    if (url && a.type && a.type in GUESSED_MIME) media.push({ url, mediaType: GUESSED_MIME[a.type] })
    else if (url) lines.push(`🔗 ${a.payload?.title ? `${a.payload.title}\n` : ''}${url}`)
  }
  if (msg.text) lines.push(msg.text)
  if (!lines.length && !media.length && msg.is_unsupported) lines.push('[Unsupported message — open it in the Meta app]')
  return { text: lines.join('\n') || null, media }
}

function previewOf(text: string | null, mediaType: string | null) {
  if (text) return text
  if (!mediaType) return ''
  return mediaType.startsWith('image/') ? '📷 Photo' : mediaType.startsWith('video/') ? '🎥 Video' : mediaType.startsWith('audio/') ? '🎤 Audio' : '📎 Attachment'
}

/**
 * Processes one verified webhook delivery. Messages from the customer create/append a thread
 * (new threads are assigned through the Instagram distribution pool); echoes of replies made
 * outside the ERP (Meta Business Suite, the IG app) are recorded as outgoing; delivery/read
 * receipts update our sent messages.
 */
export async function handleMetaMessagingEvents(db: PrismaClient, tenantId: string, body: MetaMessagingBody): Promise<void> {
  const platform: MetaDmPlatform = body.object === 'instagram' ? 'INSTAGRAM' : 'MESSENGER'
  let changed = false
  // Mids claimed by this delivery — released if it fails, so Meta's redelivery isn't skipped.
  const claimed: string[] = []

  try {
    for (const entry of body.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        const isEcho = !!event.message?.is_echo
        const ourAccountId = isEcho ? event.sender.id : event.recipient.id
        const customerId = isEcho ? event.recipient.id : event.sender.id
        if (!customerId || customerId === ourAccountId) continue
        const key = { platform_externalUserId: { platform, externalUserId: customerId } }

        // ── Receipts ──
        if (event.delivery || event.read) {
          const conv = await db.instagramConversation.findUnique({ where: key, select: { id: true } })
          if (!conv) continue
          const watermark = event.read?.watermark ?? event.delivery?.watermark
          const { count } = await db.instagramMessage.updateMany({
            where: {
              conversationId: conv.id, direction: 'OUT',
              status: event.read ? { in: ['SENT', 'DELIVERED'] } : 'SENT',
              ...(watermark && { createdAt: { lte: new Date(watermark) } }),
            },
            data: { status: event.read ? 'READ' : 'DELIVERED' },
          })
          if (count) changed = true
          continue
        }

        const msg = event.message
        if (msg?.is_deleted) continue
        let described: { text: string | null; media: { url: string; mediaType: string }[] }
        let mid: string | null = msg?.mid ?? null
        if (msg) described = describeMessage(msg)
        else if (event.postback) { described = { text: event.postback.title ?? event.postback.payload ?? null, media: [] }; mid = event.postback.mid ?? null }
        else if (event.reaction?.action === 'react') { described = { text: `Reacted ${event.reaction.emoji ?? event.reaction.reaction ?? '❤️'}`, media: [] }; mid = null }
        else continue
        if (!described.text && !described.media.length) continue

        if (mid) {
          const canon = canonicalMetaMid(mid)
          const claimKey = `${tenantId}:${platform}:${canon}`
          if (!claimMid(claimKey)) continue
          claimed.push(claimKey)
          if (await db.instagramMessage.findUnique({ where: { providerMessageId: mid }, select: { id: true } })) continue
          // Same message already stored under its other encoding (second webhook subscription,
          // or the echo of a reply whose Send API id was saved) — see canonicalMetaMid.
          if (await hasMessageWithCanonicalMid(db, key, canon)) continue
        }

        const brand = await resolveMetaDmBrand(tenantId, platform, ourAccountId)
        if (!brand) console.error('[meta-dm] no brand configured for', platform, 'account', ourAccountId, 'in tenant', tenantId)
        const firstMediaType = described.media[0]?.mediaType ?? null
        const preview = previewOf(described.text, firstMediaType)
        // When the message was actually sent — the Messenger poller hands in older messages.
        const now = event.timestamp ? new Date(event.timestamp) : new Date()
        // Picked up long after it was sent (poller backfill) — store it, but don't ping anyone.
        const stale = Date.now() - now.getTime() > 15 * 60_000

        // ── Echo: a reply sent from our side ──
        if (isEcho) {
          const conv = await db.instagramConversation.findUnique({ where: key, select: { id: true } })
          if (conv) {
            // A reply sent from the ERP echoes back, sometimes before the Send API call returned
            // its id — match it to that still-unconfirmed row instead of storing it twice.
            const pending = await db.instagramMessage.findFirst({
              where: {
                conversationId: conv.id, direction: 'OUT', providerMessageId: null, sentByUserId: { not: null },
                createdAt: { gte: new Date(Date.now() - 2 * 60_000) },
                ...(described.media.length ? { mediaUrl: { not: null } } : { body: described.text }),
              },
              orderBy: { createdAt: 'asc' },
              select: { id: true },
            })
            if (pending) {
              await db.instagramMessage.update({ where: { id: pending.id }, data: { providerMessageId: mid } }).catch(() => {})
              continue
            }
          }
        }

        const profile = await (async () => {
          const existing = await db.instagramConversation.findUnique({ where: key, select: { id: true } })
          if (existing) return null
          if (!brand) return null
          const igToken = platform === 'INSTAGRAM' ? await getIgLoginToken(tenantId, brand) : null
          const pageToken = igToken ? null : (await brandConfig(tenantId, brand)).pageToken
          return fetchProfile(platform, customerId, igToken ? { token: igToken, graph: IG_GRAPH } : pageToken ? { token: pageToken, graph: GRAPH } : null)
        })()

        const touch = (id: string) => db.instagramConversation.update({
          where: { id },
          data: {
            lastMessageAt: now, lastMessagePreview: preview, ourAccountId, ...(brand && { brand }),
            ...(!isEcho && { lastInboundAt: now, unreadCount: { increment: 1 } }),
          },
        })
        const before = await db.instagramConversation.findUnique({ where: key, select: { id: true, leadId: true, lastInboundAt: true } })
        let conversation = before && await touch(before.id)
        let isNew = false
        // Thread opened by our side (e.g. a private reply to a Page comment) — the customer's first
        // message is when it enters the distribution pool, same as a thread they started.
        if (conversation && !isEcho && !before?.lastInboundAt && !conversation.assignedToId) {
          const pick = await pickNextSalesUserId(db, 'SAMARA', 'INSTAGRAM')
          if (pick) {
            await db.instagramConversation.updateMany({ where: { id: conversation.id, assignedToId: null }, data: { assignedToId: pick } })
            conversation = await db.instagramConversation.findUniqueOrThrow({ where: { id: conversation.id } })
          }
        }
        if (!conversation) {
          try {
            conversation = await db.instagramConversation.create({
              data: {
                platform, externalUserId: customerId, ourAccountId, brand,
                igUsername: profile?.username ?? null, displayName: profile?.displayName ?? event.customerName ?? null, profilePicUrl: profile?.profilePicUrl ?? null,
                lastMessagePreview: preview, lastMessageAt: now,
                ...(!isEcho && { lastInboundAt: now, unreadCount: 1 }),
                // Instagram and Messenger share the INSTAGRAM pool (Chat › Leads Distribution).
                assignedToId: isEcho ? null : await pickNextSalesUserId(db, 'SAMARA', 'INSTAGRAM'),
              },
            })
            isNew = true
          } catch (e) {
            // Two first messages from the same person delivered concurrently.
            if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e
            conversation = await touch((await db.instagramConversation.findUniqueOrThrow({ where: key, select: { id: true } })).id)
          }
        }

        const quoted = msg?.reply_to?.mid ? await findQuotedMessage(db, conversation.id, msg.reply_to.mid) : null
        const echoName = platform === 'INSTAGRAM' ? 'Instagram app' : 'Meta Business Suite'

        // First attachment rides on the main row (with the text); any extra ones get their own.
        const rows = described.media.length ? described.media : [null]
        for (const [i, media] of rows.entries()) {
          const saved = await db.instagramMessage.create({
            data: {
              conversationId: conversation.id,
              direction: isEcho ? 'OUT' : 'IN',
              body: i === 0 ? described.text : null,
              mediaUrl: null,
              mediaType: media?.mediaType ?? null,
              status: isEcho ? 'SENT' : 'DELIVERED',
              createdAt: now,
              providerMessageId: mid ? (i === 0 ? mid : `${mid}#${i}`) : null,
              replyToId: i === 0 ? quoted?.id ?? null : null,
              ...(isEcho && { sentByName: echoName }),
            },
            select: { id: true },
          })
          if (media) {
            // Downloaded in the background so Meta gets its 200 quickly (same as WhatsApp).
            void storeAttachment(media.url, `${saved.id}`)
              .then(stored => db.instagramMessage.update({ where: { id: saved.id }, data: { mediaUrl: stored.url, ...(stored.mimeType && { mediaType: stored.mimeType }) } }))
              .catch(e => {
                console.error('[meta-dm] attachment store failed', saved.id, e)
                return db.instagramMessage.update({ where: { id: saved.id }, data: { errorMessage: 'Attachment could not be downloaded from Meta' } })
              })
              .then(() => emitTenantEvent(tenantId, 'chat'), () => {})
          }
        }
        changed = true

        if (isEcho) {
          // Sent from the Instagram app / Meta Business Suite (ERP sends were deduped above) —
          // still a staff message for the Sales Pipeline's follow-up tracking.
          if (!stale && conversation.leadId) await recordLeadOutbound(db, conversation.leadId, null, now).catch(e => console.error('[meta-dm] lead outbound stage failed', e))
          continue
        }

        // Every DM sender is a Lead — linked/created on their first message (also for an older
        // thread that predates this), and each new contact (24h+ after their last message) goes
        // into the lead's history. See src/lib/lead-contact.ts. Never blocks acking the webhook.
        try {
          const { leadId, created } = await ensureLeadForMetaDm(db, conversation.id)
          const justLinked = !!leadId && !before?.leadId
          if (leadId && (justLinked || (before && isNewContactSession(before.lastInboundAt, now)))) {
            await recordLeadContact(db, { leadId, channel: platform, brand, instagramConversationId: conversation.id, message: preview, isFirstContact: created })
          }
          // Customer answered → Sales Pipeline "In Active Communication" (src/lib/lead-stage-auto.ts).
          // Skipped for old history the Messenger poll back-fills.
          if (leadId && !stale) await recordLeadInbound(db, leadId, now)
          // Linking to an existing lead may have handed the chat to that lead's owner.
          if (justLinked && !created) {
            conversation = await db.instagramConversation.findUniqueOrThrow({ where: { id: conversation.id } })
          }
        } catch (e) {
          console.error('[meta-dm] lead link/history failed', e)
        }

        if (stale) continue
        const who = conversation.displayName || (conversation.igUsername ? `@${conversation.igUsername}` : null) || profile?.displayName || 'customer'
        const label = META_DM_PLATFORM_LABELS[platform]
        const title = isNew ? `New ${label} DM: ${who}` : `${label}: ${who}`
        const notifBody = preview || 'New message'
        if (conversation.assignedToId && !isViewing(tenantId, conversation.assignedToId, conversation.id)) {
          db.notification.create({ data: { userId: conversation.assignedToId, type: 'WHATSAPP_MESSAGE', title, body: notifBody } }).catch(() => {})
          sendPushToUser(db, conversation.assignedToId, { title, body: notifBody, url: '/' }).catch(() => {})
        } else if (!conversation.assignedToId && isNew) {
          const unassignedTitle = `Unassigned ${label} DM: ${who}`
          db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } }).then(admins => {
            for (const a of admins) {
              db.notification.create({ data: { userId: a.id, type: 'WHATSAPP_MESSAGE', title: unassignedTitle, body: notifBody } }).catch(() => {})
              sendPushToUser(db, a.id, { title: unassignedTitle, body: notifBody, url: '/' }).catch(() => {})
            }
          }).catch(() => {})
        }
      }
    }
  } catch (e) {
    for (const k of claimed) claimedMids.delete(k)
    throw e
  }

  if (changed) emitTenantEvent(tenantId, 'chat')
}
