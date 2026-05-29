'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, Ship, Users, TrendingUp, TrendingDown, Minus, Briefcase, Globe } from 'lucide-react'

/* ── types ── */
interface MonthSummary {
  total: number
  privateCharter: number
  openTrip: number
  direct: number
  viaAgent: number
}
interface TopAgent {
  agentId: string
  name: string
  total: number
  thisMonth: number
}
interface TopNationality {
  nationality: string
  count: number
}
interface SalesStatsData {
  thisMonth: MonthSummary
  lastMonth: MonthSummary
  topAgents: TopAgent[]
  topNationalities: TopNationality[]
  monthLabel: string
}

/* ── helpers ── */
const TEAL = '#1a5f6e'
const GOLD = '#bdac7e'
const RANK_COLORS = [GOLD, '#9ca3af', '#b45309', '#6b7280', '#6b7280']

function pct(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

function Delta({ now, prev }: { now: number; prev: number }) {
  const diff = now - prev
  if (diff === 0) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" />same as last month</span>
  const up = diff > 0
  return (
    <span className={`text-xs flex items-center gap-0.5 ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{diff} vs last month
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

/* ── Component ── */
export default function SalesStats() {
  const [data,    setData]    = useState<SalesStatsData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stats/sales')
      if (res.ok) setData(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  const tm = data?.thisMonth
  const lm = data?.lastMonth

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h3 className="text-2xl font-bold tracking-tight">Sales Overview</h3>
        <p className="text-muted-foreground text-sm">
          {loading ? 'Loading…' : `Booking performance for ${data?.monthLabel}`}
        </p>
      </div>

      {/* ── This month summary cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: 'Total Bookings',
            icon: <Calendar className="h-4 w-4 text-muted-foreground" />,
            value: tm?.total,
            prev:  lm?.total,
          },
          {
            title: 'Private Charter',
            icon: <Ship className="h-4 w-4 text-muted-foreground" />,
            value: tm?.privateCharter,
            prev:  lm?.privateCharter,
          },
          {
            title: 'Open Trip',
            icon: <Users className="h-4 w-4 text-muted-foreground" />,
            value: tm?.openTrip,
            prev:  lm?.openTrip,
          },
          {
            title: 'Via Agent',
            icon: <Briefcase className="h-4 w-4 text-muted-foreground" />,
            value: tm?.viaAgent,
            prev:  lm?.viaAgent,
          },
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
                <Delta now={card.value} prev={card.prev} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Trip type & source split ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Ship className="h-4 w-4" style={{ color: TEAL }} />
              Trip Type — This Month
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full rounded" />
                <Skeleton className="h-8 w-full rounded" />
              </div>
            ) : (
              <>
                <SplitBar label="Private Charter" value={tm?.privateCharter ?? 0} total={tm?.total ?? 0} color={TEAL} />
                <SplitBar label="Open Trip"       value={tm?.openTrip ?? 0}       total={tm?.total ?? 0} color={GOLD} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" style={{ color: GOLD }} />
              Booking Source — This Month
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full rounded" />
                <Skeleton className="h-8 w-full rounded" />
              </div>
            ) : (
              <>
                <SplitBar label="Direct"    value={tm?.direct   ?? 0} total={tm?.total ?? 0} color={TEAL} />
                <SplitBar label="Via Agent" value={tm?.viaAgent ?? 0} total={tm?.total ?? 0} color={GOLD} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top Agents & Top Nationalities ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Top Agents */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4" style={{ color: TEAL }} />
              Top Agents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}
              </div>
            ) : !data?.topAgents.length ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No agent bookings yet</p>
            ) : (
              <div className="space-y-2">
                {data.topAgents.map((a, i) => (
                  <div key={a.agentId} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: RANK_COLORS[i] ?? '#9ca3af' }}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.total} bookings total</p>
                    </div>
                    {a.thisMonth > 0 && (
                      <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: TEAL }}>
                        +{a.thisMonth} this month
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Nationalities */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" style={{ color: GOLD }} />
              Guest Nationalities
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded" />)}
              </div>
            ) : !data?.topNationalities.length ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No nationality data yet</p>
            ) : (() => {
              const max = data.topNationalities[0]?.count ?? 1
              return (
                <div className="space-y-3">
                  {data.topNationalities.map((n, i) => (
                    <div key={n.nationality} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: RANK_COLORS[i] ?? '#9ca3af' }}
                          >
                            {i + 1}
                          </span>
                          <span className="font-medium truncate">{n.nationality}</span>
                        </div>
                        <span className="font-bold shrink-0 ml-2">{n.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct(n.count, max)}%`, backgroundColor: i === 0 ? GOLD : TEAL }}
                        />
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
