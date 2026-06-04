'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { RotateCw, Download } from 'lucide-react'

/* ── types ── */
interface Vessel { id: string; name: string }
interface CabinMonthRow { month: string; byCabin: Record<string, number>; total: number }
interface CabinTable {
  vesselId: string; vesselName: string; cabins: string[]
  months: CabinMonthRow[]; yearByCabin: Record<string, number>; grandTotal: number
}
interface VesselMonthRow { month: string; perVessel: Record<string, number>; total: number }
interface TableData {
  year: number; vessels: Vessel[]
  cabinTables: CabinTable[]
  vesselTable: { months: VesselMonthRow[]; yearTotals: Record<string, number>; grandTotal: number }
  charts: { allRevenue: { month: string; total: number }[]; perVessel: Record<string, any>[] }
}

/* ── helpers ── */
const VESSEL_COLORS: Record<string, string> = {
  'Samara I': '#2563eb', 'Samara 1': '#2563eb',
  'Samara II': '#16a34a', 'Samara 2': '#16a34a',
  'Otium': '#9333ea', 'Mischief': '#dc2626',
}
const vesselColor = (name: string) => VESSEL_COLORS[name] ?? '#6b7280'

function fmtUSD(n: number) {
  if (n === 0) return <span className="text-gray-300">$ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;-</span>
  return <>$ &nbsp;{n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
}
function fmtK(n: number) {
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n/1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i + 1)

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs">
      <p className="font-bold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>${p.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
        </p>
      ))}
    </div>
  )
}

/* ── Sub-components ── */
function SectionTitle({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-2 font-bold text-sm tracking-wide text-white rounded-t-lg" style={{ backgroundColor: color }}>
      {children}
    </div>
  )
}

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">{children}</table>
      </div>
    </div>
  )
}

const th = 'px-3 py-2 text-center text-xs font-bold border border-gray-200 whitespace-nowrap bg-blue-100'
const td = 'px-3 py-2 text-right text-xs border border-gray-200 whitespace-nowrap'
const tfootTd = 'px-3 py-2.5 text-right text-xs font-bold border border-blue-800 whitespace-nowrap'

