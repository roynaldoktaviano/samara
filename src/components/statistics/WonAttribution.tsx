'use client'

// "Won Attribution" statistics — where won business came from (channel / source / medium /
// campaign / landing page). Data: /api/stats/won-attribution (one row per win); everything below
// is filtered and grouped client-side.
import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Trophy, DollarSign, Radar, Target, Search, X, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type TouchKey = 'first' | 'last' | 'latest'
interface Touch { source: string | null; medium: string | null; campaign: string | null }
interface Win {
  id: string; name: string; date: string | null; amountUsd: number | null; owner: string | null; pipeline: string | null
  agent: string | null; tripType: string | null; landingPage: string | null; enquiryVia: string | null
  touches: Record<TouchKey, Touch>; groups: Record<TouchKey, string>; attributionFrom: AttributionFrom
}
type AttributionFrom = 'inquiry' | 'freshsales' | 'lead-match' | 'freshsales-match' | 'agent' | null
type Dataset = 'freshsales' | 'erp'
const FROM_LABEL: Record<Exclude<AttributionFrom, null>, string> = {
  inquiry: 'Website inquiry', freshsales: 'Freshsales contact', agent: 'Agent booking',
  'lead-match': 'Lead matched by email/phone', 'freshsales-match': 'Freshsales contact matched by email/phone',
}
type Metric = 'count' | 'revenue'

// One hue for every ranking/trend (each chart is a single series); "Not tracked" is neutral grey
// and always labelled, so it's never told apart by colour alone.
const BAR = '#1a5f6e'
const MISSING = '#c4c4c4'
const NOT_TRACKED = 'Not tracked'

