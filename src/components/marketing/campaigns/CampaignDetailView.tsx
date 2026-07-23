'use client'

import { useState, useEffect, useCallback, useMemo, useDeferredValue } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Eye, MousePointerClick, Loader2, Play, ChevronLeft, ChevronRight, Search, Bot } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { UNSUBSCRIBE_URL_MARKER } from '@/lib/campaign-recipients'

const GREEN = '#16a34a'
const BLUE = '#2563eb'
const RED = '#dc2626'
const TZ = 'Asia/Jakarta'
const PREVIEW_SCALE = 0.72
const PAGE_SIZE = 20

interface ClickEvent {
  id: string
  url: string
  ipAddress: string | null
  clickedAt: string
}

interface OpenEvent {
  id: string
  ipAddress: string | null
  openedAt: string
}

interface Recipient {
  id: string
  email: string
  name: string | null
  status: 'PENDING' | 'SENT' | 'FAILED' | 'BOUNCED' | 'SKIPPED_UNSUBSCRIBED'
  sourceType: 'CUSTOMER' | 'LEAD' | 'AGENT' | 'AGENT_LEAD_CONTACT' | 'MANUAL'
  sourceId: string | null
  errorMessage: string | null
  openedAt: string | null
  openCount: number
  clickedAt: string | null
  clickCount: number
  lastClickUrl: string | null
  unsubscribedAt: string | null
  clicks: ClickEvent[]
  opens: OpenEvent[]
  sentAt: string | null
  likelyAutomated: boolean
}

interface ChartRow {
  id: string
  sentAt: string | null
  opens: { openedAt: string }[]
  clicks: { url: string; clickedAt: string }[]
}

type RecipientTab = 'ALL' | 'SENT' | 'OPENED' | 'PENDING' | 'BOUNCED' | 'FAILED' | 'UNSUBSCRIBED'

interface RecipientCounts {
  SENT: number
  OPENED: number
  PENDING: number
  BOUNCED: number
  FAILED: number
  UNSUBSCRIBED: number
}

interface CampaignWithRecipients {
  id: string
  name: string
  subject: string
  previewText: string | null
  fromEmail: string
  fromName: string | null
  status: string
  totalRecipients: number
  sentCount: number
  bodyHtml: string
  recipientCounts: RecipientCounts
  engagementStats: { realOpened: number; realClicked: number }
  pendingUnsubscribeCount: number
  chartRows: ChartRow[]
}

interface RecipientsData {
  recipients: Recipient[]
  page: number
  totalPages: number
  totalCount: number
}

const TAB_LABEL: Record<RecipientTab, string> = {
  ALL: 'All', SENT: 'Sent', OPENED: 'Opened', PENDING: 'Pending',
  BOUNCED: 'Bounced', FAILED: 'Failed', UNSUBSCRIBED: 'Unsubscribed',
}

const STATUS_STYLE: Record<Recipient['status'], string> = {
  PENDING: 'bg-gray-100 text-gray-700 border-gray-200',
  SENT: 'bg-green-100 text-green-700 border-green-200',
  FAILED: 'bg-red-100 text-red-700 border-red-200',
  BOUNCED: 'bg-orange-100 text-orange-700 border-orange-200',
  SKIPPED_UNSUBSCRIBED: 'bg-gray-100 text-gray-500 border-gray-200',
}

const STATUS_LABEL: Record<Recipient['status'], string> = {
  PENDING: 'Pending',
  SENT: 'Sent',
  FAILED: 'Failed',
  BOUNCED: 'Bounced',
  SKIPPED_UNSUBSCRIBED: 'Unsubscribed',
}

const fmt = (d: string | null) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '-'
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: TZ })

