'use client'

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { uploadToR2 } from '@/lib/r2-client'
import { Send, Loader2, Check, CheckCheck, AlertCircle, Paperclip, Reply, X, Image as ImageIcon, FileText, UserPlus, RotateCcw, Clock, Upload, PanelRight, ArrowLeft } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useFileDrop } from '@/hooks/useFileDrop'
import { formatDate } from '@/lib/format'
import WhatsappContactPanel from '@/components/whatsapp/WhatsappContactPanel'
import { missingTemplateParams, renderWhatsappTemplateBody } from '@/lib/whatsapp-templates'
import { WHATSAPP_BRAND_LABELS, type WhatsappBrand } from '@/lib/whatsapp-brands'
import { useWhatsappTemplates, templateKey } from '@/components/whatsapp/useWhatsappTemplates'
import { WHATSAPP_CHAT_CATEGORIES, WHATSAPP_CHAT_CATEGORY_LABEL, type WhatsappChatCategory } from '@/lib/whatsapp-chat-category'
import { LEAD_STAGE_COLOR, LEAD_STAGE_LABEL, type LeadStage } from '@/lib/lead-pipeline'

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
  templateName: string | null
  errorMessage: string | null
  createdAt: string
  replyTo: QuotedMessage | null
}
interface ConversationDetail {
  id: string; phone: string; contactName: string | null; brand: WhatsappBrand
  windowOpen: boolean; windowExpiresAt: string | null
  assignedToId: string | null
  assignedTo: { id: string; name: string | null; email: string } | null
  category: WhatsappChatCategory
  leadId: string | null
  lead: { id: string; name: string; stage: LeadStage } | null
}
export interface SalesUserOption { id: string; name: string | null; email: string }

interface SendPayload {
  body?: string; mediaUrl?: string; mediaType?: string; replyToId?: string
  templateName?: string; templateLanguage?: string; templateParams?: string[]
}
// A bubble shown before the server has confirmed it (optimistic send). `match` is what the
// real row will look like, so a realtime refresh that already contains it hides this one;
// `retry` is set once it failed without ever reaching the server.
interface PendingMessage extends Message {
  match: { body: string | null; mediaUrl: string | null } | null
  retry?: SendPayload
  uploading?: boolean
}

const UNASSIGNED = '__unassigned__'
// Meta's Cloud API caps per media type (https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media).
const MEDIA_LIMIT_MB: Record<string, number> = { image: 5, video: 16, audio: 16, application: 100 }

// Unsent drafts survive switching to another chat and back (module-level, per tab).
const drafts = new Map<string, string>()

function initials(name: string | null, phone: string) {
  if (name?.trim()) return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return phone.slice(-2)
}
function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  // Year is implied for the current year, so it's left off there ("Sat, 04 Oct").
  const full = formatDate(d, 'long')
  return d.getFullYear() === today.getFullYear() ? full.replace(/ \d{4}$/, '') : full
}
function quoteSnippet(q: QuotedMessage) {
  if (q.body) return q.body
  if (q.mediaType?.startsWith('image/')) return '📷 Photo'
  if (q.mediaType?.startsWith('video/')) return '🎥 Video'
  if (q.mediaType?.startsWith('audio/')) return '🎤 Audio'
  return '📎 Attachment'
}
// Our upload paths are `whatsapp/<conv>/<timestamp>-<name>` — show just the name.
function attachmentName(url: string) {
  const last = decodeURIComponent(url.split('/').pop() ?? '')
  return last.replace(/^\d{10,}-/, '') || 'Attachment'
}
function byCreatedAt(a: Message, b: Message) { return a.createdAt.localeCompare(b.createdAt) }

// The thread is refreshed as "newest page" snapshots — keep anything older the rep already
// paged in, replace the rest with the server's current copy (picks up receipts/failures).
function mergeLatest(prev: Message[], latest: Message[]): Message[] {
  if (!latest.length) return prev
  const ids = new Set(latest.map(m => m.id))
  const oldest = latest[0].createdAt
  return [...prev.filter(m => !ids.has(m.id) && m.createdAt < oldest), ...latest]
}
function upsert(prev: Message[], m: Message): Message[] {
  return (prev.some(p => p.id === m.id) ? prev.map(p => p.id === m.id ? m : p) : [...prev, m]).sort(byCreatedAt)
}

