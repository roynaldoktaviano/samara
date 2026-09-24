import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { salesCanAccessConversation } from '@/lib/whatsapp-distribution'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = await getDb(session)
  const conversation = await db.whatsappConversation.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { replyTo: { select: { id: true, body: true, direction: true, mediaType: true } } },
      },
    },
  })
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (role === 'SALES' && !salesCanAccessConversation(conversation, session.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Meta only allows free-form replies within 24h of the customer's own last message —
  // the thread UI uses this to nudge toward a Message Template once that's closed.
  const lastInbound = await db.whatsappMessage.findFirst({
    where: { conversationId: id, direction: 'IN' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  const windowOpen = !!lastInbound && Date.now() - lastInbound.createdAt.getTime() < 24 * 60 * 60 * 1000

  return NextResponse.json({ ...conversation, windowOpen })
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
