'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts'
import { RotateCw, Download } from 'lucide-react'

/* ── types ── */
interface MonthRow { month: string; bySales: Record<string, number>; total: number }
interface SPData {
  year: number; salespeople: string[]
  months: MonthRow[]; yearTotals: Record<string, number>; grandTotal: number
  monthlyChart: Record<string, any>[]
}

const COLOR_PALETTE = ['#f97316','#3b82f6','#22c55e','#ec4899','#8b5cf6','#06b6d4','#eab308','#ef4444']
const salesColor = (i: number) => COLOR_PALETTE[i % COLOR_PALETTE.length]
const TEAL = '#0e7490'

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i + 1)

function fmtUSD(n: number) {
  if (n === 0) return <span className="text-gray-300">—</span>
  return <>${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
}
function fmtK(n: number) {
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n/1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2.5 text-xs min-w-[140px]">
      <p className="font-bold text-gray-600 mb-1.5 border-b pb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-gray-600">{p.name}</span>
          </span>
          <strong style={{ color: p.color }}>
            ${p.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
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
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="h-8 px-3 text-xs font-semibold rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportCSV}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-input bg-background hover:bg-muted transition-colors">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
          <button onClick={() => fetchData(true)} disabled={refreshing}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-input bg-background hover:bg-muted disabled:opacity-40 transition-colors">
            <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Table + Summary ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">

        {/* Pivot table */}
        <div className="rounded-xl border shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: TEAL }}>
            <span className="text-sm font-bold tracking-wide text-white">SALES PERFORMANCE {year}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ backgroundColor: `${TEAL}14` }}>
                  <th className="px-3 py-2.5 text-left text-xs font-bold border-b border-gray-200 text-gray-500 uppercase tracking-wide" style={{ minWidth: 110 }}>
                    Periode
                  </th>
                  {salespeople.map((name, i) => (
                    <th key={name} className="px-3 py-2.5 text-right text-xs font-bold border-b border-l border-gray-200 uppercase tracking-wide" style={{ minWidth: 130, color: salesColor(i) }}>
                      {name}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right text-xs font-bold border-b border-l border-gray-200 uppercase tracking-wide text-gray-600" style={{ minWidth: 130, backgroundColor: `${TEAL}0d` }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {months.map((m, mi) => (
                  <tr key={m.month}
                    className={`${mi % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-cyan-50/30 transition-colors`}
                    style={{ opacity: m.total === 0 ? 0.35 : 1 }}>
                    <td className="px-3 py-2 text-xs font-semibold border-b border-gray-100 text-gray-700">{m.month}</td>
                    {salespeople.map((name, i) => (
                      <td key={name} className="px-3 py-2 text-right text-xs border-b border-l border-gray-100 tabular-nums"
                        style={{ color: (m.bySales[name] ?? 0) > 0 ? salesColor(i) : undefined }}>
                        {fmtUSD(m.bySales[name] ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right text-xs font-bold border-b border-l border-gray-100 tabular-nums"
                      style={{ backgroundColor: `${TEAL}06` }}>
                      {fmtUSD(m.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: TEAL, color: 'white' }}>
                  <td className="px-3 py-2.5 text-xs font-bold border-r border-white/10 text-white/60">TOTAL</td>
                  {salespeople.map(name => (
                    <td key={name} className="px-3 py-2.5 text-right text-xs font-bold border-l border-white/10 tabular-nums">
                      ${(yearTotals[name] ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right text-xs font-bold border-l border-white/10 tabular-nums" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
                    ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Summary card */}
        <div className="rounded-xl border shadow-sm overflow-hidden self-start">
          <div className="px-4 py-2.5" style={{ backgroundColor: TEAL }}>
            <span className="text-sm font-bold tracking-wide text-white">YEARLY TOTAL</span>
          </div>
          <div className="divide-y">
            {salespeople.map((name, i) => (
              <div key={name} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: salesColor(i) }} />
                  <span className="text-sm font-semibold text-gray-700">{name}</span>
                </div>
                <span className="text-sm font-bold tabular-nums" style={{ color: salesColor(i) }}>
                  ${(yearTotals[name] ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: `${TEAL}0d` }}>
              <span className="text-sm font-bold text-gray-700">Grand Total</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: TEAL }}>
                ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} width={56} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="total" name="Revenue" radius={[5, 5, 0, 0]}>
                {summaryChart.map((e, i) => <Cell key={e.name} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly trend — all salespersons overlaid */}
        <div className="rounded-xl border shadow-sm p-5">
          <p className="text-sm font-bold mb-4 text-gray-600">MONTHLY TREND</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthShort}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} width={56} axisLine={false} tickLine={false} />
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
              <span className="ml-auto text-xs font-semibold tabular-nums text-gray-500">
                {fmtK(yearTotals[name] ?? 0)}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={monthShort} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 9 }} width={40} axisLine={false} tickLine={false} />
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
