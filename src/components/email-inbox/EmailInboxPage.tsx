'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { uploadToR2 } from '@/lib/r2-client'
import { useFileDrop } from '@/hooks/useFileDrop'
import {
  Search, Send, Loader2, Mail, Paperclip, X, Star, Pencil, ArrowLeft, Image as ImageIcon, FileText, Inbox,
  Reply, Forward, Trash2, ChevronDown, Film,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { isHttpUrl } from '@/lib/url-safety'
import EmailComposer, { SignaturePreview, EMAIL_BODY_CLASSES, type ComposerValue } from './EmailComposer'

const ACCENT = '#1a73e8' // familiar "email" blue
const EMPTY_DRAFT: ComposerValue = { html: '', text: '', isEmpty: true }

interface ConversationSummary {
  id: string
  fromEmail: string
  fromName: string | null
  subject: string
  lastMessageAt: string
  lastMessagePreview: string | null
  unreadCount: number
  starred: boolean
  messageCount: number
  hasReply: boolean
  attachmentUrls: string[]
  assignedTo: { id: string; name: string | null } | null
}
interface Message {
  id: string
  direction: 'IN' | 'OUT'
  body: string | null
  bodyHtml?: string | null
  signatureHtml?: string | null
  attachmentUrls: string[]
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED'
  sentByName: string | null
  createdAt: string
}
interface ConversationDetail extends Omit<ConversationSummary, 'messageCount' | 'hasReply' | 'attachmentUrls'> {
  messages: Message[]
}
type Filter = 'all' | 'unread' | 'starred'

// Gmail-like letter avatars: a stable color per address
const AVATAR_COLORS = ['#e8453c', '#f4511e', '#f6bf26', '#33b679', '#0b8043', '#039be5', '#3f51b5', '#7986cb', '#8e24aa', '#d81b60', '#616161', '#795548']
function avatarColor(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function LetterAvatar({ name, email, size = 40 }: { name: string | null; email: string; size?: number }) {
  const letter = (name?.trim() || email).charAt(0).toUpperCase()
  return (
    <span className="shrink-0 rounded-full flex items-center justify-center text-white font-medium select-none"
      style={{ width: size, height: size, fontSize: size * 0.45, backgroundColor: avatarColor(email.toLowerCase()) }}>
      {letter}
    </span>
  )
}

function fileNameFromUrl(url: string) {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
    return last.replace(/^\d+-/, '') || 'attachment'
  } catch { return 'attachment' }
}
function AttachmentIcon({ name }: { name: string }) {
  const isImage = /\.(png|jpe?g|gif|webp|heic|svg)$/i.test(name)
  const isVideo = /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(name)
  const Icon = isImage ? ImageIcon : isVideo ? Film : /\.pdf$/i.test(name) ? FileText : Paperclip
  return <span className="h-4 w-4 rounded-sm flex items-center justify-center bg-[#d93025] text-white shrink-0"><Icon className="h-2.5 w-2.5" /></span>
}
function AttachmentChip({ url, compact }: { url: string; compact?: boolean }) {
  const name = fileNameFromUrl(url)
  const inner = (
    <>
      <AttachmentIcon name={name} />
      <span className="truncate">{name}</span>
    </>
  )
  const cls = `flex items-center gap-1.5 rounded-full border bg-white text-xs text-foreground/80 ${compact ? 'px-2.5 py-1 max-w-[160px]' : 'px-3 py-1.5 max-w-[240px] hover:bg-muted transition-colors'}`
  if (compact) return <span className={cls}>{inner}</span>
  return <a href={url} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
}

function fmtListTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function EmailInboxPage({ initialConversationId }: { initialConversationId?: string } = {}) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [draft, setDraft] = useState<ComposerValue>(EMPTY_DRAFT)
  const [draftKey, setDraftKey] = useState(0)
  const [sending, setSending] = useState(false)
  const [compose, setCompose] = useState<{ open: boolean; key: number; initial?: ComposeInitial }>({ open: false, key: 0 })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [replyOpen, setReplyOpen] = useState(false)
  const { data: session } = useSession()
  const myName = session?.user?.name ?? session?.user?.email ?? 'Me'
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replyFiles = useAttachmentUploads(`email-inbox/${activeId ?? 'compose'}`)
  const pendingAttachments = replyFiles.urls
  const setPendingAttachments = replyFiles.setUrls
  const uploading = replyFiles.uploading > 0
  // Files dropped anywhere on the open thread go into the reply (opening it if needed)
  const threadDrop = useFileDrop(files => { setReplyOpen(true); replyFiles.upload(files) }, !activeId)

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

  async function openConversation(c: Pick<ConversationSummary, 'id' | 'unreadCount'>) {
    if (c.id !== activeId) { setExpanded(new Set()); setReplyOpen(false); replyFiles.reset() }
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

  async function toggleStar(id: string, starred: boolean) {
    setConversations(prev => prev.map(p => p.id === id ? { ...p, starred } : p))
    setDetail(prev => prev?.id === id ? { ...prev, starred } : prev)
    const res = await fetch(`/api/email-inbox/conversations/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ starred }),
    }).catch(() => null)
    if (!res?.ok) {
      toast.error('Failed to update star')
      setConversations(prev => prev.map(p => p.id === id ? { ...p, starred: !starred } : p))
      setDetail(prev => prev?.id === id ? { ...prev, starred: !starred } : prev)
    }
  }

  async function sendReply() {
    if ((draft.isEmpty && pendingAttachments.length === 0) || !activeId) return
    setSending(true)
    const { text, html, isEmpty } = draft
    const attachments = pendingAttachments
    setDraftKey(k => k + 1); replyFiles.reset()
    try {
      const res = await fetch(`/api/email-inbox/conversations/${activeId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, html: isEmpty ? '' : html, attachmentUrls: attachments }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.message) setDetail(prev => prev ? { ...prev, messages: [...prev.messages, data.message] } : prev)
      if (data?.providerError) toast.error(`Failed to send: ${data.providerError}`)
      else setReplyOpen(false)
      await loadConversations()
    } finally { setSending(false) }
  }

  function discardReply() {
    setDraftKey(k => k + 1)
    replyFiles.reset()
    setReplyOpen(false)
  }

  /** Gmail-style Forward of the newest message: quoted header + body + its attachments. */
  function openForward(d: ConversationDetail) {
    const last = d.messages[d.messages.length - 1]
    if (!last) return
    const out = last.direction === 'OUT'
    const from = out ? (last.sentByName ?? 'Samara Yachting') : `${d.fromName ? `${d.fromName} ` : ''}&lt;${escapeHtml(d.fromEmail)}&gt;`
    const bodyHtml = last.bodyHtml || `<p>${escapeHtml(last.body ?? '').replace(/\n/g, '<br>')}</p>`
    const html =
      `<p></p><p>---------- Forwarded message ---------</p>` +
      `<p>From: <strong>${out ? escapeHtml(from) : from}</strong><br>Date: ${escapeHtml(fmtDateTime(last.createdAt))}<br>Subject: ${escapeHtml(d.subject)}<br>To: ${escapeHtml(out ? d.fromEmail : 'Samara Yachting')}</p><p></p>` +
      bodyHtml
    setCompose(prev => ({
      open: true, key: prev.key + 1,
      initial: { subject: /^fwd?:/i.test(d.subject) ? d.subject : `Fwd: ${d.subject}`, html, attachmentUrls: last.attachmentUrls.filter(isHttpUrl) },
    }))
  }

  // The editor's Cmd/Ctrl+Enter handler is bound once — always call the latest sendReply
  const sendReplyRef = useRef(sendReply)
  useEffect(() => { sendReplyRef.current = sendReply })

  const q = search.trim().toLowerCase()
  const filtered = conversations.filter(c =>
    (filter === 'all' || (filter === 'unread' ? c.unreadCount > 0 : c.starred)) &&
    (!q || (c.fromName ?? '').toLowerCase().includes(q) || c.fromEmail.toLowerCase().includes(q) ||
      c.subject.toLowerCase().includes(q) || (c.lastMessagePreview ?? '').toLowerCase().includes(q)))
  const unreadTotal = conversations.filter(c => c.unreadCount > 0).length

  return (
    <div className="h-[calc(100vh-6rem)] flex rounded-xl border overflow-hidden bg-white">
      {/* ── Thread list ── */}
      <div className={`relative w-full md:w-[400px] lg:w-[440px] shrink-0 md:border-r flex-col ${activeId ? 'hidden md:flex' : 'flex'}`}>
        <div className="px-3 pt-3 pb-2">
          <div className="flex items-center gap-3 h-12 rounded-full bg-[#eef2f6] px-4 focus-within:bg-white focus-within:shadow-md transition-all">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input className="flex-1 bg-transparent text-[15px] focus:outline-none placeholder:text-muted-foreground"
              placeholder="Search in emails" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            {([['all', 'Inbox'], ['unread', unreadTotal ? `Unread · ${unreadTotal}` : 'Unread'], ['starred', 'Starred']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`h-7 px-3 rounded-full text-xs font-medium border transition-colors ${filter === key ? 'bg-[#d3e3fd] border-transparent text-[#041e49]' : 'bg-white text-muted-foreground hover:bg-muted'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="px-5 pt-2 pb-1 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
          {filter === 'all' ? 'Inbox' : filter === 'unread' ? 'Unread' : 'Starred'}
        </p>

        <div className="flex-1 overflow-y-auto pb-24">
          {loading ? (
            <div className="p-4 space-y-4">{[...Array(6)].map((_, i) => (
              <div key={i} className="flex gap-3"><div className="h-10 w-10 rounded-full bg-muted animate-pulse" /><div className="flex-1 space-y-2"><div className="h-3 w-1/2 rounded bg-muted animate-pulse" /><div className="h-3 w-4/5 rounded bg-muted animate-pulse" /></div></div>
            ))}</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <Inbox className="h-10 w-10 mx-auto mb-3 opacity-30" />
              {conversations.length === 0 ? 'No emails yet — inbound messages will show up here.' : filter === 'starred' ? 'No starred emails' : filter === 'unread' ? 'You’re all caught up' : 'No matches'}
            </div>
          ) : filtered.map(c => {
            const unread = c.unreadCount > 0
            const who = c.fromName || c.fromEmail
            return (
              <div key={c.id} role="button" tabIndex={0} onClick={() => openConversation(c)}
                onKeyDown={e => { if (e.key === 'Enter') openConversation(c) }}
                className={`flex gap-3 px-4 py-3 cursor-pointer transition-colors ${activeId === c.id ? 'bg-[#e8f0fe]' : 'hover:bg-[#f2f6fc]'}`}>
                <LetterAvatar name={c.fromName} email={c.fromEmail} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`truncate text-[15px] ${unread ? 'font-bold text-foreground' : 'text-foreground/80'}`}>
                      {who}{c.hasReply && <span className="font-normal">, me</span>}
                      {c.messageCount > 1 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{c.messageCount}</span>}
                    </p>
                    <span className={`text-xs shrink-0 ${unread ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{fmtListTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm ${unread ? 'font-bold text-foreground' : 'text-foreground/80'}`}>{c.subject}</p>
                      <p className="truncate text-sm text-muted-foreground">{c.lastMessagePreview || '—'}</p>
                    </div>
                    <button title={c.starred ? 'Starred' : 'Not starred'} onClick={e => { e.stopPropagation(); toggleStar(c.id, !c.starred) }}
                      className="mt-1 shrink-0 text-muted-foreground/60 hover:text-muted-foreground">
                      <Star className={`h-5 w-5 ${c.starred ? 'fill-[#f4b400] text-[#f4b400]' : ''}`} />
                    </button>
                  </div>
                  {c.attachmentUrls.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2">
                      {c.attachmentUrls.filter(isHttpUrl).slice(0, 2).map((url, i) => <AttachmentChip key={i} url={url} compact />)}
                      {c.attachmentUrls.length > 2 && <span className="text-xs text-muted-foreground">+{c.attachmentUrls.length - 2}</span>}
                    </div>
                  )}
                  {c.assignedTo && <p className="truncate text-[11px] text-muted-foreground/80 mt-0.5">Owner: {c.assignedTo.name ?? '—'}</p>}
                </div>
              </div>
            )
          })}
        </div>

        <button onClick={() => setCompose(prev => ({ open: true, key: prev.key + 1 }))}
          className="absolute bottom-5 right-5 flex items-center gap-3 h-14 pl-5 pr-6 rounded-2xl bg-white shadow-[0_1px_3px_rgba(60,64,67,.3),0_4px_8px_3px_rgba(60,64,67,.15)] hover:shadow-[0_1px_3px_rgba(60,64,67,.3),0_8px_12px_6px_rgba(60,64,67,.15)] transition-shadow text-[#c5221f] font-medium">
          <Pencil className="h-5 w-5" /> Compose
        </button>
      </div>

      {/* ── Thread ── */}
      <div {...threadDrop.dropProps} className={`relative flex-1 flex-col min-w-0 ${activeId ? 'flex' : 'hidden md:flex'}`}>
        {threadDrop.isDragging && <DropOverlay />}
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center">
              <Mail className="h-12 w-12 mx-auto mb-3 opacity-20" />
              Select an email to read
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2 px-4 md:px-6 pt-4 pb-3 shrink-0">
              <button onClick={() => { setActiveId(null); setDetail(null) }} title="Back to inbox"
                className="md:hidden -ml-1 mt-0.5 h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl md:text-[22px] leading-snug text-foreground break-words">
                  {detail?.subject}
                  <span className="ml-2 align-middle inline-flex items-center rounded px-1.5 py-0.5 text-[11px] bg-muted text-muted-foreground">Inbox</span>
                </h2>
                {detail && <p className="text-xs text-muted-foreground mt-1">{detail.assignedTo ? `Owner: ${detail.assignedTo.name ?? '—'}` : 'Unassigned'}</p>}
              </div>
              {detail && (
                <button title={detail.starred ? 'Starred' : 'Not starred'} onClick={() => toggleStar(detail.id, !detail.starred)}
                  className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted shrink-0">
                  <Star className={`h-5 w-5 ${detail.starred ? 'fill-[#f4b400] text-[#f4b400]' : ''}`} />
                </button>
              )}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              {detailLoading ? (
                <div className="flex justify-center pt-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : detail && (
                <>
                  {detail.messages.map((m, i) => (
                    <MessageItem key={m.id} m={m} detail={detail}
                      expanded={expanded.has(m.id) || i === detail.messages.length - 1}
                      onToggle={() => setExpanded(prev => { const n = new Set(prev); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n })} />
                  ))}

                  {replyOpen ? (
                    /* Reply box — Gmail-style card under the thread */
                    <div className="flex gap-3 px-4 md:px-6 py-4">
                      <LetterAvatar name={myName} email={`me:${myName}`} />
                      <div className="min-w-0 flex-1 rounded-2xl border shadow-[0_1px_2px_rgba(60,64,67,.3),0_2px_6px_2px_rgba(60,64,67,.15)] overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground">
                          <Reply className="h-4 w-4 shrink-0" />
                          <span className="truncate">{detail.fromName ? `${detail.fromName} ` : ''}<span className="text-xs">&lt;{detail.fromEmail}&gt;</span></span>
                        </div>
                        <EmailComposer
                          placeholder=""
                          onChange={setDraft}
                          onSubmit={() => sendReplyRef.current()}
                          resetKey={`${activeId}-${draftKey}`}
                          minHeight={320}
                          maxHeight={null}
                          autoFocus
                        />
                        <PendingAttachments urls={pendingAttachments} uploading={replyFiles.uploading}
                          onRemove={idx => setPendingAttachments(prev => prev.filter((_, j) => j !== idx))} />
                        <SignaturePreview />
                        <div className="flex items-center gap-1 px-4 py-3">
                          <input ref={fileInputRef} type="file" multiple className="hidden"
                            onChange={e => { replyFiles.upload(Array.from(e.target.files ?? [])); e.target.value = '' }} />
                          <button onClick={sendReply} disabled={(draft.isEmpty && pendingAttachments.length === 0) || sending || uploading}
                            className="flex items-center gap-2 h-9 px-6 rounded-full text-sm font-medium text-white disabled:opacity-40 transition-colors"
                            style={{ backgroundColor: ACCENT }}>
                            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send
                          </button>
                          <button onClick={() => fileInputRef.current?.click()} title="Attach files (or drag & drop)"
                            className="ml-2 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors">
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                          </button>
                          <button onClick={discardReply} title="Discard draft"
                            className="ml-auto h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3 pl-[72px] md:pl-[80px] pr-4 py-5">
                      <button onClick={() => setReplyOpen(true)}
                        className="flex items-center gap-2.5 h-10 px-6 rounded-full border border-[#747775] text-sm font-medium text-foreground/80 hover:bg-muted transition-colors">
                        <Reply className="h-4 w-4" /> Reply
                      </button>
                      <button onClick={() => openForward(detail)}
                        className="flex items-center gap-2.5 h-10 px-6 rounded-full border border-[#747775] text-sm font-medium text-foreground/80 hover:bg-muted transition-colors">
                        <Forward className="h-4 w-4" /> Forward
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <ComposeDialog open={compose.open} resetKey={compose.key} initial={compose.initial}
        onOpenChange={open => setCompose(prev => ({ ...prev, open }))}
        onSent={async id => { await loadConversations(); setFilter('all'); openConversation({ id, unreadCount: 0 }) }} />
    </div>
  )
}

const MAX_FILE_BYTES = 20 * 1024 * 1024 // matches /api/email-inbox/upload
const MAX_TOTAL_BYTES = 35 * 1024 * 1024 // Resend rejects emails over ~40MB once encoded

/** Uploads any number of files to R2 in parallel; keeps their public URLs in order of completion. */
function useAttachmentUploads(pathPrefix: string, initial: string[] = []) {
  const [urls, setUrls] = useState<string[]>(initial)
  const [uploading, setUploading] = useState(0)
  const totalBytes = useRef(0)

  async function upload(files: File[]) {
    const accepted = files.filter(f => {
      if (f.size > MAX_FILE_BYTES) { toast.error(`${f.name} is over 20MB — share it as a link instead`); return false }
      if (totalBytes.current + f.size > MAX_TOTAL_BYTES) { toast.error(`${f.name} would make this email larger than 35MB`); return false }
      totalBytes.current += f.size
      return true
    })
    if (!accepted.length) return
    setUploading(n => n + accepted.length)
    await Promise.all(accepted.map(async f => {
      try {
        const { url } = await uploadToR2('/api/email-inbox/upload', `${pathPrefix}/${Date.now()}-${f.name}`, f)
        setUrls(prev => [...prev, url])
      } catch {
        totalBytes.current -= f.size
        toast.error(`Failed to upload ${f.name}`)
      } finally {
        setUploading(n => n - 1)
      }
    }))
  }
  function reset(next: string[] = []) { setUrls(next); totalBytes.current = 0 }

  return { urls, setUrls, uploading, upload, reset }
}

function PendingAttachments({ urls, uploading, onRemove }: { urls: string[]; uploading: number; onRemove: (index: number) => void }) {
  if (!urls.length && !uploading) return null
  return (
    <div className="flex flex-wrap gap-2 px-4 pb-3">
      {urls.map((url, i) => (
        <span key={url} className="flex items-center gap-1.5 text-xs bg-[#f2f6fc] border px-2.5 py-1.5 rounded-full max-w-[240px]">
          <AttachmentIcon name={fileNameFromUrl(url)} /> <span className="truncate">{fileNameFromUrl(url)}</span>
          <button onClick={() => onRemove(i)} title="Remove" className="ml-0.5 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
        </span>
      ))}
      {uploading > 0 && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground px-2.5 py-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Uploading {uploading} file{uploading > 1 ? 's' : ''}…
        </span>
      )}
    </div>
  )
}

function DropOverlay() {
  return (
    <div className="absolute inset-2 z-20 rounded-xl border-2 border-dashed border-[#1a73e8] bg-[#e8f0fe]/90 flex items-center justify-center pointer-events-none">
      <div className="text-center text-[#1a73e8]">
        <Paperclip className="h-8 w-8 mx-auto mb-2" />
        <p className="text-sm font-medium">Drop files to attach</p>
        <p className="text-xs opacity-80">Images, PDF, video, documents — up to 20MB each</p>
      </div>
    </div>
  )
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** One message in the thread — collapsed to a one-line snippet like Gmail, click to expand. */
function MessageItem({ m, detail, expanded, onToggle }: {
  m: Message
  detail: ConversationDetail
  expanded: boolean
  onToggle: () => void
}) {
  const out = m.direction === 'OUT'
  const name = out ? (m.sentByName ?? 'You') : (detail.fromName || detail.fromEmail)
  const avatarKey = out ? `me:${m.sentByName ?? ''}` : detail.fromEmail
  const snippet = (m.body ?? '').replace(/\s+/g, ' ').trim() || (m.attachmentUrls.length ? `📎 ${m.attachmentUrls.length} attachment${m.attachmentUrls.length > 1 ? 's' : ''}` : '')

  if (!expanded) {
    return (
      <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={e => { if (e.key === 'Enter') onToggle() }}
        className="flex items-center gap-3 px-4 md:px-6 py-3 border-b cursor-pointer hover:bg-[#f2f6fc] transition-colors">
        <LetterAvatar name={name} email={avatarKey} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-bold truncate">{name}</p>
            <span className="text-xs text-muted-foreground shrink-0">{fmtListTime(m.createdAt)}</span>
          </div>
          <p className="text-sm text-muted-foreground truncate">{snippet}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 px-4 md:px-6 py-4 border-b">
      <LetterAvatar name={name} email={avatarKey} />
      <div className="min-w-0 flex-1">
        <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={e => { if (e.key === 'Enter') onToggle() }} className="cursor-pointer">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm truncate">
              <span className="font-bold">{name}</span>
              {!out && <span className="text-xs text-muted-foreground"> &lt;{detail.fromEmail}&gt;</span>}
            </p>
            <span className="text-xs text-muted-foreground shrink-0">{fmtDateTime(m.createdAt)}</span>
          </div>
          <p className="flex items-center gap-0.5 text-xs text-muted-foreground">
            {out ? `to ${detail.fromName || detail.fromEmail}` : 'to me'} <ChevronDown className="h-3 w-3" />
          </p>
        </div>
        <div className="mt-4 text-sm">
          {m.bodyHtml
            ? <div className={`break-words ${EMAIL_BODY_CLASSES}`} dangerouslySetInnerHTML={{ __html: m.bodyHtml }} />
            : m.body && <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>}
        </div>
        {/* Server-rendered by renderEmailSignatureHtml at send time (all values escaped) */}
        {m.signatureHtml && <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: m.signatureHtml }} />}
        {m.attachmentUrls.length > 0 && (
          <div className="mt-5 pt-4 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2">{m.attachmentUrls.length} attachment{m.attachmentUrls.length > 1 ? 's' : ''}</p>
            <div className="flex flex-wrap gap-2">
              {m.attachmentUrls.filter(isHttpUrl).map((url, i) => <AttachmentChip key={i} url={url} />)}
            </div>
          </div>
        )}
        {out && m.status === 'FAILED' && <p className="text-xs mt-2 text-red-600">Failed to send</p>}
        {out && m.status === 'PENDING' && <p className="text-xs mt-2 text-muted-foreground">Sending…</p>}
      </div>
    </div>
  )
}

interface ComposeInitial { subject: string; html: string; attachmentUrls: string[] }

/** New email to any address — same endpoint as Leads' "Follow up by Email". Also used for Forward. */
function ComposeDialog({ open, onOpenChange, onSent, resetKey, initial }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent: (conversationId: string) => void
  /** Bumped each time Compose/Forward is opened — clears the form back to `initial`. */
  resetKey: number
  initial?: ComposeInitial
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 gap-0 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Keyed so every Compose/Forward starts from a fresh form */}
        <ComposeForm key={resetKey} initial={initial} onClose={() => onOpenChange(false)} onSent={onSent} />
      </DialogContent>
    </Dialog>
  )
}

function ComposeForm({ initial, onClose, onSent }: {
  initial?: ComposeInitial
  onClose: () => void
  onSent: (conversationId: string) => void
}) {
  const [to, setTo] = useState('')
  const [name, setName] = useState('')
  const [subject, setSubject] = useState(initial?.subject ?? '')
  const files = useAttachmentUploads('email-inbox/compose', initial?.attachmentUrls ?? [])
  const attachments = files.urls
  const drop = useFileDrop(files.upload)
  const fileRef = useRef<HTMLInputElement>(null)
  const [body, setBody] = useState<ComposerValue>(EMPTY_DRAFT)
  const [sending, setSending] = useState(false)

  const validTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())
  const canSend = validTo && !!subject.trim() && !body.isEmpty && !sending && files.uploading === 0

  async function send() {
    if (!canSend) return
    setSending(true)
    try {
      const res = await fetch('/api/email-inbox/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: to.trim(), name: name.trim(), subject: subject.trim(), body: body.text, html: body.html, attachmentUrls: attachments }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? 'Failed to send email'); return }
      if (data.providerError) toast.error(`Saved, but email failed to send: ${data.providerError}`)
      else toast.success('Email sent')
      onClose()
      onSent(data.conversationId)
    } finally { setSending(false) }
  }
  const sendRef = useRef(send)
  useEffect(() => { sendRef.current = send })

  const row = 'flex items-center gap-2 px-4 border-b'
  const input = 'flex-1 h-10 bg-transparent text-sm focus:outline-none'
  return (
    <>
        <DialogHeader className="px-4 py-3 bg-[#f2f6fc] border-b">
          <DialogTitle className="text-sm font-medium">{initial ? 'Forward' : 'New Message'}</DialogTitle>
        </DialogHeader>
        <div {...drop.dropProps} className="relative overflow-y-auto">
          {drop.isDragging && <DropOverlay />}
          <div className={row}><span className="text-sm text-muted-foreground w-14">To</span><input className={input} value={to} onChange={e => setTo(e.target.value)} placeholder="guest@example.com" autoFocus /></div>
          <div className={row}><span className="text-sm text-muted-foreground w-14">Name</span><input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="Recipient name (optional)" /></div>
          <div className={row}><input className={input} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" /></div>
          <EmailComposer placeholder="Write your message..." initialHtml={initial?.html ?? ''} onChange={setBody} onSubmit={() => sendRef.current()} minHeight={260} maxHeight="50vh" />
          <PendingAttachments urls={attachments} uploading={files.uploading}
            onRemove={i => files.setUrls(prev => prev.filter((_, j) => j !== i))} />
          <SignaturePreview />
        </div>
        <div className="flex items-center px-4 py-3 border-t">
          <button onClick={send} disabled={!canSend}
            className="flex items-center gap-2 h-9 px-5 rounded-full text-sm font-medium text-white disabled:opacity-40"
            style={{ backgroundColor: ACCENT }}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send
          </button>
          <input ref={fileRef} type="file" multiple className="hidden"
            onChange={e => { files.upload(Array.from(e.target.files ?? [])); e.target.value = '' }} />
          <button onClick={() => fileRef.current?.click()} title="Attach files (or drag & drop)"
            className="ml-2 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <Paperclip className="h-4 w-4" />
          </button>
        </div>
    </>
  )
}
