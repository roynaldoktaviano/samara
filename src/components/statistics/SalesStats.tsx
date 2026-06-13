'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar, Ship, Users, TrendingUp, TrendingDown, Minus, Briefcase, Globe, RotateCw, UserCog } from 'lucide-react'

/* ── constants ── */
const TEAL        = '#1a5f6e'
const GOLD        = '#bdac7e'
const RANK_COLORS = [GOLD, '#9ca3af', '#b45309', '#6b7280', '#6b7280']
const REFRESH_MS  = 30_000

/* ── types ── */
interface Summary { total: number; privateCharter: number; openTrip: number; direct: number; viaAgent: number }
interface TopAgent { agentId: string; name: string; period: number; total: number }
interface TopNationality { nationality: string; count: number }
interface Yacht { id: string; name: string }
interface Salesperson { id: string; name: string | null }
interface StatsData {
  current: Summary; compare: Summary
  topAgents: TopAgent[]; topNationalities: TopNationality[]
  yachts: Yacht[]; salespeople?: Salesperson[]
  periodLabel: string; compareLabel: string; updatedAt: string
}

/* ── date helpers ── */
function toISO(d: Date) { return d.toISOString().split('T')[0] }

const PRESETS = [
  { label: 'This Month',    get: () => { const n = new Date(); return { from: toISO(new Date(n.getFullYear(), n.getMonth(), 1)),           to: toISO(new Date(n.getFullYear(), n.getMonth() + 1, 0)) } } },
  { label: 'Last Month',    get: () => { const n = new Date(); return { from: toISO(new Date(n.getFullYear(), n.getMonth() - 1, 1)),        to: toISO(new Date(n.getFullYear(), n.getMonth(), 0)) } } },
  { label: 'Last 3 Months', get: () => { const n = new Date(); return { from: toISO(new Date(n.getFullYear(), n.getMonth() - 2, 1)),        to: toISO(new Date(n.getFullYear(), n.getMonth() + 1, 0)) } } },
  { label: 'This Year',     get: () => { const n = new Date(); return { from: toISO(new Date(n.getFullYear(), 0, 1)),                       to: toISO(new Date(n.getFullYear(), 11, 31)) } } },
  { label: 'Last Year',     get: () => { const n = new Date(); return { from: toISO(new Date(n.getFullYear() - 1, 0, 1)),                   to: toISO(new Date(n.getFullYear() - 1, 11, 31)) } } },
]

function pct(part: number, total: number) { return total ? Math.round((part / total) * 100) : 0 }

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

