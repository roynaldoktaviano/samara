import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { emitTenantEvent } from '@/lib/realtime-bus'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = await getDb(session)
  const conversation = await db.emailInboxConversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
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
  const conversation = await db.emailInboxConversation.update({ where: { id }, data: { unreadCount: 0 } }).catch(() => null)
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  emitTenantEvent(session.user.tenantId, 'chat')
  return NextResponse.json(conversation)
}
