'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Eye, MousePointerClick, UserX, Loader2, Play, ChevronLeft, ChevronRight, Search, Bot } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const GREEN = '#16a34a'
const BLUE = '#2563eb'
const AMBER = '#eda100'
const RED = '#dc2626'
const TZ = 'Asia/Jakarta'
const PREVIEW_SCALE = 0.72

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

interface UnsubscribedEntry {
  id: string
  name: string | null
  email: string
  unsubscribedAt: string | null
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
  recipients: Recipient[]
  recipientCounts: RecipientCounts
  engagementStats: { realOpened: number; realClicked: number }
  chartRows: ChartRow[]
  unsubscribedList: UnsubscribedEntry[]
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

const fmt = (d: string | null) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '—'
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

// Unique clickers per URL (not raw click count — someone clicking the same
// link twice shouldn't outweigh two different people clicking it once).
// Excludes the unsubscribe link — Resend's click tracking wraps every <a> in
// the email including it, but it already has its own "Unsubscribed" stat tile
// above and doesn't belong in content link performance.
function computeLinkStats(recipients: ChartRow[]): LinkStat[] {
  const byUrl = new Map<string, Set<string>>()
  for (const r of recipients) {
    for (const c of r.clicks) {
      if (c.url.includes('/unsubscribe?token=')) continue
      if (!byUrl.has(c.url)) byUrl.set(c.url, new Set())
      byUrl.get(c.url)!.add(r.id)
    }
  }
  return Array.from(byUrl.entries())
    .map(([url, ids]) => ({ url, clickers: ids.size }))
    .sort((a, b) => b.clickers - a.clickers)
}

function LinkPerformance({ stats, totalRecipients }: { stats: LinkStat[]; totalRecipients: number }) {
  if (stats.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Link performance</CardTitle></CardHeader>
      <CardContent className="space-y-3">
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

// Per-day Sent/Opened/Clicked series for the trend chart — Sent will usually land on
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
  const keys = new Set([...sent.keys(), ...opened.keys(), ...clicked.keys()])
  return Array.from(keys).sort((a, b) => a.localeCompare(b)).map(key => ({
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
// retry backoff) — used as the fallback pace estimate before enough real samples
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
            Sending campaign… {progress.done} of {progress.total} ({pct}%)
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
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState<SendProgress | null>(null)
  const [tab, setTab] = useState<RecipientTab>('SENT')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [continuing, setContinuing] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ status: tab, page: String(page), limit: '50' })
      if (debouncedSearch) qs.set('search', debouncedSearch)
      const res = await fetch(`/api/marketing/campaigns/${campaignId}?${qs}`)
      if (res.ok) setCampaign(await res.json())
    } finally {
      setLoading(false)
    }
  }, [campaignId, tab, page, debouncedSearch])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  const changeTab = (next: RecipientTab) => { setTab(next); setPage(1) }
  const changeSearch = (v: string) => { setSearch(v); setPage(1) }

  const continueSend = async () => {
    setContinuing(true)
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (res.ok) fetchDetail()
    } finally {
      setContinuing(false)
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
      if (data.status !== 'SENDING') fetchDetail()
    }
    poll()
    const interval = setInterval(poll, 2500)
    return () => { cancelled = true; clearInterval(interval) }
  }, [campaign?.status, campaignId, fetchDetail])

  if (loading || !campaign) {
    return (
      <div className="p-4 md:p-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4"><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
        <p className="text-sm text-muted-foreground py-12 text-center">Loading...</p>
      </div>
    )
  }

  const recipients = campaign.recipients
  const counts = campaign.recipientCounts
  const total = campaign.totalRecipients
  const delivered = counts.SENT
  const opened = counts.OPENED
  const clicked = campaign.chartRows.filter(r => r.clicks.length > 0).length
  const failed = counts.FAILED
  const bounced = counts.BOUNCED
  const unsubscribed = campaign.unsubscribedList
  const linkStats = computeLinkStats(campaign.chartRows)
  const trendData = dailyTrend(campaign.chartRows)
  const hourData = opensByHour(campaign.chartRows)

  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
  const deliveryRate = pct(delivered)
  const openRate = pct(opened)
  const clickRate = pct(clicked)
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
        <RateTile label="Open Rate" value={openRate} sub={`${opened} of ${total} · ~${campaign.engagementStats.realOpened} real`} color={GREEN} />
        <RateTile label="Click Rate" value={clickRate} sub={`${clicked} of ${total} · ~${campaign.engagementStats.realClicked} real`} color={BLUE} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Bounce Rate" value={bounceRate} suffix="%" color={bounced > 0 ? RED : undefined} />
        <StatTile label="Failed" value={failed} color={failed > 0 ? RED : undefined} />
        <StatTile label="Unsubscribed" value={unsubscribed.length} color="#6b7280" />
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
            <CardHeader className="pb-3"><CardTitle className="text-base">Sent, opened & clicked over time</CardTitle></CardHeader>
            <CardContent>
              {trendData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No activity yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="sent" name="Sent" stroke={AMBER} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} />
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

      <LinkPerformance stats={linkStats} totalRecipients={campaign.totalRecipients} />

      {unsubscribed.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><UserX className="h-4 w-4 text-gray-500" />Unsubscribed ({unsubscribed.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unsubscribed.map(r => (
              <div key={r.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
                <div>
                  <span className="font-medium">{r.name ?? r.email}</span>
                  {r.name && <span className="text-muted-foreground ml-1.5">{r.email}</span>}
                </div>
                <span className="text-xs text-muted-foreground">{fmt(r.unsubscribedAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Recipients ({campaign.totalCount})</CardTitle>
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
          <div className="flex flex-wrap gap-1.5 pt-1">
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
        </CardHeader>
        <CardContent className="p-0">
          <Table>
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
              {recipients.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.name ?? '—'}</TableCell>
                  <TableCell className="text-sm">{r.email}</TableCell>
                  <TableCell><Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge></TableCell>
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
                                <div className="text-muted-foreground">{fmt(o.openedAt)}{o.ipAddress ? ` · ${o.ipAddress}` : ''}</div>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : '—'}
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
                                <div className="text-muted-foreground">{fmt(c.clickedAt)}{c.ipAddress ? ` · ${c.ipAddress}` : ''}</div>
                                <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline wrap-break-word block">{c.url}</a>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{latestIp(r) ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-65 whitespace-normal wrap-break-word">{r.errorMessage ?? '—'}</TableCell>
                </TableRow>
              ))}
              {recipients.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">No recipients in this tab</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          {campaign.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">Page {campaign.page} of {campaign.totalPages}</p>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= campaign.totalPages} onClick={() => setPage(p => p + 1)}>
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
