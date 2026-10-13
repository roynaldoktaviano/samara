import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { salesCanAccessConversation } from '@/lib/whatsapp-distribution'

const PAGE_SIZE = 60
const REPLY_TO_SELECT = { select: { id: true, body: true, direction: true, mediaType: true } } as const

// Returns the newest PAGE_SIZE messages (the thread re-fetches this on every realtime
// 'chat' event, so it must stay small no matter how long the chat gets). `?before=<messageId>`
// pages further back for the "Load older messages" button — in that mode only
// `{ messages, hasMore }` is returned.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const before = req.nextUrl.searchParams.get('before')
  const db = await getDb(session)
  const conversation = await db.whatsappConversation.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      lead: { select: { id: true, name: true, stage: true } },
    },
  })
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (role === 'SALES' && !salesCanAccessConversation(conversation, session.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const cursor = before ? await db.whatsappMessage.findFirst({ where: { id: before, conversationId: id }, select: { createdAt: true } }) : null
  if (before && !cursor) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const page = await db.whatsappMessage.findMany({
    where: { conversationId: id, ...(cursor && { createdAt: { lt: cursor.createdAt } }) },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
    include: { replyTo: REPLY_TO_SELECT },
  })
  const hasMore = page.length > PAGE_SIZE
  const messages = page.slice(0, PAGE_SIZE).reverse()
  if (before) return NextResponse.json({ messages, hasMore })

  // Meta only allows free-form replies within 24h of the customer's own last message —
  // the thread UI uses this to count down and switch to Message Templates once it's closed.
  // lastInboundAt is kept by the webhook; older threads from before that column fall back to a lookup.
  const lastInboundAt = conversation.lastInboundAt ?? (await db.whatsappMessage.findFirst({
    where: { conversationId: id, direction: 'IN' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  }))?.createdAt ?? null
  const windowExpiresAt = lastInboundAt ? new Date(lastInboundAt.getTime() + 24 * 60 * 60 * 1000) : null
  const windowOpen = !!windowExpiresAt && windowExpiresAt.getTime() > Date.now()

  return NextResponse.json({ ...conversation, messages, hasMore, windowOpen, windowExpiresAt })
}

// Marks a conversation as read (called when the admin opens it).
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = await getDb(session)
  const existing = await db.whatsappConversation.findUnique({ where: { id }, select: { assignedToId: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (role === 'SALES' && !salesCanAccessConversation(existing, session.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const conversation = await db.whatsappConversation.update({
    where: { id },
    data: { unreadCount: 0 },
  }).catch(() => null)
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  emitTenantEvent(session.user.tenantId, 'chat')
  return NextResponse.json(conversation)
}
