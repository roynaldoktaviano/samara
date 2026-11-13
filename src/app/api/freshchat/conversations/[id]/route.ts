import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { PrismaClient } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { canAccessFreshchat } from '@/lib/freshchat-access'

// One imported Freshchat conversation with all its messages (read-only history).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role
  const db = (await getDb(session)) as unknown as PrismaClient
  if (!(await canAccessFreshchat(db, role, session.user.id, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const c = await db.freshchatConversation.findUnique({
    where: { id },
    select: {
      id: true, channelName: true, channelSource: true, brand: true, userName: true, userPhone: true, status: true,
      assignedAgentName: true, fcCreatedAt: true, lastMessageAt: true, messageCount: true, messagesSyncedAt: true,
      lead: { select: { id: true, name: true, owner: { select: { name: true } } } },
      customer: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: 'asc' }, select: { id: true, actorType: true, actorName: true, messageType: true, text: true, attachments: true, createdAt: true } },
    },
  })
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({
    ...c,
    name: c.lead?.name ?? c.customer?.name ?? c.userName ?? c.userPhone ?? 'Unknown',
    messages: c.messages.map(m => ({
      ...m,
      attachments: ((m.attachments as { kind: string; name: string | null; contentType: string | null; url: string; storedUrl: string | null }[] | null) ?? [])
        .map(a => ({ kind: a.kind, name: a.name, contentType: a.contentType, url: a.storedUrl ?? a.url, stored: !!a.storedUrl })),
    })),
  })
}