function StatTile({ label, value, suffix = '', color }: { label: string; value: number; suffix?: string; color?: string }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <div className="text-2xl font-semibold" style={color ? { color } : undefined}>{value}{suffix}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function RateTile({ label, value, suffix = '%', sub, color }: { label: string; value: number; suffix?: string; sub?: string; color?: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold mt-1" style={color ? { color } : undefined}>{value}{suffix}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

interface LinkStat {
  url: string
  clickers: number
}

// Same 30-second-click-burst heuristic as the server's isLikelyAutomated (see
// campaign-recipients.ts) - security scanners pre-fetch every link within seconds
// of delivery, so a recipient's own clicks look automated the same way regardless
// of which link we're tallying.
function isLikelyAutomatedClicks(clicks: { clickedAt: string }[]): boolean {
  if (clicks.length < 2) return false
  const times = clicks.map(c => new Date(c.clickedAt).getTime()).sort((a, b) => a - b)
  return times[times.length - 1] - times[0] <= 30_000
}

// Unique clickers per URL (not raw click count - someone clicking the same
// link twice shouldn't outweigh two different people clicking it once).
// Excludes the unsubscribe link - it's tracked separately in the recipient
// table's Unsubscribed tab, not as content link performance.
// `real` drops recipients whose clicks look automated, same as the real
// open/click rate tiles above.
function computeLinkStats(recipients: ChartRow[], real: boolean): LinkStat[] {
  const byUrl = new Map<string, Set<string>>()
  for (const r of recipients) {
    if (real && isLikelyAutomatedClicks(r.clicks)) continue
    for (const c of r.clicks) {
      if (c.url.includes(UNSUBSCRIBE_URL_MARKER)) continue
      if (!byUrl.has(c.url)) byUrl.set(c.url, new Set())
      byUrl.get(c.url)!.add(r.id)
    }
  }
  return Array.from(byUrl.entries())
    .map(([url, ids]) => ({ url, clickers: ids.size }))
    .sort((a, b) => b.clickers - a.clickers)
}

function LinkPerformance({ stats, totalRecipients, view, onViewChange, pending }: {
  stats: LinkStat[]
  totalRecipients: number
  view: 'real' | 'raw'
  onViewChange: (view: 'real' | 'raw') => void
  pending: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Link performance</CardTitle>
          <div className="flex items-center gap-2">
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <div className="flex rounded-full border border-gray-200 p-0.5 text-xs">
              {(['real', 'raw'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => onViewChange(v)}
                  className={`px-2.5 py-1 rounded-full font-medium capitalize transition-colors ${
                    view === v ? 'bg-[#bdac7e] text-white' : 'text-muted-foreground hover:bg-gray-50'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className={`space-y-3 transition-opacity ${pending ? 'opacity-50' : ''}`}>
        {stats.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No clicks yet</p>}
        {stats.map(s => {
          const pct = totalRecipients > 0 ? Math.round((s.clickers / totalRecipients) * 100) : 0
          return (
            <div key={s.url} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-xs">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">{s.url}</a>
                <span className="text-muted-foreground shrink-0 tabular-nums">{s.clickers} ({pct}%)</span>
              </div>
              <div className="h-1.5 rounded-full bg-blue-100 overflow-hidden">
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(pct, s.clickers > 0 ? 2 : 0)}%` }} />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// Fixed 6-day window (today plus the 5 days before it, in TZ) shown on the
// trend chart - a longer-running campaign's opens/clicks can trail for weeks,
// which flattens the recent trend into a barely-visible sliver.
const TREND_WINDOW_DAYS = 6

// Per-day Sent/Opened/Clicked series for the trend chart - Sent will usually land on
// a single day (a campaign is a one-time blast), while Opened/Clicked trail across
// the days after as recipients check their inbox.
function dailyTrend(recipients: ChartRow[]) {
  const sent = new Map<string, number>()
  const opened = new Map<string, number>()
  const clicked = new Map<string, number>()
  const bump = (map: Map<string, number>, iso: string) => {
    const key = new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD, sorts naturally
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  for (const r of recipients) {
    if (r.sentAt) bump(sent, r.sentAt)
    for (const o of r.opens) bump(opened, o.openedAt)
    for (const c of r.clicks) bump(clicked, c.clickedAt)
  }
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const [ty, tm, td] = todayKey.split('-').map(Number)
  const todayUTC = Date.UTC(ty, tm - 1, td)
  const keys = Array.from({ length: TREND_WINDOW_DAYS }, (_, i) =>
    new Date(todayUTC - (TREND_WINDOW_DAYS - 1 - i) * 86_400_000).toLocaleDateString('en-CA', { timeZone: TZ })
  )
  return keys.map(key => ({
    date: fmtDate(key),
    sent: sent.get(key) ?? 0,
    opened: opened.get(key) ?? 0,
    clicked: clicked.get(key) ?? 0,
  }))
}

function opensByHour(recipients: ChartRow[]) {
  const counts = new Array(24).fill(0)
  for (const r of recipients) {
    for (const o of r.opens) {
      const hour = Number(new Date(o.openedAt).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }))
      counts[hour % 24] += 1
    }
  }
  return counts.map((count, hour) => ({ hour: `${String(hour).padStart(2, '0')}:00`, count }))
}

// Most recent IP seen for a recipient, from either an open or a click event.
function latestIp(r: Recipient): string | null {
  const events = [
    ...r.opens.map(o => ({ at: o.openedAt, ip: o.ipAddress })),
    ...r.clicks.map(c => ({ at: c.clickedAt, ip: c.ipAddress })),
  ].filter(e => e.ip)
  if (events.length === 0) return null
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return events[0].ip
}

interface SendProgress {
  status: string
  startedAt: string
  total: number
  sent: number
  failed: number
  done: number
}

// Resend rate-limits to ~2 req/s (a fixed 550ms gap between sends, plus occasional
// retry backoff) - used as the fallback pace estimate before enough real samples
// have come in to compute an actual rate from elapsed time.
const FALLBACK_SECONDS_PER_EMAIL = 0.65

function fmtDuration(totalSeconds: number): string {
  if (!isFinite(totalSeconds) || totalSeconds <= 0) return 'a few seconds'
  const s = Math.round(totalSeconds)
  if (s < 60) return `${s} sec`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return rem > 0 ? `${m} min ${rem} sec` : `${m} min`
  const h = Math.floor(m / 60)
  return `${h} hr ${m % 60} min`
}

function SendingBanner({ progress }: { progress: SendProgress }) {
  const remaining = Math.max(0, progress.total - progress.done)
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const elapsedSeconds = (Date.now() - new Date(progress.startedAt).getTime()) / 1000
  const rate = elapsedSeconds > 2 && progress.done > 0 ? progress.done / elapsedSeconds : 0
  const etaSeconds = rate > 0 ? remaining / rate : remaining * FALLBACK_SECONDS_PER_EMAIL

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="pt-5 pb-4 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending campaign... {progress.done} of {progress.total} ({pct}%)
          </div>
          {remaining > 0 && (
            <span className="text-xs text-amber-700 shrink-0">~{fmtDuration(etaSeconds)} remaining</span>
          )}
        </div>
        <div className="h-2 rounded-full bg-amber-200/60 overflow-hidden">
          <div className="h-full rounded-full bg-amber-500 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        {progress.failed > 0 && (
          <p className="text-xs text-amber-700">{progress.failed} failed so far</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function CampaignDetailView({ campaignId, onBack }: {
  campaignId: string
  onBack: () => void
}) {
  const [campaign, setCampaign] = useState<CampaignWithRecipients | null>(null)
  const [recipientsData, setRecipientsData] = useState<RecipientsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [recipientsLoading, setRecipientsLoading] = useState(true)
  const [progress, setProgress] = useState<SendProgress | null>(null)
  const [tab, setTab] = useState<RecipientTab>('SENT')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [continuing, setContinuing] = useState(false)
  const [unsubscribingIds, setUnsubscribingIds] = useState<Set<string>>(new Set())
  const [suppressedIds, setSuppressedIds] = useState<Set<string>>(new Set())
  const [unsubscribingAll, setUnsubscribingAll] = useState(false)
  const [linkView, setLinkView] = useState<'real' | 'raw'>('real')
  const [deletingContactIds, setDeletingContactIds] = useState<Set<string>>(new Set())
  const [deletedContactIds, setDeletedContactIds] = useState<Set<string>>(new Set())
  const { data: session } = useSession()
  const isAdmin = (session?.user as { role?: string })?.role === 'ADMIN'

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Campaign-wide data (stats, charts) - doesn't depend on the recipient
  // tab/page/search, so it only needs to load once per campaign. `silent` skips
  // the loading flag for background refreshes that shouldn't blank the page
  // (e.g. re-syncing counts after a single-row action elsewhere on the page).
  const fetchCampaign = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}`)
      if (res.ok) setCampaign(await res.json())
    } finally {
      if (!silent) setLoading(false)
    }
  }, [campaignId])

  // Just the recipient table for the current tab/page/search - refetched on every
  // tab click without re-pulling the campaign-wide chart data above.
  const fetchRecipients = useCallback(async () => {
    setRecipientsLoading(true)
    try {
      const qs = new URLSearchParams({ status: tab, page: String(page), limit: String(PAGE_SIZE) })
      if (debouncedSearch) qs.set('search', debouncedSearch)
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/recipients?${qs}`)
      if (res.ok) setRecipientsData(await res.json())
    } finally {
      setRecipientsLoading(false)
    }
  }, [campaignId, tab, page, debouncedSearch])

  useEffect(() => { fetchCampaign() }, [fetchCampaign])
  useEffect(() => { fetchRecipients() }, [fetchRecipients])

  // setRecipientsLoading fires synchronously in the click handler itself (not just
  // inside fetchRecipients) so the table dims/spinner shows in the same paint as
  // the tab switch, instead of waiting a render cycle for the effect to catch up.
  const changeTab = (next: RecipientTab) => { setRecipientsLoading(true); setTab(next); setPage(1) }
  const changeSearch = (v: string) => { setRecipientsLoading(true); setSearch(v); setPage(1) }
  const goToPage = (next: number) => { setRecipientsLoading(true); setPage(next) }

  const continueSend = async () => {
    setContinuing(true)
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (res.ok) { fetchCampaign(); fetchRecipients() }
    } finally {
      setContinuing(false)
    }
  }

  // Two distinct actions depending on why the row qualifies (see the API route
  // for the full rationale): a recipient who clicked the unsubscribe link
  // themselves gets a real status flip to SKIPPED_UNSUBSCRIBED (moves to the
  // Unsubscribed tab); a bounced/failed recipient we're suppressing on their
  // behalf keeps their BOUNCED/FAILED status/tab - only the local button state
  // changes to reflect they've been suppressed from future sends. Patches just
  // this row in place instead of refetching the whole recipient table, and
  // syncs the campaign-wide counts silently so nothing on the page visibly reloads.
  const confirmUnsubscribe = async (id: string, isClickBased: boolean) => {
    setUnsubscribingIds(prev => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/unsubscribe-recipients`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientIds: [id] }),
      })
      if (res.ok) {
        if (isClickBased) {
          const unsubscribedAt = new Date().toISOString()
          setRecipientsData(prev => prev ? {
            ...prev,
            recipients: prev.recipients.map(r => r.id === id ? { ...r, status: 'SKIPPED_UNSUBSCRIBED' as const, unsubscribedAt } : r),
          } : prev)
        } else {
          setSuppressedIds(prev => new Set(prev).add(id))
        }
        fetchCampaign(true)
      }
    } finally {
      setUnsubscribingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  // Sweeps every recipient in the campaign matching a scope - clicked-unsubscribe
  // for the Unsubscribed tab, or bounced/failed addresses so they're suppressed
  // from future blasts too - regardless of which page is currently loaded. Unlike
  // confirmUnsubscribe this can touch rows outside the current page, so it
  // refetches the recipient table instead of patching a single row in place.
  const unsubscribeAllByScope = async (scope: 'clicked' | 'bounced' | 'failed') => {
    setUnsubscribingAll(true)
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/unsubscribe-recipients`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope }),
      })
      if (res.ok) { fetchCampaign(true); fetchRecipients() }
    } finally {
      setUnsubscribingAll(false)
    }
  }

  // A hard bounce/failure usually means the address is dead - lets an admin
  // remove the underlying guest/lead straight from the Failed tab instead of
  // going to find it in the Guests/Leads page. Admin-only (same as the
  // dedicated delete endpoints), soft-delete, and irreversible from here, so
  // it's confirmed before firing.
  const deleteContact = async (sourceType: 'CUSTOMER' | 'LEAD', sourceId: string) => {
    const label = sourceType === 'CUSTOMER' ? 'guest' : 'lead'
    if (!window.confirm(`Delete this ${label}? This can't be undone from here.`)) return
    setDeletingContactIds(prev => new Set(prev).add(sourceId))
    try {
      const endpoint = sourceType === 'CUSTOMER' ? `/api/customers/${sourceId}` : `/api/leads/${sourceId}`
      const res = await fetch(endpoint, { method: 'DELETE' })
      if (res.ok) {
        setDeletedContactIds(prev => new Set(prev).add(sourceId))
      } else {
        const data = await res.json().catch(() => null)
        window.alert(data?.error ?? `Failed to delete ${label}`)
      }
    } finally {
      setDeletingContactIds(prev => {
        const next = new Set(prev)
        next.delete(sourceId)
        return next
      })
    }
  }

  // While the campaign is actively sending, poll a lightweight counts-only endpoint
  // every few seconds to drive the progress bar/ETA, and pull the full detail again
  // once it finishes so stats/recipient statuses reflect the final outcome.
  useEffect(() => {
    if (campaign?.status !== 'SENDING') return
    let cancelled = false
    const poll = async () => {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/progress`)
      if (!res.ok || cancelled) return
      const data: SendProgress = await res.json()
      if (cancelled) return
      setProgress(data)
      if (data.status !== 'SENDING') { fetchCampaign(); fetchRecipients() }
    }
    poll()
    const interval = setInterval(poll, 2500)
    return () => { cancelled = true; clearInterval(interval) }
  }, [campaign?.status, campaignId, fetchCampaign, fetchRecipients])

  // Memoized — these loop over every non-pending recipient (thousands+ on a large
  // campaign), so recomputing them on renders that only touch tab/page/search
  // (unrelated to chartRows) was blocking the tab-switch loading state from
  // painting for a second or two. Kept above the loading early-return below so
  // hook order stays stable across renders (rules of hooks); chartRows falls
  // back to [] while campaign hasn't loaded yet.
  const chartRows = campaign?.chartRows ?? []
  const clicked = useMemo(() => chartRows.filter(r => r.clicks.length > 0).length, [chartRows])
  // Deferred so clicking Real/Raw flips the button and shows the spinner
  // instantly instead of waiting on the (potentially large) recompute below.
  const deferredLinkView = useDeferredValue(linkView)
  const linkStats = useMemo(() => computeLinkStats(chartRows, deferredLinkView === 'real'), [chartRows, deferredLinkView])
  const trendData = useMemo(() => dailyTrend(chartRows), [chartRows])
  const hourData = useMemo(() => opensByHour(chartRows), [chartRows])

  if (loading || !campaign) {
    return (
      <div className="p-4 md:p-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4"><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
        <p className="text-sm text-muted-foreground py-12 text-center">Loading...</p>
      </div>
    )
  }

  const recipients = recipientsData?.recipients ?? []
  const counts = campaign.recipientCounts
  const total = campaign.totalRecipients
  const delivered = counts.SENT
  const opened = counts.OPENED
  const failed = counts.FAILED
  const bounced = counts.BOUNCED

  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
  const deliveryRate = pct(delivered)
  const realOpenRate = pct(campaign.engagementStats.realOpened)
  const realClickRate = pct(campaign.engagementStats.realClicked)
  const openRateRaw = pct(opened)
  const clickRateRaw = pct(clicked)
  const bounceRate = pct(bounced)

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-2 -ml-2"><ArrowLeft className="h-4 w-4 mr-1.5" />Back to campaigns</Button>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{campaign.name}</h1>
            <Badge variant="outline">{campaign.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{campaign.subject}</p>
        </div>
        {campaign.status === 'PAUSED' && (
          <Button size="sm" className="bg-orange-600 hover:bg-orange-700" disabled={continuing} onClick={continueSend}>
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {continuing ? 'Resuming...' : `Continue sending (${counts.PENDING} left)`}
          </Button>
        )}
      </div>

      {campaign.status === 'SENDING' && progress && <SendingBanner progress={progress} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <RateTile label="Emails" value={total} suffix="" sub="Recipients" />
        <RateTile label="Delivery Rate" value={deliveryRate} sub={`${delivered} of ${total}`} />
        <RateTile label="Open Rate" value={realOpenRate} sub={`${campaign.engagementStats.realOpened} of ${total} - ${opened} raw (${openRateRaw}%)`} color={GREEN} />
        <RateTile label="Click Rate" value={realClickRate} sub={`${campaign.engagementStats.realClicked} of ${total} - ${clicked} raw (${clickRateRaw}%)`} color={BLUE} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Bounce Rate" value={bounceRate} suffix="%" color={bounced > 0 ? RED : undefined} />
        <StatTile label="Failed" value={failed} color={failed > 0 ? RED : undefined} />
        <StatTile label="Unsubscribed" value={counts.UNSUBSCRIBED} color="#6b7280" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Email content</CardTitle></CardHeader>
          <div className="px-6 pb-4 space-y-1 text-sm border-b">
            <div className="flex gap-2"><span className="w-16 shrink-0 text-muted-foreground">From</span><span className="truncate">{campaign.fromName ? `${campaign.fromName} <${campaign.fromEmail}>` : campaign.fromEmail}</span></div>
            <div className="flex gap-2"><span className="w-16 shrink-0 text-muted-foreground">Subject</span><span className="font-medium truncate">{campaign.subject}</span></div>
            {campaign.previewText && (
              <div className="flex gap-2"><span className="w-16 shrink-0 text-muted-foreground">Preview</span><span className="text-muted-foreground truncate">{campaign.previewText}</span></div>
            )}
          </div>
          <CardContent className="flex justify-center bg-muted/30 rounded-b-lg py-6 overflow-hidden">
            {/* Fixed 640px intrinsic width keeps the email above its own 600px mobile
                breakpoint (so hide-mobile/hide-desktop blocks render as desktop), then
                the wrapper visually scales it down to fit this column. */}
            <div style={{ width: 640 * PREVIEW_SCALE, height: 700 * PREVIEW_SCALE, overflow: 'hidden' }}>
              <iframe
                title="Sent email (desktop view)"
                srcDoc={campaign.bodyHtml}
                className="bg-white shadow-sm rounded-md border"
                style={{ width: 640, height: 700, border: 'none', transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top left' }}
                sandbox=""
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Opened & clicked over time</CardTitle></CardHeader>
            <CardContent>
              {trendData.every(d => d.opened === 0 && d.clicked === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-10">No activity in the last {TREND_WINDOW_DAYS} days</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="opened" name="Opened" stroke={GREEN} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="clicked" name="Clicked" stroke={BLUE} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Opens by hour of day</CardTitle></CardHeader>
            <CardContent>
              {hourData.every(h => h.count === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-10">No opens yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={hourData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                    <Tooltip />
                    <Bar dataKey="count" name="Opens" fill={GREEN} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <LinkPerformance
        stats={linkStats}
        totalRecipients={campaign.totalRecipients}
        view={linkView}
        onViewChange={setLinkView}
        pending={deferredLinkView !== linkView}
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Recipients ({recipientsData?.totalCount ?? 0})</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => changeSearch(e.target.value)}
                placeholder="Search by email..."
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {(['SENT', 'OPENED', 'PENDING', 'BOUNCED', 'FAILED', 'UNSUBSCRIBED'] as RecipientTab[]).map(t => {
              const count = counts[t as Exclude<RecipientTab, 'ALL'>]
              if (count === 0 && t !== tab) return null
              return (
                <button
                  key={t}
                  onClick={() => changeTab(t)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    tab === t ? 'bg-[#bdac7e] text-white border-[#bdac7e]' : 'bg-white text-muted-foreground border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {TAB_LABEL[t]} ({count})
                </button>
              )
            })}
          </div>
          {tab === 'UNSUBSCRIBED' && campaign.pendingUnsubscribeCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs border-amber-300 text-amber-800 hover:bg-amber-50"
              disabled={unsubscribingAll}
              onClick={() => unsubscribeAllByScope('clicked')}
            >
              {unsubscribingAll ? 'Unsubscribing...' : `Unsubscribe all clicked (${campaign.pendingUnsubscribeCount})`}
            </Button>
          )}
          {tab === 'BOUNCED' && counts.BOUNCED > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs border-amber-300 text-amber-800 hover:bg-amber-50"
              disabled={unsubscribingAll}
              onClick={() => unsubscribeAllByScope('bounced')}
            >
              {unsubscribingAll ? 'Unsubscribing...' : `Unsubscribe all bounced (${counts.BOUNCED})`}
            </Button>
          )}
          {tab === 'FAILED' && counts.FAILED > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs border-amber-300 text-amber-800 hover:bg-amber-50"
              disabled={unsubscribingAll}
              onClick={() => unsubscribeAllByScope('failed')}
            >
              {unsubscribingAll ? 'Unsubscribing...' : `Unsubscribe all failed (${counts.FAILED})`}
            </Button>
          )}
          </div>
        </CardHeader>
        <CardContent className="p-0 relative">
          {recipientsLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          <Table className={recipientsLoading ? 'opacity-50' : undefined}>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead>Clicked</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map(r => {
                const clickedUnsubscribeLink = r.clicks.some(c => c.url.includes(UNSUBSCRIBE_URL_MARKER))
                // Bounced/failed addresses can be suppressed too, so future
                // campaigns stop retrying a dead or invalid address - but unlike
                // a real click, that doesn't move them to the Unsubscribed tab
                // (see confirmUnsubscribe/the API route), so once suppressed
                // there's nothing left to show a live button for.
                const canUnsubscribe = r.status !== 'SKIPPED_UNSUBSCRIBED' && !suppressedIds.has(r.id)
                  && (clickedUnsubscribeLink || r.status === 'BOUNCED' || r.status === 'FAILED')
                return (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.name ?? '-'}</TableCell>
                  <TableCell className="text-sm">{r.email}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    {r.status !== 'SKIPPED_UNSUBSCRIBED' && clickedUnsubscribeLink && (
                      <Badge className="ml-1 bg-amber-100 text-amber-700 border-amber-200">Clicked unsubscribe</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.openedAt ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button type="button" className="flex items-center gap-1 text-blue-600 hover:underline">
                            <Eye className="h-3 w-3" />
                            {fmt(r.openedAt)}{r.openCount > 1 ? ` (${r.openCount}x)` : ''}
                            {r.likelyAutomated && <Bot className="h-3 w-3 text-orange-500 shrink-0"><title>Likely automated (security scanner), not a real click</title></Bot>}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-3" align="start">
                          <p className="text-xs font-medium mb-2">Dibuka ({r.opens.length}x)</p>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {r.opens.map(o => (
                              <div key={o.id} className="text-xs border-b pb-1.5 last:border-0">
                                <div className="text-muted-foreground">{fmt(o.openedAt)}{o.ipAddress ? ` - ${o.ipAddress}` : ''}</div>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.clickedAt ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button type="button" className="flex items-center gap-1 text-blue-600 hover:underline">
                            <MousePointerClick className="h-3 w-3" />
                            {fmt(r.clickedAt)}{r.clickCount > 1 ? ` (${r.clickCount}x)` : ''}
                            {r.likelyAutomated && <Bot className="h-3 w-3 text-orange-500 shrink-0"><title>Likely automated (security scanner), not a real click</title></Bot>}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-3" align="start">
                          <p className="text-xs font-medium mb-2">Link yang diklik ({r.clicks.length})</p>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {r.clicks.map(c => (
                              <div key={c.id} className="text-xs border-b pb-1.5 last:border-0">
                                <div className="text-muted-foreground">{fmt(c.clickedAt)}{c.ipAddress ? ` - ${c.ipAddress}` : ''}</div>
                                <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline wrap-break-word block">{c.url}</a>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{latestIp(r) ?? '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-65 whitespace-normal wrap-break-word">
                    {r.errorMessage && <p className="mb-1">{r.errorMessage}</p>}
                    <div className="flex flex-wrap gap-1">
                      {suppressedIds.has(r.id) && <span className="text-muted-foreground">Suppressed from future sends</span>}
                      {canUnsubscribe && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={unsubscribingIds.has(r.id)}
                          onClick={() => confirmUnsubscribe(r.id, clickedUnsubscribeLink)}
                        >
                          {unsubscribingIds.has(r.id) ? '...' : clickedUnsubscribeLink ? 'Confirm unsubscribe' : 'Unsubscribe'}
                        </Button>
                      )}
                      {isAdmin && r.status === 'FAILED' && r.sourceId && (r.sourceType === 'CUSTOMER' || r.sourceType === 'LEAD') && (
                        deletedContactIds.has(r.sourceId) ? (
                          <span className="text-red-600">{r.sourceType === 'CUSTOMER' ? 'Guest' : 'Lead'} deleted</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs border-red-300 text-red-700 hover:bg-red-50"
                            disabled={deletingContactIds.has(r.sourceId)}
                            onClick={() => deleteContact(r.sourceType as 'CUSTOMER' | 'LEAD', r.sourceId!)}
                          >
                            {deletingContactIds.has(r.sourceId) ? '...' : `Delete ${r.sourceType === 'CUSTOMER' ? 'guest' : 'lead'}`}
                          </Button>
                        )
                      )}
                      {!r.errorMessage && !canUnsubscribe && !suppressedIds.has(r.id) && !(isAdmin && r.status === 'FAILED' && r.sourceId && (r.sourceType === 'CUSTOMER' || r.sourceType === 'LEAD')) && '-'}
                    </div>
                  </TableCell>
                </TableRow>
                )
              })}
              {recipients.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">No recipients in this tab</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          {recipientsData && recipientsData.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">Page {recipientsData.page} of {recipientsData.totalPages}</p>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="h-7 px-2" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= recipientsData.totalPages} onClick={() => goToPage(page + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
