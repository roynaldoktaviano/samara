import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { sendEmailInboxReply, emailConversationScope } from '@/lib/email-inbox'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { body: rawText, attachmentUrls } = await req.json()
  const text: string | undefined = rawText?.trim() || undefined
  const attachments: string[] = Array.isArray(attachmentUrls) ? attachmentUrls : []
  if (!text && attachments.length === 0) return NextResponse.json({ error: 'Message or attachment is required' }, { status: 400 })

  const db = await getDb(session)
  const conversation = await db.emailInboxConversation.findFirst({ where: { id, ...emailConversationScope(role, session.user.id) } })
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
    // Replying to a pool thread claims it
    data: { lastMessageAt: new Date(), lastMessagePreview: text ?? '📎 Attachment', ...(conversation.assignedToId ? {} : { assignedToId: session.user.id }) },
  })

  const lastInbound = await db.emailInboxMessage.findFirst({
    where: { conversationId: id, direction: 'IN', internetMessageId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { internetMessageId: true },
  })
  const subject = /^re:/i.test(conversation.subject) ? conversation.subject : `Re: ${conversation.subject}`

  const tenantId = (session.user as { tenantId?: string }).tenantId
  const result = tenantId
    ? await sendEmailInboxReply(tenantId, conversation.fromEmail, subject, text ?? '', {
        attachmentUrls: attachments,
        inReplyTo: lastInbound?.internetMessageId,
        sender: { name: session.user.name, email: session.user.email },
      })
    : { ok: false, error: 'No tenant on session' }

  const updated = await db.emailInboxMessage.update({
    where: { id: message.id },
    data: result.ok ? { status: 'SENT', providerMessageId: result.providerMessageId } : { status: 'FAILED' },
  })

  return NextResponse.json({ message: updated, providerError: result.ok ? undefined : result.error })
}
