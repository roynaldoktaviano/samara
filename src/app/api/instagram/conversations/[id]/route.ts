import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = await getDb(session)
  const conversation = await db.instagramConversation.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { replyTo: { select: { id: true, body: true, direction: true, mediaType: true } } },
      },
    },
  })
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(conversation)
}

// Marks a conversation as read (called when the admin opens it).
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = await getDb(session)
  const conversation = await db.instagramConversation.update({ where: { id }, data: { unreadCount: 0 } }).catch(() => null)
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(conversation)
}
