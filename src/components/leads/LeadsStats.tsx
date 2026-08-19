'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { Users, Globe, Target, Clock, Flag, TrendingUp, ArrowUp, ArrowDown, X, CalendarDays } from 'lucide-react'

/* ── types ── */
interface Ranked { name: string; count: number }
interface StatsData {
  total: number
  byWebsite: Ranked[]
  bySource:  Ranked[]
  byCountry: Ranked[]
  daily:  { date: string; count: number }[]
  hourly: { hour: number; count: number }[]
  dayOfWeek: { day: number; count: number }[]
}

/* ── brand colors (match Statistics.tsx) ── */
const TEAL    = '#1a5f6e'
const GOLD    = '#bdac7e'
// "Previous period" series color — deliberately not a muted grey: a comparison line/bar
// needs to read clearly against the current-period series, not fade into the background.
const COMPARE = '#8b5cf6'
const GOOD  = '#16a34a'
const BAD   = '#dc2626'

// WITA (Central Indonesia Time, UTC+8) — no DST, so a fixed offset is safe.
const WITA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const PRESETS = [
  { value: '7',  label: '7 Days' },
  { value: '30', label: '30 Days' },
  { value: '90', label: '90 Days' },
] as const

/* ── date helpers (all in WITA calendar-date terms, "YYYY-MM-DD") ── */
const toDate = (s: string) => new Date(`${s}T00:00:00Z`)
const fmtISO = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (s: string, n: number) => fmtISO(new Date(toDate(s).getTime() + n * DAY_MS))

function presetRange(days: number) {
  const witaNow = new Date(Date.now() + WITA_OFFSET_MS)
  const to = witaNow.toISOString().slice(0, 10)
  return { from: addDays(to, -(days - 1)), to }
}

function previousRange(from: string, to: string) {
  const lengthDays = Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS) + 1
  const prevTo = addDays(from, -1)
  return { from: addDays(prevTo, -(lengthDays - 1)), to: prevTo }
}