/* ══════════════════════════════════════════
   Main component
══════════════════════════════════════════ */
export default function FinanceRevenueTable() {
  const [data,       setData]       = useState<TableData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [year,       setYear]       = useState(new Date().getFullYear())

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const res = await fetch(`/api/stats/finance/revenue-table?year=${year}`)
      if (res.ok) setData(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false); setRefreshing(false) }
  }, [year])

  useEffect(() => { fetchData() }, [fetchData])

  const exportCSV = () => {
    if (!data) return
    const rows: string[][] = []

    // Cabin tables
    for (const ct of data.cabinTables) {
      rows.push([`=== ${ct.vesselName.toUpperCase()} CABIN ===`])
      rows.push(['Month', ...ct.cabins, 'Total'])
      ct.months.forEach(m => rows.push([m.month, ...ct.cabins.map(c => (m.byCabin[c] ?? 0).toFixed(2)), m.total.toFixed(2)]))
      rows.push(['TOTAL', ...ct.cabins.map(c => (ct.yearByCabin[c] ?? 0).toFixed(2)), ct.grandTotal.toFixed(2)])
      rows.push([])
    }

    // Vessel table
    rows.push(['=== VESSEL TOTAL ==='])
    rows.push(['Month', ...data.vessels.map(v => v.name), 'Total'])
    data.vesselTable.months.forEach(m => rows.push([m.month, ...data.vessels.map(v => (m.perVessel[v.id] ?? 0).toFixed(2)), m.total.toFixed(2)]))
    rows.push(['TOTAL', ...data.vessels.map(v => (data.vesselTable.yearTotals[v.id] ?? 0).toFixed(2)), data.vesselTable.grandTotal.toFixed(2)])

    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `revenue-summary-${year}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-80 w-full rounded-xl" />
      <Skeleton className="h-60 w-full rounded-xl" />
    </div>
  )
  if (!data || !data.cabinTables || !data.vesselTable || !data.charts) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Failed to load data. Please refresh.</p>
  }

  const { vessels, cabinTables, vesselTable, charts } = data

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Revenue Summary</h3>
          <p className="text-muted-foreground text-sm">Net revenue per cabin & vessel (after discount & commission)</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="h-8 px-2 text-xs rounded-md border border-input bg-background">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 h-8 px-3 text-xs rounded-md border border-input bg-background hover:bg-muted">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
          <button onClick={() => fetchData(true)} disabled={refreshing}
            className="flex items-center gap-1.5 h-8 px-3 text-xs rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50">
            <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── CABIN TABLES (one per vessel with open trips) ── */}
      {cabinTables.map(ct => (
        <div key={ct.vesselId}>
          <SectionTitle color={vesselColor(ct.vesselName)}>
            SUMMARY REVENUE {year} — {ct.vesselName.toUpperCase()} (CABIN)
          </SectionTitle>
          <TableWrapper>
            <thead>
              <tr>
                <th className={`${th} text-left`} style={{ minWidth: 100 }}>PERIODE</th>
                {ct.cabins.map(c => (
                  <th key={c} className={th} style={{ minWidth: 110 }}>{c}</th>
                ))}
                <th className={`${th} bg-blue-200`} style={{ minWidth: 120 }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {ct.months.map((m, mi) => (
                <tr key={m.month} className={`${mi % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${m.total === 0 ? 'opacity-40' : ''} hover:bg-blue-50/40`}>
                  <td className="px-3 py-1.5 text-xs font-medium border border-gray-200">{m.month}</td>
                  {ct.cabins.map(c => (
                    <td key={c} className={td}>{fmtUSD(m.byCabin[c] ?? 0)}</td>
                  ))}
                  <td className={`${td} font-bold bg-blue-50`}>{fmtUSD(m.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#1e3a5f', color: 'white' }}>
                <td className={tfootTd + ' text-left'}></td>
                {ct.cabins.map(c => (
                  <td key={c} className={tfootTd}>
                    $ {(ct.yearByCabin[c] ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                ))}
                <td className={tfootTd} style={{ backgroundColor: '#0f3050' }}>
                  $ {ct.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </TableWrapper>
        </div>
      ))}

      {/* ── VESSEL TOTAL TABLE ── */}
      <div>
        <SectionTitle color="#1a5f6e">
          SUMMARY REVENUE {year} — PER VESSEL
        </SectionTitle>
        <TableWrapper>
          <thead>
            <tr>
              <th className={`${th} text-left`} style={{ minWidth: 100 }}>PERIODE</th>
              {vessels.map(v => (
                <th key={v.id} className={th} style={{ minWidth: 120, color: vesselColor(v.name) }}>
                  {v.name.toUpperCase()}
                </th>
              ))}
              <th className={`${th} bg-blue-200`} style={{ minWidth: 120 }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {vesselTable.months.map((m, mi) => (
              <tr key={m.month} className={`${mi % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${m.total === 0 ? 'opacity-40' : ''} hover:bg-blue-50/40`}>
                <td className="px-3 py-1.5 text-xs font-medium border border-gray-200">{m.month}</td>
                {vessels.map(v => (
                  <td key={v.id} className={`${td} font-medium`} style={{ color: (m.perVessel[v.id] ?? 0) > 0 ? vesselColor(v.name) : undefined }}>
                    {fmtUSD(m.perVessel[v.id] ?? 0)}
                  </td>
                ))}
                <td className={`${td} font-bold bg-blue-50`}>{fmtUSD(m.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: '#1e3a5f', color: 'white' }}>
              <td className={tfootTd + ' text-left'}></td>
              {vessels.map(v => (
                <td key={v.id} className={tfootTd} style={{ backgroundColor: '#1a4e6e' }}>
                  $ {(vesselTable.yearTotals[v.id] ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
              ))}
              <td className={tfootTd} style={{ backgroundColor: '#0f3050' }}>
                $ {vesselTable.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </TableWrapper>
      </div>

      {/* ── Charts ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ALL REVENUE */}
        <div className="rounded-xl border shadow-sm p-4">
          <h4 className="text-sm font-bold mb-3" style={{ color: '#16a34a' }}>ALL REVENUE {year}</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={charts.allRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} width={58} />
              <Tooltip content={<ChartTip />} />
              <Line type="monotone" dataKey="total" name="Revenue" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Cabin year totals (bar chart per vessel) */}
        {cabinTables.map(ct => {
          const cabinChart = Object.entries(ct.yearByCabin)
            .sort((a, b) => b[1] - a[1])
            .map(([cabin, value]) => ({ cabin, value }))
          return (
            <div key={`chart-${ct.vesselId}`} className="rounded-xl border shadow-sm p-4">
              <h4 className="text-sm font-bold mb-3" style={{ color: vesselColor(ct.vesselName) }}>
                CABIN {ct.vesselName.toUpperCase()}
              </h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={cabinChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="cabin" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} width={58} />
                  <Tooltip content={<ChartTip />} formatter={(v: number) => [`$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, 'Revenue']} />
                  <Bar dataKey="value" name="Revenue" fill={vesselColor(ct.vesselName)} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        })}
      </div>

      {/* Per vessel monthly bar charts */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {vessels.map(v => (
          <div key={v.id} className="rounded-xl border shadow-sm p-4">
            <h4 className="text-sm font-bold mb-3" style={{ color: vesselColor(v.name) }}>
              {v.name.toUpperCase()}
            </h4>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={charts.perVessel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 9 }} width={46} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey={v.name} fill={vesselColor(v.name)} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

    </div>
  )
}
