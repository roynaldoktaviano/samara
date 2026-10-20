'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { uploadToR2 } from '@/lib/r2-client'
import { useFileDrop } from '@/hooks/useFileDrop'
import {
  Search, Send, Loader2, Mail, Paperclip, X, Star, Pencil, ArrowLeft, Image as ImageIcon, FileText, Inbox,
  Reply, Forward, Trash2, ChevronDown, ChevronLeft, ChevronRight, Film, Plus,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { isHttpUrl } from '@/lib/url-safety'
import EmailComposer, { SignaturePreview, EMAIL_BODY_CLASSES, type ComposerValue } from './EmailComposer'

const ACCENT = '#1f5eff'
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
type Folder = 'inbox' | 'unread' | 'starred' | 'sent'
type Sort = 'newest' | 'oldest'

// Views over the same thread list — "Sent" = threads we've replied to
const FOLDERS: { key: Folder; label: string }[] = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'unread', label: 'Unread' },
  { key: 'starred', label: 'Starred' },
  { key: 'sent', label: 'Sent' },
]

const iconBtn = 'h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors'

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
function FileTypeIcon({ name, className }: { name: string; className?: string }) {
  if (/\.(png|jpe?g|gif|webp|heic|svg)$/i.test(name)) return <ImageIcon className={className} />
  if (/\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(name)) return <Film className={className} />
  return /\.pdf$/i.test(name) ? <FileText className={className} /> : <Paperclip className={className} />
}
function AttachmentIcon({ name }: { name: string }) {
  return <span className="h-4 w-4 rounded-sm flex items-center justify-center bg-[#d93025] text-white shrink-0"><FileTypeIcon name={name} className="h-2.5 w-2.5" /></span>
}
/** Small, non-interactive chip for the thread list rows. */
function AttachmentChip({ url }: { url: string }) {
  const name = fileNameFromUrl(url)
  return (
    <span className="flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-[11px] text-foreground/70 max-w-[150px]">
      <FileTypeIcon name={name} className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{name}</span>
    </span>
  )
}
/** Attachment row inside an opened message. */
function AttachmentFile({ url }: { url: string }) {
  const name = fileNameFromUrl(url)
  const ext = name.includes('.') ? name.split('.').pop()!.toUpperCase() : 'FILE'
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 max-w-[260px]">
      <span className="h-10 w-10 shrink-0 rounded-full bg-[#f4f5f7] group-hover:bg-[#eceef1] flex items-center justify-center text-muted-foreground transition-colors">
        <FileTypeIcon name={name} className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-foreground group-hover:underline">{name}</span>
        <span className="block text-[11px] text-muted-foreground">{ext}</span>
      </span>
    </a>
  )
}
function downloadAll(urls: string[]) {
  for (const url of urls) {
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.download = fileNameFromUrl(url)
    a.click()
  }
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
  const [folder, setFolder] = useState<Folder>('inbox')
  const [sort, setSort] = useState<Sort>('newest')
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
  // Reply opened from a message's header — bring the composer at the bottom into view
  useEffect(() => { if (replyOpen) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [replyOpen])

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

  function openCompose() {
    setCompose(prev => ({ open: true, key: prev.key + 1 }))
  }
  function closeThread() {
    setActiveId(null)
    setDetail(null)
  }

  /** Gmail-style Forward of `msg` (default: the newest message): quoted header + body + its attachments. */
  function openForward(d: ConversationDetail, msg?: Message) {
    const last = msg ?? d.messages[d.messages.length - 1]
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
  const inFolder = (c: ConversationSummary, f: Folder) =>
    f === 'inbox' || (f === 'unread' ? c.unreadCount > 0 : f === 'starred' ? c.starred : c.hasReply)
  const filtered = conversations.filter(c =>
    inFolder(c, folder) &&
    (!q || (c.fromName ?? '').toLowerCase().includes(q) || c.fromEmail.toLowerCase().includes(q) ||
      c.subject.toLowerCase().includes(q) || (c.lastMessagePreview ?? '').toLowerCase().includes(q)))
  if (sort === 'oldest') filtered.reverse() // API returns newest first
  const unreadTotal = conversations.filter(c => c.unreadCount > 0).length
  const folderCounts = Object.fromEntries(FOLDERS.map(f => [f.key, conversations.filter(c => inFolder(c, f.key)).length])) as Record<Folder, number>
  const folderLabel = FOLDERS.find(f => f.key === folder)!.label
  const activeIndex = filtered.findIndex(c => c.id === activeId)

  return (
    <div className="h-[calc(100vh-6rem)] flex rounded-2xl border overflow-hidden bg-white">
      {/* ── Thread list ── */}
      <div className={`relative w-full md:w-[340px] xl:w-[380px] shrink-0 md:border-r flex-col ${activeId ? 'hidden md:flex' : 'flex'}`}>
        <div className="px-5 pt-5 pb-3 space-y-3">
          <div>
            <h2 className="text-lg font-semibold leading-tight">{folderLabel}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} Messages • {unreadTotal} Unread</p>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 h-10 rounded-lg bg-[#f4f5f7] px-3 focus-within:bg-white focus-within:ring-1 focus-within:ring-[#d0d7e2] transition-all">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
                placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
            </div>
            <button onClick={openCompose} title="New message"
              className="h-10 w-10 shrink-0 rounded-lg bg-[#f4f5f7] hover:bg-[#eceef1] flex items-center justify-center text-foreground/70 transition-colors">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {FOLDERS.map(f => (
              <button key={f.key} onClick={() => setFolder(f.key)}
                className={`h-7 px-3 shrink-0 rounded-full text-xs font-medium transition-colors ${folder === f.key ? 'text-white' : 'bg-[#f4f5f7] text-foreground/70 hover:bg-[#eceef1]'}`}
                style={folder === f.key ? { backgroundColor: ACCENT } : undefined}>
                {f.label} · {folderCounts[f.key]}
              </button>
            ))}
          </div>
          <div className="relative inline-flex">
            <select value={sort} onChange={e => setSort(e.target.value as Sort)}
              className="appearance-none h-8 pl-3 pr-8 rounded-lg bg-[#f4f5f7] text-xs text-foreground/80 focus:outline-none cursor-pointer">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border-t">
          {loading ? (
            <div className="p-5 space-y-5">{[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-2"><div className="h-3 w-3/4 rounded bg-muted animate-pulse" /><div className="h-3 w-1/3 rounded bg-muted animate-pulse" /><div className="h-3 w-full rounded bg-muted animate-pulse" /></div>
            ))}</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <Inbox className="h-10 w-10 mx-auto mb-3 opacity-30" />
              {conversations.length === 0 ? 'No emails yet — inbound messages will show up here.'
                : q ? 'No matches'
                : folder === 'starred' ? 'No starred emails' : folder === 'unread' ? 'You’re all caught up' : folder === 'sent' ? 'No sent emails' : 'No matches'}
            </div>
          ) : filtered.map(c => {
            const unread = c.unreadCount > 0
            const active = activeId === c.id
            return (
              <div key={c.id} role="button" tabIndex={0} onClick={() => openConversation(c)}
                onKeyDown={e => { if (e.key === 'Enter') openConversation(c) }}
                className={`group relative px-5 py-4 border-b cursor-pointer transition-colors ${active ? 'bg-[#f5f8ff]' : 'hover:bg-[#fafbfc]'}`}>
                {active && <span className="absolute left-0 inset-y-0 w-[3px]" style={{ backgroundColor: ACCENT }} />}
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: unread ? ACCENT : 'transparent' }} />
                  <p className={`flex-1 truncate text-sm ${unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/70'}`}>{c.subject}</p>
                  <span className="text-[11px] text-muted-foreground shrink-0">{fmtListTime(c.lastMessageAt)}</span>
                </div>
                <div className="pl-3.5">
                  <div className="flex items-center gap-2 mt-1.5">
                    <p className="flex-1 truncate text-[13px] text-foreground/80">
                      {c.fromName || c.fromEmail}
                      {c.messageCount > 1 && <span className="ml-1.5 text-[11px] text-muted-foreground">({c.messageCount})</span>}
                    </p>
                    {c.hasReply && <span title="Replied"><Reply className="h-3.5 w-3.5 text-muted-foreground" /></span>}
                    <button title={c.starred ? 'Starred' : 'Not starred'} onClick={e => { e.stopPropagation(); toggleStar(c.id, !c.starred) }}
                      className={`shrink-0 text-muted-foreground/60 hover:text-muted-foreground transition-opacity ${c.starred ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}>
                      <Star className={`h-3.5 w-3.5 ${c.starred ? 'fill-[#f4b400] text-[#f4b400]' : ''}`} />
                    </button>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2 break-words">{c.lastMessagePreview || '—'}</p>
                  {c.attachmentUrls.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2.5">
                      {c.attachmentUrls.filter(isHttpUrl).slice(0, 2).map((url, i) => <AttachmentChip key={i} url={url} />)}
                      {c.attachmentUrls.length > 2 && <span className="text-[11px] text-muted-foreground">+{c.attachmentUrls.length - 2}</span>}
                    </div>
                  )}
                  {c.assignedTo && <p className="truncate text-[11px] text-muted-foreground/80 mt-1.5">Owner: {c.assignedTo.name ?? '—'}</p>}
                </div>
              </div>
            )
          })}
        </div>
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
            <div className="flex items-center gap-2 h-14 px-3 md:px-5 border-b shrink-0">
              <button onClick={closeThread} title="Back to inbox" className={iconBtn}>
                <ArrowLeft className="h-[18px] w-[18px]" />
              </button>
              <div className="flex-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                {activeIndex >= 0 && (
                  <>
                    <button onClick={() => openConversation(filtered[activeIndex - 1])} disabled={activeIndex <= 0} title="Newer" className={iconBtn}>
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="px-2 tabular-nums">{activeIndex + 1} of {filtered.length}</span>
                    <button onClick={() => openConversation(filtered[activeIndex + 1])} disabled={activeIndex >= filtered.length - 1} title="Older" className={iconBtn}>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
              {detail && (
                <button title={detail.starred ? 'Starred' : 'Not starred'} onClick={() => toggleStar(detail.id, !detail.starred)} className={iconBtn}>
                  <Star className={`h-[18px] w-[18px] ${detail.starred ? 'fill-[#f4b400] text-[#f4b400]' : ''}`} />
                </button>
              )}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              {detailLoading ? (
                <div className="flex justify-center pt-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : detail && (
                <>
                  <div className="px-4 md:px-6 pt-6 pb-2">
                    <h1 className="text-xl font-semibold leading-snug text-foreground break-words">{detail.subject}</h1>
                    <p className="text-xs text-muted-foreground mt-1">{detail.assignedTo ? `Owner: ${detail.assignedTo.name ?? '—'}` : 'Unassigned'}</p>
                  </div>

                  {detail.messages.map((m, i) => (
                    <MessageItem key={m.id} m={m} detail={detail}
                      expanded={expanded.has(m.id) || i === detail.messages.length - 1}
                      onToggle={() => setExpanded(prev => { const n = new Set(prev); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n })}
                      onReply={() => setReplyOpen(true)}
                      onForward={() => openForward(detail, m)} />
                  ))}

                  {replyOpen ? (
                    <div className="flex gap-3 px-4 md:px-6 py-5">
                      <LetterAvatar name={myName} email={`me:${myName}`} />
                      <div className="min-w-0 flex-1 rounded-xl border shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground border-b bg-[#fafbfc]">
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
                            className="flex items-center gap-2 h-9 px-5 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-colors"
                            style={{ backgroundColor: ACCENT }}>
                            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send
                          </button>
                          <button onClick={() => fileInputRef.current?.click()} title="Attach files (or drag & drop)" className={`ml-2 ${iconBtn}`}>
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                          </button>
                          <button onClick={discardReply} title="Discard draft" className={`ml-auto ${iconBtn}`}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3 px-4 md:pl-[80px] md:pr-6 py-5">
                      <button onClick={() => setReplyOpen(true)}
                        className="flex items-center gap-2 h-10 px-5 rounded-lg border border-[#e3e6eb] text-sm font-medium text-foreground/80 hover:bg-[#fafbfc] transition-colors">
                        <Reply className="h-4 w-4" /> Reply
                      </button>
                      <button onClick={() => openForward(detail)}
                        className="flex items-center gap-2 h-10 px-5 rounded-lg border border-[#e3e6eb] text-sm font-medium text-foreground/80 hover:bg-[#fafbfc] transition-colors">
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
        onSent={async id => { await loadConversations(); setFolder('inbox'); openConversation({ id, unreadCount: 0 }) }} />
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

/** One message in the thread — collapsed to a one-line snippet, click to expand. */
function MessageItem({ m, detail, expanded, onToggle, onReply, onForward }: {
  m: Message
  detail: ConversationDetail
  expanded: boolean
  onToggle: () => void
  onReply: () => void
  onForward: () => void
}) {
  const out = m.direction === 'OUT'
  const name = out ? (m.sentByName ?? 'You') : (detail.fromName || detail.fromEmail)
  const avatarKey = out ? `me:${m.sentByName ?? ''}` : detail.fromEmail
  const snippet = (m.body ?? '').replace(/\s+/g, ' ').trim() || (m.attachmentUrls.length ? `📎 ${m.attachmentUrls.length} attachment${m.attachmentUrls.length > 1 ? 's' : ''}` : '')
  const attachments = m.attachmentUrls.filter(isHttpUrl)

  if (!expanded) {
    return (
      <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={e => { if (e.key === 'Enter') onToggle() }}
        className="flex items-center gap-3 px-4 md:px-6 py-3.5 border-b cursor-pointer hover:bg-[#fafbfc] transition-colors">
        <LetterAvatar name={name} email={avatarKey} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold truncate">{name}</p>
            <span className="text-xs text-muted-foreground shrink-0">{fmtListTime(m.createdAt)}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{snippet}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 md:px-6 py-5 border-b">
      <div className="flex gap-3">
        <LetterAvatar name={name} email={avatarKey} size={44} />
        <div className="min-w-0 flex-1 flex items-start justify-between gap-3">
          <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={e => { if (e.key === 'Enter') onToggle() }} className="min-w-0 cursor-pointer">
            <p className="text-[15px] font-semibold truncate">{name}</p>
            <p className="text-xs text-muted-foreground truncate">
              From: {out ? 'Me' : detail.fromEmail}<span className="mx-1.5">•</span>To: {out ? detail.fromEmail : 'Me'}
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-end">
            <span className="text-xs text-muted-foreground">{fmtDateTime(m.createdAt)}</span>
            <div className="mt-1 flex items-center gap-0.5">
              <button onClick={onReply} title="Reply" className={iconBtn}><Reply className="h-4 w-4" /></button>
              <button onClick={onForward} title="Forward" className={iconBtn}><Forward className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 md:pl-[56px]">
        <div className="text-sm">
          {m.bodyHtml
            ? <div className={`break-words ${EMAIL_BODY_CLASSES}`} dangerouslySetInnerHTML={{ __html: m.bodyHtml }} />
            : m.body && <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>}
        </div>
        {/* Server-rendered by renderEmailSignatureHtml at send time (all values escaped) */}
        {m.signatureHtml && <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: m.signatureHtml }} />}
        {attachments.length > 0 && (
          <div className="mt-6 pt-5 border-t">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Attachments ({attachments.length})</p>
              {attachments.length > 1 && (
                <button onClick={() => downloadAll(attachments)} className="text-xs font-medium hover:underline" style={{ color: ACCENT }}>Download All</button>
              )}
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {attachments.map((url, i) => <AttachmentFile key={i} url={url} />)}
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
