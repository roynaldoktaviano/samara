'use client'

// "Freshsales Archive" menu — read-only browser over the Freshsales* archive tables filled by
// scripts/freshsales-archive.ts. Deals and contacts lists, each opening a side sheet with the
// record's details and its merged history (emails, activities/notes, timeline events).
import { useEffect, useMemo, useState } from 'react'
import {
  Archive, Search, ChevronLeft, ChevronRight, Mail, Phone, ArrowDownLeft, ArrowUpRight,
  Paperclip, StickyNote, CheckSquare, Activity, History, Briefcase, UserPlus, Users, RefreshCw,
} from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

type Status = 'OPEN' | 'WON' | 'LOST'
interface ContactRef { id: string; name: string | null; email: string | null }
interface DealRow {
  id: string; name: string; amount: number | null; currency: string | null; pipeline: string | null; stage: string | null
  status: Status; owner: string | null; lostReason: string | null; contacts: ContactRef[]; createdAt: string | null; closedDate: string | null
}
interface ContactRow {
  id: string; name: string | null; email: string | null; phone: string | null; owner: string | null
  lastContactedAt: string | null; createdAt: string | null; leadId: string | null; customerId: string | null; deals: number; historySynced: boolean
}
interface DealsResponse {
  deals: DealRow[]; total: number; notAvailable?: boolean; sync: SyncRow[]
  filters: { pipelines: { id: string; name: string }[]; stages: { id: string; name: string; pipelineId: string | null }[]; owners: { id: string; name: string }[] }
}
interface SyncRow { entity: string; status: string; processed: number; total: number | null; updatedAt: string }
type TimelineItem =
  | { kind: 'email'; id: string; at: string | null; direction: string | null; subject: string | null; preview: string | null; from: string | null; to: string[]; messageCount: number | null; attachments: { fileName: string; size: number | null }[] }
  | { kind: 'activity'; id: string; at: string | null; activityKind: string; title: string | null; body: string | null; type: string | null; outcome: string | null; status: string | null; owner: string | null }
  | { kind: 'event'; id: string; at: string; actionType: string; label: string; detail: string | null; targetType: string | null }

const STATUS_COLOR: Record<Status, string> = {
  OPEN: 'bg-blue-100 text-blue-700', WON: 'bg-green-100 text-green-700', LOST: 'bg-gray-100 text-gray-600',
}
const SYNC_LABEL: Record<string, string> = {
  contacts: 'Contacts', dealsIndex: 'Deals', dealDetails: 'Deal details', conversations: 'Emails', timeline: 'Timeline', activities: 'Activities',
}

const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtDateTime = (d: string | null | undefined) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtMoney = (n: number | null, cur: string | null) => n == null ? '—' : `${cur ?? ''} ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`.trim()

const selectCls = 'h-9 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500'

