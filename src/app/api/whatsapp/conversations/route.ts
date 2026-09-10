import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = await getDb(session)
  // A SALES rep only sees chats round-robin'd to them; ADMIN sees everything.
  const conversations = await db.whatsappConversation.findMany({
    where: role === 'SALES' ? { assignedToId: session.user.id } : undefined,
    orderBy: { lastMessageAt: 'desc' },
  })
  return NextResponse.json(conversations)
}
