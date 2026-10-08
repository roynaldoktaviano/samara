import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import type { WhatsappBrand } from '@/lib/whatsapp-brands'
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
}

// Merges the three channels' separate conversation lists (WhatsApp/Instagram/Email each
// stay their own model — see prisma/schema.prisma) into one recency-sorted list for the
// "All Chats" inbox view. Read-only summary; replying still happens in the per-channel
// screen once you click through (see UnifiedInbox's onOpenConversation).
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  // allSettled so one channel's failure (e.g. a column missing after an un-pushed schema
  // change) doesn't blank the whole inbox — the other channels still show.
  const [waRes, igRes, emailRes] = await Promise.allSettled([
    db.whatsappConversation.findMany({
      // SALES: their own chats plus unassigned ones they can claim (see salesCanAccessConversation).
      where: role === 'SALES' ? { OR: [{ assignedToId: session.user.id }, { assignedToId: null }] } : undefined,
      orderBy: { lastMessageAt: 'desc' },
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
    }),
    db.instagramConversation.findMany({
      where: instagramConversationScope(role, session.user.id),
      orderBy: { lastMessageAt: 'desc' },
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
    }),
    db.emailInboxConversation.findMany({
      where: emailConversationScope(role, session.user.id),
      orderBy: { lastMessageAt: 'desc' },
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
    }),
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
