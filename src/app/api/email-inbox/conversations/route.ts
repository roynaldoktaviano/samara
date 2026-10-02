import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { sendEmailInboxReply } from '@/lib/email-inbox'

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = await getDb(session)
  const conversations = await db.emailInboxConversation.findMany({ orderBy: { lastMessageAt: 'desc' } })
  return NextResponse.json(conversations)
}

// Starts (or continues) a thread with someone who hasn't necessarily emailed in yet — used by
// Leads' "Follow up by Email". Threads are keyed by the contact's address, so an existing one
// is reused and its subject switched to this new one.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { to: rawTo, name, subject: rawSubject, body: rawBody } = await req.json()
  const to = String(rawTo ?? '').trim()
  const subject = String(rawSubject ?? '').trim()
  const text = String(rawBody ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
  if (!subject) return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'Message is required' }, { status: 400 })

  const db = await getDb(session)
  const conversation = await db.emailInboxConversation.upsert({
    where: { fromEmail: to },
    update: { subject, lastMessageAt: new Date(), lastMessagePreview: text },
    create: { fromEmail: to, fromName: name?.trim() || null, subject, lastMessageAt: new Date(), lastMessagePreview: text },
  })

  const message = await db.emailInboxMessage.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUT',
      body: text,
      attachmentUrls: [],
      status: 'PENDING',
      sentByUserId: session.user.id,
      sentByName: session.user.name ?? session.user.email ?? 'Admin',
    },
  })

  const tenantId = (session.user as { tenantId?: string }).tenantId
  const result = tenantId
    ? await sendEmailInboxReply(tenantId, to, subject, text)
    : { ok: false, error: 'No tenant on session' }

  await db.emailInboxMessage.update({
    where: { id: message.id },
    data: result.ok ? { status: 'SENT', providerMessageId: result.providerMessageId } : { status: 'FAILED' },
  })

  return NextResponse.json({ conversationId: conversation.id, providerError: result.ok ? undefined : result.error })
}