// withYear is only meant for the compare charts, where "this period" and "previous
// period" can straddle a year boundary (e.g. comparing early Jan against late Dec) —
// otherwise the year is left off since it's implied by context (today's date).
const fmtDate = (d: string, withYear = false) => {
  const [y, m, day] = d.split('-')
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return withYear ? `${day} ${MONTHS[parseInt(m) - 1]} '${y.slice(2)}` : `${day} ${MONTHS[parseInt(m) - 1]}`
}
const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`
// `day` is JS's Date.getUTCDay() convention (0=Sun..6=Sat) — the API returns it in that
// same numbering, this just maps it to a short label for the axis/tooltip.
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const fmtDow = (d: number) => DOW_LABELS[d] ?? String(d)

/* ── delta badge ── */
function DeltaBadge({ cur, prev }: { cur: number; prev: number }) {
  if (cur === prev) return <span className="text-[11px] text-muted-foreground">same as previous period</span>
  const up = cur > prev
  const pct = prev === 0 ? 100 : Math.round((Math.abs(cur - prev) / prev) * 100)
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium" style={{ color: up ? GOOD : BAD }}>
      <Icon className="h-3 w-3" /> {pct}%<span className="text-muted-foreground font-normal ml-0.5">vs previous period</span>
    </span>
  )
}

/* ── tooltips ── */
const SeriesTooltip = ({ active, payload, label, formatLabel }: {
  active?: boolean; payload?: { value: number; name: string; color: string; dataKey: string }[]; label?: string | number
  formatLabel?: (l: string | number) => string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background shadow-md px-3 py-2 text-xs space-y-1">
      <p className="font-medium mb-0.5">{formatLabel && label !== undefined ? formatLabel(label) : label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{p.value} lead{p.value === 1 ? '' : 's'}</span>
        </div>
      ))}
    </div>
  )
}

const RankTooltip = ({ active, payload, compareMap }: {
  active?: boolean; payload?: { payload: Ranked }[]; compareMap?: Map<string, number>
}) => {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const prev = compareMap?.get(row.name) ?? 0
  return (
    <div className="rounded-lg border bg-background shadow-md px-3 py-2 text-xs space-y-0.5">
      <p className="font-medium mb-0.5">{row.name}</p>
      <p className="text-muted-foreground">{row.count} lead{row.count === 1 ? '' : 's'} <span className="text-foreground/70">(this period)</span></p>
      {compareMap && <p className="text-muted-foreground">{prev} lead{prev === 1 ? '' : 's'} <span className="text-foreground/70">(previous)</span></p>}
    </div>
  )
}

/* ── Horizontal ranking bar card ── */
function RankCard({ title, icon, data, compareData, color, loading, emptyLabel }: {
  title: string; icon: React.ReactNode; data: Ranked[]; compareData?: Ranked[]
  color: string; loading: boolean; emptyLabel: string
}) {
  const top = data.slice(0, 8)
  const height = Math.max(top.length * 32, 60)
  const compareMap = compareData ? new Map(compareData.map(r => [r.name, r.count])) : undefined
  // A fixed YAxis width clips long labels (domains like "samaraliveaboard.com") from the
  // start, since category ticks are right-anchored against the axis — Recharts doesn't
  // wrap or ellipsize on its own. Size it to the longest visible label instead, capped so
  // one long outlier doesn't eat the whole card.
  const longestLabel = Math.max(6, ...top.map(d => d.name.length))
  const yAxisWidth = Math.min(190, Math.max(90, longestLabel * 6.2))
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : top.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-6 text-center">{emptyLabel}</p>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={top} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap="25%">
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={yAxisWidth} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<RankTooltip compareMap={compareMap} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

/* ── Component ── */
export default function LeadsStats() {
  const [preset, setPreset] = useState<typeof PRESETS[number]['value']>('30')
  const [useCustom, setUseCustom] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [compare, setCompare] = useState(false)
  const [country, setCountry] = useState('')
  const [countryOptions, setCountryOptions] = useState<string[]>([])

  const [data, setData] = useState<StatsData | null>(null)
  const [prevData, setPrevData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  const presetR = presetRange(Number(preset))
  const activeFrom = useCustom && customFrom ? customFrom : presetR.from
  const activeTo   = useCustom && customTo   ? customTo   : presetR.to
  const prevR = previousRange(activeFrom, activeTo)

  useEffect(() => {
    fetch('/api/leads/countries').then(r => r.ok ? r.json() : []).then(setCountryOptions).catch(() => {})
  }, [])

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const countryQs = country ? `&country=${encodeURIComponent(country)}` : ''
      const curReq  = fetch(`/api/leads/stats?from=${activeFrom}&to=${activeTo}${countryQs}`).then(r => r.ok ? r.json() : null)
      const prevReq = compare ? fetch(`/api/leads/stats?from=${prevR.from}&to=${prevR.to}${countryQs}`).then(r => r.ok ? r.json() : null) : Promise.resolve(null)
      const [cur, prev] = await Promise.all([curReq, prevReq])
      setData(cur)
      setPrevData(prev)
    } finally {
      setLoading(false)
    }
  }, [activeFrom, activeTo, compare, country])

  useEffect(() => { fetchStats() }, [fetchStats])

  const clearCustom = () => { setUseCustom(false); setCustomFrom(''); setCustomTo('') }

  const topWebsite = data?.byWebsite[0]
  const topSource  = data?.bySource[0]
  const topCountry = data?.byCountry[0]
  const peakHour   = data?.hourly.reduce((mx, h) => h.count > mx.count ? h : mx, { hour: 0, count: 0 })
  const peakDay    = data?.dayOfWeek.reduce((mx, d) => d.count > mx.count ? d : mx, { day: 0, count: 0 })
  const showCompare = compare && !!prevData

  const summaryCards = [
    {
      title: 'Total Leads',
      value: data ? String(data.total) : null,
      sub: showCompare ? <DeltaBadge cur={data!.total} prev={prevData!.total} /> : `${activeFrom} — ${activeTo}`,
      icon: <Users className="h-4 w-4 text-muted-foreground" />,
    },
    { title: 'Top Website', value: topWebsite?.name ?? '—', sub: topWebsite ? `${topWebsite.count} lead(s)` : 'no data', icon: <Globe className="h-4 w-4 text-muted-foreground" /> },
    { title: 'Top Source',  value: topSource?.name  ?? '—', sub: topSource  ? `${topSource.count} lead(s)`  : 'no data', icon: <Target className="h-4 w-4 text-muted-foreground" /> },
    { title: 'Peak Hour (WITA)', value: peakHour && peakHour.count > 0 ? fmtHour(peakHour.hour) : '—', sub: peakHour && peakHour.count > 0 ? `${peakHour.count} lead(s)` : 'no data', icon: <Clock className="h-4 w-4 text-muted-foreground" /> },
    { title: 'Peak Day (WITA)', value: peakDay && peakDay.count > 0 ? fmtDow(peakDay.day) : '—', sub: peakDay && peakDay.count > 0 ? `${peakDay.count} lead(s)` : 'no data', icon: <CalendarDays className="h-4 w-4 text-muted-foreground" /> },
    { title: 'Top Country', value: topCountry?.name ?? '—', sub: topCountry ? `${topCountry.count} lead(s)` : 'no data', icon: <Flag className="h-4 w-4 text-muted-foreground" /> },
  ]

  // Aligned by day-offset (not calendar date) so two equal-length windows overlay — idx
  // drives the actual chart layout, but each point still carries its real calendar date
  // (both this period's and, for comparison, the corresponding previous-period date) so
  // the axis/tooltip can show real dates instead of a meaningless "Day N".
  const dailyChart = (data?.daily ?? []).map((d, i) => ({
    idx: i + 1,
    date: d.date,
    prevDate: prevData?.daily[i]?.date,
    current: d.count,
    previous: prevData?.daily[i]?.count ?? 0,
  }))
  const spansMultipleYears = new Set([
    ...(data?.daily ?? []).map(d => d.date.slice(0, 4)),
    ...(prevData?.daily ?? []).map(d => d.date.slice(0, 4)),
  ]).size > 1
  const hourlyChart = (data?.hourly ?? []).map((h, i) => ({
    hour: h.hour,
    current: h.count,
    previous: prevData?.hourly[i]?.count ?? 0,
  }))
  const dayOfWeekChart = (data?.dayOfWeek ?? []).map((d, i) => ({
    day: d.day,
    current: d.count,
    previous: prevData?.dayOfWeek[i]?.count ?? 0,
  }))

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h3 className="text-2xl font-bold tracking-tight">Leads Statistics</h3>
        <p className="text-muted-foreground text-sm">Website, source, timing & country breakdown</p>
      </div>

      {/* ── Controls ── */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1 rounded-lg border p-1">
            {PRESETS.map(r => (
              <button
                key={r.value}
                onClick={() => { setPreset(r.value); setUseCustom(false) }}
                className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
                style={!useCustom && preset === r.value ? { backgroundColor: GOLD, color: 'white' } : { color: '#6b7280' }}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={e => { setUseCustom(true); setCustomFrom(e.target.value) }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={e => { setUseCustom(true); setCustomTo(e.target.value) }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {useCustom && (
              <button onClick={clearCustom} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Flag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <select
              value={country}
              onChange={e => setCountry(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring max-w-40"
            >
              <option value="">All countries</option>
              {countryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {country && (
              <button onClick={() => setCountry('')} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Switch id="compare-toggle" checked={compare} onCheckedChange={setCompare} />
            <Label htmlFor="compare-toggle" className="text-sm cursor-pointer">
              Compare to previous period
            </Label>
          </div>
        </CardContent>
        {compare && (
          <CardContent className="pt-0 -mt-2">
            <p className="text-xs text-muted-foreground">
              This period: <span className="font-medium text-foreground">{fmtDate(activeFrom)} – {fmtDate(activeTo)}</span>
              {' · '}Compared to: <span className="font-medium text-foreground">{fmtDate(prevR.from)} – {fmtDate(prevR.to)}</span>
            </p>
          </CardContent>
        )}
      </Card>

      {/* ── Summary cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {summaryCards.map(card => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              {card.icon}
            </CardHeader>
            <CardContent>
              {card.value === null
                ? <Skeleton className="h-7 w-24 mb-1" />
                : <div className="text-xl font-bold truncate" title={card.value}>{card.value}</div>}
              {typeof card.sub === 'string' ? <p className="text-xs text-muted-foreground">{card.sub}</p> : card.sub}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Daily trend ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: TEAL }} />
            Leads per Day
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-52 w-full rounded-lg" />
          ) : !data || data.daily.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-10 text-center">No leads in this range</p>
          ) : showCompare ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyChart} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="date" tickFormatter={v => fmtDate(String(v), spansMultipleYears)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={20} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<SeriesTooltip formatLabel={l => fmtDate(String(l), spansMultipleYears)} />} />
                <Legend iconType="line" iconSize={12} wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="current"  name="This period"     stroke={TEAL}  strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="previous" name="Previous period" stroke={COMPARE} strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.daily} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="leadsDailyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={TEAL} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="date" tickFormatter={v => fmtDate(String(v))} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<SeriesTooltip formatLabel={l => fmtDate(String(l))} />} />
                <Area type="monotone" dataKey="count" name="Leads" stroke={TEAL} strokeWidth={2} fill="url(#leadsDailyFill)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Hourly / day-of-week distribution ── */}
      <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" style={{ color: GOLD }} />
            Leads by Hour of Day <span className="text-xs font-normal text-muted-foreground">(WITA)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-52 w-full rounded-lg" />
          ) : showCompare ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hourlyChart} barCategoryGap="20%" margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="hour" tickFormatter={fmtHour} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<SeriesTooltip formatLabel={l => fmtHour(Number(l))} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="current"  name="This period"     fill={GOLD}  radius={[4, 4, 0, 0]} maxBarSize={14} />
                <Bar dataKey="previous" name="Previous period" fill={COMPARE} radius={[4, 4, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.hourly ?? []} barCategoryGap="20%" margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="hour" tickFormatter={fmtHour} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<SeriesTooltip formatLabel={l => fmtHour(Number(l))} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="count" name="Leads" fill={GOLD} radius={[4, 4, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" style={{ color: TEAL }} />
            Leads by Day of Week <span className="text-xs font-normal text-muted-foreground">(WITA)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-52 w-full rounded-lg" />
          ) : showCompare ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dayOfWeekChart} barCategoryGap="20%" margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="day" tickFormatter={v => fmtDow(Number(v))} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<SeriesTooltip formatLabel={l => fmtDow(Number(l))} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="current"  name="This period"     fill={TEAL}    radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="previous" name="Previous period" fill={COMPARE} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.dayOfWeek ?? []} barCategoryGap="20%" margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="day" tickFormatter={v => fmtDow(Number(v))} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<SeriesTooltip formatLabel={l => fmtDow(Number(l))} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="count" name="Leads" fill={TEAL} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      </div>

      {/* ── Website / Source / Country rankings ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <RankCard title="By Website" icon={<Globe className="h-4 w-4" style={{ color: TEAL }} />} data={data?.byWebsite ?? []} compareData={showCompare ? prevData?.byWebsite : undefined} color={TEAL} loading={loading} emptyLabel="No website data yet" />
        <RankCard title="By Source" icon={<Target className="h-4 w-4" style={{ color: GOLD }} />} data={data?.bySource ?? []} compareData={showCompare ? prevData?.bySource : undefined} color={GOLD} loading={loading} emptyLabel="No traffic source data yet" />
        <RankCard title="By Country" icon={<Flag className="h-4 w-4" style={{ color: TEAL }} />} data={data?.byCountry ?? []} compareData={showCompare ? prevData?.byCountry : undefined} color={TEAL} loading={loading} emptyLabel="No nationality data yet" />
      </div>
    </div>
  )
}
