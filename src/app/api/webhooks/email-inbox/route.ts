import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'

// Inbound-email webhook placeholder — point whichever provider gets connected
// (Postmark inbound webhook, SendGrid inbound parse, Resend inbound, etc.) at:
//   https://<app-domain>/api/webhooks/email-inbox?tenant=<slug>
//
// Body shape below is a normalized placeholder ({ fromEmail, fromName, subject,
// text, attachmentUrls, messageId }) — adjust the parsing to match whatever the
// actual connected provider sends.
interface InboundBody {
  fromEmail?: string
  fromName?: string
  subject?: string
  text?: string
  attachmentUrls?: string[]
  messageId?: string
}

export async function POST(request: NextRequest) {
  const tenantSlug = request.nextUrl.searchParams.get('tenant')
  const resolved = await resolveTenantBySlugFull(tenantSlug)
  if (!resolved) return NextResponse.json({ error: 'Unknown or inactive tenant' }, { status: 400 })
  const { db, tenant } = resolved

  const secret = await getTenantSecret(tenant.id, 'emailInboxWebhookSecret')
  if (secret) {
    const provided = request.headers.get('x-webhook-secret') ?? request.nextUrl.searchParams.get('secret')
    if (provided !== secret) return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
  }

  const raw = await request.json().catch(() => null) as InboundBody | null
  if (!raw?.fromEmail) return NextResponse.json({ error: 'Missing fromEmail' }, { status: 400 })

  const attachments = Array.isArray(raw.attachmentUrls) ? raw.attachmentUrls : []
  const preview = raw.text ?? (attachments.length ? '📎 Attachment' : '')

  if (raw.messageId) {
    const dup = await db.emailInboxMessage.findUnique({ where: { providerMessageId: raw.messageId } })
    if (dup) return NextResponse.json({ ok: true, duplicate: true })
  }

  const conversation = await db.emailInboxConversation.upsert({
    where: { fromEmail: raw.fromEmail },
    create: { fromEmail: raw.fromEmail, fromName: raw.fromName ?? null, subject: raw.subject ?? '(no subject)', lastMessagePreview: preview, unreadCount: 1 },
    update: { fromName: raw.fromName ?? undefined, lastMessageAt: new Date(), lastMessagePreview: preview, unreadCount: { increment: 1 } },
  })

  await db.emailInboxMessage.create({
    data: { conversationId: conversation.id, direction: 'IN', body: raw.text ?? null, attachmentUrls: attachments, status: 'DELIVERED', providerMessageId: raw.messageId ?? null },
  })

  return NextResponse.json({ ok: true })
}
