'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts'
import { DollarSign, Ship, TrendingUp, Briefcase, RotateCw, Users } from 'lucide-react'

/* ── constants ── */
const TEAL        = '#1a5f6e'
const GOLD        = '#bdac7e'
const RANK_COLORS = [GOLD, '#9ca3af', '#b45309', '#6b7280', '#6b7280']
const REFRESH_MS  = 60_000
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/* ── types ── */
interface Overview { contracted: number; collected: number; outstanding: number; bookings: number }
interface VesselRow { yachtId: string; name: string; contracted: number; collected: number; bookings: number }
interface MonthRow  { month: string; contracted: number; collected: number; bookings: number }
interface AgentRow  { agentId: string; name: string; contracted: number; collected: number; bookings: number }
interface SalesRow  { name: string; contracted: number; collected: number; bookings: number }
interface Yacht     { id: string; name: string }
interface FinanceData {
  overview: Overview; revenuePerVessel: VesselRow[]; monthlyRevenue: MonthRow[]
  topAgents: AgentRow[]; salesPerformance: SalesRow[]
  yachts: Yacht[]; periodLabel: string; updatedAt: string
}

/* ── helpers ── */
const fmtK = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}
const fmtFull = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function toISO(d: Date) { return d.toISOString().split('T')[0] }
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`
}
function fmtMonth(key: string) {
  const [y, m] = key.split('-')
  return `${MONTH_NAMES[parseInt(m) - 1]} '${y.slice(2)}`
}

const PRESETS = [
  { label: 'This Year',  get: () => { const n = new Date(); return { from: toISO(new Date(n.getFullYear(), 0, 1)), to: toISO(new Date(n.getFullYear(), 11, 31)) } } },
  { label: 'Last Year',  get: () => { const n = new Date(); return { from: toISO(new Date(n.getFullYear()-1, 0, 1)), to: toISO(new Date(n.getFullYear()-1, 11, 31)) } } },
  { label: 'This Month', get: () => { const n = new Date(); return { from: toISO(new Date(n.getFullYear(), n.getMonth(), 1)), to: toISO(new Date(n.getFullYear(), n.getMonth()+1, 0)) } } },
  { label: 'Last 6 Mo',  get: () => { const n = new Date(); return { from: toISO(new Date(n.getFullYear(), n.getMonth()-5, 1)), to: toISO(new Date(n.getFullYear(), n.getMonth()+1, 0)) } } },
]

/* ── Custom Tooltip ── */
function MoneyTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ fontWeight: 700, marginBottom: 6, color: '#374151' }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color, margin: '2px 0' }}>
          {p.name}: <strong>{fmtFull(p.value)}</strong>
        </p>
      ))}
    </div>
  )
}

/* ── collect bar ── */
function CollectBar({ contracted, collected }: { contracted: number; collected: number }) {
  const pct = contracted > 0 ? Math.min(100, (collected / contracted) * 100) : 0
  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
        <span>Collected {Math.round(pct)}%</span>
        <span>{fmtK(collected)} / {fmtK(contracted)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: TEAL }} />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   Main Component
