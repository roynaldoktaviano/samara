'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { uploadToR2 } from '@/lib/r2-client'
import { Loader2, Image as ImageIcon, Heart, Reply, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const IG_BLUE = '#3897F0'

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
interface ConversationDetail {
  id: string; igUsername: string; displayName: string | null; profilePicUrl: string | null
  ourAccountUsername: string | null
  messages: Message[]
}

function initials(name: string | null, username: string) {
  if (name?.trim()) return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return username.slice(0, 2).toUpperCase()
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
function quoteSnippet(q: QuotedMessage) {
  if (q.body) return q.body
  if (q.mediaType?.startsWith('image/')) return '📷 Photo'
  return '📎 Attachment'
}

/**
 * The message-thread half of the old standalone Instagram page
 * (src/components/instagram/InstagramPage.tsx, now removed) — split out so the unified inbox
 * (src/components/chat/UnifiedInbox.tsx) can drop it into its own right-hand pane next to a
 * shared conversation list, instead of Instagram needing its own separate screen.
 */
export default function InstagramThread({ conversationId, onConversationUpdate }: { conversationId: string; onConversationUpdate: () => void }) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDetail = useCallback(async () => {
    const res = await fetch(`/api/instagram/conversations/${conversationId}`)
    if (res.ok) setDetail(await res.json())
  }, [conversationId])

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setDetailLoading(true)
    setReplyTo(null)
    ;(async () => {
      await loadDetail()
      if (cancelled) return
      setDetailLoading(false)
      fetch(`/api/instagram/conversations/${conversationId}`, { method: 'PATCH' }).catch(() => {})
      onConversationUpdate()
    })()
    return () => { cancelled = true }
  }, [conversationId])

  useEffect(() => {
    const t = setInterval(loadDetail, 4000)
    return () => clearInterval(t)
  }, [loadDetail])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [detail?.messages.length])

  async function postMessage(payload: { body?: string; mediaUrl?: string; mediaType?: string }) {
    const res = await fetch(`/api/instagram/conversations/${conversationId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, replyToId: replyTo?.id }),
    })
    const data = await res.json().catch(() => ({}))
    if (data?.message) setDetail(prev => prev ? { ...prev, messages: [...prev.messages, data.message] } : prev)
    setReplyTo(null)
    onConversationUpdate()
  }

  async function sendMessage() {
    if (!draft.trim()) return
    setSending(true)
    const text = draft.trim()
    setDraft('')
    try { await postMessage({ body: text }) } finally { setSending(false) }
  }

  async function handleFilePicked(file: File) {
    setUploading(true)
    try {
      const blob = await uploadToR2('/api/instagram/upload', `instagram/${conversationId}/${Date.now()}-${file.name}`, file)
      await postMessage({ mediaUrl: blob.url, mediaType: file.type })
    } catch (e) { console.error(e) } finally { setUploading(false) }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white">
      <div className="px-5 py-3 border-b bg-white flex items-center gap-3 shrink-0">
        <Avatar>
          {detail?.profilePicUrl && <AvatarImage src={detail.profilePicUrl} alt={detail.igUsername} />}
          <AvatarFallback className="text-xs font-semibold bg-muted">{initials(detail?.displayName ?? null, detail?.igUsername ?? '')}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{detail?.displayName || detail?.igUsername}</p>
          <p className="text-xs text-muted-foreground">@{detail?.igUsername}</p>
        </div>
        {detail?.ourAccountUsername && (
          <p className="text-xs text-muted-foreground shrink-0">
            From: <span className="font-medium text-foreground">@{detail.ourAccountUsername}</span>
          </p>
        )}
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
    </div>
  )
}
