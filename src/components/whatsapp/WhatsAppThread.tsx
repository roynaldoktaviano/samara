'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { uploadToR2 } from '@/lib/r2-client'
import { Send, Loader2, Check, CheckCheck, AlertCircle, Paperclip, Reply, X, Image as ImageIcon, FileText, UserPlus } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { renderWhatsappTemplateBody } from '@/lib/whatsapp-templates'
import { WHATSAPP_BRAND_LABELS, type WhatsappBrand } from '@/lib/whatsapp-brands'
import { useWhatsappTemplates, templateKey } from '@/components/whatsapp/useWhatsappTemplates'

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
  createdAt: string
  replyTo: QuotedMessage | null
}
interface ConversationDetail {
  id: string; phone: string; contactName: string | null; brand: WhatsappBrand; windowOpen: boolean; messages: Message[]
  assignedToId: string | null
  assignedTo: { id: string; name: string | null; email: string } | null
}
export interface SalesUserOption { id: string; name: string | null; email: string }

const UNASSIGNED = '__unassigned__'

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
export default function WhatsAppThread({ conversationId, onConversationUpdate, salesUsers = [] }: {
  conversationId: string
  onConversationUpdate: () => void
  // ADMIN only — the reps a chat can be reassigned to from the header.
  salesUsers?: SalesUserOption[]
}) {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role ?? ''
  const isAdmin = role === 'ADMIN'
  const [assigning, setAssigning] = useState(false)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateParams, setTemplateParams] = useState<string[]>([])
  const [sendingTemplate, setSendingTemplate] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const templates = useWhatsappTemplates(detail?.brand)
  const selectedTemplate = templates.find(t => templateKey(t) === templateName)

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

  async function postMessage(payload: { body?: string; mediaUrl?: string; mediaType?: string; templateName?: string; templateLanguage?: string; templateParams?: string[] }) {
    const res = await fetch(`/api/whatsapp/conversations/${conversationId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, replyToId: replyTo?.id }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) toast.error(data?.error ?? 'Failed to send message')
    else if (data?.providerError) toast.error(`WhatsApp menolak pesan: ${data.providerError}`)
    if (data?.message) setDetail(prev => prev ? { ...prev, messages: [...prev.messages, data.message] } : prev)
    setReplyTo(null)
    await loadDetail()
    onConversationUpdate()
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

  async function sendMessage() {
    if (!draft.trim()) return
    setSending(true)
    const text = draft.trim()
    setDraft('')
    try { await postMessage({ body: text }) } finally { setSending(false) }
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
      await postMessage({ templateName: selectedTemplate.name, templateLanguage: selectedTemplate.language, templateParams })
      setTemplateOpen(false)
    } finally {
      setSendingTemplate(false)
    }
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
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{detail?.contactName || detail?.phone}</p>
          <p className="text-xs text-muted-foreground">
            {detail?.phone}
            {detail && <> · via <span className="font-medium">{WHATSAPP_BRAND_LABELS[detail.brand]}</span></>}
          </p>
        </div>
        {detail && isAdmin && (
          <Select value={detail.assignedToId ?? UNASSIGNED} onValueChange={v => assignTo(v === UNASSIGNED ? null : v)} disabled={assigning}>
            <SelectTrigger className="h-8 w-48 text-xs shrink-0" title="Sales yang memegang chat ini">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Belum di-assign</SelectItem>
              {/* Keep the current holder selectable even if they've since lost the SALES role. */}
              {detail.assignedTo && !salesUsers.some(u => u.id === detail.assignedToId) && (
                <SelectItem value={detail.assignedTo.id}>{detail.assignedTo.name ?? detail.assignedTo.email}</SelectItem>
              )}
              {salesUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name ?? u.email}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      {detail && !isAdmin && detail.assignedToId === null && (
        <div className="px-5 py-2 bg-amber-50 border-b text-xs flex items-center justify-between gap-2 shrink-0">
          <span className="text-amber-800">Chat ini belum dipegang sales mana pun. Ambil supaya masuk ke daftar kamu (membalas juga otomatis mengambilnya).</span>
          <Button size="sm" variant="outline" className="h-7 shrink-0" disabled={assigning} onClick={() => session?.user?.id && assignTo(session.user.id)}>
            {assigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><UserPlus className="h-3.5 w-3.5 mr-1" /> Ambil chat</>}
          </Button>
        </div>
      )}

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
              {m.templateName && (
                <p className={`flex items-center gap-1 text-[10px] mb-1 font-medium ${m.direction === 'OUT' ? 'text-white/70' : 'text-muted-foreground'}`}>
                  <FileText className="h-2.5 w-2.5" /> Template: {m.templateName}
                </p>
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
        {detail && !detail.windowOpen && (
          <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1 text-xs">
            <span className="text-amber-700">
              Sudah lebih dari 24 jam sejak balasan terakhir customer — pesan bebas kemungkinan ditolak WhatsApp. Pakai Template Message.
            </span>
            <button onClick={openTemplatePicker} className="shrink-0 font-medium underline" style={{ color: '#1b7a45' }}>
              Kirim Template
            </button>
          </div>
        )}
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
          <Popover open={templateOpen} onOpenChange={setTemplateOpen}>
            <PopoverTrigger asChild>
              <button onClick={openTemplatePicker} title="Send a Message Template"
                className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                <FileText className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-3" side="top" align="start">
              <div className="space-y-1">
                <p className="text-xs font-medium">Message Template</p>
                <p className="text-[11px] text-muted-foreground">Dipakai kalau customer belum pernah chat, atau sudah &gt;24 jam sejak balasan terakhirnya.</p>
              </div>
              <Select value={templateName} onValueChange={v => { setTemplateName(v); setTemplateParams(new Array(templates.find(t => templateKey(t) === v)?.paramLabels?.length ?? 0).fill('')) }}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Pilih template" /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => <SelectItem key={templateKey(t)} value={templateKey(t)}>{t.label} ({t.language})</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedTemplate?.paramLabels?.map((label, i) => (
                <Input key={i} placeholder={label} value={templateParams[i] ?? ''}
                  onChange={e => setTemplateParams(prev => { const next = [...prev]; next[i] = e.target.value; return next })}
                  className="h-9 text-sm" />
              ))}
              {selectedTemplate && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap border rounded-md p-2 bg-muted/40">
                  {renderWhatsappTemplateBody(selectedTemplate, templateParams)}
                </p>
              )}
              <Button onClick={sendTemplate} disabled={!selectedTemplate || sendingTemplate} className="w-full h-9" style={{ backgroundColor: ACCENT }}>
                {sendingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Kirim Template'}
              </Button>
            </PopoverContent>
          </Popover>
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
