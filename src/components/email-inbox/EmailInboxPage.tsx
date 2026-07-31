'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { uploadToR2 } from '@/lib/r2-client'
import { Search, Send, Loader2, Mail, Paperclip, X } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const ACCENT = '#1a73e8' // familiar "email" blue

interface ConversationSummary {
  id: string
  fromEmail: string
  fromName: string | null
  subject: string
  lastMessageAt: string
  lastMessagePreview: string | null
  unreadCount: number
}
interface Message {
  id: string
  direction: 'IN' | 'OUT'
  body: string | null
  attachmentUrls: string[]
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED'
  sentByName: string | null
  createdAt: string
}
interface ConversationDetail extends ConversationSummary {
  messages: Message[]
}

function initials(name: string | null, email: string) {
  if (name?.trim()) return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return email.slice(0, 2).toUpperCase()
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmtListTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export default function EmailInboxPage({ initialConversationId }: { initialConversationId?: string } = {}) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/email-inbox/conversations')
    if (res.ok) setConversations(await res.json())
    setLoading(false)
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/email-inbox/conversations/${id}`)
    if (res.ok) setDetail(await res.json())
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])
  useEffect(() => {
    const t = setInterval(loadConversations, 15000)
    return () => clearInterval(t)
  }, [loadConversations])
  useEffect(() => {
    if (!activeId) return
    const t = setInterval(() => loadDetail(activeId), 8000)
    return () => clearInterval(t)
  }, [activeId, loadDetail])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [detail?.messages.length])

  // Deep-link from the unified inbox (src/components/chat/UnifiedInbox.tsx).
  const deepLinkConsumed = useRef(false)
  useEffect(() => {
    if (!initialConversationId || deepLinkConsumed.current || conversations.length === 0) return
    const target = conversations.find(c => c.id === initialConversationId)
    if (target) { deepLinkConsumed.current = true; openConversation(target) }
  }, [initialConversationId, conversations])

  async function openConversation(c: ConversationSummary) {
    setActiveId(c.id)
    setDetailLoading(true)
    setDetail(null)
    await loadDetail(c.id)
    setDetailLoading(false)
    if (c.unreadCount > 0) {
      fetch(`/api/email-inbox/conversations/${c.id}`, { method: 'PATCH' }).catch(() => {})
      setConversations(prev => prev.map(p => p.id === c.id ? { ...p, unreadCount: 0 } : p))
    }
  }

  async function sendReply() {
    if ((!draft.trim() && pendingAttachments.length === 0) || !activeId) return
    setSending(true)
    const text = draft.trim()
    const attachments = pendingAttachments
    setDraft(''); setPendingAttachments([])
    try {
      const res = await fetch(`/api/email-inbox/conversations/${activeId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, attachmentUrls: attachments }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.message) setDetail(prev => prev ? { ...prev, messages: [...prev.messages, data.message] } : prev)
      await loadConversations()
    } finally { setSending(false) }
  }

  async function handleFilePicked(file: File) {
    if (!activeId) return
    setUploading(true)
    try {
      const blob = await uploadToR2('/api/email-inbox/upload', `email-inbox/${activeId}/${Date.now()}-${file.name}`, file)
      setPendingAttachments(prev => [...prev, blob.url])
    } catch (e) { console.error(e) } finally { setUploading(false) }
  }

  const filtered = search.trim()
    ? conversations.filter(c =>
        (c.fromName ?? '').toLowerCase().includes(search.trim().toLowerCase()) ||
        c.fromEmail.toLowerCase().includes(search.trim().toLowerCase()) ||
        c.subject.toLowerCase().includes(search.trim().toLowerCase()))
    : conversations

  return (
    <div className="h-[calc(100vh-6rem)] flex rounded-xl border overflow-hidden bg-card">
      <div className="w-80 shrink-0 border-r flex flex-col">
        <div className="px-4 py-4 border-b flex items-center gap-2">
          <Mail className="h-5 w-5" style={{ color: ACCENT }} />
          <div>
            <h2 className="text-lg font-bold tracking-tight">Email</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Inbox</p>
          </div>
        </div>
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input className="w-full h-9 border rounded-md pl-8 pr-3 text-sm focus:outline-none focus:ring-1 bg-white" style={{ '--tw-ring-color': ACCENT } as React.CSSProperties}
              placeholder="Search name, email, subject..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-14 rounded-md bg-muted animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
              {conversations.length === 0 ? 'No emails yet — inbound messages will show up here.' : 'No matches'}
            </div>
          ) : filtered.map(c => (
            <button key={c.id} onClick={() => openConversation(c)}
              className={`w-full text-left px-4 py-3 flex items-start gap-3 border-b transition-colors ${activeId === c.id ? 'bg-blue-50/60' : 'hover:bg-muted/40'}`}>
              <Avatar className="mt-0.5">
                <AvatarFallback className="text-xs font-semibold" style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}>
                  {initials(c.fromName, c.fromEmail)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm truncate ${c.unreadCount > 0 ? 'font-semibold' : 'font-medium'}`}>{c.fromName || c.fromEmail}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{fmtListTime(c.lastMessageAt)}</span>
                </div>
                <p className={`text-xs truncate ${c.unreadCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{c.subject}</p>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-xs truncate text-muted-foreground">{c.lastMessagePreview || '—'}</p>
                  {c.unreadCount > 0 && (
                    <span className="shrink-0 min-w-4 h-4 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ backgroundColor: ACCENT }}>
                      {c.unreadCount > 9 ? '9+' : c.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: '#f6f8fc' }}>
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center">
              <Mail className="h-10 w-10 mx-auto mb-2 opacity-30" />
              Select an email to view the thread
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b bg-white shrink-0">
              <p className="text-sm font-semibold truncate">{detail?.subject}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{detail?.fromName ? `${detail.fromName} · ` : ''}{detail?.fromEmail}</p>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
              {detailLoading ? (
                <div className="flex justify-center pt-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : detail?.messages.map(m => (
                <div key={m.id} className="rounded-lg border bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-muted/20">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[10px] font-semibold" style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}>
                          {m.direction === 'OUT' ? (m.sentByName ?? 'A').slice(0, 2).toUpperCase() : initials(detail.fromName, detail.fromEmail)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{m.direction === 'OUT' ? (m.sentByName ?? 'You') : (detail.fromName || detail.fromEmail)}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {m.direction === 'OUT' ? `to ${detail.fromEmail}` : `to Samara Yachting`}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{fmtDateTime(m.createdAt)}</span>
                  </div>
                  <div className="px-4 py-3 text-sm">
                    {m.body && <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>}
                    {m.attachmentUrls.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {m.attachmentUrls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border bg-muted/40 hover:bg-muted transition-colors">
                            <Paperclip className="h-3 w-3" /> Attachment {i + 1}
                          </a>
                        ))}
                      </div>
                    )}
                    {m.direction === 'OUT' && m.status === 'FAILED' && (
                      <p className="text-xs mt-2 text-red-600">Failed to send</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Reply panel — deliberately looks like a real email compose box (To/Send), not a chat input */}
            <div className="p-4 border-t bg-white shrink-0">
              <div className="rounded-lg border overflow-hidden">
                <div className="px-4 py-2 border-b bg-muted/20 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Reply</span> to {detail?.fromName ? `${detail.fromName} ` : ''}
                  <span className="text-foreground">&lt;{detail?.fromEmail}&gt;</span>
                  <span className="block text-[11px] mt-0.5">Subject: Re: {detail?.subject}</span>
                </div>
                <textarea
                  rows={4}
                  className="w-full resize-none px-4 py-3 text-sm focus:outline-none"
                  placeholder="Write your reply..."
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply() } }}
                />
                {pendingAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-4 pb-2">
                    {pendingAttachments.map((url, i) => (
                      <span key={i} className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-md">
                        <Paperclip className="h-3 w-3" /> File {i + 1}
                        <button onClick={() => setPendingAttachments(prev => prev.filter((_, idx) => idx !== i))} className="ml-1 text-muted-foreground hover:text-foreground">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/10">
                  <input ref={fileInputRef} type="file" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFilePicked(f); e.target.value = '' }} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  </button>
                  <button onClick={sendReply} disabled={(!draft.trim() && pendingAttachments.length === 0) || sending}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-40 transition-colors"
                    style={{ backgroundColor: ACCENT }}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
