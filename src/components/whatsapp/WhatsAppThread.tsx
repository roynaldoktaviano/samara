'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { uploadToR2 } from '@/lib/r2-client'
import { Send, Loader2, Check, CheckCheck, AlertCircle, Paperclip, Reply, X, Image as ImageIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const ACCENT = '#25D366' // WhatsApp green — this module only

interface QuotedMessage { id: string; body: string | null; direction: 'IN' | 'OUT'; mediaType: string | null }
interface Message {
  id: string
  direction: 'IN' | 'OUT'
  body: string | null
  mediaUrl: string | null
  mediaType: string | null
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
  sentByName: string | null
  createdAt: string
  replyTo: QuotedMessage | null
}
interface ConversationDetail {
  id: string; phone: string; contactName: string | null; messages: Message[]
}

function initials(name: string | null, phone: string) {
  if (name?.trim()) return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return phone.slice(-2)
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
function quoteSnippet(q: QuotedMessage) {
  if (q.body) return q.body
  if (q.mediaType?.startsWith('image/')) return '📷 Photo'
  return '📎 Attachment'
}
function StatusIcon({ status }: { status: Message['status'] }) {
  if (status === 'FAILED') return <AlertCircle className="h-3 w-3 text-red-300" />
  if (status === 'PENDING') return <Loader2 className="h-3 w-3 animate-spin text-white/60" />
  if (status === 'READ') return <CheckCheck className="h-3 w-3 text-blue-300" />
  if (status === 'DELIVERED' || status === 'SENT') return <CheckCheck className="h-3 w-3 text-white/60" />
  return <Check className="h-3 w-3 text-white/60" />
}

/**
 * The message-thread half of the old standalone WhatsApp page (src/components/whatsapp/ChatPage.tsx,
 * now removed) — split out so the unified inbox (src/components/chat/UnifiedInbox.tsx) can drop it
 * into its own right-hand pane next to a shared conversation list, instead of WhatsApp needing its
 * own separate screen with its own separate list.
 */
export default function WhatsAppThread({ conversationId, onConversationUpdate }: { conversationId: string; onConversationUpdate: () => void }) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDetail = useCallback(async () => {
    const res = await fetch(`/api/whatsapp/conversations/${conversationId}`)
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
      fetch(`/api/whatsapp/conversations/${conversationId}`, { method: 'PATCH' }).catch(() => {})
      onConversationUpdate()
    })()
    return () => { cancelled = true }
  }, [conversationId])

  useEffect(() => {
    const t = setInterval(loadDetail, 4000)
    return () => clearInterval(t)
  }, [loadDetail])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [detail?.messages.length])

  async function postMessage(payload: { body?: string; mediaUrl?: string; mediaType?: string }) {
    const res = await fetch(`/api/whatsapp/conversations/${conversationId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, replyToId: replyTo?.id }),
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
      const blob = await uploadToR2('/api/whatsapp/upload', `whatsapp/${conversationId}/${Date.now()}-${file.name}`, file)
      const caption = draft.trim()
      setDraft('')
      await postMessage({ body: caption || undefined, mediaUrl: blob.url, mediaType: file.type })
    } catch (e) {
      console.error(e)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: '#efeae2' }}>
      <div className="px-5 py-3 border-b bg-white flex items-center gap-3 shrink-0">
        <Avatar>
          <AvatarFallback className="text-xs font-semibold" style={{ backgroundColor: `${ACCENT}22`, color: '#1b7a45' }}>
            {initials(detail?.contactName ?? null, detail?.phone ?? '')}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{detail?.contactName || detail?.phone}</p>
          <p className="text-xs text-muted-foreground">{detail?.phone}</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
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
            <div className={`max-w-[70%] rounded-lg px-3 py-2 shadow-sm text-sm ${m.direction === 'OUT' ? 'text-white' : 'bg-white text-foreground'}`}
              style={m.direction === 'OUT' ? { backgroundColor: '#005c4b' } : undefined}>
              {m.replyTo && (
                <div className={`rounded px-2 py-1 mb-1.5 border-l-2 text-xs ${m.direction === 'OUT' ? 'bg-black/15 border-white/50 text-white/80' : 'bg-black/5 border-green-600 text-muted-foreground'}`}>
                  <p className="font-medium">{m.replyTo.direction === 'OUT' ? 'You' : (detail?.contactName || detail?.phone)}</p>
                  <p className="truncate">{quoteSnippet(m.replyTo)}</p>
                </div>
              )}
              {m.mediaUrl && (
                m.mediaType?.startsWith('image/') ? (
                  <img src={m.mediaUrl} alt="Attachment" className="rounded-md mb-1.5 max-h-60 object-cover" />
                ) : (
                  <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer"
                    className={`flex items-center gap-1.5 mb-1.5 text-xs underline ${m.direction === 'OUT' ? 'text-white/90' : 'text-blue-600'}`}>
                    <Paperclip className="h-3 w-3" /> Attachment
                  </a>
                )
              )}
              {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
              <div className={`flex items-center gap-1 mt-1 justify-end ${m.direction === 'OUT' ? 'text-white/70' : 'text-muted-foreground'}`}>
                <span className="text-[10px]">{fmtTime(m.createdAt)}</span>
                {m.direction === 'OUT' && <StatusIcon status={m.status} />}
              </div>
            </div>
            {m.direction === 'IN' && (
              <button onClick={() => setReplyTo(m)} title="Reply"
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0">
                <Reply className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="border-t bg-white shrink-0">
        {replyTo && (
          <div className="flex items-center gap-2 px-3 pt-2.5">
            <div className="flex-1 min-w-0 flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-1.5 border-l-2 border-green-600">
              <div className="min-w-0">
                <p className="text-xs font-medium">Replying to {replyTo.direction === 'OUT' ? 'yourself' : (detail?.contactName || detail?.phone)}</p>
                <p className="text-xs text-muted-foreground truncate">{quoteSnippet(replyTo)}</p>
              </div>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="p-3 flex items-end gap-2">
          <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,application/pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFilePicked(f); e.target.value = '' }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            title="Attach media"
            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
          </button>
          <textarea
            rows={1}
            className="flex-1 resize-none border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 max-h-28"
            placeholder="Type a message..."
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          />
          <button onClick={sendMessage} disabled={!draft.trim() || sending}
            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-white disabled:opacity-40 transition-colors"
            style={{ backgroundColor: ACCENT }}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
