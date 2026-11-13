'use client'

// Read-only view of one conversation imported from Freshchat (src/lib/freshchat-import.ts).
// Those channels are still connected to Freshchat, so there is no composer — replies happen there.
import { useEffect, useState } from 'react'
import { ArrowLeft, FileText, History, Lock, MessageCircle, Instagram, Facebook, Globe, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'

export const FRESHCHAT_SOURCE: Record<string, { label: string; icon: typeof MessageCircle; color: string }> = {
  WHATSAPP: { label: 'WhatsApp', icon: MessageCircle, color: '#25D366' },
  INSTA: { label: 'Instagram', icon: Instagram, color: '#E1306C' },
  FB_NATIVE: { label: 'Messenger', icon: Facebook, color: '#0866FF' },
  FRESHCHAT: { label: 'Website chat', icon: Globe, color: '#6366F1' },
}
export const freshchatSource = (s: string | null | undefined) => FRESHCHAT_SOURCE[s ?? ''] ?? { label: 'Chat', icon: MessageCircle, color: '#64748B' }

interface Attachment { kind: string; name: string | null; contentType: string | null; url: string; stored: boolean }
interface Message { id: string; actorType: string | null; actorName: string | null; messageType: string | null; text: string | null; attachments: Attachment[]; createdAt: string }
interface Detail {
  id: string; name: string; channelName: string | null; channelSource: string | null; userPhone: string | null; status: string | null
  assignedAgentName: string | null; fcCreatedAt: string | null; messageCount: number; messagesSyncedAt: string | null
  lead: { id: string; name: string; owner: { name: string | null } | null } | null; customer: { id: string; name: string } | null
  messages: Message[]
}

export default function FreshchatThread({ conversationId, onBack, embedded = false }: {
  conversationId: string
  onBack?: () => void
  // Inside a dialog / panel: no full-height layout or back button
  embedded?: boolean
}) {
  const [res, setRes] = useState<{ id: string; data: Detail | null } | null>(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/freshchat/conversations/${conversationId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setRes({ id: conversationId, data: d }) })
      .catch(() => { if (alive) setRes({ id: conversationId, data: null }) })
    return () => { alive = false }
  }, [conversationId])
  const data = res?.id === conversationId ? res.data : undefined
  const src = freshchatSource(data?.channelSource)
  const Icon = src.icon

  return (
    <div className={cn('flex flex-col min-w-0 bg-card', embedded ? 'h-[70vh]' : 'flex-1 h-full')}>
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        {onBack && (
          <Button size="icon" variant="ghost" className="md:hidden size-8" onClick={onBack} aria-label="Back to chats"><ArrowLeft className="size-4" /></Button>
        )}
        <span className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center" style={{ backgroundColor: `${src.color}22`, color: src.color }}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{data?.name ?? 'Loading…'}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {[src.label, data?.channelName && data.channelName !== src.label ? data.channelName : null, data?.userPhone, data?.assignedAgentName ? `Agent: ${data.assignedAgentName}` : null, data?.lead?.owner?.name ? `Owner: ${data.lead.owner.name}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] text-muted-foreground bg-muted/50 border-b">
        <Lock className="h-3 w-3" /> History imported from Freshchat — read-only. Reply from Freshsales while this channel is connected there.
      </div>

      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-1.5 bg-muted/20">
        {data === undefined ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className={cn('h-10 w-2/3 rounded-lg bg-muted animate-pulse', i % 2 && 'ml-auto')} />)}</div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground text-center p-6">This conversation couldn't be loaded.</p>
        ) : data.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center p-6"><History className="h-5 w-5 mx-auto mb-1 opacity-50" />{data.messagesSyncedAt ? 'No messages in this conversation.' : 'Messages are still being imported from Freshchat.'}</p>
        ) : (
          data.messages.map((m, i) => {
            const prev = data.messages[i - 1]
            const day = formatDate(m.createdAt)
            const newDay = !prev || formatDate(prev.createdAt) !== day
            return (
              <div key={m.id}>
                {newDay && <p className="text-center my-3"><span className="text-[11px] bg-card border rounded-full px-2.5 py-0.5 text-muted-foreground">{day}</span></p>}
                <Bubble m={m} />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function Bubble({ m }: { m: Message }) {
  const time = formatDate(m.createdAt, 'time')
  if (m.messageType === 'system' || m.actorType === 'system') {
    return <p className="text-center text-[11px] text-muted-foreground px-6 py-0.5 whitespace-pre-line">{m.text} <span className="opacity-60">· {time}</span></p>
  }
  const mine = m.actorType === 'agent' || m.actorType === 'bot'
  const note = m.messageType === 'private'
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[80%] rounded-lg px-3 py-1.5 text-sm shadow-sm',
        note ? 'bg-warning/15 border border-warning/30' : mine ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-foreground' : 'bg-card border')}>
        {(mine || note) && <p className="text-[10px] font-medium text-muted-foreground mb-0.5">{note ? 'Internal note · ' : ''}{m.actorName ?? (m.actorType === 'bot' ? 'Bot' : 'Agent')}</p>}
        {m.attachments.map((a, i) => <AttachmentView key={i} a={a} />)}
        {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
        <p className="text-[10px] text-muted-foreground text-right mt-0.5">{time}</p>
      </div>
    </div>
  )
}

function AttachmentView({ a }: { a: Attachment }) {
  const isImage = a.kind === 'image' || a.contentType?.startsWith('image/')
  if (isImage) {
    return (
      <a href={a.url} target="_blank" rel="noreferrer" className="block mb-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.url} alt={a.name ?? 'Image'} className="max-h-64 rounded-md object-contain" loading="lazy" />
      </a>
    )
  }
  if (a.kind === 'audio' || a.contentType?.startsWith('audio/')) return <audio controls src={a.url} className="mb-1 max-w-full" />
  if (a.kind === 'video' || a.contentType?.startsWith('video/')) return <video controls src={a.url} className="mb-1 max-h-64 rounded-md" />
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 mb-1 rounded-md border bg-background/60 px-2 py-1.5 text-xs hover:bg-muted">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate flex-1">{a.name ?? 'File'}</span>
      <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {!a.stored && <span className="sr-only">(original Freshchat link, may expire)</span>}
    </a>
  )
}
