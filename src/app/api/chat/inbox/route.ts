import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { WHATSAPP_BRANDS, type WhatsappBrand } from '@/lib/whatsapp-brands'
import { instagramConversationScope } from '@/lib/whatsapp-distribution'
import { emailConversationScope } from '@/lib/email-inbox'

export type ChatChannel = 'whatsapp' | 'instagram' | 'email'

export interface UnifiedInboxItem {
  id: string
  channel: ChatChannel
  name: string
  avatarUrl: string | null
  preview: string | null
  lastMessageAt: string
  unreadCount: number
  // WhatsApp/Instagram/Email — who this chat is assigned to (see src/lib/whatsapp-distribution.ts).
  assignedToId?: string | null
  assignedToName?: string | null
  // WhatsApp only — which of the 3 numbers this chat came in on (see src/lib/whatsapp-brands.ts).
  brand?: WhatsappBrand | null
  // WhatsApp only — set while the customer's latest message hasn't been answered yet
  // (lastInboundAt later than lastOutboundAt): when they started waiting.
  waitingSince?: string | null
}

export type InboxView = 'all' | 'unread' | 'waiting'

// Newest N per channel — the list is re-fetched on every realtime 'chat' event, so it stays
// bounded; anything older is reached through the search box (filtered server-side).
const PER_CHANNEL_LIMIT = 150
const isWaiting = (c: { lastInboundAt: Date | null; lastOutboundAt: Date | null }) =>
  !!c.lastInboundAt && (!c.lastOutboundAt || c.lastInboundAt > c.lastOutboundAt)

// Merges the three channels' separate conversation lists (WhatsApp/Instagram/Email each
// stay their own model — see prisma/schema.prisma) into one recency-sorted list for the
// "All Chats" inbox view. Read-only summary; replying still happens in the per-channel
// screen once you click through (see UnifiedInbox's onOpenConversation).
//
// Query params (all optional): q (name/number/email/last message), brand (WhatsApp brand —
// hides Instagram/Email like the brand tabs always did), assignee (ADMIN: 'unassigned' or a
// user id), view ('unread' | 'waiting' — waiting is WhatsApp-only, the only channel that
// tracks reply timestamps).
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const sp = request.nextUrl.searchParams
  const q = sp.get('q')?.trim() || ''
  const brand = WHATSAPP_BRANDS.find(b => b === sp.get('brand')) ?? null
  const assignee = role === 'ADMIN' ? sp.get('assignee') || null : null
  const view = (['unread', 'waiting'] as const).find(v => v === sp.get('view')) ?? 'all'
  const contains = (field: string) => ({ [field]: { contains: q, mode: 'insensitive' as const } })
  const assigneeWhere = assignee === 'unassigned' ? { assignedToId: null } : assignee ? { assignedToId: assignee } : {}
  const unreadWhere = view === 'unread' ? { unreadCount: { gt: 0 } } : {}
  // Instagram/Email have no brand and no reply timestamps — skip them for those filters.
  const otherChannels = !brand && view !== 'waiting'

  // allSettled so one channel's failure (e.g. a column missing after an un-pushed schema
  // change) doesn't blank the whole inbox — the other channels still show.
  const [waRes, igRes, emailRes] = await Promise.allSettled([
    db.whatsappConversation.findMany({
      where: {
        AND: [
          // SALES: their own chats plus unassigned ones they can claim (see salesCanAccessConversation).
          role === 'SALES' ? { OR: [{ assignedToId: session.user.id }, { assignedToId: null }] } : {},
          brand ? { brand } : {},
          assigneeWhere,
          unreadWhere,
          view === 'waiting' ? { OR: [
            { lastInboundAt: { not: null }, lastOutboundAt: null },
            { lastInboundAt: { gt: db.whatsappConversation.fields.lastOutboundAt } },
          ] } : {},
          q ? { OR: [contains('contactName'), contains('phone'), contains('lastMessagePreview')] } : {},
        ],
      },
      orderBy: { lastMessageAt: 'desc' },
      take: PER_CHANNEL_LIMIT,
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
    }),
    otherChannels ? db.instagramConversation.findMany({
      where: { AND: [
        instagramConversationScope(role, session.user.id), assigneeWhere, unreadWhere,
        q ? { OR: [contains('displayName'), contains('igUsername'), contains('lastMessagePreview')] } : {},
      ] },
      orderBy: { lastMessageAt: 'desc' },
      take: PER_CHANNEL_LIMIT,
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
    }) : Promise.resolve([]),
    otherChannels ? db.emailInboxConversation.findMany({
      where: { AND: [
        emailConversationScope(role, session.user.id), assigneeWhere, unreadWhere,
        q ? { OR: [contains('fromName'), contains('fromEmail'), contains('subject'), contains('lastMessagePreview')] } : {},
      ] },
      orderBy: { lastMessageAt: 'desc' },
      take: PER_CHANNEL_LIMIT,
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
    }) : Promise.resolve([]),
  ])
  const errors: Record<string, string> = {}
  const settled = <T,>(name: string, r: PromiseSettledResult<T[]>): T[] => {
    if (r.status === 'fulfilled') return r.value
    console.error(`[chat/inbox] ${name} query failed:`, r.reason)
    errors[name] = r.reason instanceof Error ? r.reason.message : String(r.reason)
    return []
  }
  const whatsapp = settled('whatsapp', waRes)
  const instagram = settled('instagram', igRes)
  const email = settled('email', emailRes)
  // ADMIN can open /api/chat/inbox?debug=1 to see why a channel came back empty.
  if (role === 'ADMIN' && request.nextUrl.searchParams.get('debug')) return NextResponse.json({ errors })

  const items: UnifiedInboxItem[] = [
    ...whatsapp.map((c): UnifiedInboxItem => ({
      id: c.id, channel: 'whatsapp', name: c.contactName || c.phone, avatarUrl: null,
      preview: c.lastMessagePreview, lastMessageAt: c.lastMessageAt.toISOString(), unreadCount: c.unreadCount,
      assignedToId: c.assignedToId, assignedToName: c.assignedTo?.name || c.assignedTo?.email || null,
      brand: c.brand,
      waitingSince: isWaiting(c) ? c.lastInboundAt!.toISOString() : null,
    })),
    ...instagram.map((c): UnifiedInboxItem => ({
      id: c.id, channel: 'instagram', name: c.displayName || c.igUsername, avatarUrl: c.profilePicUrl,
      preview: c.lastMessagePreview, lastMessageAt: c.lastMessageAt.toISOString(), unreadCount: c.unreadCount,
      assignedToId: c.assignedToId, assignedToName: c.assignedTo?.name || c.assignedTo?.email || null,
    })),
    ...email.map((c): UnifiedInboxItem => ({
      id: c.id, channel: 'email', name: c.fromName || c.fromEmail, avatarUrl: null,
      preview: c.lastMessagePreview ?? c.subject, lastMessageAt: c.lastMessageAt.toISOString(), unreadCount: c.unreadCount,
      assignedToId: c.assignedToId, assignedToName: c.assignedTo?.name || c.assignedTo?.email || null,
    })),
  ]
  items.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))

  return NextResponse.json(items)
}
