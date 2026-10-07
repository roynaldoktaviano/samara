import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { emailConversationScope } from '@/lib/email-inbox'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = await getDb(session)
  const conversation = await db.emailInboxConversation.findFirst({
    where: { id, ...emailConversationScope(role, session.user.id) },
    include: { messages: { orderBy: { createdAt: 'asc' } }, assignedTo: { select: { id: true, name: true } } },
  })
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(conversation)
}

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = await getDb(session)
  const { count } = await db.emailInboxConversation.updateMany({ where: { id, ...emailConversationScope(role, session.user.id) }, data: { unreadCount: 0 } })
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const conversation = await db.emailInboxConversation.findUnique({ where: { id } })
  emitTenantEvent(session.user.tenantId, 'chat')
  return NextResponse.json(conversation)
}