══════════════════════════════════════════ */
export default function FinanceStats() {
  const thisYear = PRESETS[0].get()
  const [data,        setData]        = useState<FinanceData | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [yachtId,     setYachtId]     = useState('all')
  const [from,        setFrom]        = useState(thisYear.from)
  const [to,          setTo]          = useState(thisYear.to)
  const [activePreset,setActivePreset]= useState('This Year')
  const [tick,        setTick]        = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStats = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const qs = new URLSearchParams({ from, to, ...(yachtId !== 'all' ? { yachtId } : {}) })
      const res = await fetch(`/api/stats/finance?${qs}`)
      if (res.ok) setData(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false); setRefreshing(false) }
  }, [from, to, yachtId])

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => {
    timerRef.current = setInterval(() => fetchStats(true), REFRESH_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchStats])
  useEffect(() => { const t = setInterval(() => setTick(v => v + 1), 15_000); return () => clearInterval(t) }, [])

  const applyPreset = (p: typeof PRESETS[0]) => { const r = p.get(); setFrom(r.from); setTo(r.to); setActivePreset(p.label) }
  const ov = data?.overview

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Finance Overview</h3>
          <p className="text-muted-foreground text-sm">
            {loading ? 'Loading…' : data?.periodLabel}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => fetchStats(true)} disabled={refreshing}
            className="flex items-center gap-1.5 h-8 px-3 text-xs rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50">
            <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {data?.updatedAt && !loading && (
            <span className="text-[11px] text-muted-foreground w-14">{timeAgo(data.updatedAt)}</span>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => applyPreset(p)}
            className={`h-8 px-3 rounded-md text-xs font-medium transition-colors border ${activePreset === p.label ? 'border-transparent text-white' : 'border-input bg-background text-muted-foreground hover:bg-muted'}`}
            style={activePreset === p.label ? { backgroundColor: TEAL } : {}}>
            {p.label}
          </button>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        <input type="date" value={from} onChange={e => { setFrom(e.target.value); setActivePreset('') }}
          className="h-8 px-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
        <span className="text-xs text-muted-foreground">→</span>
        <input type="date" value={to} onChange={e => { setTo(e.target.value); setActivePreset('') }}
          className="h-8 px-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
        <div className="w-px h-5 bg-border mx-1" />
        <Select value={yachtId} onValueChange={setYachtId}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vessels</SelectItem>
            {data?.yachts.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* ── Overview cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: 'Contracted Revenue', icon: <DollarSign className="h-4 w-4 text-muted-foreground" />, value: ov?.contracted, sub: 'Net after discount & commission' },
          { title: 'Collected',          icon: <TrendingUp  className="h-4 w-4 text-muted-foreground" />, value: ov?.collected,  sub: 'Total payments received' },
          { title: 'Outstanding',        icon: <DollarSign  className="h-4 w-4 text-muted-foreground" />, value: ov?.outstanding, sub: 'Remaining to be collected', warn: true },
          { title: 'Total Bookings',     icon: <Ship        className="h-4 w-4 text-muted-foreground" />, value: ov?.bookings,   sub: 'Non-cancelled bookings', count: true },
        ].map(c => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{c.title}</CardTitle>
              {c.icon}
            </CardHeader>
            <CardContent>
              {loading || c.value === undefined
                ? <Skeleton className="h-7 w-28 mb-1" />
                : <div className={`text-2xl font-bold ${c.warn && (c.value as number) > 0 ? 'text-amber-600' : ''}`}>
                    {c.count ? c.value : fmtK(c.value as number)}
                  </div>}
              <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
              {!loading && !c.count && ov && ov.contracted > 0 && c.title === 'Collected' && (
                <p className="text-xs font-medium mt-0.5" style={{ color: TEAL }}>
                  {Math.round((ov.collected / ov.contracted) * 100)}% collected
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Monthly Revenue Chart ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: TEAL }} /> Monthly Revenue
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-56 w-full rounded" /> : !data?.monthlyRevenue.length ? (
            <p className="text-sm text-muted-foreground text-center py-10">No data in this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.monthlyRevenue.map(m => ({ ...m, month: fmtMonth(m.month) }))} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => fmtK(v)} tick={{ fontSize: 11 }} width={64} />
                <Tooltip content={<MoneyTip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="contracted" name="Contracted" fill={GOLD} radius={[3, 3, 0, 0]} />
                <Bar dataKey="collected"  name="Collected"  fill={TEAL} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Revenue per Vessel + Top Agents ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Revenue per vessel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Ship className="h-4 w-4" style={{ color: TEAL }} /> Revenue per Vessel
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded" />)}</div>
            ) : !data?.revenuePerVessel.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data</p>
            ) : (
              <div className="space-y-4">
                {data.revenuePerVessel.map((v, i) => (
                  <div key={v.yachtId}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundColor: RANK_COLORS[i] ?? '#9ca3af' }}>{i + 1}</span>
                        <span className="font-semibold text-sm">{v.name}</span>
                        <span className="text-xs text-muted-foreground">{v.bookings} bookings</span>
                      </div>
                      <span className="text-sm font-bold">{fmtK(v.contracted)}</span>
                    </div>
                    <CollectBar contracted={v.contracted} collected={v.collected} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top agents */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4" style={{ color: GOLD }} /> Top Agents by Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded" />)}</div>
            ) : !data?.topAgents.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No agent bookings in this period</p>
            ) : (
              <div className="space-y-3">
                {data.topAgents.map((a, i) => (
                  <div key={a.agentId} className="rounded-lg border px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundColor: RANK_COLORS[i] ?? '#9ca3af' }}>{i + 1}</span>
                        <span className="font-medium text-sm truncate">{a.name}</span>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div className="text-sm font-bold">{fmtK(a.contracted)}</div>
                        <div className="text-[10px] text-muted-foreground">{a.bookings} bookings</div>
                      </div>
                    </div>
                    <CollectBar contracted={a.contracted} collected={a.collected} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Sales Performance ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" style={{ color: TEAL }} /> Sales Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-40 w-full rounded" /> : !data?.salesPerformance.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No data</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs">Sales</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs text-right">Bookings</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs text-right">Contracted</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs text-right">Collected</th>
                    <th className="pb-2 font-medium text-muted-foreground text-xs text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.salesPerformance.map((s, i) => {
                    const outstanding = Math.max(0, s.contracted - s.collected)
                    return (
                      <tr key={s.name} className="hover:bg-muted/30">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                              style={{ backgroundColor: RANK_COLORS[i] ?? '#9ca3af' }}>{i + 1}</span>
                            <span className="font-medium">{s.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-right text-muted-foreground">{s.bookings}</td>
                        <td className="py-2.5 pr-4 text-right font-semibold">{fmtFull(s.contracted)}</td>
                        <td className="py-2.5 pr-4 text-right" style={{ color: TEAL }}>{fmtFull(s.collected)}</td>
                        <td className="py-2.5 text-right font-medium" style={{ color: outstanding > 0 ? '#d97706' : '#059669' }}>
                          {fmtFull(outstanding)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t font-bold">
                    <td className="pt-2.5 pr-4 text-xs text-muted-foreground">TOTAL</td>
                    <td className="pt-2.5 pr-4 text-right text-xs text-muted-foreground">{ov?.bookings}</td>
                    <td className="pt-2.5 pr-4 text-right">{fmtFull(ov?.contracted ?? 0)}</td>
                    <td className="pt-2.5 pr-4 text-right" style={{ color: TEAL }}>{fmtFull(ov?.collected ?? 0)}</td>
                    <td className="pt-2.5 text-right" style={{ color: (ov?.outstanding ?? 0) > 0 ? '#d97706' : '#059669' }}>
                      {fmtFull(ov?.outstanding ?? 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
