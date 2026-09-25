import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { putToR2 } from '@/lib/r2'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { pickNextSalesUserId } from '@/lib/whatsapp-distribution'
import { autoLinkNewConversation } from '@/lib/whatsapp-lead'
import { sendPushToUser } from '@/lib/push'
import { WHATSAPP_BRANDS, WHATSAPP_BRAND_SECRET_KEYS, WHATSAPP_GRAPH_VERSION, type WhatsappBrand } from '@/lib/whatsapp-brands'

// WhatsApp Cloud API (Meta) webhook — handles both the one-time GET verification
// handshake and the actual POST event deliveries. Samara Yachting has 3 separate
// WhatsApp Business numbers (Samara/Mischief/Otium) that can all point at this same
// webhook (one Meta App) — each inbound `value` carries which phone number it came
// in on via `metadata.phone_number_id`, resolved to a brand below.
//
// Point this at, in the Meta App dashboard → WhatsApp → Configuration:
//   Callback URL:   https://<app-domain>/api/webhooks/whatsapp?tenant=<slug>
//   Verify token:   whatever you set as "WhatsApp Webhook Verify Token" in Super Admin
// Subscribe to the `messages` webhook field.

const GRAPH_VERSION = WHATSAPP_GRAPH_VERSION

// Matches an inbound value's phone_number_id against each brand's configured one.
async function resolveBrand(tenantId: string, phoneNumberId: string | undefined): Promise<WhatsappBrand | null> {
  if (!phoneNumberId) return null
  for (const brand of WHATSAPP_BRANDS) {
    const configured = await getTenantSecret(tenantId, WHATSAPP_BRAND_SECRET_KEYS[brand].phoneNumberId)
    if (configured && configured === phoneNumberId) return brand
  }
  console.error('[whatsapp webhook] no configured brand matches phone_number_id', phoneNumberId, 'for tenant', tenantId)
  return null
}

// ── GET: Meta's webhook verification handshake ──────────────────────────────
export async function GET(request: NextRequest) {
  const tenantSlug = request.nextUrl.searchParams.get('tenant')
  const resolved = await resolveTenantBySlugFull(tenantSlug)
  if (!resolved) return NextResponse.json({ error: 'Unknown or inactive tenant' }, { status: 400 })

  const verifyToken = await getTenantSecret(resolved.tenant.id, 'whatsappWebhookSecret')
  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && challenge && verifyToken && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

// ── Cloud API payload shapes (only the fields we actually use) ──────────────
interface CloudApiMediaRef { id: string; caption?: string; mime_type?: string; filename?: string }
interface CloudApiMessage {
  from: string
  id: string
  timestamp: string
  type: string
  text?: { body: string }
  image?: CloudApiMediaRef
  video?: CloudApiMediaRef
  audio?: CloudApiMediaRef
  document?: CloudApiMediaRef
  sticker?: CloudApiMediaRef
  // Present when this message is a "swipe to reply" quote of an earlier message —
  // `id` is the WAMID (providerMessageId) of the message being replied to.
  context?: { id: string }
}
interface CloudApiStatus { id: string; status: string; timestamp: string; recipient_id: string }
interface CloudApiValue {
  metadata?: { phone_number_id?: string }
  contacts?: { profile?: { name?: string }; wa_id: string }[]
  messages?: CloudApiMessage[]
  statuses?: CloudApiStatus[]
}
interface CloudApiBody {
  object?: string
  entry?: { id: string; changes: { field: string; value: CloudApiValue }[] }[]
}

const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'] as const

function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const provided = header.slice('sha256='.length)
  if (expected.length !== provided.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
}

// Cloud API never gives a directly-fetchable media URL — you resolve a temporary,
// auth-gated one from the media id, then download it (also auth-gated), then it's
// ours to keep. Re-hosted on our own Blob storage so it doesn't expire like Meta's does.
async function fetchAndStoreMedia(mediaId: string, accessToken: string): Promise<{ url: string; mimeType: string } | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!metaRes.ok) return null
    const meta = await metaRes.json() as { url?: string; mime_type?: string }
    if (!meta.url) return null

    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!fileRes.ok) return null
    const bytes = await fileRes.arrayBuffer()
    const ext = meta.mime_type?.split('/')[1]?.split(';')[0] ?? 'bin'
    const url = await putToR2(`whatsapp-media/${mediaId}.${ext}`, Buffer.from(bytes), meta.mime_type)
    return { url, mimeType: meta.mime_type ?? 'application/octet-stream' }
  } catch (e) {
    console.error('[whatsapp webhook] failed to fetch/store media', mediaId, e)
    return null
  }
}

