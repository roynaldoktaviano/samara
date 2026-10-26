'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { RotateCw, Download } from 'lucide-react'
import { formatMoney, formatMoneyCompact } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'

/* ── types ── */
interface Vessel { id: string; name: string }
interface CabinMonthRow { month: string; byCabin: Record<string, number>; total: number }
interface CabinTable {
  vesselId: string; vesselName: string; cabins: string[]
  months: CabinMonthRow[]; yearByCabin: Record<string, number>; grandTotal: number
  refundMonths: { byCabin: Record<string, number>; total: number }[]
  refundByCabin: Record<string, number>; refundTotal: number
}
interface VesselMonthRow { month: string; perVessel: Record<string, number>; total: number }
interface TableData {
  year: number; vessels: Vessel[]
  cabinTables: CabinTable[]
  vesselTable: {
    months: VesselMonthRow[]; yearTotals: Record<string, number>; grandTotal: number
    refundMonths: { perVessel: Record<string, number>; total: number }[]
    refundYearTotals: Record<string, number>; refundGrandTotal: number
  }
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
  if (n === 0) return <span className="text-muted-foreground/70">$ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;-</span>
  return <>{formatMoney(n, { currency: 'USD' })}</>
}

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i + 1)

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover border border-border rounded-lg shadow px-3 py-2 text-xs">
      <p className="font-bold text-foreground/80 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{formatMoney(p.value, { currency: 'USD', decimals: 0 })}</strong>
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
      <p className="sm:hidden text-xs text-muted-foreground px-3 py-1.5 border-b bg-muted/50">← Swipe to see all columns</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">{children}</table>
      </div>
    </div>
  )
}

