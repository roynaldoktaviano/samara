import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { putToR2 } from '@/lib/r2'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { pickNextSalesUserId } from '@/lib/whatsapp-distribution'
import { autoLinkNewConversation } from '@/lib/whatsapp-lead'
import { isNewContactSession, recordLeadContact } from '@/lib/lead-contact'
import { sendPushToUser } from '@/lib/push'
import { isViewing } from '@/lib/chat-presence'
import { WHATSAPP_BRANDS, WHATSAPP_BRAND_SECRET_KEYS, WHATSAPP_BRAND_WEBHOOK_SECRET_KEYS, WHATSAPP_GRAPH_VERSION, type WhatsappBrand } from '@/lib/whatsapp-brands'

// WhatsApp Cloud API (Meta) webhook — handles both the one-time GET verification
// handshake and the actual POST event deliveries. Samara Yachting has 3 separate
// WhatsApp Business numbers (Samara/Mischief/Otium) that can all point at this same
// webhook (one Meta App) — each inbound `value` carries which phone number it came
// in on via `metadata.phone_number_id`, resolved to a brand below.
//
// Point this at, in the Meta App dashboard → WhatsApp → Configuration:
//   Callback URL:   https://<app-domain>/api/webhooks/whatsapp?tenant=<slug>
//                   (or /api/webhooks/whatsapp/mischief|otium?tenant=<slug> for a number in its own Meta App)
//   Verify token:   whatever you set as "WhatsApp Webhook Verify Token" in Super Admin
// Subscribe to the `messages` webhook field.
//
// A brand-specific endpoint (createWhatsappWebhookHandlers('MISCHIEF')) exists for a
// number that lives in its OWN Meta App: it checks that brand's own verify token / app
// secret first (falling back to the shared ones), and files messages under that brand
// even if its phone_number_id isn't (yet) configured in tenant secrets.

const GRAPH_VERSION = WHATSAPP_GRAPH_VERSION

// Matches an inbound value's phone_number_id against each brand's configured one.
async function resolveBrand(tenantId: string, phoneNumberId: string | undefined, fallbackBrand?: WhatsappBrand): Promise<WhatsappBrand | null> {
  if (!phoneNumberId) return fallbackBrand ?? null
  for (const brand of WHATSAPP_BRANDS) {
    const configured = await getTenantSecret(tenantId, WHATSAPP_BRAND_SECRET_KEYS[brand].phoneNumberId)
    if (configured && configured === phoneNumberId) return brand
  }
  if (fallbackBrand) return fallbackBrand
  console.error('[whatsapp webhook] no configured brand matches phone_number_id', phoneNumberId, 'for tenant', tenantId)
  return null
}

