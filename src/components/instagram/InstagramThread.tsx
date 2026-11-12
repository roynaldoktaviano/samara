'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { uploadToR2 } from '@/lib/r2-client'
import { Loader2, Image as ImageIcon, Heart, Reply, X, ArrowLeft, AlertCircle, Clock, RotateCcw, PanelRight } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { isHttpUrl } from '@/lib/url-safety'
import { WHATSAPP_BRAND_LABELS, type WhatsappBrand } from '@/lib/whatsapp-brands'
import { formatDate } from '@/lib/format'
import { chatDisplayName } from '@/lib/chat-display-name'
import ChatLeadSection, { CHAT_LEAD_PANEL_KEY as PANEL_PREF_KEY } from '@/components/chat/ChatLeadSection'
import { LEAD_STAGE_COLOR, LEAD_STAGE_LABEL, type LeadStage } from '@/lib/lead-pipeline'

const IG_BLUE = '#3897F0'
const MESSENGER_BLUE = '#0866FF'
const DAY_MS = 24 * 60 * 60 * 1000

interface QuotedMessage { id: string; body: string | null; direction: 'IN' | 'OUT'; mediaType: string | null }
interface Message {
  id: string
  direction: 'IN' | 'OUT'
  body: string | null
  mediaUrl: string | null
  mediaType: string | null
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
  createdAt: string
  errorMessage: string | null
  sentByName: string | null
  replyTo: QuotedMessage | null
}
interface ConversationDetail {
  id: string; igUsername: string | null; displayName: string | null; profilePicUrl: string | null
  platform: 'INSTAGRAM' | 'MESSENGER'
  brand: WhatsappBrand | null
  lastInboundAt: string | null
  ourAccountUsername: string | null
  assignedToId: string | null
  leadId: string | null
  lead: { id: string; name: string; stage: LeadStage } | null
  messages: Message[]
}

interface SendPayload { body?: string; mediaUrl?: string; mediaType?: string; replyToId?: string }
// An optimistic bubble: `match` finds its saved row on refresh; `retry` is set once it failed
// without ever reaching the server (no connection) so it can be sent again.
interface PendingMessage extends Message {
  match: { body: string | null; mediaUrl: string | null } | null
  retry?: SendPayload
  uploading?: boolean
}

