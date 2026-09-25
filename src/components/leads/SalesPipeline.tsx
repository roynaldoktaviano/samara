'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Loader2, MessageCircle, Search, Pencil, Clock, Inbox, ChevronDown, ChevronUp, Globe, UserPen, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { roleMatches } from '@/lib/role-utils'
import {
  LEAD_STAGE_COLOR, LEAD_STAGE_LABEL, LEAD_TRANSITIONS, LEAD_LOST_REASON_LABEL, canTransition,
  type LeadStage, type LeadLostReason,
} from '@/lib/lead-pipeline'
import { WHATSAPP_BRANDS, WHATSAPP_BRAND_LABELS, type WhatsappBrand } from '@/lib/whatsapp-brands'
import { WHATSAPP_CHAT_CATEGORY_LABEL, type WhatsappChatCategory } from '@/lib/whatsapp-chat-category'
import LeadEditSheet from '@/components/leads/LeadEditSheet'
import LostReasonDialog from '@/components/leads/LostReasonDialog'

const WA_GREEN = '#25D366'
// Board column order — UNQUALIFIED last since it's a side-track, not a step forward.
const COLUMNS: LeadStage[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'OPPORTUNITY', 'CLOSED_WON', 'CLOSED_LOST', 'UNQUALIFIED']
const TRIAGE_OPTIONS: Exclude<WhatsappChatCategory, 'UNSORTED'>[] = ['SALES', 'GUEST', 'VENDOR', 'SPAM']
const TRIAGE_SHORT: Record<Exclude<WhatsappChatCategory, 'UNSORTED'>, string> = { SALES: 'Sales', GUEST: 'Tamu', VENDOR: 'Vendor', SPAM: 'Spam' }
const STAGNANT_HOURS = 24
const UNOWNED = '__unowned__'

type Channel = 'all' | 'website' | 'whatsapp' | 'manual'
const CHANNEL_LABEL: Record<Channel, string> = { all: 'Semua channel', website: 'Form website', whatsapp: 'WhatsApp', manual: 'Manual' }

interface PipelineChat {
  id: string; brand: WhatsappBrand; lastMessageAt: string; lastMessagePreview: string | null; unreadCount: number
  lastInboundAt: string | null; lastOutboundAt: string | null
}
interface PipelineLead {
  id: string; name: string; phone: string | null; email: string | null; stage: LeadStage; stageUpdatedAt: string | null
  leadQuality: 'HOT' | 'WARM' | 'COLD' | null; guestCount: number | null; travelStartDate: string | null
  travelSeason: string | null; proposalSentAt: string | null; lostReason: LeadLostReason | null; createdAt: string
  source: string | null
  ownerAssignedAt: string | null
  assignmentLogs: { id: string; reason: 'AUTO_DISTRIBUTION' | 'CLAIM' | 'MANUAL' | 'STAGNANT'; createdAt: string; fromUser: { name: string | null; email: string } | null; toUser: { name: string | null; email: string } | null }[]
  owner: { id: string; name: string | null; email: string } | null
  destination: { name: string } | null
  _count: { inquiries: number }
  whatsappConversations: PipelineChat[]
}
interface Column { stage: LeadStage; items: PipelineLead[]; total: number }
interface UnsortedChat {
  id: string; phone: string; contactName: string | null; brand: WhatsappBrand; lastMessageAt: string
  lastMessagePreview: string | null; unreadCount: number
  assignedTo: { id: string; name: string | null; email: string } | null
}
interface SalesUser { id: string; name: string | null; email: string }

const ASSIGN_REASON_LABEL = { AUTO_DISTRIBUTION: 'Pembagian otomatis', CLAIM: 'Diambil sendiri', MANUAL: 'Diatur admin', STAGNANT: 'Dialihkan (24 jam tanpa follow up)' }

const QUALITY_COLOR = { HOT: 'bg-red-100 text-red-700', WARM: 'bg-amber-100 text-amber-700', COLD: 'bg-sky-100 text-sky-700' }

function relTime(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins} mnt lalu`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} jam lalu`
  return `${Math.floor(hrs / 24)} hari lalu`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Hours the customer has been waiting on a reply across this lead's chats (null = nobody waiting).