const th = 'px-3 py-2 text-center text-xs font-bold border border-border whitespace-nowrap bg-info/15'
const td = 'px-3 py-2 text-right text-xs border border-border whitespace-nowrap'
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
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="Year" value={year} onChange={e => setYear(Number(e.target.value))}
            className="h-8 w-auto">
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

      {/* ── CABIN TABLES (one per vessel with open trips) ── */}
      {cabinTables.map(ct => (
        <div key={ct.vesselId}>
          <SectionTitle color={vesselColor(ct.vesselName)}>
            SUMMARY REVENUE {year} — {ct.vesselName.toUpperCase()} (CABIN)
          </SectionTitle>
          <TableWrapper>
            <thead>
              <tr>
                <th className={`${th} text-left`} style={{ minWidth: 100 }}>PERIOD</th>
                {ct.cabins.map(c => (
                  <th key={c} className={th} style={{ minWidth: 110 }}>{c}</th>
                ))}
                <th className={`${th} bg-info/25`} style={{ minWidth: 120 }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {ct.months.map((m, mi) => (
                <tr key={m.month} className={`${mi % 2 === 0 ? 'bg-card' : 'bg-muted/50'} ${m.total === 0 ? 'opacity-40' : ''} hover:bg-info/5`}>
                  <td className="px-3 py-1.5 text-xs font-medium border border-border">{m.month}</td>
                  {ct.cabins.map(c => (
                    <td key={c} className={td}>{fmtUSD(m.byCabin[c] ?? 0)}</td>
                  ))}
                  <td className={`${td} font-bold bg-info/10`}>{fmtUSD(m.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#1e3a5f', color: 'white' }}>
                <td className={tfootTd + ' text-left text-[10px] opacity-70'}>PUBLISHED</td>
                {ct.cabins.map(c => (
                  <td key={c} className={tfootTd}>{formatMoney(ct.yearByCabin[c] ?? 0, { currency: 'USD' })}</td>
                ))}
                <td className={tfootTd} style={{ backgroundColor: '#0f3050' }}>{formatMoney(ct.grandTotal, { currency: 'USD' })}</td>
              </tr>
              <tr className="bg-destructive/10 text-destructive">
                <td className="px-3 py-1.5 text-left text-[10px] font-bold border border-border whitespace-nowrap">REFUNDED</td>
                {ct.cabins.map(c => (
                  <td key={c} className="px-3 py-1.5 text-right text-xs border border-border whitespace-nowrap">
                    {(ct.refundByCabin[c] ?? 0) > 0
                      ? <span className="text-destructive">-{formatMoney(ct.refundByCabin[c], { currency: 'USD' })}</span>
                      : <span className="text-muted-foreground/70">—</span>}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right text-xs font-bold border border-border whitespace-nowrap bg-destructive/15">
                  {ct.refundTotal > 0
                    ? <span className="text-destructive">-{formatMoney(ct.refundTotal, { currency: 'USD' })}</span>
                    : <span className="text-muted-foreground/70">—</span>}
                </td>
              </tr>
              <tr className="bg-success/10">
                <td className="px-3 py-1.5 text-left text-[10px] font-bold border border-border whitespace-nowrap text-success">NET</td>
                {ct.cabins.map(c => {
                  const net = (ct.yearByCabin[c] ?? 0) - (ct.refundByCabin[c] ?? 0)
                  return <td key={c} className="px-3 py-1.5 text-right text-xs font-semibold border border-border whitespace-nowrap text-success">{formatMoney(net, { currency: 'USD' })}</td>
                })}
                <td className="px-3 py-1.5 text-right text-xs font-bold border border-border whitespace-nowrap bg-success/15 text-success">
                  {formatMoney(ct.grandTotal - ct.refundTotal, { currency: 'USD' })}
                </td>
              </tr>
            </tfoot>
          </TableWrapper>
        </div>
      ))}

      {/* ── VESSEL TOTAL TABLE ── */}
      <div>
        <SectionTitle color="var(--brand)">
          SUMMARY REVENUE {year} — PER VESSEL
        </SectionTitle>
        <TableWrapper>
          <thead>
            <tr>
              <th className={`${th} text-left`} style={{ minWidth: 100 }}>PERIOD</th>
              {vessels.map(v => (
                <th key={v.id} className={th} style={{ minWidth: 120, color: vesselColor(v.name) }}>
                  {v.name.toUpperCase()}
                </th>
              ))}
              <th className={`${th} bg-info/25`} style={{ minWidth: 120 }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {vesselTable.months.map((m, mi) => (
              <tr key={m.month} className={`${mi % 2 === 0 ? 'bg-card' : 'bg-muted/50'} ${m.total === 0 ? 'opacity-40' : ''} hover:bg-info/5`}>
                <td className="px-3 py-1.5 text-xs font-medium border border-border">{m.month}</td>
                {vessels.map(v => (
                  <td key={v.id} className={`${td} font-medium`} style={{ color: (m.perVessel[v.id] ?? 0) > 0 ? vesselColor(v.name) : undefined }}>
                    {fmtUSD(m.perVessel[v.id] ?? 0)}
                  </td>
                ))}
                <td className={`${td} font-bold bg-info/10`}>{fmtUSD(m.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: '#1e3a5f', color: 'white' }}>
              <td className={tfootTd + ' text-left text-[10px] opacity-70'}>PUBLISHED</td>
              {vessels.map(v => (
                <td key={v.id} className={tfootTd} style={{ backgroundColor: '#1a4e6e' }}>
                  {formatMoney(vesselTable.yearTotals[v.id] ?? 0, { currency: 'USD' })}
                </td>
              ))}
              <td className={tfootTd} style={{ backgroundColor: '#0f3050' }}>
                {formatMoney(vesselTable.grandTotal, { currency: 'USD' })}
              </td>
            </tr>
            <tr className="bg-destructive/10">
              <td className="px-3 py-1.5 text-left text-[10px] font-bold border border-border whitespace-nowrap text-destructive">REFUNDED</td>
              {vessels.map(v => {
                const ref = vesselTable.refundYearTotals[v.id] ?? 0
                return (
                  <td key={v.id} className="px-3 py-1.5 text-right text-xs border border-border whitespace-nowrap">
                    {ref > 0
                      ? <span className="text-destructive">-{formatMoney(ref, { currency: 'USD' })}</span>
                      : <span className="text-muted-foreground/70">—</span>}
                  </td>
                )
              })}
              <td className="px-3 py-1.5 text-right text-xs font-bold border border-border whitespace-nowrap bg-destructive/15">
                {vesselTable.refundGrandTotal > 0
                  ? <span className="text-destructive">-{formatMoney(vesselTable.refundGrandTotal, { currency: 'USD' })}</span>
                  : <span className="text-muted-foreground/70">—</span>}
              </td>
            </tr>
            <tr className="bg-success/10">
              <td className="px-3 py-1.5 text-left text-[10px] font-bold border border-border whitespace-nowrap text-success">NET</td>
              {vessels.map(v => {
                const net = (vesselTable.yearTotals[v.id] ?? 0) - (vesselTable.refundYearTotals[v.id] ?? 0)
                return (
                  <td key={v.id} className="px-3 py-1.5 text-right text-xs font-semibold border border-border whitespace-nowrap text-success">
                    {formatMoney(net, { currency: 'USD' })}
                  </td>
                )
              })}
              <td className="px-3 py-1.5 text-right text-xs font-bold border border-border whitespace-nowrap bg-success/15 text-success">
                {formatMoney(vesselTable.grandTotal - vesselTable.refundGrandTotal, { currency: 'USD' })}
              </td>
            </tr>
          </tfoot>
        </TableWrapper>
      </div>

      {/* ── Charts ── */}
      <div className="grid gap-4 grid-cols-1">
        {/* ALL REVENUE */}
        <div className="rounded-xl border shadow-sm p-4">
          <h4 className="text-sm font-bold mb-3" style={{ color: 'var(--success)' }}>ALL REVENUE {year}</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={charts.allRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={v => formatMoneyCompact(v, { currency: 'USD' })} tick={{ fontSize: 10 }} width={58} />
              <Tooltip content={<ChartTip />} />
              <Line type="monotone" dataKey="total" name="Revenue" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cabin year totals (one full-width chart per vessel) */}
      {cabinTables.map(ct => {
        const cabinChart = ct.cabins.map(cabin => ({ cabin, value: (ct.yearByCabin[cabin] ?? 0) - (ct.refundByCabin[cabin] ?? 0) }))
        return (
          <div key={`chart-${ct.vesselId}`} className="rounded-xl border shadow-sm p-4">
            <h4 className="text-sm font-bold mb-3" style={{ color: vesselColor(ct.vesselName) }}>
              CABIN {ct.vesselName.toUpperCase()}
            </h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={cabinChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="cabin" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={v => formatMoneyCompact(v, { currency: 'USD' })} tick={{ fontSize: 10 }} width={58} />
                <Tooltip content={<ChartTip />} formatter={(v: number) => [formatMoney(v, { currency: 'USD', decimals: 0 }), 'Revenue']} />
                <Bar dataKey="value" name="Revenue" fill={vesselColor(ct.vesselName)} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      })}

      {/* Per vessel monthly bar charts */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        {vessels.map(v => (
          <div key={v.id} className="rounded-xl border shadow-sm p-4">
            <h4 className="text-sm font-bold mb-3" style={{ color: vesselColor(v.name) }}>
              {v.name.toUpperCase()}
            </h4>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={charts.perVessel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                <YAxis tickFormatter={v => formatMoneyCompact(v, { currency: 'USD' })} tick={{ fontSize: 9 }} width={46} />
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
