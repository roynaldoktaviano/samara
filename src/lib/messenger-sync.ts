import type { PrismaClient } from '@prisma/client'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { WHATSAPP_BRANDS, WHATSAPP_GRAPH_VERSION } from '@/lib/whatsapp-brands'
import { META_DM_BRAND_SECRET_KEYS, handleMetaMessagingEvents, type MetaMessagingEvent } from '@/lib/meta-dm'

// Facebook Messenger DMs, pulled from each brand Page's Conversations API.
//
// Meta's webhook only delivers Page messaging events once `pages_messaging` has Advanced
// Access, but the Page token can already read every conversation. This poller turns what it
// reads into the same events the webhook would carry and runs them through
// handleMetaMessagingEvents, so leads, assignment, notifications and replies behave exactly
// like webhook DMs. Messages are keyed by Meta's mid ("m_…", the same id the webhook and
// the Send API use), so if the webhook starts delivering too, nothing is stored twice.

const GRAPH = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}`
/** How far back the first run (per Page, per process) imports history when the ERP has none. */
const BACKFILL_MS = 30 * 24 * 60 * 60 * 1000
/** Re-read a little before the last watermark, in case Meta's updated_time lags a message. */
const OVERLAP_MS = 5 * 60_000
const MAX_CONVERSATION_PAGES = 10
const MAX_MESSAGE_PAGES = 5

interface GraphAttachment {
  mime_type?: string
  name?: string
  image_data?: { url?: string }
  video_data?: { url?: string }
  file_url?: string
}
interface GraphMessage {
  id: string
  message?: string
  created_time: string
  from?: { id: string; name?: string }
  to?: { data?: { id: string; name?: string }[] }
  attachments?: { data?: GraphAttachment[] }
  sticker?: string
  shares?: { data?: { link?: string; name?: string }[] }
}
interface GraphPaged<T> { data?: T[]; paging?: { next?: string }; error?: { message?: string; code?: number } }
interface GraphConversation { id: string; updated_time: string; messages?: GraphPaged<GraphMessage> }

const MESSAGE_FIELDS = 'id,message,created_time,from,to,attachments{mime_type,name,image_data,video_data,file_url},sticker,shares{link,name}'

// Per Page: time of the newest message already handled. In-process only — on boot it's
// re-derived from the newest stored Messenger message for that Page.
const watermarks = new Map<string, number>()
const lastErrors = new Map<string, string>()

async function graph<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json().catch(() => ({})) as T & { error?: { message?: string; code?: number } }
  if (!res.ok || data.error) throw new Error(`(#${data.error?.code ?? res.status}) ${data.error?.message ?? 'Graph request failed'}`)
  return data
}

function toEvent(m: GraphMessage, pageId: string): MetaMessagingEvent | null {
  const fromId = m.from?.id
  const other = m.to?.data?.find(p => p.id !== fromId)
  if (!fromId || !other) return null
  const isEcho = fromId === pageId
  const customer = isEcho ? other : m.from!

  const attachments: NonNullable<MetaMessagingEvent['message']>['attachments'] = []
  for (const a of m.attachments?.data ?? []) {
    if (a.image_data?.url) attachments.push({ type: 'image', payload: { url: a.image_data.url } })
    else if (a.video_data?.url) attachments.push({ type: 'video', payload: { url: a.video_data.url } })
    else if (a.file_url) attachments.push({ type: a.mime_type?.startsWith('audio/') ? 'audio' : 'file', payload: { url: a.file_url, title: a.name } })
  }
  if (m.sticker) attachments.push({ type: 'image', payload: { url: m.sticker } })
  for (const sh of m.shares?.data ?? []) if (sh.link) attachments.push({ type: 'share', payload: { url: sh.link, title: sh.name } })

  return {
    sender: { id: fromId },
    recipient: { id: other.id },
    timestamp: Date.parse(m.created_time),
    message: { mid: m.id, text: m.message || undefined, attachments, is_echo: isEcho },
    customerName: customer.name,
  }
}

async function syncPage(db: PrismaClient, tenantId: string, pageId: string, token: string) {
  const wmKey = `${tenantId}:${pageId}`
  let watermark = watermarks.get(wmKey)
  if (watermark === undefined) {
    const newest = await db.instagramMessage.findFirst({
      where: { conversation: { platform: 'MESSENGER', ourAccountId: pageId }, providerMessageId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    watermark = newest ? newest.createdAt.getTime() : Date.now() - BACKFILL_MS
  }
  const since = watermark - OVERLAP_MS

  // Newest-updated conversations first; stop paging once they're older than the watermark.
  const fresh: GraphConversation[] = []
  let url: string | undefined = `${GRAPH}/${pageId}/conversations?platform=messenger&fields=id,updated_time,messages.limit(25){${MESSAGE_FIELDS}}&limit=25`
  for (let page = 0; url && page < MAX_CONVERSATION_PAGES; page++) {
    const res: GraphPaged<GraphConversation> = await graph<GraphPaged<GraphConversation>>(url, token)
    const batch = res.data ?? []
    const recent = batch.filter(c => Date.parse(c.updated_time) > since)
    fresh.push(...recent)
    url = recent.length === batch.length ? res.paging?.next : undefined
  }

  let newest = watermark
  // Oldest conversation first, and each conversation's messages oldest first, so threads
  // and their lastMessageAt build up in order.
  for (const conv of fresh.reverse()) {
    const messages: GraphMessage[] = [...(conv.messages?.data ?? [])]
    let next = conv.messages?.paging?.next
    for (let p = 0; next && p < MAX_MESSAGE_PAGES; p++) {
      const oldest = messages[messages.length - 1]
      if (!oldest || Date.parse(oldest.created_time) <= since) break
      const more: GraphPaged<GraphMessage> = await graph<GraphPaged<GraphMessage>>(next, token)
      messages.push(...(more.data ?? []))
      next = more.paging?.next
    }

    const candidates = messages.filter(m => Date.parse(m.created_time) > since).reverse()
    if (!candidates.length) continue
    const known = new Set((await db.instagramMessage.findMany({
      where: { providerMessageId: { in: candidates.map(m => m.id) } },
      select: { providerMessageId: true },
    })).map(r => r.providerMessageId))
    const events = candidates.filter(m => !known.has(m.id)).map(m => toEvent(m, pageId)).filter((e): e is MetaMessagingEvent => !!e)
    if (events.length) {
      await handleMetaMessagingEvents(db, tenantId, { object: 'page', entry: [{ id: pageId, messaging: events }] })
    }
    for (const m of candidates) newest = Math.max(newest, Date.parse(m.created_time))
  }
  watermarks.set(wmKey, newest)
}

/** Pulls new Messenger DMs for every brand Page configured on this tenant. */
export async function syncMessengerForTenant(db: PrismaClient, tenantId: string): Promise<void> {
  for (const brand of WHATSAPP_BRANDS) {
    const keys = META_DM_BRAND_SECRET_KEYS[brand]
    const [pageId, token] = await Promise.all([getTenantSecret(tenantId, keys.pageId), getTenantSecret(tenantId, keys.pageToken)])
    if (!pageId || !token) continue
    const errKey = `${tenantId}:${brand}`
    try {
      await syncPage(db, tenantId, pageId, token)
      if (lastErrors.has(errKey)) { console.log(`[messenger-sync] ${brand} recovered`); lastErrors.delete(errKey) }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Log each distinct failure once, not every minute.
      if (lastErrors.get(errKey) !== msg) console.error(`[messenger-sync] ${brand} (tenant ${tenantId}) failed:`, msg)
      lastErrors.set(errKey, msg)
    }
  }
}
