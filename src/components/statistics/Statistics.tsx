'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts'
import { TrendingUp, Users, Ship, DollarSign, Calendar, Medal } from 'lucide-react'

/* ── types ── */
interface TopSale {
  name: string
  count: number
  revenue: number
}
interface TopYacht {
  yachtId: string
  name: string
  count: number
  revenue: number
}
interface MonthStat {
  month: string
  private: number
  open: number
  total: number
  revenue: number
}
interface StatsData {
  topSales:     TopSale[]
  topYachts:    TopYacht[]
  monthlyStats: MonthStat[]
  revenue:      { total: number; monthly: number }
  bookings:     { total: number; confirmed: number; pending: number; completed: number }
  customers:    { total: number }
}

/* ── helpers ── */
const GOLD = '#bdac7e'
const TEAL = '#1a5f6e'

const fmtMoney = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmtMonth = (key: string) => {
  const [y, m] = key.split('-')
  return `${MONTH_NAMES[parseInt(m) - 1]} '${y.slice(2)}`
}

const RANK_COLORS = [GOLD, '#9ca3af', '#b45309', '#6b7280', '#6b7280']

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 4 }, (_, i) => CURRENT_YEAR - i)

/* ── Custom tooltip ── */
const MoneyTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background shadow-md px-3 py-2 text-xs space-y-1">
      <p className="font-semibold text-sm mb-1">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground capitalize">{p.name}:</span>
          <span className="font-medium">{p.name === 'revenue' ? fmtMoney(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

type ChartFilter = 'all' | 'private' | 'open'

/* ── Component ── */
export default function Statistics() {
  const [data,        setData]        = useState<StatsData | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [year,        setYear]        = useState(CURRENT_YEAR)
  const [chartFilter, setChartFilter] = useState<ChartFilter>('all')

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stats')
      if (res.ok) setData(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  /* filter monthly data by selected year */
  const monthlyFiltered = (data?.monthlyStats ?? [])
    .filter(m => m.month.startsWith(String(year)))

  /* fill missing months with zeroes so chart is complete */
  const monthlyChart = Array.from({ length: 12 }, (_, i) => {
    const key  = `${year}-${String(i + 1).padStart(2, '0')}`
    const found = monthlyFiltered.find(m => m.month === key)
    return {
      month:   MONTH_NAMES[i],
      private: found?.private ?? 0,
      open:    found?.open    ?? 0,
      revenue: found?.revenue ?? 0,
    }
  })

  const yearRevenue  = monthlyFiltered.reduce((s, m) => s + m.revenue, 0)
  const yearBookings = monthlyFiltered.reduce((s, m) => s + m.total,   0)
  const peakMonth    = [...monthlyFiltered].sort((a, b) => b.total - a.total)[0]

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Statistics</h3>
          <p className="text-muted-foreground text-sm">Booking performance & revenue summary</p>
        </div>
        {/* Year selector */}
        <div className="flex items-center gap-1 rounded-lg border p-1">
          {YEARS.map(y => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
              style={year === y ? { backgroundColor: GOLD, color: 'white' } : { color: '#6b7280' }}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: 'Total Booking',
            value: loading ? null : String(yearBookings),
            sub:   `in ${year}`,
            icon:  <Calendar className="h-4 w-4 text-muted-foreground" />,
          },
          {
            title: 'Revenue',
            value: loading ? null : fmtMoney(yearRevenue),
            sub:   `in ${year}`,
            icon:  <DollarSign className="h-4 w-4 text-muted-foreground" />,
          },
          {
            title: 'Peak Month',
            value: loading ? null : (peakMonth ? fmtMonth(peakMonth.month) : '—'),
            sub:   peakMonth ? `${peakMonth.total} bookings` : 'no data yet',
            icon:  <TrendingUp className="h-4 w-4 text-muted-foreground" />,
          },
          {
            title: 'Total Guests',
            value: loading ? null : String(data?.customers.total ?? 0),
            sub:   'all time',
            icon:  <Users className="h-4 w-4 text-muted-foreground" />,
          },
        ].map(card => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              {card.icon}
            </CardHeader>
            <CardContent>
              {card.value === null
                ? <Skeleton className="h-7 w-24 mb-1" />
                : <div className="text-2xl font-bold">{card.value}</div>}
              <p className="text-xs text-muted-foreground">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Monthly bookings chart ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" style={{ color: GOLD }} />
              Bookings per Month — {year}
            </CardTitle>
            {/* Filter toggle */}
            <div className="flex items-center gap-1 rounded-lg border p-1">
              {([['all', 'All'], ['private', 'Private Charter'], ['open', 'Open Trip']] as [ChartFilter, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setChartFilter(val)}
                  className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                  style={chartFilter === val
                    ? { backgroundColor: val === 'open' ? GOLD : val === 'private' ? TEAL : '#1e293b', color: 'white' }
                    : { color: '#6b7280' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-52 w-full rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChart} barCategoryGap="35%" barGap={4} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<MoneyTooltip />} />
                <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                {(chartFilter === 'all' || chartFilter === 'private') && (
                  <Bar dataKey="private" name="Private Charter" fill={TEAL} radius={[4, 4, 0, 0]} maxBarSize={28} />
                )}
                {(chartFilter === 'all' || chartFilter === 'open') && (
                  <Bar dataKey="open" name="Open Trip" fill={GOLD} radius={[4, 4, 0, 0]} maxBarSize={28} />
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Revenue per month ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" style={{ color: TEAL }} />
            Revenue per Month — {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyChart} barSize={18} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                />
                <Tooltip content={<MoneyTooltip />} />
                <Bar dataKey="revenue" name="revenue" fill={TEAL} radius={[4, 4, 0, 0]}>
                  {monthlyChart.map((_, i) => (
                    <Cell key={i} fill={i === monthlyChart.reduce((mx, c, ci) => c.revenue > monthlyChart[mx].revenue ? ci : mx, 0) ? GOLD : TEAL} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Bottom row: top sales + top yachts ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Top Sales */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Medal className="h-4 w-4" style={{ color: GOLD }} />
              Top Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
              </div>
            ) : !data?.topSales.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No sales data yet</p>
            ) : (
              <div className="space-y-2">
                {data.topSales.map((s, i) => (
                  <div key={s.name} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: RANK_COLORS[i] ?? '#9ca3af' }}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{fmtMoney(s.revenue)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-semibold">{s.count}</span>
                      <span className="text-xs text-muted-foreground ml-1">bookings</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Yachts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Ship className="h-4 w-4" style={{ color: TEAL }} />
              Most Popular Yachts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
              </div>
            ) : !data?.topYachts.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No yacht data yet</p>
            ) : (
              <div className="space-y-2">
                {data.topYachts.map((y, i) => (
                  <div key={y.yachtId} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: RANK_COLORS[i] ?? '#9ca3af' }}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{y.name}</p>
                      <p className="text-xs text-muted-foreground">{fmtMoney(y.revenue)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-semibold">{y.count}</span>
                      <span className="text-xs text-muted-foreground ml-1">bookings</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
