import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { sendWhatsappMessage, sendWhatsappTemplateMessage } from '@/lib/whatsapp'
import { findWhatsappTemplate, renderWhatsappTemplateBody } from '@/lib/whatsapp-templates'
import { claimWhatsappConversation } from '@/lib/whatsapp-distribution'
import { recordStaffReply, syncLeadOwner } from '@/lib/whatsapp-lead'

// Admin composes a reply from the Chat UI. The message is saved immediately
// (so the thread always reflects what was sent from here, regardless of
// provider status), then handed to the WhatsApp API — if that's not wired up
// yet for this tenant, the message just sits as FAILED with an error note.
//
// `templateName`/`templateParams` (instead of `body`) send an approved Message
// Template — required by Meta once the customer hasn't messaged in for 24h, since a
// free-form `body` send would just get rejected outside that window.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { body: rawText, mediaUrl, mediaType, replyToId, templateName, templateLanguage, templateParams } = await req.json()
  const text: string | undefined = rawText?.trim() || undefined
  if (!text && !mediaUrl && !templateName) return NextResponse.json({ error: 'Message or attachment is required' }, { status: 400 })

  const db = await getDb(session)
  const conversation = await db.whatsappConversation.findUnique({ where: { id } })
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (role === 'SALES' && conversation.assignedToId !== session.user.id) {
    if (conversation.assignedToId !== null) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // Replying to an unassigned chat claims it — atomically, so if another rep got there
    // first this reply is refused instead of two reps answering the same customer.
    if (!(await claimWhatsappConversation(db, id, session.user.id))) {
      return NextResponse.json({ error: 'This chat was just taken by another sales rep' }, { status: 409 })
    }
    await syncLeadOwner(db, id, 'CLAIM').catch(() => {})
  }

  let quotedProviderMessageId: string | null = null
  if (replyToId) {
    const quoted = await db.whatsappMessage.findFirst({ where: { id: replyToId, conversationId: id } })
    if (!quoted) return NextResponse.json({ error: 'Message being replied to was not found' }, { status: 400 })
    // Meta only understands its own WAMID — if the quoted message never got one (e.g. it's a
    // send that itself failed), we still save the reply locally but can't quote it on WhatsApp.
    quotedProviderMessageId = quoted.providerMessageId
  }

  const brand = conversation.brand
  const templateDef = templateName ? await findWhatsappTemplate(db, brand, templateName, templateLanguage) : undefined
  if (templateName && !templateDef) return NextResponse.json({ error: 'Unknown template' }, { status: 400 })
  const renderedBody = templateDef ? renderWhatsappTemplateBody(templateDef, templateParams ?? []) : text

  const message = await db.whatsappMessage.create({
    data: {
      conversationId: id,
      direction: 'OUT',
      body: renderedBody ?? null,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      replyToId: replyToId || null,
      templateName: templateDef?.name ?? null,
      status: 'PENDING',
      sentByUserId: session.user.id,
      sentByName: session.user.name ?? session.user.email ?? 'Admin',
    },
    include: { replyTo: { select: { id: true, body: true, direction: true, mediaType: true } } },
  })
  await db.whatsappConversation.update({
    where: { id },
    data: { lastMessageAt: new Date(), lastMessagePreview: renderedBody ?? (mediaUrl ? '📎 Attachment' : '') },
  })

  const tenantId = (session.user as { tenantId?: string }).tenantId
  const result = !tenantId
    ? { ok: false, error: 'No tenant on session' }
    : templateDef
      ? await sendWhatsappTemplateMessage(tenantId, brand, conversation.phone, templateDef.name, templateDef.language, templateParams)
      : await sendWhatsappMessage(tenantId, brand, conversation.phone, text ?? '', mediaUrl || undefined, mediaType || undefined, quotedProviderMessageId || undefined)

  const updated = await db.whatsappMessage.update({
    where: { id: message.id },
    data: result.ok
      ? { status: 'SENT', providerMessageId: result.providerMessageId }
      : { status: 'FAILED' },
    include: { replyTo: { select: { id: true, body: true, direction: true, mediaType: true } } },
  })
  if (result.ok) await recordStaffReply(db, id, session.user.id).catch(e => console.error('[whatsapp] recordStaffReply failed', e))

  return NextResponse.json({ message: updated, providerError: result.ok ? undefined : result.error })
}
