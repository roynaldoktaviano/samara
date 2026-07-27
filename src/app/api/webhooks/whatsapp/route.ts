import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { putToR2 } from '@/lib/r2'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'

// WhatsApp Cloud API (Meta) webhook — handles both the one-time GET verification
// handshake and the actual POST event deliveries.
//
// Point this at, in the Meta App dashboard → WhatsApp → Configuration:
//   Callback URL:   https://<app-domain>/api/webhooks/whatsapp?tenant=<slug>
//   Verify token:   whatever you set as "WhatsApp Webhook Verify Token" in Super Admin
// Subscribe to the `messages` webhook field.

const GRAPH_VERSION = 'v21.0'

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

  const accessToken = await getTenantSecret(tenant.id, 'whatsappApiToken')

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value

      // Delivery/read receipts for messages we sent
      for (const status of value.statuses ?? []) {
        const mapped = status.status.toUpperCase()
        if (!['SENT', 'DELIVERED', 'READ', 'FAILED'].includes(mapped)) continue
        await db.whatsappMessage.updateMany({
          where: { providerMessageId: status.id },
          data: { status: mapped as 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' },
        }).catch(() => {})
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
        const conversation = await db.whatsappConversation.upsert({
          where: { phone: msg.from },
          create: { phone: msg.from, contactName, lastMessagePreview: preview, unreadCount: 1 },
          update: { contactName: contactName ?? undefined, lastMessageAt: new Date(), lastMessagePreview: preview, unreadCount: { increment: 1 } },
        })

        await db.whatsappMessage.create({
          data: { conversationId: conversation.id, direction: 'IN', body: text, mediaUrl, mediaType, status: 'DELIVERED', providerMessageId: msg.id },
        })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
