import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { instagramConversationScope } from '@/lib/whatsapp-distribution'

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = await getDb(session)
  const conversations = await db.instagramConversation.findMany({
    where: instagramConversationScope(role, session.user.id),
    orderBy: { lastMessageAt: 'desc' },
    include: { assignedTo: { select: { id: true, name: true } } },
  })
  return NextResponse.json(conversations)
}
