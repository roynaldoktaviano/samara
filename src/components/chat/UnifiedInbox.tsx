'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Search, MessageCircle, Instagram, Mail, Plus, Loader2, Clock, MessageSquarePlus, MessagesSquare, Sailboat, Ship, Anchor } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatChannel, InboxView, UnifiedInboxItem } from '@/app/api/chat/inbox/route'
import { WHATSAPP_BRANDS, WHATSAPP_BRAND_LABELS, type WhatsappBrand } from '@/lib/whatsapp-brands'
import { missingTemplateParams, renderWhatsappTemplateBody } from '@/lib/whatsapp-templates'
import { useWhatsappTemplates, templateKey } from '@/components/whatsapp/useWhatsappTemplates'
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

// "Waiting 12m" on a chat whose customer hasn't been answered yet — amber, then red once it's
// been sitting long enough to cost the lead.
function waitingLabel(since: string, now: number) {
  const mins = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000))
  const text = mins < 60 ? `${mins}m` : mins < 48 * 60 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`
  return { text, urgent: mins >= 30 }
}

const BRAND_TAB_ICON: Record<'all' | WhatsappBrand, typeof MessageCircle> = {
  all: MessagesSquare, SAMARA: Sailboat, MISCHIEF: Ship, OTIUM: Anchor,
}

const VIEW_LABELS: Record<InboxView, string> = { all: 'All', unread: 'Unread', waiting: 'Needs reply' }

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

/**
 * Combined WhatsApp + Instagram inbox — one list, one thread pane, no separate screens to
 * flip between (that's the whole point: replying doesn't need leaving this view). Email
 * stays a genuinely separate screen (different UI on purpose, not chat-bubble shaped) — an
 * email row here still hands off via onOpenEmail rather than opening inline.
 */
export default function UnifiedInbox({ onOpenEmail, onOpenBooking, initialWhatsappId, onDeepLinkHandled }: {
  onOpenEmail: (id: string) => void
  // Contact panel's past-booking links.
  onOpenBooking?: (id: string) => void
  // Opens this WhatsApp chat straight away — used by the WhatsApp Pipeline's "open chat".
  initialWhatsappId?: string | null
  onDeepLinkHandled?: () => void
}) {
  const { data: session } = useSession()
  const userRole = (session?.user as { role?: string })?.role ?? ''
  const isAdmin = userRole === 'ADMIN'

  const [items, setItems] = useState<UnifiedInboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [view, setView] = useState<InboxView>('all')
  const [now, setNow] = useState(() => Date.now())
  const [brandFilter, setBrandFilter] = useState<'all' | WhatsappBrand>('all')
  const [salesFilter, setSalesFilter] = useState('all')
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([])
  const [selected, setSelected] = useState<{ channel: 'whatsapp' | 'instagram'; id: string } | null>(
    initialWhatsappId ? { channel: 'whatsapp', id: initialWhatsappId } : null,
  )
  const [newChatOpen, setNewChatOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Filtering happens server-side (the list is capped to the newest chats per channel, so a
  // client-side filter would miss older ones). Responses can come back out of order when
  // filters change quickly — only the latest request is allowed to land.
  const requestSeq = useRef(0)
  const load = useCallback(async () => {
    const seq = ++requestSeq.current
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('q', debouncedSearch)
    if (brandFilter !== 'all') params.set('brand', brandFilter)
    if (salesFilter !== 'all') params.set('assignee', salesFilter)
    if (view !== 'all') params.set('view', view)
    try {
      const res = await fetch(`/api/chat/inbox?${params}`)
      if (res.ok && seq === requestSeq.current) setItems(await res.json())
    } catch { /* offline — keep the last list */ }
    if (seq === requestSeq.current) setLoading(false)
  }, [debouncedSearch, brandFilter, salesFilter, view])

  useEffect(() => { load() }, [load])
  // Consumed once on mount, so revisiting the inbox later doesn't reopen the same chat.
  useEffect(() => { if (initialWhatsappId) onDeepLinkHandled?.() }, [])
  // Realtime: page.tsx re-dispatches the server's 'chat' SSE topic as 'chat-changed' (new
  // message, receipt, assignment...). Bursts are coalesced into one fetch; the slow poll is
  // only a safety net for a dropped SSE connection.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onChange = () => { clearTimeout(timer); timer = setTimeout(load, 250) }
    window.addEventListener('chat-changed', onChange)
    const poll = setInterval(load, 30000)
    return () => { window.removeEventListener('chat-changed', onChange); clearTimeout(timer); clearInterval(poll) }
  }, [load])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  // Only ADMIN sees every chat, so the "assigned to" filter is only meaningful for them —
  // a SALES rep's list is already scoped server-side to just their own conversations.
  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/users')
      .then(r => r.ok ? r.json() : [])
      .then((users: (SalesUser & { role: string })[]) => setSalesUsers(users.filter(u => u.role === 'SALES')))
      .catch(() => {})
  }, [isAdmin])

  const filtered = items

  // Mobile shows the list and the thread as two full screens (WhatsApp-style), so an open
  // thread gets a history entry — the phone's back gesture returns to the list instead of
  // leaving the ERP.
  const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  useEffect(() => {
    const onPop = () => setSelected(null)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  function select(next: { channel: 'whatsapp' | 'instagram'; id: string }) {
    if (isMobile() && !selected) window.history.pushState({ chatThread: true }, '')
    setSelected(next)
  }
  function closeThread() {
    if ((window.history.state as { chatThread?: boolean } | null)?.chatThread) window.history.back()
    else setSelected(null)
  }

  function openItem(item: UnifiedInboxItem) {
    if (item.channel === 'email') { onOpenEmail(item.id); return }
    select({ channel: item.channel, id: item.id })
    if (item.unreadCount > 0) setItems(prev => prev.map(p => p.id === item.id && p.channel === item.channel ? { ...p, unreadCount: 0 } : p))
  }

  async function startChat(payload: NewChatPayload) {
    const res = await fetch('/api/whatsapp/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.error ?? 'Failed to start conversation' }
    setNewChatOpen(false)
    await load()
    select({ channel: 'whatsapp', id: data.conversationId })
    return { ok: true, providerError: data.providerError as string | undefined }
  }

  return (
    // Mobile: edge-to-edge (cancels page.tsx's p-3) and fills the screen under the 3rem top bar.
    <div className="-m-3 sm:m-0 h-[calc(100dvh-3rem)] sm:h-[calc(100vh-6rem)] flex sm:rounded-xl sm:border overflow-hidden bg-card">
      {/* Conversation list */}
      <div className={cn('w-full md:w-80 shrink-0 md:border-r flex-col relative', selected ? 'hidden md:flex' : 'flex')}>
        <div className="px-4 pt-4 pb-2 md:py-4 md:border-b flex items-start justify-between gap-2">
          <div>
            <h2 className="text-2xl md:text-lg font-bold tracking-tight">
              <span className="md:hidden">Chats</span><span className="hidden md:inline">All Chats</span>
            </h2>
            <p className="hidden md:block text-xs text-muted-foreground mt-0.5">WhatsApp &amp; Instagram, newest first</p>
          </div>
          <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="hidden md:inline-flex h-8 shrink-0" title="Start a new WhatsApp chat">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Chat WhatsApp Baru</DialogTitle>
              </DialogHeader>
              <NewChatForm onSubmit={startChat} />
            </DialogContent>
          </Dialog>
        </div>
        <div className="hidden md:block px-3 pt-3 border-b pb-3">
          <Tabs value={brandFilter} onValueChange={v => setBrandFilter(v as 'all' | WhatsappBrand)}>
            <TabsList className="w-full">
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              {WHATSAPP_BRANDS.map(b => (
                <TabsTrigger key={b} value={b} className="text-xs">{WHATSAPP_BRAND_LABELS[b]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="px-4 pb-2 md:p-3 md:border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-3 md:left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 md:h-3.5 md:w-3.5 text-muted-foreground pointer-events-none" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, number or message…"
              className="pl-9 md:pl-8 h-10 md:h-9 rounded-full md:rounded-md bg-muted md:bg-transparent border-0 md:border" />
          </div>
          <div className="flex gap-2 md:gap-1 overflow-x-auto [scrollbar-width:none]">
            {(Object.keys(VIEW_LABELS) as InboxView[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn('shrink-0 md:flex-1 h-8 md:h-7 px-4 md:px-0 rounded-full md:rounded-md text-[13px] md:text-[11px] font-medium md:border transition-colors',
                  view === v
                    ? 'bg-[#d9fdd3] text-[#0a6b3c] md:bg-foreground md:text-background md:border-foreground'
                    : 'bg-muted text-muted-foreground md:bg-transparent hover:bg-muted')}>
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
          {isAdmin && salesUsers.length > 0 && (
            <Select value={salesFilter} onValueChange={setSalesFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Filter by sales rep" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sales</SelectItem>
                <SelectItem value="unassigned">Belum di-assign</SelectItem>
                {salesUsers.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name ?? u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex-1 overflow-y-auto pb-28 md:pb-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center p-6">
              {debouncedSearch || view !== 'all' || brandFilter !== 'all' || salesFilter !== 'all' ? 'No chats match these filters.' : 'No conversations yet.'}
            </p>
          ) : (
            filtered.map(item => {
              const badge = CHANNEL_BADGE[item.channel]
              const BadgeIcon = badge.icon
              const unread = item.unreadCount > 0
              const isActive = selected?.channel === item.channel && selected.id === item.id
              const waiting = item.waitingSince ? waitingLabel(item.waitingSince, now) : null
              return (
                <button
                  key={`${item.channel}:${item.id}`}
                  onClick={() => openItem(item)}
                  className={cn('w-full flex items-center gap-3 px-4 py-3 text-left md:border-b transition-colors', isActive ? 'bg-muted/60' : 'hover:bg-muted/40 active:bg-muted/60')}
                >
                  <div className="relative shrink-0">
                    <Avatar className="size-12 md:size-10">
                      {item.avatarUrl && <AvatarImage src={item.avatarUrl} alt={item.name} />}
                      <AvatarFallback className="text-sm md:text-xs font-semibold bg-muted">{initials(item.name)}</AvatarFallback>
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
                      <p className={cn('text-[15px] md:text-sm truncate', unread ? 'font-semibold' : 'font-medium')}>{item.name}</p>
                      <span className={cn('text-xs md:text-[10px] shrink-0', unread ? 'text-[#1fa855] md:text-foreground font-medium' : 'text-muted-foreground')}>
                        {timeLabel(item.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className={cn('text-sm md:text-xs truncate flex-1', unread ? 'text-foreground' : 'text-muted-foreground')}>
                        {item.preview || '—'}
                      </p>
                      {waiting && (
                        <span title="Customer is waiting for a reply"
                          className={cn('shrink-0 inline-flex items-center gap-0.5 rounded px-1 text-[10px] font-medium',
                            waiting.urgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800')}>
                          <Clock className="h-2.5 w-2.5" />{waiting.text}
                        </span>
                      )}
                      {unread && (
                        <span className="md:hidden shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-[#1fa855] text-white text-[11px] font-semibold flex items-center justify-center">
                          {item.unreadCount > 99 ? '99+' : item.unreadCount}
                        </span>
                      )}
                    </div>
                    {(item.channel === 'whatsapp' || !item.assignedToId || (isAdmin && item.assignedToName)) && (
                      <p className="text-[11px] md:text-[10px] text-muted-foreground/70 truncate mt-0.5">
                        {item.channel === 'whatsapp' ? item.brand && WHATSAPP_BRAND_LABELS[item.brand] : item.channel === 'instagram' ? 'Instagram' : 'Email'}
                        {!item.assignedToId
                          ? <span className="text-amber-600 font-medium"> · Belum di-assign</span>
                          : isAdmin && item.assignedToName && <> · Sales: {item.assignedToName}</>}
                      </p>
                    )}
                  </div>

                  {unread && <span className="hidden md:block shrink-0 h-2 w-2 rounded-full bg-red-500" />}
                </button>
              )
            })
          )}
        </div>

        {/* Mobile: new-chat FAB + brand switcher as a floating bottom tab bar (desktop uses the Tabs above). */}
        <button onClick={() => setNewChatOpen(true)} title="Start a new WhatsApp chat"
          className="md:hidden absolute right-4 bottom-[6.5rem] h-14 w-14 rounded-2xl bg-[#1fa855] text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform">
          <MessageSquarePlus className="h-6 w-6" />
        </button>
        <nav className="md:hidden absolute inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] rounded-full border bg-card/95 backdrop-blur shadow-lg grid grid-cols-4 py-2">
          {(['all', ...WHATSAPP_BRANDS] as const).map(b => {
            const Icon = BRAND_TAB_ICON[b]
            const active = brandFilter === b
            return (
              <button key={b} onClick={() => setBrandFilter(b)} className="flex flex-col items-center gap-1">
                <span className={cn('h-8 w-14 rounded-full flex items-center justify-center transition-colors', active ? 'bg-[#d9fdd3] text-[#0a6b3c]' : 'text-muted-foreground')}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className={cn('text-xs', active ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                  {b === 'all' ? 'All' : WHATSAPP_BRAND_LABELS[b]}
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Thread */}
      {!selected ? (
        <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground text-sm">
          <div className="text-center">
            <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
            Select a conversation to start replying
          </div>
        </div>
      ) : selected.channel === 'whatsapp' ? (
        <WhatsAppThread key={selected.id} conversationId={selected.id} onConversationUpdate={load} salesUsers={salesUsers}
          onOpenBooking={onOpenBooking} onOpenChat={id => setSelected({ channel: 'whatsapp', id })} onBack={closeThread} />
      ) : (
        <InstagramThread key={selected.id} conversationId={selected.id} onConversationUpdate={load} onBack={closeThread} />
      )}
    </div>
  )
}

/**
 * Starting a WhatsApp thread with someone who's never messaged in requires a Message
 * Template (Meta rejects free text outside the 24h customer-service window) — see
 * Chat > WhatsApp Templates (src/lib/whatsapp-templates.ts) and POST /api/whatsapp/conversations.
 */
export interface NewChatPayload { phone: string; brand: WhatsappBrand; templateName: string; templateLanguage: string; templateParams: string[]; contactName?: string }

export function NewChatForm({ onSubmit, initialPhone = '', initialName = '' }: {
  onSubmit: (payload: NewChatPayload) => Promise<{ ok: boolean; error?: string; providerError?: string }>
  // Prefill when started from somewhere that already knows the contact (e.g. Leads' "Follow up by WhatsApp").
  initialPhone?: string
  initialName?: string
}) {
  const [phone, setPhone] = useState(initialPhone)
  const [contactName, setContactName] = useState(initialName)
  const [brand, setBrand] = useState<WhatsappBrand>('SAMARA')
  const [templateName, setTemplateName] = useState('')
  const [templateParams, setTemplateParams] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const templates = useWhatsappTemplates(brand)
  // Falls back to the brand's first template until one is picked (and after a brand switch,
  // since the old pick won't exist in the new brand's list).
  const selectedTemplate = templates.find(t => templateKey(t) === templateName) ?? templates[0]

  async function handleSubmit() {
    if (!phone.trim() || !selectedTemplate) return
    setSubmitting(true)
    setError(null)
    const result = await onSubmit({ phone: phone.trim(), brand, templateName: selectedTemplate.name, templateLanguage: selectedTemplate.language, templateParams, contactName: contactName.trim() || undefined })
    setSubmitting(false)
    if (!result.ok) setError(result.error ?? 'Failed to start conversation')
    else if (result.providerError) setError(`Terkirim tapi WhatsApp menolak: ${result.providerError}`)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Nomor WhatsApp</label>
        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="62812xxxxxxx / 0812xxxxxxx" className="h-9" />
        <p className="text-[11px] text-muted-foreground">Nomor luar negeri pakai kode negara (mis. 61…, 44…). Awalan 0 otomatis jadi 62.</p>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Nama (opsional)</label>
        <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Nama contact/lead" className="h-9" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Nomor Brand</label>
        <Select value={brand} onValueChange={v => { setBrand(v as WhatsappBrand); setTemplateName(''); setTemplateParams([]) }}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WHATSAPP_BRANDS.map(b => <SelectItem key={b} value={b}>{WHATSAPP_BRAND_LABELS[b]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Template</label>
        <Select value={selectedTemplate ? templateKey(selectedTemplate) : ''} onValueChange={v => { setTemplateName(v); setTemplateParams(new Array(templates.find(t => templateKey(t) === v)?.paramLabels?.length ?? 0).fill('')) }}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Pilih template" /></SelectTrigger>
          <SelectContent>
            {templates.map(t => <SelectItem key={templateKey(t)} value={templateKey(t)}>{t.label} ({t.language})</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {selectedTemplate?.paramLabels?.map((label, i) => (
        <Input key={i} placeholder={label} value={templateParams[i] ?? ''}
          onChange={e => setTemplateParams(prev => { const next = [...prev]; next[i] = e.target.value; return next })}
          className="h-9" />
      ))}
      {selectedTemplate && (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap border rounded-md p-2 bg-muted/40">
          {renderWhatsappTemplateBody(selectedTemplate, templateParams)}
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Button onClick={handleSubmit} disabled={!phone.trim() || !selectedTemplate || submitting || missingTemplateParams(selectedTemplate, templateParams)} className="w-full h-9">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mulai Chat'}
      </Button>
    </div>
  )
}
