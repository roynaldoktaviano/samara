'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, MessageCircle, Instagram, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatChannel, UnifiedInboxItem } from '@/app/api/chat/inbox/route'
import { WHATSAPP_BRANDS, WHATSAPP_BRAND_LABELS, type WhatsappBrand } from '@/lib/whatsapp-brands'
import WhatsAppThread from '@/components/whatsapp/WhatsAppThread'
import InstagramThread from '@/components/instagram/InstagramThread'

interface SalesUser { id: string; name: string | null; email: string }

const CHANNEL_BADGE: Record<ChatChannel, { icon: typeof MessageCircle; color: string }> = {
  whatsapp:  { icon: MessageCircle, color: '#25D366' },
  instagram: { icon: Instagram,     color: '#E1306C' },
  email:     { icon: Mail,          color: '#3B82F6' },
}

function timeLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

/**
 * Combined WhatsApp + Instagram inbox — one list, one thread pane, no separate screens to
 * flip between (that's the whole point: replying doesn't need leaving this view). Email
 * stays a genuinely separate screen (different UI on purpose, not chat-bubble shaped) — an
 * email row here still hands off via onOpenEmail rather than opening inline.
 */
export default function UnifiedInbox({ onOpenEmail }: { onOpenEmail: (id: string) => void }) {
  const { data: session } = useSession()
  const userRole = (session?.user as { role?: string })?.role ?? ''
  const isAdmin = userRole === 'ADMIN'

  const [items, setItems] = useState<UnifiedInboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState<'all' | WhatsappBrand>('all')
  const [salesFilter, setSalesFilter] = useState('all')
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([])
  const [selected, setSelected] = useState<{ channel: 'whatsapp' | 'instagram'; id: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/chat/inbox')
    if (res.ok) setItems(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [load])

  // Only ADMIN sees every chat, so the "assigned to" filter is only meaningful for them —
  // a SALES rep's list is already scoped server-side to just their own conversations.
  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/users')
      .then(r => r.ok ? r.json() : [])
      .then((users: (SalesUser & { role: string })[]) => setSalesUsers(users.filter(u => u.role === 'SALES')))
      .catch(() => {})
  }, [isAdmin])

  const filtered = useMemo(() => {
    let list = items
    if (brandFilter !== 'all') list = list.filter(i => i.channel === 'whatsapp' && i.brand === brandFilter)
    if (salesFilter !== 'all') list = list.filter(i => i.channel === 'whatsapp' && i.assignedToId === salesFilter)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter(i => i.name.toLowerCase().includes(q) || i.preview?.toLowerCase().includes(q))
    return list
  }, [items, search, salesFilter, brandFilter])

  function openItem(item: UnifiedInboxItem) {
    if (item.channel === 'email') { onOpenEmail(item.id); return }
    setSelected({ channel: item.channel, id: item.id })
    if (item.unreadCount > 0) setItems(prev => prev.map(p => p.id === item.id && p.channel === item.channel ? { ...p, unreadCount: 0 } : p))
  }

  return (
    <div className="h-[calc(100vh-6rem)] flex rounded-xl border overflow-hidden bg-card">
      {/* Conversation list */}
      <div className="w-80 shrink-0 border-r flex flex-col">
        <div className="px-4 py-4 border-b">
          <h2 className="text-lg font-bold tracking-tight">All Chats</h2>
          <p className="text-xs text-muted-foreground mt-0.5">WhatsApp &amp; Instagram, newest first</p>
        </div>
        <div className="px-3 pt-3 border-b pb-3">
          <Tabs value={brandFilter} onValueChange={v => setBrandFilter(v as 'all' | WhatsappBrand)}>
            <TabsList className="w-full">
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              {WHATSAPP_BRANDS.map(b => (
                <TabsTrigger key={b} value={b} className="text-xs">{WHATSAPP_BRAND_LABELS[b]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or message…" className="pl-8 h-9" />
          </div>
          {isAdmin && salesUsers.length > 0 && (
            <Select value={salesFilter} onValueChange={setSalesFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Filter by sales rep" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sales</SelectItem>
                {salesUsers.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name ?? u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center p-6">No conversations yet.</p>
          ) : (
            filtered.map(item => {
              const badge = CHANNEL_BADGE[item.channel]
              const BadgeIcon = badge.icon
              const unread = item.unreadCount > 0
              const isActive = selected?.channel === item.channel && selected.id === item.id
              return (
                <button
                  key={`${item.channel}:${item.id}`}
                  onClick={() => openItem(item)}
                  className={cn('w-full flex items-center gap-3 px-4 py-3 text-left border-b transition-colors', isActive ? 'bg-muted/60' : 'hover:bg-muted/40')}
                >
                  <div className="relative shrink-0">
                    <Avatar className="size-10">
                      {item.avatarUrl && <AvatarImage src={item.avatarUrl} alt={item.name} />}
                      <AvatarFallback className="text-xs font-semibold bg-muted">{initials(item.name)}</AvatarFallback>
                    </Avatar>
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full flex items-center justify-center ring-2 ring-white"
                      style={{ backgroundColor: badge.color }}
                    >
                      <BadgeIcon className="h-2.5 w-2.5 text-white" />
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn('text-sm truncate', unread ? 'font-semibold' : 'font-medium')}>{item.name}</p>
                      <span className={cn('text-[10px] shrink-0', unread ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                        {timeLabel(item.lastMessageAt)}
                      </span>
                    </div>
                    <p className={cn('text-xs truncate mt-0.5', unread ? 'text-foreground' : 'text-muted-foreground')}>
                      {item.preview || '—'}
                    </p>
                    {isAdmin && item.channel === 'whatsapp' && item.assignedToName && (
                      <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">Sales: {item.assignedToName}</p>
                    )}
                  </div>

                  {unread && <span className="shrink-0 h-2 w-2 rounded-full bg-red-500" />}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Thread */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          <div className="text-center">
            <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
            Select a conversation to start replying
          </div>
        </div>
      ) : selected.channel === 'whatsapp' ? (
        <WhatsAppThread key={selected.id} conversationId={selected.id} onConversationUpdate={load} />
      ) : (
        <InstagramThread key={selected.id} conversationId={selected.id} onConversationUpdate={load} />
      )}
    </div>
  )
}