export default function FreshsalesArchive() {
  const [tab, setTab] = useState<'deals' | 'contacts'>('deals')
  const [sync, setSync] = useState<SyncRow[]>([])
  const [openDeal, setOpenDeal] = useState<string | null>(null)
  const [openContact, setOpenContact] = useState<string | null>(null)

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Archive className="h-5 w-5 text-amber-600" />
          <div>
            <h1 className="text-xl font-semibold">Freshsales Archive</h1>
            <p className="text-sm text-muted-foreground">Read-only copy of Freshsales deals, contacts, emails and activity history.</p>
          </div>
        </div>
        <SyncStatus sync={sync} />
      </div>

      <div className="flex gap-1.5">
        {([['deals', 'Deals', Briefcase], ['contacts', 'Contacts', Users]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-amber-600 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'deals'
        ? <DealsTab onOpen={setOpenDeal} onSync={setSync} />
        : <ContactsTab onOpen={setOpenContact} />}

      <DealSheet id={openDeal} onClose={() => setOpenDeal(null)} onOpenContact={id => { setOpenDeal(null); setOpenContact(id) }} />
      <ContactSheet id={openContact} onClose={() => setOpenContact(null)} onOpenDeal={id => { setOpenContact(null); setOpenDeal(id) }} />
    </div>
  )
}

function SyncStatus({ sync }: { sync: SyncRow[] }) {
  const shown = sync.filter(s => SYNC_LABEL[s.entity])
  if (!shown.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map(s => {
        const pct = s.total ? Math.min(100, Math.round((s.processed / s.total) * 100)) : null
        const running = s.status === 'RUNNING'
        return (
          <span key={s.entity} title={`Updated ${fmtDateTime(s.updatedAt)}`}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${s.status === 'ERROR' ? 'bg-red-100 text-red-700' : running ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'}`}>
            {running && <RefreshCw className="h-3 w-3 animate-spin" />}
            {SYNC_LABEL[s.entity]} {running && pct !== null ? `${pct}%` : s.status === 'DONE' ? '✓' : s.status.toLowerCase()}
          </span>
        )
      })}
    </div>
  )
}

function Pager({ page, total, pageSize, onPage, noun }: { page: number; total: number; pageSize: number; onPage: (p: number) => void; noun: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex items-center justify-between text-sm pt-3">
      <p className="text-muted-foreground text-xs">Page {page} of {pages} · {total.toLocaleString()} {noun}</p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}

// Fetches `url` whenever it changes. `loading` is derived from whether the stored result is for
// the current url, so the effect never sets state synchronously.
function useFetch<T>(url: string | null) {
  const [res, setRes] = useState<{ url: string; data: T | null } | null>(null)
  useEffect(() => {
    if (!url) return
    let cancelled = false
    fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null).then(d => { if (!cancelled) setRes({ url, data: d }) })
    return () => { cancelled = true }
  }, [url])
  const current = !!url && res?.url === url
  return { data: current ? res!.data : null, loading: !!url && !current, last: res?.data ?? null }
}

function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

// ─── Deals ──────────────────────────────────────────────────────────────────

function DealsTab({ onOpen, onSync }: { onOpen: (id: string) => void; onSync: (s: SyncRow[]) => void }) {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [pipeline, setPipeline] = useState('')
  const [stage, setStage] = useState('')
  const [status, setStatus] = useState('')
  const [owner, setOwner] = useState('')
  const dq = useDebounced(q)

  const url = useMemo(() => {
    const p = new URLSearchParams({ page: String(page) })
    if (dq) p.set('q', dq)
    if (pipeline) p.set('pipeline', pipeline)
    if (stage) p.set('stage', stage)
    if (status) p.set('status', status)
    if (owner) p.set('owner', owner)
    return `/api/freshsales-archive/deals?${p}`
  }, [page, dq, pipeline, stage, status, owner])
  const { data, loading, last } = useFetch<DealsResponse>(url)
  // Keep filter options from the previous response while the next page loads
  const filters = (data ?? last)?.filters ?? { pipelines: [], stages: [], owners: [] }
  const deals = data?.deals ?? []
  const total = (data ?? last)?.total ?? 0
  const notAvailable = !!data?.notAvailable
  useEffect(() => { if (data?.sync) onSync(data.sync) }, [data, onSync])
  // Any filter change goes back to page 1
  const withReset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1) }

  const stages = filters.stages.filter(s => !pipeline || s.pipelineId === pipeline)

  if (notAvailable) return <p className="text-sm text-muted-foreground">The Freshsales archive isn&apos;t set up for this company.</p>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => withReset(setQ)(e.target.value)} placeholder="Search deal name…" className="pl-8 h-9 w-64" />
        </div>
        <select className={selectCls} value={pipeline} onChange={e => { withReset(setPipeline)(e.target.value); setStage('') }}>
          <option value="">All pipelines</option>
          {filters.pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className={selectCls} value={stage} onChange={e => withReset(setStage)(e.target.value)}>
          <option value="">All stages</option>
          {stages.map(s => <option key={s.id} value={s.id}>{pipeline ? s.name : `${s.name} · ${filters.pipelines.find(p => p.id === s.pipelineId)?.name ?? ''}`}</option>)}
        </select>
        <select className={selectCls} value={status} onChange={e => withReset(setStatus)(e.target.value)} disabled={!!stage}>
          <option value="">Open / Won / Lost</option>
          <option value="OPEN">Open</option>
          <option value="WON">Won</option>
          <option value="LOST">Lost</option>
        </select>
        <select className={selectCls} value={owner} onChange={e => withReset(setOwner)(e.target.value)}>
          <option value="">All owners</option>
          {filters.owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          <option value="none">No owner</option>
        </select>
      </div>

      <div className="rounded-xl border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Deal</TableHead>
              <TableHead>Pipeline / Stage</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? [...Array(8)].map((_, i) => (
              <TableRow key={i}>{[...Array(6)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>)}</TableRow>
            )) : deals.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">No deals found</TableCell></TableRow>
            ) : deals.map(d => (
              <TableRow key={d.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onOpen(d.id)}>
                <TableCell className="max-w-[320px]">
                  <p className="font-medium text-sm truncate" title={d.name}>{d.name}</p>
                  {d.lostReason && <p className="text-[11px] text-muted-foreground">Lost: {d.lostReason}</p>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge className={`${STATUS_COLOR[d.status]} border-transparent`}>{d.stage ?? '—'}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{d.pipeline ?? '—'}</p>
                </TableCell>
                <TableCell className="max-w-[220px]">
                  {d.contacts.length ? d.contacts.slice(0, 2).map(c => (
                    <p key={c.id} className="text-xs truncate">{c.name ?? c.email}</p>
                  )) : <span className="text-xs text-muted-foreground">—</span>}
                  {d.contacts.length > 2 && <p className="text-[11px] text-muted-foreground">+{d.contacts.length - 2} more</p>}
                </TableCell>
                <TableCell className="text-xs">{d.owner ?? '—'}</TableCell>
                <TableCell className="text-right text-xs whitespace-nowrap">{fmtMoney(d.amount, d.currency)}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(d.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager page={page} total={total} pageSize={50} onPage={setPage} noun="deal(s)" />
    </div>
  )
}

// ─── Contacts ───────────────────────────────────────────────────────────────

function ContactsTab({ onOpen }: { onOpen: (id: string) => void }) {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [linked, setLinked] = useState('')
  const dq = useDebounced(q)

  const url = useMemo(() => {
    const p = new URLSearchParams({ page: String(page) })
    if (dq) p.set('q', dq)
    if (linked) p.set('linked', linked)
    return `/api/freshsales-archive/contacts?${p}`
  }, [page, dq, linked])
  const { data, loading, last } = useFetch<{ contacts: ContactRow[]; total: number }>(url)
  const contacts = data?.contacts ?? []
  const total = (data ?? last)?.total ?? 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="Search name, email, phone…" className="pl-8 h-9 w-72" />
        </div>
        <select className={selectCls} value={linked} onChange={e => { setLinked(e.target.value); setPage(1) }}>
          <option value="">All contacts</option>
          <option value="lead">Linked to a Lead</option>
          <option value="customer">Linked to a Guest</option>
          <option value="none">Archive only</option>
        </select>
      </div>

      <div className="rounded-xl border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead>Email / Phone</TableHead>
              <TableHead>In ERP</TableHead>
              <TableHead className="text-center">Deals</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Last contacted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? [...Array(8)].map((_, i) => (
              <TableRow key={i}>{[...Array(6)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>)}</TableRow>
            )) : contacts.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">No contacts found</TableCell></TableRow>
            ) : contacts.map(c => (
              <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onOpen(c.id)}>
                <TableCell className="font-medium text-sm max-w-[240px] truncate">{c.name ?? '—'}</TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    {c.email && <div className="flex items-center gap-1 text-xs"><Mail className="h-3 w-3 text-muted-foreground" />{c.email}</div>}
                    {c.phone && <div className="flex items-center gap-1 text-xs"><Phone className="h-3 w-3 text-muted-foreground" />{c.phone}</div>}
                  </div>
                </TableCell>
                <TableCell><ErpBadge leadId={c.leadId} customerId={c.customerId} /></TableCell>
                <TableCell className="text-center text-xs">{c.deals || '—'}</TableCell>
                <TableCell className="text-xs">{c.owner ?? '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(c.lastContactedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager page={page} total={total} pageSize={50} onPage={setPage} noun="contact(s)" />
    </div>
  )
}

function ErpBadge({ leadId, customerId }: { leadId: string | null; customerId: string | null }) {
  if (customerId) return <Badge className="bg-green-100 text-green-700 border-transparent">Guest</Badge>
  if (leadId) return <Badge className="bg-amber-100 text-amber-800 border-transparent">Lead</Badge>
  return <span className="text-[11px] text-muted-foreground">Archive only</span>
}

// ─── Detail sheets ──────────────────────────────────────────────────────────


interface DealDetail {
  deal: DealRow & {
    leadSource: string | null; probability: number | null; expectedClose: string | null; stageUpdatedAt: string | null
    updatedAt: string | null; detailSynced: boolean; customFields: { key: string; label: string; value: string }[]
  }
  contacts: { id: string; name: string | null; email: string | null; phone: string | null; leadId: string | null; customerId: string | null }[]
  timeline: TimelineItem[]
}

function DealSheet({ id, onClose, onOpenContact }: { id: string | null; onClose: () => void; onOpenContact: (id: string) => void }) {
  const { data, loading } = useFetch<DealDetail>(id ? `/api/freshsales-archive/deals/${id}` : null)
  const d = data?.deal
  return (
    <Sheet open={!!id} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent className="w-[95vw] sm:w-[640px] sm:max-w-none p-0 flex flex-col overflow-hidden">
        <SheetTitle className="sr-only">Deal</SheetTitle>
        {loading || !d ? <SheetSkeleton /> : (
          <div className="flex-1 overflow-y-auto">
            <div className="border-b p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Briefcase className="h-3.5 w-3.5" /> Freshsales deal</div>
              <h2 className="text-lg font-semibold leading-snug">{d.name}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`${STATUS_COLOR[d.status]} border-transparent`}>{d.stage ?? '—'}</Badge>
                <span className="text-xs text-muted-foreground">{d.pipeline}</span>
                {d.lostReason && <span className="text-xs text-muted-foreground">· Lost: {d.lostReason}</span>}
              </div>
            </div>

            <div className="p-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm border-b">
              <Field label="Amount" value={fmtMoney(d.amount, d.currency)} />
              <Field label="Owner" value={d.owner} />
              <Field label="Created" value={fmtDate(d.createdAt)} />
              <Field label="Stage updated" value={fmtDate(d.stageUpdatedAt)} />
              <Field label="Expected close" value={fmtDate(d.expectedClose)} />
              <Field label="Closed" value={fmtDate(d.closedDate)} />
              <Field label="Lead source" value={d.leadSource} />
              <Field label="Probability" value={d.probability != null ? `${d.probability}%` : null} />
            </div>

            <div className="p-5 border-b space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contacts</h3>
              {data.contacts.length ? data.contacts.map(c => (
                <button key={c.id} onClick={() => onOpenContact(c.id)} className="w-full flex items-center justify-between rounded-lg border px-3 py-2 text-left hover:bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{c.name ?? c.email}</p>
                    <p className="text-xs text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(' · ')}</p>
                  </div>
                  <ErpBadge leadId={c.leadId} customerId={c.customerId} />
                </button>
              )) : <p className="text-sm text-muted-foreground">No contacts</p>}
            </div>

            {d.customFields.length > 0 && (
              <div className="p-5 border-b space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom fields</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {d.customFields.map(f => <Field key={f.key} label={f.label} value={f.value} />)}
                </div>
              </div>
            )}
            {!d.detailSynced && (
              <p className="mx-5 mt-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                Custom fields, lost reason and notes for this deal are still being pulled from Freshsales.
              </p>
            )}

            <TimelineView items={data.timeline} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

interface ContactDetail {
  contact: ContactRow & { country: string | null; city: string | null; firstSource: string | null; firstMedium: string | null; firstCampaign: string | null }
  deals: DealRow[]
  timeline: TimelineItem[]
}

function ContactSheet({ id, onClose, onOpenDeal }: { id: string | null; onClose: () => void; onOpenDeal: (id: string) => void }) {
  const { data, loading } = useFetch<ContactDetail>(id ? `/api/freshsales-archive/contacts/${id}` : null)
  const c = data?.contact
  return (
    <Sheet open={!!id} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent className="w-[95vw] sm:w-[640px] sm:max-w-none p-0 flex flex-col overflow-hidden">
        <SheetTitle className="sr-only">Contact</SheetTitle>
        {loading || !c ? <SheetSkeleton /> : (
          <div className="flex-1 overflow-y-auto">
            <div className="border-b p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><UserPlus className="h-3.5 w-3.5" /> Freshsales contact</div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{c.name ?? c.email ?? '—'}</h2>
                <ErpBadge leadId={c.leadId} customerId={c.customerId} />
              </div>
              <div className="space-y-0.5">
                {c.email && <div className="flex items-center gap-1 text-xs"><Mail className="h-3 w-3 text-muted-foreground" />{c.email}</div>}
                {c.phone && <div className="flex items-center gap-1 text-xs"><Phone className="h-3 w-3 text-muted-foreground" />{c.phone}</div>}
              </div>
            </div>

            <div className="p-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm border-b">
              <Field label="Owner" value={c.owner} />
              <Field label="Created" value={fmtDate(c.createdAt)} />
              <Field label="Last contacted" value={fmtDate(c.lastContactedAt)} />
              <Field label="Location" value={[c.city, c.country].filter(Boolean).join(', ') || null} />
              <Field label="First source" value={[c.firstSource, c.firstMedium].filter(Boolean).join(' / ') || null} />
              <Field label="First campaign" value={c.firstCampaign} />
            </div>

            <div className="p-5 border-b space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deals ({data.deals.length})</h3>
              {data.deals.length ? data.deals.map(d => (
                <button key={d.id} onClick={() => onOpenDeal(d.id)} className="w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{d.pipeline} · {fmtDate(d.createdAt)}{d.owner ? ` · ${d.owner}` : ''}</p>
                  </div>
                  <Badge className={`${STATUS_COLOR[d.status]} border-transparent shrink-0`}>{d.stage ?? '—'}</Badge>
                </button>
              )) : <p className="text-sm text-muted-foreground">No deals</p>}
            </div>

            {!c.historySynced && (
              <p className="mx-5 mt-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                Emails and timeline for this contact are still being pulled from Freshsales (or it has no contact history).
              </p>
            )}
            <TimelineView items={data.timeline} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground capitalize">{label}</p>
      <p className="text-sm break-words">{value || '—'}</p>
    </div>
  )
}

function SheetSkeleton() {
  return (
    <div className="p-5 space-y-3">
      <Skeleton className="h-4 w-24" /><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-40" />
      <div className="pt-4 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
    </div>
  )
}

// ─── Timeline ───────────────────────────────────────────────────────────────

const ACTIVITY_ICON: Record<string, typeof StickyNote> = { NOTE: StickyNote, TASK: CheckSquare, SALES_ACTIVITY: Activity, APPOINTMENT: Activity }

function TimelineView({ items }: { items: TimelineItem[] }) {
  const [filter, setFilter] = useState<'all' | 'email' | 'activity' | 'event'>('all')
  const shown = filter === 'all' ? items : items.filter(i => i.kind === filter)
  const count = (k: TimelineItem['kind']) => items.filter(i => i.kind === k).length
  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</h3>
        <div className="flex gap-1">
          {([['all', `All ${items.length}`], ['email', `Emails ${count('email')}`], ['activity', `Activities ${count('activity')}`], ['event', `Changes ${count('event')}`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${filter === k ? 'bg-amber-100 text-amber-800' : 'text-muted-foreground hover:bg-muted'}`}>{label}</button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">Nothing here yet.</p> : (
        <ol className="relative border-l pl-4 space-y-3">
          {shown.map(item => <TimelineEntry key={`${item.kind}-${item.id}`} item={item} />)}
        </ol>
      )}
      {items.length >= 400 && <p className="text-[11px] text-muted-foreground">Showing the latest 400 items.</p>}
    </div>
  )
}

function TimelineEntry({ item }: { item: TimelineItem }) {
  const [open, setOpen] = useState(false)
  if (item.kind === 'email') {
    const incoming = item.direction === 'incoming'
    const Icon = incoming ? ArrowDownLeft : ArrowUpRight
    return (
      <li className="relative">
        <span className={`absolute -left-[25px] top-1 flex h-4 w-4 items-center justify-center rounded-full ${incoming ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}><Icon className="h-2.5 w-2.5" /></span>
        <button onClick={() => setOpen(o => !o)} className="w-full text-left rounded-lg border px-3 py-2 hover:bg-muted/40">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{item.subject || '(no subject)'}</p>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtDateTime(item.at)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            <Mail className="inline h-3 w-3 mr-1" />{incoming ? 'From' : 'Sent'} {item.from ?? '—'}{item.to.length ? ` → ${item.to.slice(0, 3).join(', ')}${item.to.length > 3 ? '…' : ''}` : ''}
            {item.messageCount && item.messageCount > 1 ? ` · ${item.messageCount} messages` : ''}
          </p>
          {item.preview && <p className={`text-xs mt-1 whitespace-pre-line text-foreground/80 ${open ? '' : 'line-clamp-2'}`}>{item.preview}</p>}
          {open && item.attachments.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {item.attachments.map((a, i) => <span key={i} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px]"><Paperclip className="h-3 w-3" />{a.fileName}</span>)}
            </div>
          )}
          {open && <p className="text-[10px] text-muted-foreground mt-1">Freshsales only provides a preview of the email body.</p>}
        </button>
      </li>
    )
  }
  if (item.kind === 'activity') {
    const Icon = ACTIVITY_ICON[item.activityKind] ?? Activity
    return (
      <li className="relative">
        <span className="absolute -left-[25px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-amber-800"><Icon className="h-2.5 w-2.5" /></span>
        <div className="rounded-lg border px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{item.title || item.activityKind.replace('_', ' ').toLowerCase()}</p>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtDateTime(item.at)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {[item.activityKind === 'NOTE' ? 'Note' : item.type ?? item.activityKind.replace('_', ' ').toLowerCase(), item.outcome, item.status, item.owner].filter(Boolean).join(' · ')}
          </p>
          {item.body && <p className="text-xs mt-1 whitespace-pre-line text-foreground/80">{item.body}</p>}
        </div>
      </li>
    )
  }
  return (
    <li className="relative">
      <span className="absolute -left-[25px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground"><History className="h-2.5 w-2.5" /></span>
      <div className="flex items-center justify-between gap-2 py-0.5">
        <p className="text-xs"><span className="font-medium capitalize">{item.label}</span>{item.targetType ? <span className="text-muted-foreground"> · {item.targetType}</span> : null}{item.detail ? <span className="text-muted-foreground"> — {item.detail}</span> : null}</p>
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtDateTime(item.at)}</span>
      </div>
    </li>
  )
}