const TOUCH_LABEL: Record<TouchKey, string> = { first: 'First touch', last: 'Created from', latest: 'Latest touch' }
const TOUCH_HELP: Record<TouchKey, string> = {
  first: 'Where the guest first came from (first visit ever)',
  last: 'The visit on which the enquiry / contact was created',
  latest: 'The most recent visit before winning',
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const usdShort = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

interface Dim { key: string; title: string; get: (w: Win, t: TouchKey) => string | null }
const DIMS: Dim[] = [
  { key: 'channel', title: 'Channel', get: (w, t) => w.groups[t] },
  { key: 'source', title: 'Source', get: (w, t) => w.touches[t].source?.toLowerCase() ?? null },
  { key: 'medium', title: 'Medium', get: (w, t) => w.touches[t].medium?.toLowerCase() ?? null },
  { key: 'campaign', title: 'Campaign', get: (w, t) => w.touches[t].campaign },
  { key: 'sourceMedium', title: 'Source / Medium', get: (w, t) => (w.touches[t].source || w.touches[t].medium) ? `${w.touches[t].source?.toLowerCase() ?? '(none)'} / ${w.touches[t].medium?.toLowerCase() ?? '(none)'}` : null },
  { key: 'landing', title: 'Landing page', get: w => w.landingPage },
  { key: 'tripType', title: 'Trip type', get: w => w.tripType },
  { key: 'enquiryVia', title: 'Enquiry via', get: w => w.enquiryVia },
  { key: 'agent', title: 'Agent', get: w => w.agent },
  { key: 'owner', title: 'Sales owner', get: w => w.owner },
]
const DIM_BY_KEY = new Map(DIMS.map(d => [d.key, d]))

export default function WonAttribution() {
  const [dataset, setDataset] = useState<Dataset>('freshsales')
  const [touch, setTouch] = useState<TouchKey>('first')
  const [metric, setMetric] = useState<Metric>('count')
  const [year, setYear] = useState('')
  const [pipeline, setPipeline] = useState('')
  const [hideUntracked, setHideUntracked] = useState(false)
  const [drill, setDrill] = useState<{ dim: string; value: string } | null>(null)
  const [res, setRes] = useState<{ dataset: Dataset; wins: Win[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/stats/won-attribution?dataset=${dataset}`)
      .then(r => (r.ok ? r.json() : { wins: [] }))
      .then(d => { if (!cancelled) setRes({ dataset, wins: d.wins ?? [] }) })
    return () => { cancelled = true }
  }, [dataset])
  const loading = res?.dataset !== dataset
  const all = useMemo(() => (loading ? [] : res?.wins ?? []), [loading, res])

  const years = useMemo(() => [...new Set(all.map(w => w.date?.slice(0, 4)).filter(Boolean) as string[])].sort().reverse(), [all])
  const pipelines = useMemo(() => [...new Set(all.map(w => w.pipeline).filter(Boolean) as string[])].sort(), [all])

  // Filters that apply to every chart (drill-down only narrows the table)
  const base = useMemo(() => all.filter(w =>
    (!year || w.date?.startsWith(year))
    && (!pipeline || w.pipeline === pipeline)
    && (!hideUntracked || w.groups[touch] !== NOT_TRACKED),
  ), [all, year, pipeline, hideUntracked, touch])

  const switchDataset = (d: Dataset) => { setDataset(d); setYear(''); setPipeline(''); setDrill(null) }

  const tracked = base.filter(w => w.groups[touch] !== NOT_TRACKED)
  const revenue = base.reduce((a, w) => a + (w.amountUsd ?? 0), 0)
  const topChannel = rank(tracked, DIM_BY_KEY.get('channel')!, touch, 'count')[0]

  const dims = DIMS.filter(d => dataset === 'erp' ? !['enquiryVia'].includes(d.key) : d.key !== 'agent')

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-600" /> Won Attribution</h1>
        <p className="text-sm text-muted-foreground">Which campaign, source and medium the won business came from.</p>
      </div>

      {/* Filters — one row */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={dataset} onChange={v => switchDataset(v as Dataset)} options={[['freshsales', 'Freshsales won deals'], ['erp', 'ERP bookings']]} />
        <Segmented value={touch} onChange={v => { setTouch(v as TouchKey); setDrill(null) }} options={(['first', 'last', 'latest'] as TouchKey[]).map(k => [k, TOUCH_LABEL[k]])} titles={TOUCH_HELP} />
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={year} onChange={e => setYear(e.target.value)}>
          <option value="">All years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={pipeline} onChange={e => setPipeline(e.target.value)}>
          <option value="">{dataset === 'erp' ? 'Direct + Agent' : 'All pipelines'}</option>
          {pipelines.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" checked={hideUntracked} onChange={e => setHideUntracked(e.target.checked)} className="accent-amber-600" />
          Hide not tracked
        </label>
        <div className="ml-auto"><Segmented value={metric} onChange={v => setMetric(v as Metric)} options={[['count', 'Wins'], ['revenue', 'Revenue']]} /></div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<Trophy className="h-4 w-4" />} label={dataset === 'erp' ? 'Bookings' : 'Won deals'} value={loading ? null : base.length.toLocaleString()} />
        <Kpi icon={<DollarSign className="h-4 w-4" />} label="Revenue (USD)" value={loading ? null : usd(revenue)} />
        <Kpi icon={<Radar className="h-4 w-4" />} label="With attribution" value={loading ? null : `${tracked.length.toLocaleString()} (${base.length ? Math.round((tracked.length / base.length) * 100) : 0}%)`}
          hint={dataset === 'freshsales' ? 'Most older deals predate UTM tracking' : 'Agent bookings count as Agent; other guests via their inquiry, or matched to a Lead / Freshsales contact by email or phone'} />
        <Kpi icon={<Target className="h-4 w-4" />} label="Top channel" value={loading ? null : topChannel ? `${topChannel.name} · ${topChannel.count}` : '—'} />
      </div>

      <TrendCard wins={base} loading={loading} metric={metric} byMonth={!!year} />

      <div className="grid gap-4 md:grid-cols-2">
        {dims.map(d => (
          <RankCard key={d.key} dim={d} wins={base} touch={touch} metric={metric} loading={loading}
            active={drill?.dim === d.key ? drill.value : null}
            onPick={value => setDrill(drill?.dim === d.key && drill.value === value ? null : { dim: d.key, value })} />
        ))}
      </div>

      <WinsTable wins={base} touch={touch} drill={drill} onClearDrill={() => setDrill(null)} loading={loading} dataset={dataset} year={year} />
    </div>
  )
}

function Segmented({ value, onChange, options, titles }: { value: string; onChange: (v: string) => void; options: [string, string][]; titles?: Record<string, string> }) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} title={titles?.[v]}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${value === v ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string | null; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</p>
        {value === null ? <Skeleton className="h-7 w-24" /> : <p className="text-2xl font-semibold tabular-nums">{value}</p>}
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

// ─── rankings ───────────────────────────────────────────────────────────────

interface Ranked { name: string; count: number; revenue: number }
function rank(wins: Win[], dim: Dim, touch: TouchKey, metric: Metric): Ranked[] {
  const m = new Map<string, Ranked>()
  for (const w of wins) {
    const name = dim.get(w, touch) ?? NOT_TRACKED
    const r = m.get(name) ?? { name, count: 0, revenue: 0 }
    r.count++; r.revenue += w.amountUsd ?? 0
    m.set(name, r)
  }
  return [...m.values()].sort((a, b) => (metric === 'count' ? b.count - a.count : b.revenue - a.revenue))
}

function RankTooltip({ active, payload, total }: { active?: boolean; payload?: { payload: Ranked }[]; total: number }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div className="rounded-lg border bg-background shadow-md px-3 py-2 text-xs space-y-0.5">
      <p className="font-medium mb-0.5 max-w-[260px] break-words">{r.name}</p>
      <p className="text-muted-foreground">{r.count} win{r.count === 1 ? '' : 's'} · {total ? Math.round((r.count / total) * 100) : 0}%</p>
      <p className="text-muted-foreground">{usd(r.revenue)}</p>
      <p className="text-[10px] text-muted-foreground pt-0.5">Click to list these wins</p>
    </div>
  )
}

function RankCard({ dim, wins, touch, metric, loading, active, onPick }: {
  dim: Dim; wins: Win[]; touch: TouchKey; metric: Metric; loading: boolean; active: string | null; onPick: (v: string) => void
}) {
  const all = rank(wins, dim, touch, metric)
  const top = all.slice(0, 8)
  const rest = all.length - top.length
  const longest = Math.max(6, ...top.map(d => d.name.length))
  const yWidth = Math.min(200, Math.max(90, longest * 6.2))
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{dim.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-40 w-full rounded-lg" /> : top.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-6 text-center">No data</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(top.length * 30, 60)}>
              <BarChart data={top} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barCategoryGap="25%">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={yWidth} tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: string) => (v.length > 32 ? `${v.slice(0, 31)}…` : v)} />
                <Tooltip content={<RankTooltip total={wins.length} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey={metric} radius={[0, 4, 4, 0]} maxBarSize={16} cursor="pointer"
                  onClick={(d: { payload?: Ranked }) => d.payload && onPick(d.payload.name)}
                  label={{ position: 'right', fontSize: 11, fill: '#6b7280', formatter: (v: number) => (metric === 'count' ? v : usdShort(v)) }}>
                  {top.map(r => (
                    <Cell key={r.name} fill={r.name === NOT_TRACKED ? MISSING : BAR} fillOpacity={active && active !== r.name ? 0.35 : 1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {rest > 0 && <p className="text-[11px] text-muted-foreground mt-1">+{rest} more — see the table below</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── trend ──────────────────────────────────────────────────────────────────

function TrendCard({ wins, loading, metric, byMonth }: { wins: Win[]; loading: boolean; metric: Metric; byMonth: boolean }) {
  const data = useMemo(() => {
    const m = new Map<string, Ranked>()
    for (const w of wins) {
      if (!w.date) continue
      const key = byMonth ? w.date.slice(0, 7) : w.date.slice(0, 4)
      const r = m.get(key) ?? { name: key, count: 0, revenue: 0 }
      r.count++; r.revenue += w.amountUsd ?? 0
      m.set(key, r)
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [wins, byMonth])
  const label = (k: string) => byMonth ? new Date(`${k}-01`).toLocaleDateString('en-GB', { month: 'short' }) : k
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{metric === 'count' ? 'Wins' : 'Revenue'} per {byMonth ? 'month' : 'year'}</CardTitle></CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-48 w-full rounded-lg" /> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
              <XAxis dataKey="name" tickFormatter={label} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={48} allowDecimals={false}
                tickFormatter={(v: number) => (metric === 'count' ? String(v) : usdShort(v))} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const r = payload[0].payload as Ranked
                return (
                  <div className="rounded-lg border bg-background shadow-md px-3 py-2 text-xs space-y-0.5">
                    <p className="font-medium">{byMonth ? new Date(`${r.name}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : r.name}</p>
                    <p className="text-muted-foreground">{r.count} win{r.count === 1 ? '' : 's'} · {usd(r.revenue)}</p>
                  </div>
                )
              }} />
              <Bar dataKey={metric} fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ─── table (also the accessible view of every chart) ────────────────────────

