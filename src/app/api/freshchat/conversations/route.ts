import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma, PrismaClient } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { freshchatScope } from '@/lib/freshchat-access'

// Chat › Freshchat list — read-only WhatsApp / Instagram / Messenger / website-chat history
// imported from Freshchat (src/lib/freshchat-import.ts).
//   GET ?q=&source=WHATSAPP|INSTA|FB_NATIVE|FRESHCHAT&page=1
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role
  const db = (await getDb(session)) as unknown as PrismaClient
  const sp = req.nextUrl.searchParams
  const q = sp.get('q')?.trim()
  const source = sp.get('source')
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const take = 50

  const where: Prisma.FreshchatConversationWhereInput = {
    AND: [
      freshchatScope(role, session.user.id),
      { messageCount: { gt: 0 } },
      // Copied into a WhatsApp / IG / Messenger thread already — shown there, not here
      { erpThreadId: null },
      source ? { channelSource: source } : {},
      q ? { OR: [
        { userName: { contains: q, mode: 'insensitive' } },
        { userPhone: { contains: q } },
        { lead: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { lastMessagePreview: { contains: q, mode: 'insensitive' } },
        { messages: { some: { text: { contains: q, mode: 'insensitive' } } } },
      ] } : {},
    ],
  }
  const [rows, total] = await Promise.all([
    db.freshchatConversation.findMany({
      where, orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }], skip: (page - 1) * take, take,
      select: {
        id: true, channelName: true, channelSource: true, brand: true, userName: true, userPhone: true, status: true,
        lastMessageAt: true, lastMessagePreview: true, messageCount: true, assignedAgentName: true,
        lead: { select: { id: true, name: true, owner: { select: { name: true } } } },
        customer: { select: { id: true, name: true } },
      },
    }),
    db.freshchatConversation.count({ where }),
  ])
  return NextResponse.json({
    total, page, pageSize: take,
    items: rows.map(r => ({
      id: r.id,
      name: r.lead?.name ?? r.customer?.name ?? r.userName ?? r.userPhone ?? 'Unknown',
      channelName: r.channelName, channelSource: r.channelSource, brand: r.brand, status: r.status,
      lastMessageAt: r.lastMessageAt, preview: r.lastMessagePreview, messageCount: r.messageCount,
      agent: r.assignedAgentName, owner: r.lead?.owner?.name ?? null, leadId: r.lead?.id ?? null, customerId: r.customer?.id ?? null,
    })),
  })
}