export function createWhatsappWebhookHandlers(endpointBrand?: WhatsappBrand) {
  // Per-brand secrets only exist for a number that sits in its own Meta App — otherwise
  // the shared ones apply.
  const brandSecret = async (tenantId: string, kind: 'webhookSecret' | 'appSecret') => {
    const own = endpointBrand ? WHATSAPP_BRAND_WEBHOOK_SECRET_KEYS[endpointBrand]?.[kind] : undefined
    const value = own ? await getTenantSecret(tenantId, own) : null
    return value || getTenantSecret(tenantId, kind === 'webhookSecret' ? 'whatsappWebhookSecret' : 'whatsappAppSecret')
  }

  // ── GET: Meta's webhook verification handshake ──────────────────────────────
  async function GET(request: NextRequest) {
    const tenantSlug = request.nextUrl.searchParams.get('tenant')
    const resolved = await resolveTenantBySlugFull(tenantSlug)
    if (!resolved) return NextResponse.json({ error: 'Unknown or inactive tenant' }, { status: 400 })

    const verifyToken = await brandSecret(resolved.tenant.id, 'webhookSecret')
    const mode = request.nextUrl.searchParams.get('hub.mode')
    const token = request.nextUrl.searchParams.get('hub.verify_token')
    const challenge = request.nextUrl.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && challenge && verifyToken && token === verifyToken) {
      return new NextResponse(challenge, { status: 200 })
    }
    // Diagnostics for a failed handshake — lengths/prefixes only, never the full tokens.
    const ownKey = endpointBrand ? WHATSAPP_BRAND_WEBHOOK_SECRET_KEYS[endpointBrand]?.webhookSecret : undefined
    const ownSet = ownKey ? !!(await getTenantSecret(resolved.tenant.id, ownKey)) : false
    console.warn('[whatsapp webhook] verification failed', {
      tenant: resolved.tenant.slug,
      endpointBrand: endpointBrand ?? 'shared',
      tokenSource: ownSet ? ownKey : 'whatsappWebhookSecret (or env WHATSAPP_WEBHOOK_SECRET)',
      mode,
      hasChallenge: !!challenge,
      received: token ? { length: token.length, prefix: token.slice(0, 4) } : null,
      expected: verifyToken ? { length: verifyToken.length, prefix: verifyToken.slice(0, 4) } : null,
    })
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
    // Tap on a template's quick-reply button / an interactive message's button or list row.
    button?: { text?: string; payload?: string }
    interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string; description?: string } }
    reaction?: { emoji?: string; message_id?: string }
    location?: { latitude: number; longitude: number; name?: string; address?: string }
    // Present when this message is a "swipe to reply" quote of an earlier message —
    // `id` is the WAMID (providerMessageId) of the message being replied to.
    context?: { id: string }
  }
  interface CloudApiStatus {
    id: string; status: string; timestamp: string; recipient_id: string
    errors?: { code: number; title?: string; message?: string; error_data?: { details?: string } }[]
  }
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
  async function POST(request: NextRequest) {
    const tenantSlug = request.nextUrl.searchParams.get('tenant')
    const resolved = await resolveTenantBySlugFull(tenantSlug)
    if (!resolved) return NextResponse.json({ error: 'Unknown or inactive tenant' }, { status: 400 })
    const { db, tenant } = resolved

    const rawBody = await request.text()
    const appSecret = await brandSecret(tenant.id, 'appSecret')
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
    // Receipts are batched by Meta — one realtime ping for the whole delivery is enough.
    let statusChanged = false

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        const brand = await resolveBrand(tenant.id, value.metadata?.phone_number_id, endpointBrand)
        const accessToken = brand ? await getTenantSecret(tenant.id, WHATSAPP_BRAND_SECRET_KEYS[brand].apiToken) : null

        // Delivery/read receipts for messages we sent
        for (const status of value.statuses ?? []) {
          const mapped = status.status.toUpperCase()
          if (!['SENT', 'DELIVERED', 'READ', 'FAILED'].includes(mapped)) continue
          // A `failed` status carries Meta's reason (e.g. 131042 payment issue, 131049
          // per-user marketing limit) — keep it so staff can see why, not just a red icon.
          const err = status.errors?.[0]
          const errorMessage = mapped === 'FAILED' && err
            ? `(#${err.code}) ${err.title ?? err.message ?? 'Failed'}${err.error_data?.details ? ` — ${err.error_data.details}` : ''}`
            : undefined
          if (errorMessage) console.error('[whatsapp] delivery failed', status.id, errorMessage)
          const { count } = await db.whatsappMessage.updateMany({
            where: { providerMessageId: status.id },
            data: { status: mapped as 'SENT' | 'DELIVERED' | 'READ' | 'FAILED', ...(errorMessage && { errorMessage }) },
          }).catch(() => ({ count: 0 }))
          if (count) statusChanged = true
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
          let mediaType: string | null = null
          // Downloaded after the message is saved and Meta has been answered — see below.
          let pendingMediaId: string | null = null

          if (msg.type === 'text') {
            text = msg.text?.body ?? null
          } else if (msg.type === 'button') {
            text = msg.button?.text ?? msg.button?.payload ?? null
          } else if (msg.type === 'interactive') {
            text = msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? null
          } else if (msg.type === 'reaction') {
            // An empty emoji means the customer removed their reaction — nothing to show.
            if (!msg.reaction?.emoji) continue
            text = `Reacted ${msg.reaction.emoji}`
          } else if (msg.type === 'location' && msg.location) {
            const { latitude, longitude, name, address } = msg.location
            text = `📍 ${[name, address].filter(Boolean).join(' — ') || 'Location'}\nhttps://maps.google.com/?q=${latitude},${longitude}`
          } else if ((MEDIA_TYPES as readonly string[]).includes(msg.type)) {
            const ref = (msg as unknown as Record<string, CloudApiMediaRef | undefined>)[msg.type]
            if (ref?.id) {
              pendingMediaId = ref.id
              mediaType = ref.mime_type ?? (msg.type === 'sticker' ? 'image/webp' : `${msg.type === 'document' ? 'application' : msg.type}/octet-stream`)
            }
            text = ref?.caption ?? null
          } else {
            text = `[Unsupported message type: ${msg.type}]`
          }

          const preview = text ?? (!mediaType ? '' : mediaType.startsWith('image/') ? '📷 Photo' : mediaType.startsWith('video/') ? '🎥 Video' : mediaType.startsWith('audio/') ? '🎤 Audio' : '📎 Attachment')
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
          const existing = await db.whatsappConversation.findUnique({ where: conversationKey, select: { id: true, leadId: true, category: true, lastInboundAt: true } })
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

          const saved = await db.whatsappMessage.create({
            data: { conversationId: conversation.id, direction: 'IN', body: text, mediaUrl: null, mediaType, status: 'DELIVERED', providerMessageId: msg.id, replyToId: quoted?.id ?? null },
            select: { id: true },
          })
          emitTenantEvent(tenant.id, 'chat')

          // Media is fetched from Meta and re-hosted on R2 in the background — a big video
          // can take many seconds, and holding the webhook response that long makes Meta
          // retry/throttle deliveries (and delays every other message in the batch). The
          // bubble shows "loading" until mediaUrl lands; a failure is recorded on the row.
          // Relies on the long-running single Node process (see src/lib/realtime-bus.ts).
          if (pendingMediaId) {
            const mediaId = pendingMediaId
            void (async () => {
              const stored = accessToken ? await fetchAndStoreMedia(mediaId, accessToken) : null
              await db.whatsappMessage.update({
                where: { id: saved.id },
                data: stored ? { mediaUrl: stored.url, mediaType: stored.mimeType } : { errorMessage: 'Media could not be downloaded from WhatsApp' },
              })
              emitTenantEvent(tenant.id, 'chat')
            })().catch(e => console.error('[whatsapp webhook] background media store failed', mediaId, e))
          }

          // Existing Lead/Guest with this number → link/categorise the chat right away; an
          // unknown number gets a new Lead (see src/lib/whatsapp-lead.ts) — also for an older chat
          // still UNSORTED without one. Then the contact goes into the lead's history: always when
          // the chat just got its Lead, else when they'd been quiet 24h+ (src/lib/lead-contact.ts).
          // Never blocks acking the webhook.
          try {
            let leadId = existing?.leadId ?? null
            let created = false
            if (!leadId && (isNewConversation || existing?.category === 'UNSORTED')) {
              ({ leadId, created } = await autoLinkNewConversation(db, conversation.id, { createLead: true }))
            }
            const justLinked = !!leadId && !existing?.leadId
            if (leadId && (justLinked || (existing && isNewContactSession(existing.lastInboundAt)))) {
              await recordLeadContact(db, { leadId, channel: 'WHATSAPP', brand, whatsappConversationId: conversation.id, message: preview, isFirstContact: created })
            }
          } catch (e) {
            console.error('[whatsapp webhook] lead link/history failed', e)
          }

          // Notice for whichever sales rep this chat is assigned to — in-app bell (toast +
          // chime, see src/app/page.tsx's 'chat' SSE handler) and a browser/OS push so they
          // still hear about it if the app isn't open. Best-effort, fire-and-forget: a
          // failure here shouldn't hold up acking the webhook to Meta.
          const notifTitle = `WhatsApp from ${contactName || msg.from}`
          const notifBody = preview || 'New message'
          if (conversation.assignedToId && isViewing(tenant.id, conversation.assignedToId, conversation.id)) {
            // The rep has this chat open right now — the message just appears in their thread
            // (the 'chat' event above), so a bell/push on top of it would only be noise.
          } else if (conversation.assignedToId) {
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

    if (statusChanged) emitTenantEvent(tenant.id, 'chat')
    if (hasUnroutedMessages) {
      return NextResponse.json({ error: 'Message received on a WhatsApp number that is not configured for any brand' }, { status: 503 })
    }
    return NextResponse.json({ ok: true })
  }

  return { GET, POST }
}
