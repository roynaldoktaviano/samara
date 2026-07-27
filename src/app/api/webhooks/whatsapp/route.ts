import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'

// Inbound WhatsApp messages land here from whichever provider gets wired up
// (Cloud API, Twilio, Fonnte, Wablas, Qontak, ...). Point that provider's
// webhook at `https://<app-domain>/api/webhooks/whatsapp?tenant=<slug>`
// (defaults to 'samara' when omitted, matching the other webhooks in this app)
// and set a WhatsApp Webhook Secret for the tenant in Super Admin so this can
// verify the sender — sent back as `x-webhook-secret` or `?secret=`.
//
// The body shape below is a normalized placeholder ({ phone, name, message,
// mediaUrl, mediaType, messageId }) — adjust this parsing to match whatever
// payload the actual provider sends; they all differ.
interface InboundBody {
  phone?: string
  from?: string
  name?: string
  contactName?: string
  message?: string
  body?: string
  text?: string
  mediaUrl?: string
  mediaType?: string
  messageId?: string
  id?: string
}

export async function POST(request: NextRequest) {
  const tenantSlug = request.nextUrl.searchParams.get('tenant')
  const resolved = await resolveTenantBySlugFull(tenantSlug)
  if (!resolved) return NextResponse.json({ error: 'Unknown or inactive tenant' }, { status: 400 })
  const { db, tenant } = resolved

  const secret = await getTenantSecret(tenant.id, 'whatsappWebhookSecret')
  if (secret) {
    const provided = request.headers.get('x-webhook-secret') ?? request.nextUrl.searchParams.get('secret')
    if (provided !== secret) return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
  }

  const raw = await request.json().catch(() => null) as InboundBody | null
  if (!raw) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const phone = raw.phone ?? raw.from
  if (!phone) return NextResponse.json({ error: 'Missing phone/from' }, { status: 400 })
  const contactName = raw.name ?? raw.contactName ?? null
  const text = raw.message ?? raw.body ?? raw.text ?? null
  const mediaUrl = raw.mediaUrl ?? null
  const mediaType = raw.mediaType ?? null
  const providerMessageId = raw.messageId ?? raw.id ?? null
  const preview = text ?? (mediaUrl ? '📎 Attachment' : '')

  if (providerMessageId) {
    const dup = await db.whatsappMessage.findUnique({ where: { providerMessageId } })
    if (dup) return NextResponse.json({ ok: true, duplicate: true })
  }

  const conversation = await db.whatsappConversation.upsert({
    where: { phone },
    create: { phone, contactName, lastMessagePreview: preview, unreadCount: 1 },
    update: { contactName: contactName ?? undefined, lastMessageAt: new Date(), lastMessagePreview: preview, unreadCount: { increment: 1 } },
  })

  await db.whatsappMessage.create({
    data: { conversationId: conversation.id, direction: 'IN', body: text, mediaUrl, mediaType, status: 'DELIVERED', providerMessageId },
  })

  return NextResponse.json({ ok: true })
}
