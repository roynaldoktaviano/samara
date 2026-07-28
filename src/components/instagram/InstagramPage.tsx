'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { uploadToR2 } from '@/lib/r2-client'
import { Search, Send, Loader2, Instagram as InstagramIcon, Image as ImageIcon, Heart, Reply, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

// Instagram's own gradient — used sparingly (unread dot, header accent) so the
// module reads as "Instagram" at a glance without re-skinning every control.
const IG_GRADIENT = 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)'
const IG_BLUE = '#3897F0'

interface ConversationSummary {
  id: string
  igUsername: string
  displayName: string | null
  profilePicUrl: string | null
  lastMessageAt: string
  lastMessagePreview: string | null
  unreadCount: number
}
interface QuotedMessage { id: string; body: string | null; direction: 'IN' | 'OUT'; mediaType: string | null }
interface Message {
  id: string
  direction: 'IN' | 'OUT'
  body: string | null
  mediaUrl: string | null
  mediaType: string | null
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
  createdAt: string
  replyTo: QuotedMessage | null
}
interface ConversationDetail extends ConversationSummary {
  messages: Message[]
}

function initials(name: string | null, username: string) {
  if (name?.trim()) return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return username.slice(0, 2).toUpperCase()
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtListTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function quoteSnippet(q: QuotedMessage) {
  if (q.body) return q.body
  if (q.mediaType?.startsWith('image/')) return '📷 Photo'
  return '📎 Attachment'
}

export default function InstagramPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/instagram/conversations')
    if (res.ok) setConversations(await res.json())
    setLoading(false)
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/instagram/conversations/${id}`)
    if (res.ok) setDetail(await res.json())
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])
  useEffect(() => {
    const t = setInterval(loadConversations, 8000)
    return () => clearInterval(t)
  }, [loadConversations])
  useEffect(() => {
    if (!activeId) return
    const t = setInterval(() => loadDetail(activeId), 4000)
    return () => clearInterval(t)
  }, [activeId, loadDetail])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [detail?.messages.length])

  async function openConversation(c: ConversationSummary) {
    setActiveId(c.id)
    setDetailLoading(true)
    setDetail(null)
    setReplyTo(null)
    await loadDetail(c.id)
    setDetailLoading(false)
    if (c.unreadCount > 0) {
      fetch(`/api/instagram/conversations/${c.id}`, { method: 'PATCH' }).catch(() => {})
      setConversations(prev => prev.map(p => p.id === c.id ? { ...p, unreadCount: 0 } : p))
    }
  }

  async function postMessage(payload: { body?: string; mediaUrl?: string; mediaType?: string }) {
    if (!activeId) return
    const res = await fetch(`/api/instagram/conversations/${activeId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, replyToId: replyTo?.id }),
    })
    const data = await res.json().catch(() => ({}))
    if (data?.message) setDetail(prev => prev ? { ...prev, messages: [...prev.messages, data.message] } : prev)
    setReplyTo(null)
    await loadConversations()
  }

  async function sendMessage() {
    if (!draft.trim() || !activeId) return
    setSending(true)
    const text = draft.trim()
    setDraft('')
    try { await postMessage({ body: text }) } finally { setSending(false) }
  }

  async function handleFilePicked(file: File) {
    if (!activeId) return
    setUploading(true)
    try {
      const blob = await uploadToR2('/api/instagram/upload', `instagram/${activeId}/${Date.now()}-${file.name}`, file)
      await postMessage({ mediaUrl: blob.url, mediaType: file.type })
    } catch (e) { console.error(e) } finally { setUploading(false) }
  }

  const filtered = search.trim()
    ? conversations.filter(c => (c.displayName ?? '').toLowerCase().includes(search.trim().toLowerCase()) || c.igUsername.toLowerCase().includes(search.trim().toLowerCase()))
    : conversations

  return (
    <div className="h-[calc(100vh-6rem)] flex rounded-xl border overflow-hidden bg-card">
      <div className="w-80 shrink-0 border-r flex flex-col">
        <div className="px-4 py-4 border-b flex items-center gap-2">
          <InstagramIcon className="h-5 w-5" style={{ color: '#dc2743' }} />
          <div>
            <h2 className="text-lg font-bold tracking-tight">Instagram</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Direct messages</p>
          </div>
        </div>
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input className="w-full h-9 border rounded-full pl-8 pr-3 text-sm focus:outline-none focus:ring-1 bg-white" style={{ '--tw-ring-color': IG_BLUE } as React.CSSProperties}
              placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <InstagramIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
              {conversations.length === 0 ? 'No conversations yet — inbound DMs will show up here.' : 'No matches'}
            </div>
          ) : filtered.map(c => (
            <button key={c.id} onClick={() => openConversation(c)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b transition-colors ${activeId === c.id ? 'bg-pink-50/60' : 'hover:bg-muted/40'}`}>
              <div className="relative shrink-0">
                <div className="p-[2px] rounded-full" style={c.unreadCount > 0 ? { background: IG_GRADIENT } : undefined}>
                  <Avatar className="border-2 border-white">
                    {c.profilePicUrl && <AvatarImage src={c.profilePicUrl} alt={c.igUsername} />}
                    <AvatarFallback className="text-xs font-semibold bg-muted">{initials(c.displayName, c.igUsername)}</AvatarFallback>
                  </Avatar>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm truncate ${c.unreadCount > 0 ? 'font-semibold' : 'font-medium'}`}>{c.displayName || c.igUsername}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{fmtListTime(c.lastMessageAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className={`text-xs truncate ${c.unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{c.lastMessagePreview || '—'}</p>
                  {c.unreadCount > 0 && (
                    <span className="shrink-0 min-w-4 h-4 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ background: IG_BLUE }}>
                      {c.unreadCount > 9 ? '9+' : c.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center">
              <InstagramIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
              Select a conversation to start replying
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b bg-white flex items-center gap-3 shrink-0">
              <Avatar>
                {detail?.profilePicUrl && <AvatarImage src={detail.profilePicUrl} alt={detail.igUsername} />}
                <AvatarFallback className="text-xs font-semibold bg-muted">{initials(detail?.displayName ?? null, detail?.igUsername ?? '')}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{detail?.displayName || detail?.igUsername}</p>
                <p className="text-xs text-muted-foreground">@{detail?.igUsername}</p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-1.5">
              {detailLoading ? (
                <div className="flex justify-center pt-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : detail?.messages.map(m => (
                <div key={m.id} className={`group flex items-center gap-1.5 ${m.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
                  {m.direction === 'OUT' && (
                    <button onClick={() => setReplyTo(m)} title="Reply"
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0">
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <div className={`max-w-[65%] rounded-3xl px-4 py-2 text-sm ${m.direction === 'OUT' ? 'text-white' : 'bg-[#EFEFEF] text-foreground'}`}
                    style={m.direction === 'OUT' ? { backgroundColor: IG_BLUE } : undefined}>
                    {m.replyTo && (
                      <div className={`rounded-2xl px-3 py-1.5 mb-1.5 border-l-2 text-xs ${m.direction === 'OUT' ? 'bg-black/15 border-white/50 text-white/80' : 'bg-black/5 border-[#3897F0] text-muted-foreground'}`}>
                        <p className="font-medium">{m.replyTo.direction === 'OUT' ? 'You' : (detail?.displayName || detail?.igUsername)}</p>
                        <p className="truncate">{quoteSnippet(m.replyTo)}</p>
                      </div>
                    )}
                    {m.mediaUrl && (
                      m.mediaType?.startsWith('image/')
                        ? <img src={m.mediaUrl} alt="Attachment" className="rounded-2xl mb-1 max-h-60 object-cover" />
                        : <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="underline text-xs">Attachment</a>
                    )}
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  </div>
                  {m.direction === 'IN' && (
                    <button onClick={() => setReplyTo(m)} title="Reply"
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0">
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {detail?.messages.length ? (
                <p className="text-[10px] text-muted-foreground text-right pr-1 pt-1">
                  {fmtTime(detail.messages[detail.messages.length - 1].createdAt)}
                </p>
              ) : null}
            </div>

            <div className="border-t bg-white shrink-0">
              {replyTo && (
                <div className="flex items-center gap-2 px-3 pt-2.5">
                  <div className="flex-1 min-w-0 flex items-center gap-2 bg-muted/60 rounded-2xl px-3 py-1.5 border-l-2" style={{ borderColor: IG_BLUE }}>
                    <div className="min-w-0">
                      <p className="text-xs font-medium">Replying to {replyTo.direction === 'OUT' ? 'yourself' : (detail?.displayName || detail?.igUsername)}</p>
                      <p className="text-xs text-muted-foreground truncate">{quoteSnippet(replyTo)}</p>
                    </div>
                  </div>
                  <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="p-3 flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFilePicked(f); e.target.value = '' }} />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              </button>
              <input
                className="flex-1 h-10 rounded-full border px-4 text-sm focus:outline-none focus:ring-1"
                style={{ '--tw-ring-color': IG_BLUE } as React.CSSProperties}
                placeholder="Message..."
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendMessage() } }}
              />
              {draft.trim() ? (
                <button onClick={sendMessage} disabled={sending} className="text-sm font-semibold shrink-0 disabled:opacity-40" style={{ color: IG_BLUE }}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
                </button>
              ) : (
                <Heart className="h-6 w-6 text-muted-foreground shrink-0" />
              )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
