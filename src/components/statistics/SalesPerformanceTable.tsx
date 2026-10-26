'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts'
import { RotateCw, Download } from 'lucide-react'
import { formatMoney, formatMoneyCompact } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'

/* ── types ── */
interface MonthRow { month: string; bySales: Record<string, number>; total: number }
interface SPData {
  year: number; salespeople: string[]
  months: MonthRow[]; yearTotals: Record<string, number>; grandTotal: number
  monthlyChart: Record<string, any>[]
}

const COLOR_PALETTE = ['#f97316','#3b82f6','#22c55e','#ec4899','#8b5cf6','#06b6d4','#eab308','#ef4444']
const salesColor = (i: number) => COLOR_PALETTE[i % COLOR_PALETTE.length]
const TEAL = 'var(--brand)'

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i + 1)

function fmtUSD(n: number) {
  if (n === 0) return <span className="text-muted-foreground/70">—</span>
  return <>{formatMoney(n, { currency: 'USD' })}</>
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover border border-border rounded-lg shadow-md px-3 py-2.5 text-xs min-w-[140px]">
      <p className="font-bold text-muted-foreground mb-1.5 border-b pb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
          </span>
          <strong style={{ color: p.color }}>
            {formatMoney(p.value, { currency: 'USD', decimals: 0 })}
          </strong>
        </div>
      ))}
    </div>
  )
}

