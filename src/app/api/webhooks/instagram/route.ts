import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { isHttpUrl } from '@/lib/url-safety'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { pickNextSalesUserId } from '@/lib/whatsapp-distribution'
import { sendPushToUser } from '@/lib/push'

// Instagram DM webhook placeholder — point whichever provider gets connected
// (Meta's Instagram Messaging API, or a third-party inbox provider) at:
//   https://<app-domain>/api/webhooks/instagram?tenant=<slug>
//
// Body shape below is a normalized placeholder ({ username, name, profilePicUrl,
// message, mediaUrl, mediaType, messageId }) — adjust the parsing to match
// whatever the actual connected provider sends.
interface InboundBody {
  username?: string
  name?: string
  profilePicUrl?: string
  message?: string
  mediaUrl?: string
  mediaType?: string
  messageId?: string
}

export async function POST(request: NextRequest) {
  const tenantSlug = request.nextUrl.searchParams.get('tenant')
  const resolved = await resolveTenantBySlugFull(tenantSlug)
  if (!resolved) return NextResponse.json({ error: 'Unknown or inactive tenant' }, { status: 400 })
  const { db, tenant } = resolved

  const secret = await getTenantSecret(tenant.id, 'instagramWebhookSecret')
  if (!secret) return NextResponse.json({ error: 'instagramWebhookSecret not configured' }, { status: 500 })
  const provided = request.headers.get('x-webhook-secret') ?? request.nextUrl.searchParams.get('secret')
  if (provided !== secret) return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })

  const raw = await request.json().catch(() => null) as InboundBody | null
  if (!raw?.username) return NextResponse.json({ error: 'Missing username' }, { status: 400 })
  const mediaUrl = isHttpUrl(raw.mediaUrl) ? raw.mediaUrl : null

  const preview = raw.message ?? (mediaUrl ? '📎 Attachment' : '')
  if (raw.messageId) {
    const dup = await db.instagramMessage.findUnique({ where: { providerMessageId: raw.messageId } })
    if (dup) return NextResponse.json({ ok: true, duplicate: true })
  }

  // A brand-new DM gets a sales rep from the Instagram pool (Chat › Leads Distribution, own
  // rotation); an existing one keeps whoever holds it.
  const existing = await db.instagramConversation.findUnique({ where: { igUsername: raw.username }, select: { id: true } })
  const assignedToId = existing ? null : await pickNextSalesUserId(db, 'SAMARA', 'INSTAGRAM')
  const conversation = await db.instagramConversation.upsert({
    where: { igUsername: raw.username },
    create: { igUsername: raw.username, displayName: raw.name ?? null, profilePicUrl: raw.profilePicUrl ?? null, lastMessagePreview: preview, unreadCount: 1, assignedToId },
    update: { displayName: raw.name ?? undefined, profilePicUrl: raw.profilePicUrl ?? undefined, lastMessageAt: new Date(), lastMessagePreview: preview, unreadCount: { increment: 1 } },
  })

  await db.instagramMessage.create({
    data: { conversationId: conversation.id, direction: 'IN', body: raw.message ?? null, mediaUrl, mediaType: raw.mediaType ?? null, status: 'DELIVERED', providerMessageId: raw.messageId ?? null },
  })

  if (conversation.assignedToId) {
    const title = existing ? `Instagram: ${conversation.displayName || conversation.igUsername}` : `Instagram DM baru: ${conversation.displayName || conversation.igUsername}`
    const body = preview || 'Pesan baru'
    db.notification.create({ data: { userId: conversation.assignedToId, type: 'WHATSAPP_MESSAGE', title, body } }).catch(() => {})
    sendPushToUser(db, conversation.assignedToId, { title, body, url: '/' }).catch(() => {})
  }

  emitTenantEvent(tenant.id, 'chat')
  return NextResponse.json({ ok: true })
}
