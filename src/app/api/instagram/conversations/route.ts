import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { instagramConversationScope } from '@/lib/whatsapp-distribution'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = await getDb(session)
  // `?unread=1` — just the unread rows' counts, for the sidebar badge (refetched on every
  // realtime 'chat' event, so it shouldn't drag the whole list along).
  if (req.nextUrl.searchParams.get('unread')) {
    return NextResponse.json(await db.instagramConversation.findMany({ where: { AND: [instagramConversationScope(role, session.user.id), { unreadCount: { gt: 0 } }] }, select: { id: true, unreadCount: true } }))
  }
  const conversations = await db.instagramConversation.findMany({
    where: instagramConversationScope(role, session.user.id),
    orderBy: { lastMessageAt: 'desc' },
    include: { assignedTo: { select: { id: true, name: true } } },
  })
  return NextResponse.json(conversations)
}