export default function SalesPerformanceTable() {
  const [data,       setData]       = useState<SPData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [year,       setYear]       = useState(new Date().getFullYear())

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const res = await fetch(`/api/stats/finance/sales-performance?year=${year}`)
      if (res.ok) setData(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false); setRefreshing(false) }
  }, [year])

  useEffect(() => { fetchData() }, [fetchData])

  const exportCSV = () => {
    if (!data) return
    const rows = [
      ['Month', ...data.salespeople, 'Total'],
      ...data.months.map(m => [m.month, ...data.salespeople.map(s => (m.bySales[s] ?? 0).toFixed(2)), m.total.toFixed(2)]),
      ['TOTAL', ...data.salespeople.map(s => (data.yearTotals[s] ?? 0).toFixed(2)), data.grandTotal.toFixed(2)],
    ]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }))
    a.download = `sales-performance-${year}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (loading) return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => <Skeleton key={i} className={`w-full rounded-xl ${i === 0 ? 'h-8' : i === 1 ? 'h-72' : 'h-52'}`} />)}
    </div>
  )
  if (!data?.salespeople?.length) return (
    <div className="py-16 text-center text-muted-foreground text-sm">No sales data found for {year}.</div>
  )

  const { salespeople, months, yearTotals, grandTotal, monthlyChart } = data
  const summaryChart = salespeople.map((name, i) => ({ name, total: yearTotals[name] ?? 0, color: salesColor(i) }))
  const monthShort   = monthlyChart.map(m => ({ ...m, month: (m.month as string).slice(0, 3) }))

  return (
    <div className="space-y-5">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Sales Performance</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Revenue per salesperson · {year}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="Year" value={year} onChange={e => setYear(Number(e.target.value))}
            className="h-8 w-auto font-semibold">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </NativeSelect>
          <Button variant="outline" size="sm" onClick={exportCSV} className="text-xs">
            <Download className="size-3.5" /> Export CSV
          </Button>
          <Button variant="outline" size="icon" onClick={() => fetchData(true)} disabled={refreshing}
            aria-label="Refresh" className="size-8">
            <RotateCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* ── Table + Summary ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">

        {/* Pivot table */}
        <div className="rounded-xl border shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: TEAL }}>
            <span className="text-sm font-bold tracking-wide text-brand-foreground">SALES PERFORMANCE {year}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ backgroundColor: 'color-mix(in srgb, var(--brand) 8%, transparent)' }}>
                  <th className="px-3 py-2.5 text-left text-xs font-bold border-b border-border text-muted-foreground uppercase tracking-wide" style={{ minWidth: 110 }}>
                    Period
                  </th>
                  {salespeople.map((name, i) => (
                    <th key={name} className="px-3 py-2.5 text-right text-xs font-bold border-b border-l border-border uppercase tracking-wide" style={{ minWidth: 130, color: salesColor(i) }}>
                      {name}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right text-xs font-bold border-b border-l border-border uppercase tracking-wide text-muted-foreground" style={{ minWidth: 130, backgroundColor: 'color-mix(in srgb, var(--brand) 5%, transparent)' }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {months.map((m, mi) => (
                  <tr key={m.month}
                    className={`${mi % 2 === 0 ? 'bg-card' : 'bg-muted/25'} hover:bg-cyan-50/30 dark:hover:bg-cyan-500/10 transition-colors`}
                    style={{ opacity: m.total === 0 ? 0.35 : 1 }}>
                    <td className="px-3 py-2 text-xs font-semibold border-b border-border text-foreground/80">{m.month}</td>
                    {salespeople.map((name, i) => (
                      <td key={name} className="px-3 py-2 text-right text-xs border-b border-l border-border tabular-nums"
                        style={{ color: (m.bySales[name] ?? 0) > 0 ? salesColor(i) : undefined }}>
                        {fmtUSD(m.bySales[name] ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right text-xs font-bold border-b border-l border-border tabular-nums"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--brand) 2%, transparent)' }}>
                      {fmtUSD(m.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: TEAL, color: 'var(--brand-foreground)' }}>
                  <td className="px-3 py-2.5 text-xs font-bold border-r border-brand-foreground/10 text-brand-foreground/60">TOTAL</td>
                  {salespeople.map(name => (
                    <td key={name} className="px-3 py-2.5 text-right text-xs font-bold border-l border-brand-foreground/10 tabular-nums">
                      {formatMoney(yearTotals[name] ?? 0, { currency: 'USD' })}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right text-xs font-bold border-l border-brand-foreground/10 tabular-nums" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
                    {formatMoney(grandTotal, { currency: 'USD' })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Summary card */}
        <div className="rounded-xl border shadow-sm overflow-hidden self-start">
          <div className="px-4 py-2.5" style={{ backgroundColor: TEAL }}>
            <span className="text-sm font-bold tracking-wide text-brand-foreground">YEARLY TOTAL</span>
          </div>
          <div className="divide-y">
            {salespeople.map((name, i) => (
              <div key={name} className="flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors">
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: salesColor(i) }} />
                  <span className="text-sm font-semibold text-foreground/80">{name}</span>
                </div>
                <span className="text-sm font-bold tabular-nums" style={{ color: salesColor(i) }}>
                  {formatMoney(yearTotals[name] ?? 0, { currency: 'USD' })}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: 'color-mix(in srgb, var(--brand) 5%, transparent)' }}>
              <span className="text-sm font-bold text-foreground/80">Grand Total</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: TEAL }}>
                {formatMoney(grandTotal, { currency: 'USD' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Charts ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Total per salesperson */}
        <div className="rounded-xl border shadow-sm p-5">
          <p className="text-sm font-bold mb-4" style={{ color: TEAL }}>SALES PERFORMANCE {year}</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={summaryChart} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => formatMoneyCompact(v, { currency: 'USD' })} tick={{ fontSize: 10 }} width={56} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="total" name="Revenue" radius={[5, 5, 0, 0]}>
                {summaryChart.map((e, i) => <Cell key={e.name} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly trend — all salespersons overlaid */}
        <div className="rounded-xl border shadow-sm p-5">
          <p className="text-sm font-bold mb-4 text-muted-foreground">MONTHLY TREND</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthShort}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => formatMoneyCompact(v, { currency: 'USD' })} tick={{ fontSize: 10 }} width={56} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {salespeople.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={salesColor(i)}
                  strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Per-salesperson monthly bar charts ── */}
      <div className={`grid gap-4 ${salespeople.length <= 2 ? 'sm:grid-cols-2' : salespeople.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
        {salespeople.map((name, i) => (
          <div key={name} className="rounded-xl border shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: salesColor(i) }} />
              <h4 className="text-sm font-bold" style={{ color: salesColor(i) }}>{name}</h4>
              <span className="ml-auto text-xs font-semibold tabular-nums text-muted-foreground">
                {formatMoneyCompact(yearTotals[name] ?? 0, { currency: 'USD' })}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={monthShort} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => formatMoneyCompact(v, { currency: 'USD' })} tick={{ fontSize: 9 }} width={40} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey={name} fill={salesColor(i)} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

    </div>
  )
}