function StatusIcon({ status }: { status: Message['status'] }) {
  if (status === 'FAILED') return <AlertCircle className="h-3 w-3 text-red-300" />
  if (status === 'PENDING') return <Clock className="h-3 w-3 text-white/60" />
  if (status === 'READ') return <CheckCheck className="h-3 w-3 text-blue-300" />
  if (status === 'DELIVERED') return <CheckCheck className="h-3 w-3 text-white/60" />
  return <Check className="h-3 w-3 text-white/60" />
}

function windowLabel(expiresAt: string, now: number) {
  const mins = Math.floor((new Date(expiresAt).getTime() - now) / 60000)
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${Math.max(mins, 0)}m`
}

/**
 * The message-thread half of the old standalone WhatsApp page (src/components/whatsapp/ChatPage.tsx,
 * now removed) — split out so the unified inbox (src/components/chat/UnifiedInbox.tsx) can drop it
 * into its own right-hand pane next to a shared conversation list, instead of WhatsApp needing its
 * own separate screen with its own separate list.
 *
 * Live updates come from the realtime 'chat' topic (page.tsx re-dispatches it as a
 * 'chat-changed' window event); sends are optimistic so the rep never waits on Meta's API.
 */
const PANEL_PREF_KEY = 'wa-contact-panel-open'

export default function WhatsAppThread({ conversationId, onConversationUpdate, salesUsers = [], onOpenBooking, onOpenChat, onBack }: {
  conversationId: string
  // Mobile only — the inbox shows list and thread as separate screens; this returns to the list.
  onBack?: () => void
  onConversationUpdate: () => void
  // ADMIN only — the reps a chat can be reassigned to from the header.
  salesUsers?: SalesUserOption[]
  // From the contact panel: jump to a past booking / this number's chat on another brand.
  onOpenBooking?: (bookingId: string) => void
  onOpenChat?: (conversationId: string) => void
}) {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role ?? ''
  const isAdmin = role === 'ADMIN'
  const [assigning, setAssigning] = useState(false)
  const [categorizing, setCategorizing] = useState(false)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [pending, setPending] = useState<PendingMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [detailLoading, setDetailLoading] = useState(true)
  const [draft, setDraftState] = useState(() => drafts.get(conversationId) ?? '')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateParams, setTemplateParams] = useState<string[]>([])
  const [sendingTemplate, setSendingTemplate] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // Remembered per browser — reps on a small laptop screen may prefer the thread wider.
  // On a phone the panel is a full-screen overlay, so it always starts closed there.
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const olderLoaded = useRef(false)
  const lastInboundId = useRef<string | null>(null)
  // Whether the next render should jump to the bottom (own send, or new message while the
  // rep was already at the bottom) — never yank them down while reading history.
  const stickToBottom = useRef(true)
  const prependAnchor = useRef<number | null>(null)

  const windowOpen = detail?.windowExpiresAt ? new Date(detail.windowExpiresAt).getTime() > now : false
  // Free text / media only go through inside Meta's 24h customer-service window.
  const canFreeText = !detail || windowOpen
  const windowClosingSoon = windowOpen && detail?.windowExpiresAt && new Date(detail.windowExpiresAt).getTime() - now < 3 * 60 * 60 * 1000
  const contactLabel = detail?.contactName || detail?.phone

  const templates = useWhatsappTemplates(detail?.brand)
  const selectedTemplate = templates.find(t => templateKey(t) === templateName)

  function setDraft(value: string) {
    setDraftState(value)
    if (value) drafts.set(conversationId, value)
    else drafts.delete(conversationId)
  }

  const markRead = useCallback(() => {
    fetch(`/api/whatsapp/conversations/${conversationId}`, { method: 'PATCH' }).catch(() => {})
  }, [conversationId])

  const loadDetail = useCallback(async () => {
    const res = await fetch(`/api/whatsapp/conversations/${conversationId}`).catch(() => null)
    if (!res?.ok) return
    const data: ConversationDetail & { messages: Message[]; hasMore: boolean } = await res.json()
    const { messages: latest, hasMore: more, ...meta } = data
    const el = scrollRef.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) stickToBottom.current = true
    setDetail(meta)
    setMessages(prev => mergeLatest(prev, latest))
    if (!olderLoaded.current) setHasMore(more)

    // A new customer message arrived while this chat is open and on screen — it's been
    // seen, so don't leave it counted as unread in the inbox/sidebar badge.
    const newestIn = [...latest].reverse().find(m => m.direction === 'IN')?.id ?? null
    if (lastInboundId.current !== null && newestIn && newestIn !== lastInboundId.current && document.visibilityState === 'visible') markRead()
    lastInboundId.current = newestIn ?? lastInboundId.current ?? ''
  }, [conversationId, markRead])

  useEffect(() => {
    // Mounted fresh per chat (UnifiedInbox keys it by conversation id), so loading state starts true.
    let cancelled = false
    ;(async () => {
      await loadDetail()
      if (cancelled) return
      setDetailLoading(false)
      markRead()
      onConversationUpdate()
      textareaRef.current?.focus()
    })()
    return () => { cancelled = true }
  }, [conversationId])

  // Realtime refresh (coalesced), plus a slow poll as a safety net for a dropped SSE
  // connection, plus an immediate catch-up when the tab comes back into view.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => { clearTimeout(timer); timer = setTimeout(loadDetail, 150) }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('chat-changed', refresh)
    document.addEventListener('visibilitychange', onVisible)
    const poll = setInterval(loadDetail, 15000)
    return () => {
      clearTimeout(timer); clearInterval(poll)
      window.removeEventListener('chat-changed', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadDetail])

  // Presence heartbeat while this chat is on screen — the webhook skips the bell/push for a
  // rep already looking at it (see src/lib/chat-presence.ts).
  useEffect(() => {
    const url = `/api/whatsapp/conversations/${conversationId}/presence`
    const beat = () => { if (document.visibilityState === 'visible') fetch(url, { method: 'POST' }).catch(() => {}) }
    const leave = () => fetch(url, { method: 'DELETE', keepalive: true }).catch(() => {})
    const onVisibility = () => (document.visibilityState === 'visible' ? beat() : leave())
    beat()
    const t = setInterval(beat, 20000)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', leave)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', leave)
      leave()
    }
  }, [conversationId])

  // Keeps the 24h-window countdown current.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  // Hide an optimistic bubble once a refresh already brought in the real row for it
  // (the server saves the row before calling Meta, so this can land before the POST returns).
  const visiblePending = pending.filter(p => p.retry || !p.match || !messages.some(m =>
    m.direction === 'OUT' && m.body === p.match!.body && m.mediaUrl === p.match!.mediaUrl &&
    Date.parse(m.createdAt) >= Date.parse(p.createdAt) - 60000))
  const thread: (Message | PendingMessage)[] = [...messages, ...visiblePending]
  const lastId = thread[thread.length - 1]?.id

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (prependAnchor.current !== null) {
      // Older page was inserted above — keep the same message under the rep's eyes.
      el.scrollTop = el.scrollHeight - prependAnchor.current
      prependAnchor.current = null
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight
      stickToBottom.current = false
    }
  }, [lastId, thread.length, detailLoading])

  // Grow the composer with its content (up to max-h), like WhatsApp does.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  async function loadOlder() {
    const oldest = messages[0]
    if (!oldest || loadingOlder) return
    setLoadingOlder(true)
    try {
      const res = await fetch(`/api/whatsapp/conversations/${conversationId}?before=${oldest.id}`)
      if (!res.ok) return
      const data: { messages: Message[]; hasMore: boolean } = await res.json()
      olderLoaded.current = true
      if (scrollRef.current) prependAnchor.current = scrollRef.current.scrollHeight - scrollRef.current.scrollTop
      setMessages(prev => [...data.messages.filter(m => !prev.some(p => p.id === m.id)), ...prev])
      setHasMore(data.hasMore)
    } finally {
      setLoadingOlder(false)
    }
  }

  // Sends one message. With `tempId`, an optimistic bubble already shows it — it's swapped
  // for the saved row on success, or flagged with a retry on a failure that never reached
  // the server. Without one (template sends), errors only toast.
  async function postMessage(payload: SendPayload, tempId?: string): Promise<boolean> {
    const fail = (error: string) => {
      toast.error(error)
      if (tempId) setPending(p => p.map(m => m.id === tempId ? { ...m, status: 'FAILED', errorMessage: error, retry: payload, uploading: false } : m))
      return false
    }
    let res: Response
    try {
      res = await fetch(`/api/whatsapp/conversations/${conversationId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
    } catch {
      return fail('No connection — message not sent')
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return fail(data?.error ?? 'Failed to send message')
    if (data?.providerError) toast.error(`WhatsApp rejected the message: ${data.providerError}`)
    stickToBottom.current = true
    if (data?.message) setMessages(prev => upsert(prev, data.message))
    if (tempId) setPending(p => p.filter(m => m.id !== tempId))
    onConversationUpdate()
    return true
  }

  function addPending(payload: SendPayload, extra?: Partial<PendingMessage>): string {
    const id = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const quoted = payload.replyToId ? thread.find(m => m.id === payload.replyToId) : null
    stickToBottom.current = true
    setPending(p => [...p, {
      id, direction: 'OUT', body: payload.body ?? null, mediaUrl: payload.mediaUrl ?? null, mediaType: payload.mediaType ?? null,
      status: 'PENDING', sentByName: session?.user?.name ?? null, templateName: null, errorMessage: null,
      createdAt: new Date().toISOString(),
      replyTo: quoted ? { id: quoted.id, body: quoted.body, direction: quoted.direction, mediaType: quoted.mediaType } : null,
      match: { body: payload.body ?? null, mediaUrl: payload.mediaUrl ?? null },
      ...extra,
    }])
    return id
  }

  // ADMIN: reassign/release. SALES: claim an unassigned chat for themselves.
  async function assignTo(assignedToId: string | null) {
    setAssigning(true)
    try {
      const res = await fetch(`/api/whatsapp/conversations/${conversationId}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignedToId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? 'Failed to update assignment'); return }
      await loadDetail()
      onConversationUpdate()
    } finally {
      setAssigning(false)
    }
  }

  // Triage for the WhatsApp Pipeline — SALES creates/links this chat's Lead server-side.
  async function setCategory(category: WhatsappChatCategory) {
    setCategorizing(true)
    try {
      const res = await fetch(`/api/whatsapp/conversations/${conversationId}/category`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? 'Failed to change category'); return }
      await loadDetail()
      onConversationUpdate()
    } finally {
      setCategorizing(false)
    }
  }

  // Never blocks the composer — the rep can keep typing and sending while earlier
  // messages are still on their way.
  function sendMessage() {
    const text = draft.trim()
    if (!text || !canFreeText) return
    const payload: SendPayload = { body: text, replyToId: replyTo?.id }
    const tempId = addPending(payload)
    setDraft('')
    setReplyTo(null)
    textareaRef.current?.focus()
    postMessage(payload, tempId)
  }

  function retry(m: Message | PendingMessage) {
    const payload: SendPayload = 'retry' in m && m.retry
      ? m.retry
      : { body: m.body ?? undefined, mediaUrl: m.mediaUrl ?? undefined, mediaType: m.mediaType ?? undefined }
    if ('retry' in m && m.retry) setPending(p => p.filter(x => x.id !== m.id))
    postMessage(payload, addPending(payload))
  }

  function openTemplatePicker() {
    setTemplateName(templates[0] ? templateKey(templates[0]) : '')
    setTemplateParams(new Array(templates[0]?.paramLabels?.length ?? 0).fill(''))
    setTemplateOpen(true)
  }

  async function sendTemplate() {
    if (!selectedTemplate) return
    setSendingTemplate(true)
    try {
      const ok = await postMessage({ templateName: selectedTemplate.name, templateLanguage: selectedTemplate.language, templateParams, replyToId: replyTo?.id })
      if (ok) { setTemplateOpen(false); setReplyTo(null) }
    } finally {
      setSendingTemplate(false)
    }
  }

  async function handleFilePicked(file: File) {
    if (!canFreeText) { toast.error('The 24h window is closed — send a Message Template first'); return }
    const kind = file.type.split('/')[0]
    const limitMb = MEDIA_LIMIT_MB[kind]
    if (!limitMb || (kind === 'application' && file.type !== 'application/pdf')) {
      toast.error('Only images, videos, audio and PDF can be sent'); return
    }
    if (file.size > limitMb * 1024 * 1024) {
      toast.error(`WhatsApp only accepts ${kind === 'application' ? 'documents' : `${kind}s`} up to ${limitMb}MB`); return
    }
    const caption = draft.trim() || undefined
    const replyToId = replyTo?.id
    setDraft('')
    setReplyTo(null)
    const previewUrl = URL.createObjectURL(file)
    const tempId = addPending({ body: caption, mediaType: file.type, replyToId }, { mediaUrl: previewUrl, match: null, uploading: true })
    const safeName = file.name.replace(/[^\w.\-]+/g, '_')
    let url: string
    try {
      url = (await uploadToR2('/api/whatsapp/upload', `whatsapp/${conversationId}/${Date.now()}-${safeName}`, file)).url
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Upload failed'
      toast.error(error)
      setPending(p => p.filter(m => m.id !== tempId))
      setDraft(caption ?? '')
      URL.revokeObjectURL(previewUrl)
      return
    }
    const payload: SendPayload = { body: caption, mediaUrl: url, mediaType: file.type, replyToId }
    setPending(p => p.map(m => m.id === tempId ? { ...m, uploading: false, match: { body: caption ?? null, mediaUrl: url } } : m))
    await postMessage(payload, tempId)
  }

  const { isDragging, dropProps } = useFileDrop(files => { if (files[0]) handleFilePicked(files[0]) })


  return (
    <div className="flex-1 flex min-w-0 min-h-0">
    <div className="flex-1 flex flex-col min-w-0 relative bg-[#efeae2] dark:bg-[#0b141a]" {...dropProps}>
      {isDragging && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/80 border-2 border-dashed border-success pointer-events-none">
          <p className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--success)' }}><Upload className="h-4 w-4" /> Drop to send</p>
        </div>
      )}
      <div className="px-3 md:px-5 py-2 md:py-3 border-b bg-card flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-2 shrink-0">
        {onBack && (
          <Button type="button" variant="ghost" size="icon" onClick={onBack} title="Back to chats" aria-label="Back to chats" className="md:hidden -ml-1 size-8 shrink-0 rounded-full">
            <ArrowLeft className="size-5" />
          </Button>
        )}
        <Avatar>
          <AvatarFallback className="text-xs font-semibold" style={{ backgroundColor: `${ACCENT}22`, color: 'var(--success)' }}>
            {initials(detail?.contactName ?? null, detail?.phone ?? '')}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{contactLabel}</p>
          <p className="text-xs text-muted-foreground truncate">
            {detail?.phone && (
              <a href={`https://wa.me/${detail.phone}`} target="_blank" rel="noopener noreferrer" className="hover:underline" title="Open in WhatsApp">+{detail.phone}</a>
            )}
            {detail && <> · via <span className="font-medium">{WHATSAPP_BRAND_LABELS[detail.brand]}</span></>}
          </p>
        </div>
        {/* Phone: stage + category/assignee drop to their own full-width row under the name. */}
        <div className="order-last md:order-none w-full md:w-auto flex items-center gap-2 md:gap-3">
          {detail?.category === 'SALES' && detail.lead && (
            <span className={`shrink-0 text-[11px] font-medium rounded-full px-2 py-0.5 ${LEAD_STAGE_COLOR[detail.lead.stage]}`} title="Lead stage in the WhatsApp Pipeline">
              {LEAD_STAGE_LABEL[detail.lead.stage]}
            </span>
          )}
          {detail && (
            <Select value={detail.category} onValueChange={v => setCategory(v as WhatsappChatCategory)} disabled={categorizing}>
              <SelectTrigger aria-label="Chat category" className={`h-8 flex-1 min-w-0 md:flex-none md:w-40 text-xs ${detail.category === 'UNSORTED' ? 'border-warning text-warning' : ''}`} title="Chat category (Sales = goes into the WhatsApp Pipeline)">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WHATSAPP_CHAT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{WHATSAPP_CHAT_CATEGORY_LABEL[c]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {detail && isAdmin && (
            <Select value={detail.assignedToId ?? UNASSIGNED} onValueChange={v => assignTo(v === UNASSIGNED ? null : v)} disabled={assigning}>
              <SelectTrigger aria-label="Sales rep handling this chat" className="h-8 flex-1 min-w-0 md:flex-none md:w-48 text-xs" title="Sales rep handling this chat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {/* Keep the current holder selectable even if they've since lost the SALES role. */}
                {detail.assignedTo && !salesUsers.some(u => u.id === detail.assignedToId) && (
                  <SelectItem value={detail.assignedTo.id}>{detail.assignedTo.name ?? detail.assignedTo.email}</SelectItem>
                )}
                {salesUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name ?? u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        {!panelOpen && (
          <Button type="button" variant="ghost" size="icon" onClick={() => togglePanel(true)} title="Show contact info" aria-label="Show contact info"
            className="size-8 shrink-0 text-muted-foreground">
            <PanelRight className="h-4 w-4" />
          </Button>
        )}
      </div>
      {detail && !isAdmin && detail.assignedToId === null && (
        <div className="px-5 py-2 bg-warning/10 border-b text-xs flex items-center justify-between gap-2 shrink-0">
          <span className="text-warning">No sales rep is handling this chat yet. Take it to add it to your list (replying also takes it automatically).</span>
          <Button size="sm" variant="outline" className="h-7 shrink-0" loading={assigning} onClick={() => session?.user?.id && assignTo(session.user.id)}>
            {!assigning && <UserPlus className="size-3.5" />} Take chat
          </Button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-2">
        {detailLoading && !messages.length ? (
          <div className="flex justify-center pt-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center">
                <button type="button" onClick={loadOlder} disabled={loadingOlder} aria-label={loadingOlder ? 'Loading older messages' : undefined} className="text-xs rounded-full bg-card/90 shadow-sm px-3 py-1 text-muted-foreground hover:text-foreground">
                  {loadingOlder ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Load older messages'}
                </button>
              </div>
            )}
            {thread.map((m, i) => {
              const showDay = i === 0 || dayLabel(thread[i - 1].createdAt) !== dayLabel(m.createdAt)
              const isPending = 'match' in m
              const failed = m.status === 'FAILED'
              const canRetry = m.direction === 'OUT' && failed && !m.templateName && (isPending ? !!m.retry : true)
              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="flex justify-center my-3">
                      <span className="text-[11px] rounded-md bg-card/90 shadow-sm px-2.5 py-0.5 text-muted-foreground">{dayLabel(m.createdAt)}</span>
                    </div>
                  )}
                  <div className={`group flex items-center gap-1.5 ${m.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
                    {m.direction === 'OUT' && !isPending && (
                      <button type="button" onClick={() => { setReplyTo(m); textareaRef.current?.focus() }} title="Reply" aria-label="Reply to message"
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0">
                        <Reply className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <div className={`max-w-[85%] md:max-w-[70%] min-w-0 [overflow-wrap:anywhere] rounded-lg px-3 py-2 shadow-sm text-sm ${m.direction === 'OUT' ? 'text-white' : 'bg-card text-foreground'} ${isPending && !failed ? 'opacity-80' : ''}`}
                      style={m.direction === 'OUT' ? { backgroundColor: '#005c4b' } : undefined}>
                      {m.replyTo && (
                        <div className={`rounded px-2 py-1 mb-1.5 border-l-2 text-xs ${m.direction === 'OUT' ? 'bg-black/15 border-white/50 text-white/80' : 'bg-foreground/5 border-success text-muted-foreground'}`}>
                          <p className="font-medium">{m.replyTo.direction === 'OUT' ? 'You' : contactLabel}</p>
                          <p className="truncate">{quoteSnippet(m.replyTo)}</p>
                        </div>
                      )}
                      {m.mediaUrl && <MediaBlock url={m.mediaUrl} type={m.mediaType} out={m.direction === 'OUT'} />}
                      {/* Inbound media is re-hosted in the background by the webhook — placeholder until it lands. */}
                      {m.direction === 'IN' && !m.mediaUrl && m.mediaType && (
                        m.errorMessage
                          ? <p className="flex items-center gap-1 text-xs text-destructive mb-1"><AlertCircle className="h-3 w-3" /> {m.errorMessage}</p>
                          : <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading {quoteSnippet({ ...m, body: null }).replace(/^\S+\s/, '').toLowerCase()}…</p>
                      )}
                      {isPending && m.uploading && (
                        <p className="flex items-center gap-1 text-[10px] text-white/70 mb-1"><Loader2 className="h-2.5 w-2.5 animate-spin" /> Uploading…</p>
                      )}
                      {m.templateName && (
                        <p className={`flex items-center gap-1 text-[10px] mb-1 font-medium ${m.direction === 'OUT' ? 'text-white/70' : 'text-muted-foreground'}`}>
                          <FileText className="h-2.5 w-2.5" /> Template: {m.templateName}
                        </p>
                      )}
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                      <div className={`flex items-center gap-1 mt-1 justify-end ${m.direction === 'OUT' ? 'text-white/70' : 'text-muted-foreground'}`}>
                        {m.direction === 'OUT' && m.sentByName && isAdmin && <span className="text-[10px] mr-1">{m.sentByName}</span>}
                        <span className="text-[10px]">{formatDate(m.createdAt, 'time')}</span>
                        {m.direction === 'OUT' && <StatusIcon status={m.status} />}
                      </div>
                      {m.direction === 'OUT' && failed && (m.errorMessage || canRetry) && (
                        <div className="mt-1 flex items-start gap-1.5 text-[10px] text-red-100 bg-destructive/30 rounded px-1.5 py-0.5">
                          {m.errorMessage && <span className="break-words flex-1">{m.errorMessage}</span>}
                          {canRetry && (
                            <button type="button" onClick={() => retry(m)} className="shrink-0 inline-flex items-center gap-0.5 font-medium underline">
                              <RotateCcw className="h-2.5 w-2.5" /> Retry
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {m.direction === 'IN' && (
                      <button type="button" onClick={() => { setReplyTo(m); textareaRef.current?.focus() }} title="Reply" aria-label="Reply to message"
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0">
                        <Reply className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      <div className="border-t bg-card shrink-0">
        {detail && !windowOpen && (
          <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1 text-xs">
            <span className="text-warning">
              {detail.windowExpiresAt
                ? 'More than 24h since the customer last replied — WhatsApp only accepts a Message Template now.'
                : 'The customer hasn’t messaged this number yet — start with a Message Template.'}
            </span>
            <Button type="button" variant="link" onClick={openTemplatePicker} className="h-auto shrink-0 p-0 text-xs text-success underline">
              Send Template
            </Button>
          </div>
        )}
        {windowClosingSoon && detail?.windowExpiresAt && (
          <p className="px-3 pt-2 text-[11px] text-warning flex items-center gap-1">
            <Clock className="h-3 w-3" /> Reply window closes in {windowLabel(detail.windowExpiresAt, now)} — after that only templates go through.
          </p>
        )}
        {replyTo && (
          <div className="flex items-center gap-2 px-3 pt-2.5">
            <div className="flex-1 min-w-0 flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-1.5 border-l-2 border-success">
              <div className="min-w-0">
                <p className="text-xs font-medium">Replying to {replyTo.direction === 'OUT' ? 'yourself' : contactLabel}</p>
                <p className="text-xs text-muted-foreground truncate">{quoteSnippet(replyTo)}</p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="size-8 shrink-0 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="p-3 flex items-end gap-2">
          <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,application/pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFilePicked(f); e.target.value = '' }} />
          <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={!canFreeText}
            title="Attach photo, video, audio or PDF (or drag & drop / paste)" aria-label="Attach photo, video, audio or PDF"
            className="shrink-0 rounded-full text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Popover open={templateOpen} onOpenChange={setTemplateOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onClick={openTemplatePicker} title="Send a Message Template" aria-label="Send a Message Template"
                className="shrink-0 rounded-full text-muted-foreground">
                <FileText className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] space-y-3" side="top" align="start">
              <div className="space-y-1">
                <p className="text-xs font-medium">Message Template</p>
                <p className="text-[11px] text-muted-foreground">For customers who haven&apos;t messaged yet, or whose last reply was more than 24h ago.</p>
              </div>
              {templates.length === 0 ? (
                <p className="text-xs text-muted-foreground">No templates registered for this number yet (Chat &gt; WhatsApp Templates).</p>
              ) : (
                <Select value={templateName} onValueChange={v => { setTemplateName(v); setTemplateParams(new Array(templates.find(t => templateKey(t) === v)?.paramLabels?.length ?? 0).fill('')) }}>
                  <SelectTrigger aria-label="Message Template" className="h-9 w-full text-sm"><SelectValue placeholder="Choose template" /></SelectTrigger>
                  <SelectContent>
                    {templates.map(t => <SelectItem key={templateKey(t)} value={templateKey(t)}>{t.label} ({t.language})</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {selectedTemplate?.paramLabels?.map((label, i) => (
                <Input key={i} placeholder={label} aria-label={label} value={templateParams[i] ?? ''}
                  onChange={e => setTemplateParams(prev => { const next = [...prev]; next[i] = e.target.value; return next })}
                  className="h-9 text-sm" />
              ))}
              {selectedTemplate && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap border rounded-md p-2 bg-muted/40">
                  {renderWhatsappTemplateBody(selectedTemplate, templateParams)}
                </p>
              )}
              <Button onClick={sendTemplate} loading={sendingTemplate} disabled={!selectedTemplate || missingTemplateParams(selectedTemplate, templateParams)} className="w-full" style={{ backgroundColor: ACCENT }}>
                Send Template
              </Button>
            </PopoverContent>
          </Popover>
          <Textarea
            ref={textareaRef}
            rows={1}
            disabled={!canFreeText}
            aria-label="Message"
            className="flex-1 min-h-9 max-h-36 resize-none rounded-lg disabled:bg-muted/50"
            placeholder={canFreeText ? 'Type a message… (Shift+Enter for a new line)' : 'Reply window closed — use a Message Template'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendMessage() } }}
            onPaste={e => {
              const file = Array.from(e.clipboardData.files)[0]
              if (file) { e.preventDefault(); handleFilePicked(file) }
            }}
          />
          <Button type="button" size="icon" onClick={sendMessage} disabled={!draft.trim() || !canFreeText} aria-label="Send message"
            className="shrink-0 rounded-full text-white"
            style={{ backgroundColor: ACCENT }}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
    {panelOpen && (
      <WhatsappContactPanel conversationId={conversationId} leadId={detail?.leadId ?? null}
        onClose={() => togglePanel(false)} onOpenBooking={onOpenBooking} onOpenChat={onOpenChat} />
    )}
    </div>
  )
}

function MediaBlock({ url, type, out }: { url: string; type: string | null; out: boolean }) {
  if (type?.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" title="Open full size">
        <img src={url} alt="Attachment" className="rounded-md mb-1.5 max-h-60 object-cover" />
      </a>
    )
  }
  if (type?.startsWith('video/')) return <video src={url} controls preload="metadata" className="rounded-md mb-1.5 max-h-60 max-w-full" />
  if (type?.startsWith('audio/')) return <audio src={url} controls preload="metadata" className="mb-1.5 max-w-full" />
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className={`flex items-center gap-1.5 mb-1.5 text-xs underline ${out ? 'text-white/90' : 'text-info'}`}>
      <Paperclip className="h-3 w-3 shrink-0" /> <span className="truncate">{attachmentName(url)}</span>
    </a>
  )
}
