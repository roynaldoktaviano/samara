import { NextResponse } from 'next/server'
import { chatRole } from '@/lib/role-utils'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { WHATSAPP_BRANDS, type WhatsappBrand } from '@/lib/whatsapp-brands'
import { instagramConversationScope } from '@/lib/whatsapp-distribution'
import type { ChatPlatform } from '../route'

export type UnreadByBrand = Record<WhatsappBrand, number>
export type InboxUnreadCounts = Record<ChatPlatform, { total: number; byBrand: UnreadByBrand }>

// Red badges on the All Chats platform chips + brand tabs, so a rep can see WHERE the
// sidebar's unread number is. Same scope and same unit (sum of unread messages) as the
// sidebar badge in src/app/page.tsx, so the numbers add up to it.
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = chatRole((session?.user as { role?: string })?.role)
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const waScope = role === 'SALES' ? { OR: [{ assignedToId: session.user.id }, { assignedToId: null }] } : {}
  const [wa, meta] = await Promise.all([
    db.whatsappConversation.groupBy({
      by: ['brand'],
      where: { ...waScope, unreadCount: { gt: 0 } },
      _sum: { unreadCount: true },
    }).catch(() => []),
    db.instagramConversation.groupBy({
      by: ['platform', 'brand'],
      where: { AND: [instagramConversationScope(role, session.user.id), { unreadCount: { gt: 0 } }] },
      _sum: { unreadCount: true },
    }).catch(() => []),
  ])

  const empty = () => ({ total: 0, byBrand: Object.fromEntries(WHATSAPP_BRANDS.map(b => [b, 0])) as UnreadByBrand })
  const counts: InboxUnreadCounts = { whatsapp: empty(), instagram: empty(), messenger: empty() }
  for (const r of wa) {
    const n = r._sum.unreadCount ?? 0
    counts.whatsapp.total += n
    counts.whatsapp.byBrand[r.brand] += n
  }
  for (const r of meta) {
    const n = r._sum.unreadCount ?? 0
    const p = counts[r.platform === 'MESSENGER' ? 'messenger' : 'instagram']
    p.total += n
    // A DM whose account isn't mapped to a brand yet still counts toward the platform chip.
    if (r.brand) p.byBrand[r.brand] += n
  }
  return NextResponse.json(counts)
}
