import { NextRequest, NextResponse } from 'next/server'
import { Resend, type WebhookEventPayload } from 'resend'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { putToR2, isR2Configured } from '@/lib/r2'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { parseAddress, repEmailForInboundAddress } from '@/lib/email-inbox'
import { pickNextSalesUserId } from '@/lib/whatsapp-distribution'
import { sendPushToUser } from '@/lib/push'

// Resend Inbound webhook (event: email.received). Point the Resend webhook at:
//   https://<app-domain>/api/webhooks/email-inbox?tenant=<slug>
// Its signing secret (whsec_…) goes in tenant secret emailInboxWebhookSecret.
//
// The webhook only carries metadata — body and attachments are fetched from the
// Receiving API. Attachments are re-hosted on R2 because Resend's download URLs expire.
//
// Routing for a thread with no owner yet, first match wins:
//   1. mail to rina@<reply domain> (a rep's personal Reply-To, or a Zoho forward from
//      rina@samarayachting.com) → the user whose login email is rina@<from domain>
//   2. the sender is already a Lead with an owner → that owner (lead owner = chat owner)
//   3. otherwise (mail to the shared inquiry@ address) → next rep in the Email pool, on its
//      own rotation (Chat › Leads Distribution)
// A thread that already has an owner keeps it.

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Drops the quoted thread mail clients append below a reply ("On … wrote:", "-----Original Message-----", "> …"). */
function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/)
  const cut = lines.findIndex(l =>
    /^On .+wrote:\s*$/i.test(l.trim()) ||
    /^-{2,}\s*Original Message\s*-{2,}/i.test(l.trim()) ||
    /^From: .+/i.test(l.trim()) && lines.some(x => /^Sent: /i.test(x.trim())))
  const kept = (cut > 0 ? lines.slice(0, cut) : lines)
  while (kept.length && (kept[kept.length - 1].trim() === '' || kept[kept.length - 1].startsWith('>'))) kept.pop()
  return kept.join('\n').trim() || text.trim()
}

export async function POST(request: NextRequest) {
  const tenantSlug = request.nextUrl.searchParams.get('tenant')
  const resolved = await resolveTenantBySlugFull(tenantSlug)
  if (!resolved) return NextResponse.json({ error: 'Unknown or inactive tenant' }, { status: 400 })
  const { db, tenant } = resolved

  const [secret, apiKey, sharedFrom, sharedReplyTo] = await Promise.all([
    getTenantSecret(tenant.id, 'emailInboxWebhookSecret'),
    getTenantSecret(tenant.id, 'resendApiKey'),
    getTenantSecret(tenant.id, 'emailInboxFromAddress'),
    getTenantSecret(tenant.id, 'emailInboxReplyToAddress'),
  ])
  if (!secret || !apiKey) return NextResponse.json({ error: 'emailInboxWebhookSecret / resendApiKey not configured' }, { status: 500 })

  const resend = new Resend(apiKey)
  const payload = await request.text()
  let event: WebhookEventPayload
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get('svix-id') ?? '',
        timestamp: request.headers.get('svix-timestamp') ?? '',
        signature: request.headers.get('svix-signature') ?? '',
      },
      webhookSecret: secret,
    })
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  if (event.type !== 'email.received') return NextResponse.json({ ok: true, ignored: event.type })
  const emailId = event.data.email_id

  const dup = await db.emailInboxMessage.findUnique({ where: { providerMessageId: emailId } })
  if (dup) return NextResponse.json({ ok: true, duplicate: true })

  const { data: email, error } = await resend.emails.receiving.get(emailId)
  // 500 so Resend retries — the email exists, we just couldn't read it yet
  if (error || !email) return NextResponse.json({ error: error?.message ?? 'Could not fetch received email' }, { status: 500 })

  const sender = parseAddress(email.headers?.from ?? email.from)
  const fromEmail = sender.email ?? parseAddress(email.from).email
  if (!fromEmail) return NextResponse.json({ error: 'Missing sender' }, { status: 400 })

  const rawText = email.text?.trim() || (email.html ? htmlToText(email.html) : '')
  const text = rawText ? stripQuotedReply(rawText) : ''

  const existing = await db.emailInboxConversation.findUnique({ where: { fromEmail }, select: { assignedToId: true } })
  let ownerId: string | null = existing?.assignedToId ?? null
  if (!ownerId) {
    const repEmail = repEmailForInboundAddress([...(email.to ?? []), ...(email.received_for ?? [])], sharedFrom, sharedReplyTo)
    const rep = repEmail
      ? await db.user.findFirst({ where: { email: { equals: repEmail, mode: 'insensitive' } }, select: { id: true } })
      : null
    const lead = rep ? null : await db.lead.findFirst({
      where: { deletedAt: null, email: { equals: fromEmail, mode: 'insensitive' }, ownerId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { ownerId: true },
    })
    ownerId = rep?.id ?? lead?.ownerId ?? await pickNextSalesUserId(db, 'SAMARA', 'EMAIL')
  }
  const newlyAssigned = !!ownerId && ownerId !== existing?.assignedToId

  const conversation = await db.emailInboxConversation.upsert({
    where: { fromEmail },
    create: { fromEmail, fromName: sender.name, subject: email.subject || '(no subject)', lastMessagePreview: text || '📎 Attachment', unreadCount: 1, assignedToId: ownerId },
    update: {
      fromName: sender.name ?? undefined, lastMessageAt: new Date(), lastMessagePreview: text || '📎 Attachment', unreadCount: { increment: 1 },
      ...(newlyAssigned ? { assignedToId: ownerId } : {}),
    },
  })

  const attachmentUrls: string[] = []
  if (email.attachments?.length && isR2Configured()) {
    const { data: list } = await resend.emails.receiving.attachments.list({ emailId })
    for (const a of list?.data ?? []) {
      // inline parts are signature logos / embedded images, not real attachments
      if (a.content_disposition === 'inline') continue
      try {
        const res = await fetch(a.download_url)
        if (!res.ok) continue
        const buf = Buffer.from(await res.arrayBuffer())
        const name = (a.filename ?? 'attachment').replace(/[\\/]/g, '_')
        attachmentUrls.push(await putToR2(`email-inbox/${conversation.id}/${Date.now()}-${name}`, buf, a.content_type))
      } catch (e) {
        console.error('[email-inbox webhook] attachment re-host failed', a.id, e)
      }
    }
  }

  await db.emailInboxMessage.create({
    data: {
      conversationId: conversation.id,
      direction: 'IN',
      body: text || null,
      attachmentUrls,
      status: 'DELIVERED',
      providerMessageId: emailId,
      internetMessageId: email.message_id || null,
    },
  })

  if (newlyAssigned && ownerId) {
    const title = `New email: ${sender.name ?? fromEmail}`
    const body = email.subject || '(no subject)'
    db.notification.create({ data: { userId: ownerId, type: 'LEAD_ASSIGNED', title, body } }).catch(() => {})
    sendPushToUser(db, ownerId, { title, body, url: '/' }).catch(() => {})
  }

  emitTenantEvent(tenant.id, 'chat')
  return NextResponse.json({ ok: true })
}