function initials(name: string | null, username: string | null) {
  if (name?.trim()) return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (username ?? '?').slice(0, 2).toUpperCase()
}
// Meta's send errors are long and technical ("(#10) Cannot message users who are not admins…") —
// shown once as a plain-language banner above the composer instead of under every failed bubble.
function friendlySendError(raw: string, isMessenger: boolean) {
  const platform = isMessenger ? 'Messenger' : 'Instagram'
  if (/pages_messaging|not admins, developers or testers/i.test(raw))
    return `${platform} replies from the ERP are blocked until Meta approves the app's messaging permission. Reply from Meta Business Suite for now.`
  if (/outside of allowed window|24 hour|messaging window/i.test(raw))
    return "Outside Meta's reply window — the customer has to message again before a reply can be delivered."
  if (/#551|not available/i.test(raw)) return 'This person can\'t receive messages right now.'
  if (/#190|access token|session has expired|OAuthException/i.test(raw))
    return `The ${platform} connection has expired — an admin needs to reconnect it in Settings.`
  return raw
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
export default function InstagramThread({ conversationId, onConversationUpdate, onBack }: { conversationId: string; onConversationUpdate: () => void; onBack?: () => void }) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [draft, setDraft] = useState('')
  // Optimistic bubbles — shown the moment the rep hits Send, swapped for the saved row once
  // the server answers (sending never blocks the composer).
  const [pending, setPending] = useState<PendingMessage[]>([])
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isMessenger = detail?.platform === 'MESSENGER'
  const accent = isMessenger ? MESSENGER_BLUE : IG_BLUE
  const contactName = chatDisplayName(detail?.lead?.name, detail?.displayName || (detail?.igUsername ? `@${detail.igUsername}` : isMessenger ? 'Facebook user' : 'Instagram user'))
  // Meta's reply window: free within 24h of the customer's last message, Human Agent tag up to 7 days.
  const sinceInbound = detail?.lastInboundAt ? Date.now() - new Date(detail.lastInboundAt).getTime() : null
  const replyWindow = sinceInbound === null || sinceInbound <= DAY_MS ? null : sinceInbound <= 7 * DAY_MS ? 'tagged' : 'closed'

  const messages = detail?.messages ?? []
  // Hide an optimistic bubble once a refresh already brought in its saved row (the server
  // saves the row before calling Meta, so this can land before the POST returns) — otherwise
  // the same message would show twice.
  const visiblePending = pending.filter(p => p.retry || !p.match || !messages.some(m =>
    m.direction === 'OUT' && m.body === p.match!.body && m.mediaUrl === p.match!.mediaUrl &&
    Date.parse(m.createdAt) >= Date.parse(p.createdAt) - 60_000))
  const thread: (Message | PendingMessage)[] = [...messages, ...visiblePending]

  // Banner only while the most recent reply is the one that failed — once a later reply goes
  // through, old failures just keep their small "Not sent" tag.
  const lastOut = thread.findLast(m => m.direction === 'OUT')
  const sendError = lastOut?.status === 'FAILED' ? lastOut.errorMessage ?? 'Message could not be sent.' : null

  const loadDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/instagram/conversations/${conversationId}`)
      if (res.ok) setDetail(await res.json())
    } catch { /* offline — keep what's on screen */ }
  }, [conversationId])

  // Lead panel on the right — open by default on desktop (remembered per browser, shared with
  // the WhatsApp thread); a full-screen overlay on a phone, so it starts closed there.
  const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  const [panelOpen, setPanelOpen] = useState(() => {
    if (isPhone()) return false
    try { return localStorage.getItem(PANEL_PREF_KEY) !== '0' } catch { return true }
  })
  function togglePanel(open: boolean) {
    setPanelOpen(open)
    if (isPhone()) return
    try { localStorage.setItem(PANEL_PREF_KEY, open ? '1' : '0') } catch { /* storage blocked */ }
  }

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setDetailLoading(true)
    setReplyTo(null)
    setPending([])
    stickToBottom.current = true
    ;(async () => {
      await loadDetail()
      if (cancelled) return
      setDetailLoading(false)
      fetch(`/api/instagram/conversations/${conversationId}`, { method: 'PATCH' }).catch(() => {})
      onConversationUpdate()
    })()
    return () => { cancelled = true }
  }, [conversationId])

  // Realtime: page.tsx re-dispatches the server's 'chat' SSE topic as 'chat-changed' the moment a
  // DM lands (webhook or the Messenger poller), so new messages show without waiting on a poll.
  // The slow poll is only a safety net for a dropped SSE connection.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => { clearTimeout(timer); timer = setTimeout(loadDetail, 150) }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('chat-changed', refresh)
    document.addEventListener('visibilitychange', onVisible)
    const poll = setInterval(loadDetail, 10_000)
    return () => {
      clearTimeout(timer); clearInterval(poll)
      window.removeEventListener('chat-changed', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadDetail])

  // Follow new messages only when the rep is already at the bottom (or just sent one) —
  // never yank them away from older messages they're reading.
  const lastId = thread[thread.length - 1]?.id
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [lastId, thread.length, detailLoading])
  function onScroll() {
    const el = scrollRef.current
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  function addPending(payload: SendPayload, extra?: Partial<PendingMessage>): string {
    const id = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const quoted = payload.replyToId ? thread.find(m => m.id === payload.replyToId) : null
    stickToBottom.current = true
    setPending(p => [...p, {
      id, direction: 'OUT', body: payload.body ?? null, mediaUrl: payload.mediaUrl ?? null, mediaType: payload.mediaType ?? null,
      status: 'PENDING', createdAt: new Date().toISOString(), errorMessage: null, sentByName: null,
      replyTo: quoted ? { id: quoted.id, body: quoted.body, direction: quoted.direction, mediaType: quoted.mediaType } : null,
      match: { body: payload.body ?? null, mediaUrl: payload.mediaUrl ?? null },
      ...extra,
    }])
    return id
  }

  async function postMessage(payload: SendPayload, tempId: string) {
    const fail = (error: string) => {
      setPending(p => p.map(m => m.id === tempId ? { ...m, status: 'FAILED', errorMessage: error, retry: payload, uploading: false } : m))
    }
    let res: Response
    try {
      res = await fetch(`/api/instagram/conversations/${conversationId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
    } catch {
      return fail('No connection — message not sent')
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.message) return fail(data?.error ?? 'Failed to send message')
    stickToBottom.current = true
    // Upsert by id — a refresh may already have brought this row in while Meta was answering.
    setDetail(prev => prev ? {
      ...prev,
      messages: prev.messages.some(m => m.id === data.message.id)
        ? prev.messages.map(m => m.id === data.message.id ? data.message : m)
        : [...prev.messages, data.message],
    } : prev)
    setPending(p => p.filter(m => m.id !== tempId))
    onConversationUpdate()
  }

  function sendMessage() {
    const text = draft.trim()
    if (!text) return
    const payload: SendPayload = { body: text, replyToId: replyTo?.id }
    const tempId = addPending(payload)
    setDraft('')
    setReplyTo(null)
    postMessage(payload, tempId)
  }

  function retry(m: PendingMessage) {
    if (!m.retry) return
    setPending(p => p.filter(x => x.id !== m.id))
    postMessage(m.retry, addPending(m.retry))
  }

  async function handleFilePicked(file: File) {
    const replyToId = replyTo?.id
    setReplyTo(null)
    const previewUrl = URL.createObjectURL(file)
    const tempId = addPending({ mediaType: file.type, replyToId }, { mediaUrl: previewUrl, match: null, uploading: true })
    let url: string
    try {
      url = (await uploadToR2('/api/instagram/upload', `instagram/${conversationId}/${Date.now()}-${file.name}`, file)).url
    } catch (e) {
      console.error(e)
      setPending(p => p.map(m => m.id === tempId ? { ...m, status: 'FAILED', uploading: false, errorMessage: 'Upload failed — pick the file again' } : m))
      return
    }
    const payload: SendPayload = { mediaUrl: url, mediaType: file.type, replyToId }
    setPending(p => p.map(m => m.id === tempId ? { ...m, uploading: false, match: { body: null, mediaUrl: url } } : m))
    await postMessage(payload, tempId)
  }

  return (
    <div className="flex-1 flex min-w-0 min-h-0">
    <div className="flex-1 flex flex-col min-w-0 bg-card">
      <div className="px-3 md:px-5 py-3 border-b bg-card flex items-center gap-3 shrink-0">
        {onBack && (
          <button onClick={onBack} title="Back to chats" className="md:hidden -ml-1 h-8 w-8 shrink-0 rounded-full flex items-center justify-center hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <Avatar>
          {detail?.profilePicUrl && <AvatarImage src={detail.profilePicUrl} alt={contactName} />}
          <AvatarFallback className="text-xs font-semibold bg-muted">{initials(chatDisplayName(detail?.lead?.name, detail?.displayName ?? '') || null, detail?.igUsername ?? null)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{contactName}</p>
          <p className="text-xs text-muted-foreground">
            {isMessenger ? 'Facebook Messenger' : detail?.igUsername && detail.displayName ? `@${detail.igUsername} · Instagram` : 'Instagram'}
          </p>
        </div>
        {detail?.lead && (
          <span className={`shrink-0 text-[11px] font-medium rounded-full px-2 py-0.5 ${LEAD_STAGE_COLOR[detail.lead.stage]}`} title="Lead stage">
            {LEAD_STAGE_LABEL[detail.lead.stage]}
          </span>
        )}
        {(detail?.brand || detail?.ourAccountUsername) && (
          <p className="hidden sm:block text-xs text-muted-foreground shrink-0">
            To: <span className="font-medium text-foreground">{detail.brand ? WHATSAPP_BRAND_LABELS[detail.brand] : `@${detail.ourAccountUsername}`}</span>
          </p>
        )}
        {!panelOpen && (
          <button type="button" onClick={() => togglePanel(true)} title="Show lead" aria-label="Show lead"
            className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground">
            <PanelRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-1.5">
        {detailLoading ? (
          <div className="flex flex-col items-center gap-2 pt-10 text-xs text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />Loading messages…
          </div>
        ) : thread.map(m => {
          const isPending = 'match' in m
          const failed = m.status === 'FAILED'
          // Blob preview of an image still uploading from this browser.
          const rawUrl: string | null = m.mediaUrl
          const mediaSrc = (isPending && rawUrl?.startsWith('blob:')) || isHttpUrl(rawUrl) ? rawUrl : null
          return (
          <div key={m.id} className={`group flex items-center gap-1.5 ${m.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
            {m.direction === 'OUT' && !isPending && (
              <button onClick={() => setReplyTo(m)} title="Reply"
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0">
                <Reply className="h-3.5 w-3.5" />
              </button>
            )}
            <div className={`max-w-[65%] flex flex-col ${m.direction === 'OUT' ? 'items-end' : 'items-start'}`}>
            <div className={`rounded-3xl px-4 py-2 text-sm ${m.direction === 'OUT' ? 'text-white' : 'bg-muted text-foreground'} ${failed ? 'opacity-60' : m.status === 'PENDING' ? 'opacity-75' : ''}`}
              style={m.direction === 'OUT' ? { backgroundColor: accent } : undefined}>
              {m.replyTo && (
                <div className={`rounded-2xl px-3 py-1.5 mb-1.5 border-l-2 text-xs ${m.direction === 'OUT' ? 'bg-black/15 border-white/50 text-white/80' : 'bg-foreground/5 border-[#3897F0] text-muted-foreground'}`}>
                  <p className="font-medium">{m.replyTo.direction === 'OUT' ? 'You' : contactName}</p>
                  <p className="truncate">{quoteSnippet(m.replyTo)}</p>
                </div>
              )}
              {mediaSrc && (
                m.mediaType?.startsWith('image/')
                  ? <img src={mediaSrc} alt="Attachment" className="rounded-2xl mb-1 max-h-60 object-cover" />
                  : <a href={mediaSrc} target="_blank" rel="noopener noreferrer" className="underline text-xs">Attachment</a>
              )}
              {!mediaSrc && m.mediaType && m.direction === 'IN' && !m.errorMessage && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading attachment…</p>
              )}
              {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
            </div>
            {failed ? (
              <p className="flex items-center gap-1 text-[10px] text-destructive mt-0.5 px-1">
                <span className="inline-flex items-center gap-1 cursor-help" title={m.errorMessage ?? undefined}><AlertCircle className="h-3 w-3 shrink-0" />Not sent</span>
                {isPending && m.retry && (
                  <button type="button" onClick={() => retry(m)} className="inline-flex items-center gap-0.5 font-medium underline ml-1">
                    <RotateCcw className="h-2.5 w-2.5" />Retry
                  </button>
                )}
                {isPending && (
                  <button type="button" onClick={() => setPending(p => p.filter(x => x.id !== m.id))} title="Dismiss" aria-label="Dismiss" className="ml-1 hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </p>
            ) : m.status === 'PENDING' ? (
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5 px-1">
                <Loader2 className="h-3 w-3 animate-spin" />{isPending && m.uploading ? 'Uploading…' : 'Sending…'}
              </p>
            ) : m.direction === 'OUT' && m.sentByName ? (
              <p className="text-[10px] text-muted-foreground mt-0.5 px-1">{m.sentByName}{m.status === 'READ' ? ' · Seen' : ''}</p>
            ) : m.direction === 'IN' && m.errorMessage ? (
              <p className="text-[11px] text-muted-foreground mt-0.5 px-1">{m.errorMessage}</p>
            ) : null}
            </div>
            {m.direction === 'IN' && (
              <button onClick={() => setReplyTo(m)} title="Reply"
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0">
                <Reply className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          )
        })}
        {!detailLoading && messages.length ? (
          <p className="text-[10px] text-muted-foreground text-right pr-1 pt-1">
            {formatDate(messages[messages.length - 1].createdAt, 'time')}
          </p>
        ) : null}
      </div>

      <div className="border-t bg-card shrink-0">
        {sendError && (
          <div className="mx-3 mt-2.5 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" title={sendError}>
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
            <span>{friendlySendError(sendError, isMessenger)}</span>
          </div>
        )}
        {replyWindow && (
          <p className={`flex items-center gap-1.5 px-4 pt-2 text-xs ${replyWindow === 'closed' ? 'text-destructive' : 'text-warning'}`}>
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {replyWindow === 'closed'
              ? "Customer's last message was over 7 days ago — Meta won't deliver a reply until they message again."
              : "Customer's last message was over 24h ago — replies are sent as Human Agent (allowed up to 7 days)."}
          </p>
        )}
        {replyTo && (
          <div className="flex items-center gap-2 px-3 pt-2.5">
            <div className="flex-1 min-w-0 flex items-center gap-2 bg-muted/60 rounded-2xl px-3 py-1.5 border-l-2" style={{ borderColor: accent }}>
              <div className="min-w-0">
                <p className="text-xs font-medium">Replying to {replyTo.direction === 'OUT' ? 'yourself' : contactName}</p>
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
          <button onClick={() => fileInputRef.current?.click()} title="Send photo or video" aria-label="Send photo or video"
            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <ImageIcon className="h-4 w-4" />
          </button>
          <input
            className="flex-1 h-10 rounded-full border px-4 text-sm focus:outline-none focus:ring-1"
            style={{ '--tw-ring-color': accent } as React.CSSProperties}
            placeholder="Message…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendMessage() } }}
          />
          {draft.trim() ? (
            <button onClick={sendMessage} className="text-sm font-semibold shrink-0" style={{ color: accent }}>
              Send
            </button>
          ) : (
            <Heart className="h-6 w-6 text-muted-foreground shrink-0" />
          )}
        </div>
      </div>
    </div>
    {panelOpen && (
      <aside className="fixed inset-0 z-40 md:static md:z-auto w-full md:w-80 shrink-0 md:border-l bg-card flex flex-col min-h-0">
        <div className="px-4 h-[57px] border-b flex items-center justify-between shrink-0">
          <p className="text-sm font-semibold">Lead</p>
          <button type="button" onClick={() => togglePanel(false)} title="Hide panel" aria-label="Hide panel"
            className="h-8 w-8 -mr-2 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {detail ? (
            <ChatLeadSection channel="instagram" conversationId={conversationId} leadId={detail.leadId} assignedToId={detail.assignedToId}
              onChanged={() => { loadDetail(); onConversationUpdate() }} />
          ) : (
            <div className="flex justify-center pt-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          )}
        </div>
      </aside>
    )}
    </div>
  )
}