function waitingHours(chats: PipelineChat[]): number | null {
  let max: number | null = null
  for (const c of chats) {
    if (!c.lastInboundAt) continue
    if (c.lastOutboundAt && new Date(c.lastOutboundAt) >= new Date(c.lastInboundAt)) continue
    const h = (Date.now() - new Date(c.lastInboundAt).getTime()) / 3600000
    if (max === null || h > max) max = h
  }
  return max
}

function ChannelIcons({ lead }: { lead: PipelineLead }) {
  const web = lead._count.inquiries > 0
  const wa = lead.whatsappConversations.length > 0
  return (
    <span className="flex items-center gap-1 shrink-0 text-muted-foreground">
      {web && <Globe className="h-3 w-3" aria-label="Form website" />}
      {wa && <MessageCircle className="h-3 w-3" style={{ color: WA_GREEN }} aria-label="WhatsApp" />}
      {!web && !wa && <UserPen className="h-3 w-3" aria-label="Manual" />}
    </span>
  )
}

/**
 * "Sales Pipeline" — one Kanban for every Lead regardless of channel (website form,
 * WhatsApp, manual), plus a triage strip for WhatsApp chats not yet categorised (a chat
 * only becomes a Lead once marked Sales — see src/lib/whatsapp-lead.ts). Stage moves go
 * through PATCH /api/leads/[id]/stage, so the Leads module's transition rules and
 * Qualified field requirements apply here too.
 */
