import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { sendEmailInboxReply } from '@/lib/email-inbox'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { body: rawText, attachmentUrls } = await req.json()
  const text: string | undefined = rawText?.trim() || undefined
  const attachments: string[] = Array.isArray(attachmentUrls) ? attachmentUrls : []
  if (!text && attachments.length === 0) return NextResponse.json({ error: 'Message or attachment is required' }, { status: 400 })

  const db = await getDb(session)
  const conversation = await db.emailInboxConversation.findUnique({ where: { id } })
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const message = await db.emailInboxMessage.create({
    data: {
      conversationId: id,
      direction: 'OUT',
      body: text ?? null,
      attachmentUrls: attachments,
      status: 'PENDING',
      sentByUserId: session.user.id,
      sentByName: session.user.name ?? session.user.email ?? 'Admin',
    },
  })
  await db.emailInboxConversation.update({
    where: { id },
    data: { lastMessageAt: new Date(), lastMessagePreview: text ?? '📎 Attachment' },
  })

  const tenantId = (session.user as { tenantId?: string }).tenantId
  const result = tenantId
    ? await sendEmailInboxReply(tenantId, conversation.fromEmail, conversation.subject, text ?? '')
    : { ok: false, error: 'No tenant on session' }

  const updated = await db.emailInboxMessage.update({
    where: { id: message.id },
    data: result.ok ? { status: 'SENT', providerMessageId: result.providerMessageId } : { status: 'FAILED' },
  })

  return NextResponse.json({ message: updated, providerError: result.ok ? undefined : result.error })
}