function WinsTable({ wins, touch, drill, onClearDrill, loading, dataset, year }: {
  wins: Win[]; touch: TouchKey; drill: { dim: string; value: string } | null; onClearDrill: () => void; loading: boolean; dataset: Dataset; year: string
}) {
  const [exporting, setExporting] = useState(false)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const rows = useMemo(() => {
    const dim = drill ? DIM_BY_KEY.get(drill.dim) : null
    const needle = q.trim().toLowerCase()
    return wins
      .filter(w => !dim || (dim.get(w, touch) ?? NOT_TRACKED) === drill!.value)
      .filter(w => !needle || [w.name, w.touches[touch].source, w.touches[touch].medium, w.touches[touch].campaign, w.owner, w.landingPage].some(v => v?.toLowerCase().includes(needle)))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  }, [wins, drill, q, touch])
  const pages = Math.max(1, Math.ceil(rows.length / 50))
  const cur = Math.min(page, pages)
  const shown = rows.slice((cur - 1) * 50, cur * 50)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{dataset === 'erp' ? 'Bookings' : 'Won deals'} <span className="text-muted-foreground font-normal text-sm">({rows.length.toLocaleString()})</span></CardTitle>
          <div className="flex items-center gap-2">
            {drill && (
              <button onClick={onClearDrill} className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2.5 py-1 text-xs font-medium">
                {DIM_BY_KEY.get(drill.dim)?.title}: {drill.value} <X className="h-3 w-3" />
              </button>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="Search…" className="pl-8 h-9 w-56" />
            </div>
            <Button variant="outline" size="sm" className="h-9" disabled={loading || !rows.length || exporting}
              onClick={async () => { setExporting(true); try { await exportXlsx(rows, touch, dataset, year, drill) } finally { setExporting(false) } }}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> {exporting ? 'Exporting…' : 'Export .xlsx'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Won</TableHead>
                <TableHead>{dataset === 'erp' ? 'Booking' : 'Deal'}</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Source / Medium</TableHead>
                <TableHead>Campaign</TableHead>
                {dataset === 'erp' && <TableHead>Booking source</TableHead>}
                <TableHead>Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? [...Array(6)].map((_, i) => (
                <TableRow key={i}>{[...Array(dataset === 'erp' ? 8 : 7)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
              )) : shown.length === 0 ? (
                <TableRow><TableCell colSpan={dataset === 'erp' ? 8 : 7} className="py-10 text-center text-muted-foreground">Nothing matches</TableCell></TableRow>
              ) : shown.map(w => {
                const t = w.touches[touch]
                return (
                  <TableRow key={w.id}>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{fmtDate(w.date)}</TableCell>
                    <TableCell className="text-sm max-w-[280px] truncate" title={w.name}>{w.name}</TableCell>
                    <TableCell className="text-right text-xs whitespace-nowrap tabular-nums">{w.amountUsd != null ? usd(w.amountUsd) : '—'}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      <span className={w.groups[touch] === NOT_TRACKED ? 'text-muted-foreground' : ''}>{w.groups[touch]}</span>
                      {(w.attributionFrom === 'lead-match' || w.attributionFrom === 'freshsales-match') && (
                        <p className="text-[10px] text-muted-foreground" title={FROM_LABEL[w.attributionFrom]}>matched by email/phone</p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs max-w-[220px] truncate" title={`${t.source ?? ''} / ${t.medium ?? ''}`}>{t.source || t.medium ? `${t.source ?? '—'} / ${t.medium ?? '—'}` : '—'}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={t.campaign ?? ''}>{t.campaign ?? '—'}</TableCell>
                    {dataset === 'erp' && <TableCell className="text-xs whitespace-nowrap">{w.agent ? `Agent · ${w.agent}` : w.pipeline ?? '—'}</TableCell>}
                    <TableCell className="text-xs whitespace-nowrap">{w.owner ?? '—'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between text-sm pt-3">
          <p className="text-muted-foreground text-xs">Page {cur} of {pages}</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={cur <= 1} onClick={() => setPage(cur - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={cur >= pages} onClick={() => setPage(cur + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── xlsx export ────────────────────────────────────────────────────────────

// Exports exactly what the table shows (all pages): sheet 1 = one row per win, sheet 2 = totals
// per channel / source / medium / campaign. exceljs is loaded only when the button is clicked.
async function exportXlsx(rows: Win[], touch: TouchKey, dataset: Dataset, year: string, drill: { dim: string; value: string } | null) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const header = (ws: import('exceljs').Worksheet) => {
    const r = ws.getRow(1)
    r.font = { bold: true }
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1EDE3' } }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }

  const ws = wb.addWorksheet(dataset === 'erp' ? 'Bookings' : 'Won deals')
  ws.columns = [
    { header: 'Won date', key: 'date', width: 13, style: { numFmt: 'dd mmm yyyy' } },
    { header: dataset === 'erp' ? 'Booking' : 'Deal', key: 'name', width: 48 },
    { header: 'Amount (USD)', key: 'amount', width: 14, style: { numFmt: '#,##0' } },
    { header: 'Channel', key: 'channel', width: 16 },
    { header: 'Source', key: 'source', width: 22 },
    { header: 'Medium', key: 'medium', width: 26 },
    { header: 'Campaign', key: 'campaign', width: 34 },
    { header: 'Landing page', key: 'landing', width: 40 },
    { header: 'Trip type', key: 'tripType', width: 18 },
    ...(dataset === 'erp'
      ? [{ header: 'Booking source', key: 'bookingSource', width: 12 }, { header: 'Agent', key: 'agent', width: 24 }]
      : [{ header: 'Enquiry via', key: 'enquiryVia', width: 12 }]),
    { header: 'Owner', key: 'owner', width: 20 },
    { header: 'Attribution from', key: 'from', width: 34 },
  ]
  for (const w of rows) {
    const t = w.touches[touch]
    ws.addRow({
      date: w.date ? new Date(w.date) : null,
      name: w.name,
      amount: w.amountUsd,
      channel: w.groups[touch],
      source: t.source,
      medium: t.medium,
      campaign: t.campaign,
      landing: w.landingPage,
      tripType: w.tripType,
      bookingSource: w.pipeline,
      agent: w.agent,
      enquiryVia: w.enquiryVia,
      owner: w.owner,
      from: w.attributionFrom ? FROM_LABEL[w.attributionFrom] : '',
    })
  }
  header(ws)
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } }

  const sum = wb.addWorksheet('Summary')
  sum.columns = [
    { header: 'Group', key: 'group', width: 14 },
    { header: 'Value', key: 'name', width: 44 },
    { header: 'Wins', key: 'count', width: 8 },
    { header: '% of wins', key: 'pct', width: 10, style: { numFmt: '0%' } },
    { header: 'Revenue (USD)', key: 'revenue', width: 16, style: { numFmt: '#,##0' } },
  ]
  for (const key of ['channel', 'source', 'medium', 'campaign']) {
    const dim = DIM_BY_KEY.get(key)!
    for (const r of rank(rows, dim, touch, 'count')) {
      sum.addRow({ group: dim.title, name: r.name, count: r.count, pct: rows.length ? r.count / rows.length : 0, revenue: r.revenue })
    }
    sum.addRow({})
  }
  header(sum)

  const buf = await wb.xlsx.writeBuffer()
  const parts = ['won-attribution', dataset === 'erp' ? 'erp-bookings' : 'freshsales', TOUCH_LABEL[touch].toLowerCase().replace(/\s+/g, '-'), year || 'all-years']
  if (drill) parts.push(drill.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30))
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = `${parts.join('_')}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