export default function SalesPipeline({ onOpenChat }: { onOpenChat: (conversationId: string) => void }) {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role ?? ''
  const isAdmin = roleMatches(role, ['ADMIN'])
  const myId = session?.user?.id

  const [columns, setColumns] = useState<Column[]>([])
  const [unsorted, setUnsorted] = useState<UnsortedChat[]>([])
  const [newLookbackDays, setNewLookbackDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [channel, setChannel] = useState<Channel>('all')
  const [brand, setBrand] = useState<'all' | WhatsappBrand>('all')
  const [owner, setOwner] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([])
  const [triageOpen, setTriageOpen] = useState(true)
  const [triaging, setTriaging] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editLeadId, setEditLeadId] = useState<string | null>(null)
  const [lostTarget, setLostTarget] = useState<PipelineLead | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropStage, setDropStage] = useState<LeadStage | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (channel !== 'all') params.set('channel', channel)
    if (brand !== 'all') params.set('brand', brand)
    if (isAdmin && owner !== 'all') params.set('ownerId', owner)
    if (search) params.set('q', search)
    const res = await fetch(`/api/sales-pipeline?${params}`)
    if (res.ok) {
      const data = await res.json()
      setColumns(data.columns)
      setUnsorted(data.unsorted)
      setNewLookbackDays(data.newLookbackDays)
    }
    setLoading(false)
  }, [channel, brand, owner, search, isAdmin])

  useEffect(() => { setLoading(true); load() }, [load])
  useEffect(() => {
    const t = setInterval(load, 20000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/users')
      .then(r => r.ok ? r.json() : [])
      .then((users: (SalesUser & { role: string })[]) => setSalesUsers(users.filter(u => u.role === 'SALES')))
      .catch(() => {})
  }, [isAdmin])

  const byStage = useMemo(() => Object.fromEntries(columns.map(c => [c.stage, c])) as Record<LeadStage, Column | undefined>, [columns])
  const allLeads = useMemo(() => columns.flatMap(c => c.items), [columns])
  const selected = selectedId ? allLeads.find(l => l.id === selectedId) ?? null : null

  async function changeStage(lead: PipelineLead, stage: LeadStage, extra?: { lostReason: string; lostNote: string }) {
    if (stage === lead.stage) return
    if (!canTransition(lead.stage, stage)) {
      const next = LEAD_TRANSITIONS[lead.stage].map(s => LEAD_STAGE_LABEL[s]).join(', ')
      toast.error(next ? `Dari ${LEAD_STAGE_LABEL[lead.stage]} hanya bisa ke: ${next}` : `${LEAD_STAGE_LABEL[lead.stage]} sudah final`)
      return
    }
    if (stage === 'CLOSED_LOST' && !extra) { setLostTarget(lead); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}/stage`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage, ...extra }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data?.missingFields?.length) {
          toast.error(`Lengkapi dulu: ${data.missingFields.join(', ')}`)
          setEditLeadId(lead.id)
        } else {
          toast.error(data?.error ?? 'Gagal mengubah stage')
        }
        return
      }
      toast.success(`${lead.name} → ${LEAD_STAGE_LABEL[stage]}`)
      setLostTarget(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  // ADMIN: assign/release. SALES: claim an unowned lead for themselves.
  async function setOwnerOf(lead: PipelineLead, ownerId: string | null) {
    setBusy(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}/owner`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ownerId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? 'Gagal mengubah pemilik'); return }
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function triage(chat: UnsortedChat, category: WhatsappChatCategory) {
    setTriaging(chat.id)
    try {
      const res = await fetch(`/api/whatsapp/conversations/${chat.id}/category`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? 'Gagal memilah chat'); return }
      toast.success(`${chat.contactName || chat.phone} → ${WHATSAPP_CHAT_CATEGORY_LABEL[category]}`)
      await load()
    } finally {
      setTriaging(null)
    }
  }

  function onDrop(stage: LeadStage) {
    const lead = allLeads.find(l => l.id === dragId)
    setDragId(null)
    setDropStage(null)
    if (lead) changeStage(lead, stage)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Sales Pipeline</h2>
          <p className="text-sm text-muted-foreground">Semua lead dari website, WhatsApp, dan input manual. Geser kartu untuk pindah stage, klik untuk detail.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Cari nama / email / nomor" className="h-9 w-56 pl-8 text-sm" />
          </div>
          <Select value={channel} onValueChange={v => setChannel(v as Channel)}>
            <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(CHANNEL_LABEL) as Channel[]).map(c => <SelectItem key={c} value={c}>{CHANNEL_LABEL[c]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={brand} onValueChange={v => setBrand(v as 'all' | WhatsappBrand)}>
            <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua nomor WA</SelectItem>
              {WHATSAPP_BRANDS.map(b => <SelectItem key={b} value={b}>WA {WHATSAPP_BRAND_LABELS[b]}</SelectItem>)}
            </SelectContent>
          </Select>
          {isAdmin && (
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua sales</SelectItem>
                <SelectItem value="unassigned">Tanpa pemilik</SelectItem>
                {salesUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name ?? u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Triage strip — WhatsApp chats nobody has categorised yet */}
      {(channel === 'all' || channel === 'whatsapp') && (
        <div className="rounded-xl border bg-card">
          <button onClick={() => setTriageOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Inbox className="h-4 w-4" /> Chat WhatsApp belum dipilah
              <Badge variant="secondary" className={unsorted.length ? 'bg-amber-100 text-amber-800' : ''}>{unsorted.length}</Badge>
            </span>
            {triageOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {triageOpen && (
            <div className="border-t divide-y max-h-72 overflow-y-auto">
              {unsorted.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">Semua chat sudah dipilah.</p>
              ) : unsorted.map(c => (
                <div key={c.id} className="px-4 py-2.5 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {c.contactName || `+${c.phone}`}
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground">{WHATSAPP_BRAND_LABELS[c.brand]} · {relTime(c.lastMessageAt)}</span>
                      {isAdmin && <span className="ml-2 text-[11px] font-normal text-muted-foreground">· {c.assignedTo ? (c.assignedTo.name ?? c.assignedTo.email) : 'belum di-assign'}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{c.lastMessagePreview || '—'}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onOpenChat(c.id)} title="Buka chat">
                      <MessageCircle className="h-3.5 w-3.5" />
                    </Button>
                    {TRIAGE_OPTIONS.map(cat => (
                      <Button key={cat} size="sm" variant={cat === 'SALES' ? 'default' : 'outline'} className="h-7 px-2.5 text-xs"
                        style={cat === 'SALES' ? { backgroundColor: WA_GREEN } : undefined}
                        disabled={triaging === c.id} onClick={() => triage(c, cat)}>
                        {TRIAGE_SHORT[cat]}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Board */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {COLUMNS.map(stage => {
            const col = byStage[stage]
            const items = col?.items ?? []
            return (
              <div key={stage}
                onDragOver={e => { if (dragId) { e.preventDefault(); setDropStage(stage) } }}
                onDragLeave={() => setDropStage(s => s === stage ? null : s)}
                onDrop={() => onDrop(stage)}
                className={cn('w-64 shrink-0 rounded-xl border bg-muted/30 flex flex-col max-h-[calc(100vh-18rem)]',
                  dropStage === stage && 'ring-2 ring-primary/50 bg-primary/5')}>
                <div className="px-3 py-2.5 border-b space-y-0.5">
                  <div className="flex items-center justify-between">
                    <Badge className={`${LEAD_STAGE_COLOR[stage]} border-transparent`}>{LEAD_STAGE_LABEL[stage]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {col && col.total > items.length ? `${items.length} / ${col.total}` : items.length}
                    </span>
                  </div>
                  {stage === 'NEW' && <p className="text-[10px] text-muted-foreground">{newLookbackDays} hari terakhir</p>}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {items.map(l => {
                    const chat = l.whatsappConversations[0]
                    const waiting = stage.startsWith('CLOSED') ? null : waitingHours(l.whatsappConversations)
                    const unread = l.whatsappConversations.reduce((n, c) => n + c.unreadCount, 0)
                    return (
                      <div key={l.id} draggable onDragStart={() => setDragId(l.id)} onDragEnd={() => { setDragId(null); setDropStage(null) }}
                        onClick={() => setSelectedId(l.id)}
                        className={cn('rounded-lg border bg-card p-2.5 cursor-pointer hover:shadow-sm transition-shadow space-y-1.5', dragId === l.id && 'opacity-50')}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-tight truncate">{l.name}</p>
                          <span className="flex items-center gap-1.5 shrink-0">
                            {unread > 0 && <span className="rounded-full px-1.5 text-[10px] font-semibold text-white" style={{ backgroundColor: WA_GREEN }}>{unread}</span>}
                            <ChannelIcons lead={l} />
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Array.from(new Set(l.whatsappConversations.map(c => c.brand))).map(b => (
                            <span key={b} className="text-[10px] rounded bg-green-50 text-green-800 px-1.5 py-0.5">{WHATSAPP_BRAND_LABELS[b]}</span>
                          ))}
                          {l.leadQuality && <span className={`text-[10px] rounded px-1.5 py-0.5 ${QUALITY_COLOR[l.leadQuality]}`}>{l.leadQuality}</span>}
                          {!l.owner && <span className="text-[10px] rounded bg-amber-50 text-amber-800 px-1.5 py-0.5">Tanpa pemilik</span>}
                          {stage === 'CLOSED_LOST' && l.lostReason && <span className="text-[10px] rounded bg-muted px-1.5 py-0.5">{LEAD_LOST_REASON_LABEL[l.lostReason]}</span>}
                        </div>
                        {chat?.lastMessagePreview && <p className="text-xs text-muted-foreground line-clamp-2">{chat.lastMessagePreview}</p>}
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="truncate">{isAdmin && l.owner ? (l.owner.name ?? l.owner.email) : (chat ? `Chat ${relTime(chat.lastMessageAt)}` : `Masuk ${relTime(l.createdAt)}`)}</span>
                          {waiting !== null && (
                            <span className={cn('flex items-center gap-0.5 font-medium shrink-0', waiting >= STAGNANT_HOURS ? 'text-red-600' : 'text-amber-600')}
                              title="Pesan terakhir tamu belum dibalas">
                              <Clock className="h-3 w-3" /> Belum dibalas {waiting < 1 ? `${Math.max(1, Math.round(waiting * 60))} mnt` : `${Math.floor(waiting)} jam`}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {items.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">—</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Lead detail */}
      <Sheet open={!!selected} onOpenChange={v => { if (!v) setSelectedId(null) }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <div className="space-y-5 pt-2">
              <div>
                <SheetTitle className="text-lg">{selected.name}</SheetTitle>
                <p className="text-sm text-muted-foreground">{[selected.phone, selected.email].filter(Boolean).join(' · ') || '—'}</p>
              </div>

              <div className="rounded-lg border bg-muted/20 p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Stage</span>
                  <Badge className={`${LEAD_STAGE_COLOR[selected.stage]} border-transparent`}>{LEAD_STAGE_LABEL[selected.stage]}</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_TRANSITIONS[selected.stage].length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">Stage final</span>
                  ) : LEAD_TRANSITIONS[selected.stage].map(next => (
                    <Button key={next} size="sm" disabled={busy}
                      variant={next.startsWith('CLOSED') || next === 'UNQUALIFIED' ? 'outline' : 'default'}
                      onClick={() => changeStage(selected, next)}>
                      {next === 'CONTACTED' && selected.stage === 'UNQUALIFIED' ? 'Buka lagi ke Contacted' : `→ ${LEAD_STAGE_LABEL[next]}`}
                    </Button>
                  ))}
                </div>
                {selected.stage === 'CONTACTED' && (
                  <p className="text-[11px] text-muted-foreground">Untuk Qualified wajib isi: produk, destinasi, negara, tanggal/musim, jumlah tamu, kualitas lead.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Pemilik</p>
                {isAdmin ? (
                  <Select value={selected.owner?.id ?? UNOWNED} onValueChange={v => setOwnerOf(selected, v === UNOWNED ? null : v)} disabled={busy}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNOWNED}>Tanpa pemilik</SelectItem>
                      {selected.owner && !salesUsers.some(u => u.id === selected.owner?.id) && (
                        <SelectItem value={selected.owner.id}>{selected.owner.name ?? selected.owner.email}</SelectItem>
                      )}
                      {salesUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name ?? u.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : selected.owner ? (
                  <p className="text-sm font-medium">{selected.owner.id === myId ? 'Kamu' : (selected.owner.name ?? selected.owner.email)}</p>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => myId && setOwnerOf(selected, myId)}>
                    <UserPlus className="h-3.5 w-3.5 mr-1" /> Ambil lead ini
                  </Button>
                )}
                {selected.whatsappConversations.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">Chat WhatsApp lead ini ikut pindah ke pemilik baru.</p>
                )}
                {selected.owner && selected.ownerAssignedAt && !selected.stage.startsWith('CLOSED') && (
                  <p className="text-[11px] text-muted-foreground">
                    Dipegang sejak {relTime(selected.ownerAssignedAt)} — tanpa follow up {STAGNANT_HOURS} jam, lead pindah otomatis ke sales lain.
                  </p>
                )}
                {selected.assignmentLogs.length > 0 && (
                  <div className="pt-1 space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">Riwayat pemilik</p>
                    {selected.assignmentLogs.map(log => (
                      <p key={log.id} className="text-[11px] text-muted-foreground">
                        {fmtDate(log.createdAt)} · {log.fromUser ? (log.fromUser.name ?? log.fromUser.email) : '—'} → {log.toUser ? (log.toUser.name ?? log.toUser.email) : 'Tanpa pemilik'}
                        <span className="ml-1 italic">({ASSIGN_REASON_LABEL[log.reason]})</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                {([
                  ['Kualitas', selected.leadQuality ?? '—'],
                  ['Destinasi', selected.destination?.name ?? '—'],
                  ['Jumlah tamu', selected.guestCount ?? '—'],
                  ['Rencana trip', selected.travelStartDate ? fmtDate(selected.travelStartDate) : (selected.travelSeason ?? '—')],
                  ['Penawaran dikirim', selected.proposalSentAt ? fmtDate(selected.proposalSentAt) : '—'],
                  ['Masuk', fmtDate(selected.createdAt)],
                ] as [string, string | number][]).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>

              <Button variant="outline" className="w-full" onClick={() => setEditLeadId(selected.id)}>
                <Pencil className="h-4 w-4 mr-1.5" /> Edit data lead
              </Button>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Channel</p>
                {selected._count.inquiries > 0 && (
                  <div className="rounded-lg border p-2.5 text-xs flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    {selected._count.inquiries} form website <span className="text-muted-foreground">— detail di menu Leads</span>
                  </div>
                )}
                {selected.whatsappConversations.map(c => (
                  <button key={c.id} onClick={() => onOpenChat(c.id)}
                    className="w-full text-left rounded-lg border p-2.5 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" style={{ color: WA_GREEN }} /> WhatsApp {WHATSAPP_BRAND_LABELS[c.brand]}</span>
                      <span className="text-muted-foreground">{relTime(c.lastMessageAt)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-1">{c.lastMessagePreview || '—'}</p>
                  </button>
                ))}
                {selected._count.inquiries === 0 && selected.whatsappConversations.length === 0 && (
                  <p className="text-xs text-muted-foreground">Input manual — belum ada form atau chat.</p>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <LeadEditSheet open={!!editLeadId} leadId={editLeadId} onClose={() => setEditLeadId(null)} onSaved={() => { setEditLeadId(null); load() }} />
      <LostReasonDialog
        open={!!lostTarget}
        leadName={lostTarget?.name}
        busy={busy}
        onCancel={() => setLostTarget(null)}
        onConfirm={(lostReason, lostNote) => lostTarget && changeStage(lostTarget, 'CLOSED_LOST', { lostReason, lostNote })}
      />
    </div>
  )
}
