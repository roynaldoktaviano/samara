import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { sendWhatsappMessage } from '@/lib/whatsapp'

// Admin composes a reply from the Chat UI. The message is saved immediately
// (so the thread always reflects what was sent from here, regardless of
// provider status), then handed to the WhatsApp API — if that's not wired up
// yet for this tenant, the message just sits as FAILED with an error note.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { body: rawText, mediaUrl, mediaType, replyToId } = await req.json()
  const text: string | undefined = rawText?.trim() || undefined
  if (!text && !mediaUrl) return NextResponse.json({ error: 'Message or attachment is required' }, { status: 400 })

  const db = await getDb(session)
  const conversation = await db.whatsappConversation.findUnique({ where: { id } })
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (replyToId) {
    const quoted = await db.whatsappMessage.findFirst({ where: { id: replyToId, conversationId: id } })
    if (!quoted) return NextResponse.json({ error: 'Message being replied to was not found' }, { status: 400 })
  }

  const message = await db.whatsappMessage.create({
    data: {
      conversationId: id,
      direction: 'OUT',
      body: text ?? null,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      replyToId: replyToId || null,
      status: 'PENDING',
      sentByUserId: session.user.id,
      sentByName: session.user.name ?? session.user.email ?? 'Admin',
    },
    include: { replyTo: { select: { id: true, body: true, direction: true, mediaType: true } } },
  })
  await db.whatsappConversation.update({
    where: { id },
    data: { lastMessageAt: new Date(), lastMessagePreview: text ?? (mediaUrl ? '📎 Attachment' : '') },
  })

  const tenantId = (session.user as { tenantId?: string }).tenantId
  const result = tenantId
    ? await sendWhatsappMessage(tenantId, conversation.phone, text ?? '', mediaUrl || undefined, mediaType || undefined)
    : { ok: false, error: 'No tenant on session' }

  const updated = await db.whatsappMessage.update({
    where: { id: message.id },
    data: result.ok
      ? { status: 'SENT', providerMessageId: result.providerMessageId }
      : { status: 'FAILED' },
    include: { replyTo: { select: { id: true, body: true, direction: true, mediaType: true } } },
  })

  return NextResponse.json({ message: updated, providerError: result.ok ? undefined : result.error })
}