// ── POST: actual message/status events ───────────────────────────────────────
export async function POST(request: NextRequest) {
  const tenantSlug = request.nextUrl.searchParams.get('tenant')
  const resolved = await resolveTenantBySlugFull(tenantSlug)
  if (!resolved) return NextResponse.json({ error: 'Unknown or inactive tenant' }, { status: 400 })
  const { db, tenant } = resolved

  const rawBody = await request.text()
  const appSecret = await getTenantSecret(tenant.id, 'whatsappAppSecret')
  if (appSecret && !verifySignature(rawBody, request.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const body = JSON.parse(rawBody) as CloudApiBody
  if (body.object !== 'whatsapp_business_account') return NextResponse.json({ ok: true, ignored: true })

  // Set when a message arrived on a number we can't map to a brand (phone_number_id not
  // configured / mistyped in tenant secrets). Those messages are NOT saved — a thread with
  // no brand can't be replied to or distributed — and we answer non-2xx at the end so Meta
  // keeps redelivering them (for up to ~7 days) until the config is fixed. Everything else
  // in the batch is still processed now; redelivery is safe thanks to the providerMessageId dedupe.
  let hasUnroutedMessages = false

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      const brand = await resolveBrand(tenant.id, value.metadata?.phone_number_id)
      const accessToken = brand ? await getTenantSecret(tenant.id, WHATSAPP_BRAND_SECRET_KEYS[brand].apiToken) : null

      // Delivery/read receipts for messages we sent
      for (const status of value.statuses ?? []) {
        const mapped = status.status.toUpperCase()
        if (!['SENT', 'DELIVERED', 'READ', 'FAILED'].includes(mapped)) continue
        await db.whatsappMessage.updateMany({
          where: { providerMessageId: status.id },
          data: { status: mapped as 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' },
        }).catch(() => {})
      }

      if (!brand) {
        if (value.messages?.length) hasUnroutedMessages = true
        continue
      }

      // Inbound messages
      for (const msg of value.messages ?? []) {
        const dup = await db.whatsappMessage.findUnique({ where: { providerMessageId: msg.id } })
        if (dup) continue

        const contactName = value.contacts?.find(c => c.wa_id === msg.from)?.profile?.name ?? null
        let text: string | null = null
        let mediaUrl: string | null = null
        let mediaType: string | null = null

        if (msg.type === 'text') {
          text = msg.text?.body ?? null
        } else if ((MEDIA_TYPES as readonly string[]).includes(msg.type)) {
          const ref = (msg as unknown as Record<string, CloudApiMediaRef | undefined>)[msg.type]
          if (ref?.id && accessToken) {
            const stored = await fetchAndStoreMedia(ref.id, accessToken)
            if (stored) { mediaUrl = stored.url; mediaType = stored.mimeType }
          }
          text = ref?.caption ?? null
        } else {
          text = `[Unsupported message type: ${msg.type}]`
        }

        const preview = text ?? (mediaUrl ? '📎 Attachment' : '')
        // One thread per (number, brand) — the same customer messaging Samara and then
        // Otium gets two threads, each distributed via that brand's own pool and replied
        // from that brand's number. Only a brand-new thread gets assigned (per the
        // admin-configured pool/method, see pickNextSalesUserId) — an existing one keeps
        // whoever holds it (admins can reassign from the thread header).
        const conversationKey = { phone_brand: { phone: msg.from, brand } }
        const touchExisting = (id: string) => db.whatsappConversation.update({
          where: { id },
          data: { contactName: contactName ?? undefined, lastMessageAt: new Date(), lastInboundAt: new Date(), lastMessagePreview: preview, unreadCount: { increment: 1 } },
        })
        const existing = await db.whatsappConversation.findUnique({ where: conversationKey, select: { id: true } })
        let isNewConversation = false
        let conversation
        if (existing) {
          conversation = await touchExisting(existing.id)
        } else {
          try {
            conversation = await db.whatsappConversation.create({
              data: { phone: msg.from, contactName, lastMessagePreview: preview, lastInboundAt: new Date(), unreadCount: 1, assignedToId: await pickNextSalesUserId(db, brand), brand },
            })
            isNewConversation = true
          } catch (e) {
            // Two first-messages from the same new number delivered concurrently — the other
            // delivery created the thread a moment ago, so just append to it.
            if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e
            const raced = await db.whatsappConversation.findUniqueOrThrow({ where: conversationKey, select: { id: true } })
            conversation = await touchExisting(raced.id)
          }
        }

        // Resolve the quoted message (if this is a reply) — Meta only gives us its WAMID,
        // so we look up which of our own rows that maps back to via providerMessageId.
        const quoted = msg.context?.id
          ? await db.whatsappMessage.findUnique({ where: { providerMessageId: msg.context.id }, select: { id: true } })
          : null

        await db.whatsappMessage.create({
          data: { conversationId: conversation.id, direction: 'IN', body: text, mediaUrl, mediaType, status: 'DELIVERED', providerMessageId: msg.id, replyToId: quoted?.id ?? null },
        })
        emitTenantEvent(tenant.id, 'chat')

        // Existing Lead/Guest with this number → link/categorise the new chat right away
        // (see src/lib/whatsapp-lead.ts). Never blocks acking the webhook.
        if (isNewConversation) {
          await autoLinkNewConversation(db, conversation.id).catch(e => console.error('[whatsapp webhook] auto-link failed', e))
        }

        // Notice for whichever sales rep this chat is assigned to — in-app bell (toast +
        // chime, see src/app/page.tsx's 'chat' SSE handler) and a browser/OS push so they
        // still hear about it if the app isn't open. Best-effort, fire-and-forget: a
        // failure here shouldn't hold up acking the webhook to Meta.
        const notifTitle = `WhatsApp from ${contactName || msg.from}`
        const notifBody = preview || 'New message'
        if (conversation.assignedToId) {
          db.notification.create({
            data: { userId: conversation.assignedToId, type: 'WHATSAPP_MESSAGE', title: notifTitle, body: notifBody },
          }).catch(() => {})
          sendPushToUser(db, conversation.assignedToId, { title: notifTitle, body: notifBody, url: '/' }).catch(() => {})
        } else if (isNewConversation) {
          // Nobody in this brand's distribution pool — the chat sits unassigned (every SALES
          // rep can see and claim it), so tell admins once so it doesn't go unanswered.
          const unassignedTitle = `Unassigned WhatsApp (${brand}) from ${contactName || msg.from}`
          db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } }).then(admins => {
            for (const a of admins) {
              db.notification.create({ data: { userId: a.id, type: 'WHATSAPP_MESSAGE', title: unassignedTitle, body: notifBody } }).catch(() => {})
              sendPushToUser(db, a.id, { title: unassignedTitle, body: notifBody, url: '/' }).catch(() => {})
            }
          }).catch(() => {})
        }
      }
    }
  }

  if (hasUnroutedMessages) {
    return NextResponse.json({ error: 'Message received on a WhatsApp number that is not configured for any brand' }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}