/* ── sub-components ── */
function Delta({ now, prev, label }: { now: number; prev: number; label: string }) {
  const diff = now - prev
  if (diff === 0) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" />same as {label}</span>
  const up = diff > 0
  return (
    <span className={`text-xs flex items-center gap-0.5 ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{diff} vs {label}
    </span>
  )
}

function SplitBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const p = pct(value, total)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-bold">{value} <span className="text-muted-foreground font-normal text-xs">({p}%)</span></span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${p}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

/* ── main component ── */
export default function SalesStats() {
  const { data: session } = useSession()
  const userRole = (session?.user as { role?: string })?.role ?? ''
  const isAdmin  = userRole === 'ADMIN'

  const thisMonth = PRESETS[0].get()

  const [data,            setData]            = useState<StatsData | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [refreshing,      setRefreshing]      = useState(false)
  const [yachtId,         setYachtId]         = useState('all')
  const [from,            setFrom]            = useState(thisMonth.from)
  const [to,              setTo]              = useState(thisMonth.to)
  const [activePreset,    setActivePreset]    = useState('This Month')
  const [tick,            setTick]            = useState(0)
  const [salespersonId,   setSalespersonId]   = useState('all') // admin only
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStats = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const qs = new URLSearchParams({
        from, to,
        ...(yachtId !== 'all' ? { yachtId } : {}),
        ...(isAdmin && salespersonId !== 'all' ? { salespersonId } : {}),
      })
      const res = await fetch(`/api/stats/sales?${qs}`)
      if (res.ok) setData(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false); setRefreshing(false) }
  }, [from, to, yachtId, isAdmin, salespersonId])

  useEffect(() => { fetchStats() }, [fetchStats])

  useEffect(() => {
    timerRef.current = setInterval(() => fetchStats(true), REFRESH_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchStats])

  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 10_000)
    return () => clearInterval(t)
  }, [])

  const applyPreset = (preset: typeof PRESETS[0]) => {
    const range = preset.get()
    setFrom(range.from); setTo(range.to)
    setActivePreset(preset.label)
  }

  const handleFromChange = (v: string) => { setFrom(v); setActivePreset('') }
  const handleToChange   = (v: string) => {
    if (v && from && v < from) { setTo(from); setFrom(v) }
    else setTo(v)
    setActivePreset('')
  }

  const cur = data?.current
  const cmp = data?.compare

  // Resolve the label shown under the title
  const scopeLabel = isAdmin
    ? salespersonId !== 'all'
      ? data?.salespeople?.find(s => s.id === salespersonId)?.name ?? 'Sales'
      : 'All Sales'
    : 'My Sales'

  return (
    <div className="space-y-5">

      {/* ── Header row 1: title + scope label ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-0.5">
            <h3 className="text-2xl font-bold tracking-tight">Sales Overview</h3>
            {/* Admin: salesperson filter dropdown. Sales: fixed "My Sales" badge */}
            {isAdmin ? (
              <Select value={salespersonId} onValueChange={setSalespersonId}>
                <SelectTrigger className="h-8 w-44 text-xs font-semibold border rounded-lg" style={{ borderColor: TEAL, color: salespersonId !== 'all' ? TEAL : undefined }}>
                  <UserCog className="h-3.5 w-3.5 mr-1 shrink-0" style={{ color: TEAL }} />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sales</SelectItem>
                  {data?.salespeople?.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name ?? s.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="px-3 py-1 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: TEAL }}>
                My Sales
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {loading ? 'Loading…' : (
              <>
                <span>{data?.periodLabel}</span>
                {data?.compareLabel && (
                  <span className="text-muted-foreground/50 ml-1.5">vs {data.compareLabel}</span>
                )}
                {yachtId !== 'all' && data?.yachts && (
                  <span className="ml-1.5">· {data.yachts.find(y => y.id === yachtId)?.name}</span>
                )}
                {isAdmin && salespersonId !== 'all' && (
                  <span className="ml-1.5">· {scopeLabel}</span>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => fetchStats(true)} disabled={refreshing}
            className="flex items-center gap-1.5 h-8 px-3 text-xs rounded-md border border-input bg-background hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {data?.updatedAt && !loading && (
            <span className="text-[11px] text-muted-foreground w-12">{timeAgo(data.updatedAt)}</span>
          )}
        </div>
      </div>

      {/* ── Header row 2: filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className={`h-8 px-3 rounded-md text-xs font-medium transition-colors border ${
              activePreset === p.label
                ? 'border-transparent text-white'
                : 'border-input bg-background text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            style={activePreset === p.label ? { backgroundColor: TEAL } : {}}
          >
            {p.label}
          </button>
        ))}

        <div className="w-px h-5 bg-border mx-1" />

        <input
          type="date" value={from}
          onChange={e => handleFromChange(e.target.value)}
          className="h-8 px-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground">→</span>
        <input
          type="date" value={to}
          onChange={e => handleToChange(e.target.value)}
          className="h-8 px-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />

        <div className="w-px h-5 bg-border mx-1" />

        <Select value={yachtId} onValueChange={setYachtId}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vessels</SelectItem>
            {data?.yachts.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: 'Total Bookings',  icon: <Calendar  className="h-4 w-4 text-muted-foreground" />, value: cur?.total,          prev: cmp?.total },
          { title: 'Private Charter', icon: <Ship      className="h-4 w-4 text-muted-foreground" />, value: cur?.privateCharter, prev: cmp?.privateCharter },
          { title: 'Open Trip',       icon: <Users     className="h-4 w-4 text-muted-foreground" />, value: cur?.openTrip,       prev: cmp?.openTrip },
          { title: 'Via Agent',       icon: <Briefcase className="h-4 w-4 text-muted-foreground" />, value: cur?.viaAgent,       prev: cmp?.viaAgent },
        ].map(card => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              {card.icon}
            </CardHeader>
            <CardContent>
              {loading || card.value === undefined
                ? <Skeleton className="h-7 w-20 mb-1" />
                : <div className="text-2xl font-bold">{card.value}</div>}
              {!loading && card.value !== undefined && card.prev !== undefined && (
                <Delta now={card.value} prev={card.prev} label="prev period" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Trip type & source ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Ship className="h-4 w-4" style={{ color: TEAL }} /> Trip Type
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? <><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></> : (
              <>
                <SplitBar label="Private Charter" value={cur?.privateCharter ?? 0} total={cur?.total ?? 0} color={TEAL} />
                <SplitBar label="Open Trip"       value={cur?.openTrip ?? 0}       total={cur?.total ?? 0} color={GOLD} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" style={{ color: GOLD }} /> Booking Source
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? <><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></> : (
              <>
                <SplitBar label="Direct"    value={cur?.direct   ?? 0} total={cur?.total ?? 0} color={TEAL} />
                <SplitBar label="Via Agent" value={cur?.viaAgent ?? 0} total={cur?.total ?? 0} color={GOLD} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top Agents & Nationalities ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4" style={{ color: TEAL }} /> Top Agents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}</div>
            ) : !data?.topAgents.length ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No agent bookings in this period</p>
            ) : (
              <div className="space-y-2">
                {data.topAgents.map((a, i) => (
                  <div key={a.agentId} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: RANK_COLORS[i] ?? '#9ca3af' }}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.total} bookings all-time</p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: TEAL }}>
                      {a.period} this period
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" style={{ color: GOLD }} /> Guest Nationalities
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded" />)}</div>
            ) : !data?.topNationalities.length ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No nationality data in this period</p>
            ) : (() => {
              const max = data.topNationalities[0]?.count ?? 1
              return (
                <div className="space-y-3">
                  {data.topNationalities.map((n, i) => (
                    <div key={n.nationality} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: RANK_COLORS[i] ?? '#9ca3af' }}>
                            {i + 1}
                          </span>
                          <span className="font-medium truncate">{n.nationality}</span>
                        </div>
                        <span className="font-bold shrink-0 ml-2">{n.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct(n.count, max)}%`, backgroundColor: i === 0 ? GOLD : TEAL }} />
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
