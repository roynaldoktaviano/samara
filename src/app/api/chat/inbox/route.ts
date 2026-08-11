import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export type ChatChannel = 'whatsapp' | 'instagram' | 'email'

export interface UnifiedInboxItem {
  id: string
  channel: ChatChannel
  name: string
  avatarUrl: string | null
  preview: string | null
  lastMessageAt: string
  unreadCount: number
}

// Merges the three channels' separate conversation lists (WhatsApp/Instagram/Email each
// stay their own model — see prisma/schema.prisma) into one recency-sorted list for the
// "All Chats" inbox view. Read-only summary; replying still happens in the per-channel
// screen once you click through (see UnifiedInbox's onOpenConversation).
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const [whatsapp, instagram, email] = await Promise.all([
    db.whatsappConversation.findMany({ orderBy: { lastMessageAt: 'desc' } }),
    db.instagramConversation.findMany({ orderBy: { lastMessageAt: 'desc' } }),
    db.emailInboxConversation.findMany({ orderBy: { lastMessageAt: 'desc' } }),
  ])

  const items: UnifiedInboxItem[] = [
    ...whatsapp.map((c): UnifiedInboxItem => ({
      id: c.id, channel: 'whatsapp', name: c.contactName || c.phone, avatarUrl: null,
      preview: c.lastMessagePreview, lastMessageAt: c.lastMessageAt.toISOString(), unreadCount: c.unreadCount,
    })),
    ...instagram.map((c): UnifiedInboxItem => ({
      id: c.id, channel: 'instagram', name: c.displayName || c.igUsername, avatarUrl: c.profilePicUrl,
      preview: c.lastMessagePreview, lastMessageAt: c.lastMessageAt.toISOString(), unreadCount: c.unreadCount,
    })),
    ...email.map((c): UnifiedInboxItem => ({
      id: c.id, channel: 'email', name: c.fromName || c.fromEmail, avatarUrl: null,
      preview: c.lastMessagePreview ?? c.subject, lastMessageAt: c.lastMessageAt.toISOString(), unreadCount: c.unreadCount,
    })),
  ]
  items.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))

  return NextResponse.json(items)
}
