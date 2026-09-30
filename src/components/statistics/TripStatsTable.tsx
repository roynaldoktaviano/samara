'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { RotateCw, Download } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/* ── types ── */
interface TripPayment { type: 'DP' | 'PELUNASAN'; amountUsd: number; month: string }
interface TripLine {
  client: string; pax: number; rooms: number; salesman: string
  source: string; period: string
  amount: number; tnk: number; total: number; agentFee: number; net: number
  forex: number | null; currency: 'USD' | 'IDR'; rupiah: number | null
  usd: { dpPeriod: string | null; dp: number; pelPeriod: string | null; pel: number; balance: number }
  idr: { dpPeriod: string | null; dp: number; pelPeriod: string | null; pel: number; balance: number; paidUsd: number; balanceUsd: number }
  balanceUsd: number; paidUsd: number; dueMonth: string | null; remark: string
  payments: TripPayment[]
}
type UsageKey = 'SHIP_USAGE' | 'BAR_COGS' | 'COMPLIMENTARY' | 'SHRINKAGE'
type TripCost = Record<UsageKey | 'total', number>
interface CostItem { name: string; unit: string; qty: number; cost: number; byDate: boolean; usageType: UsageKey }
interface TripRow extends TripLine {
  cost: TripCost; costItems: CostItem[]
  id: string; kind: 'OPEN_TRIP' | 'PRIVATE_CHARTER'; label: string; closed: boolean
  tripNumber: number | null; startDate: string; endDate: string; dn: string; days: number
  lines: (TripLine & { bookingCode: string })[]
}
interface TripStatsData {
  year: number; yachtId: string | null; yachts: { id: string; name: string }[]; trips: TripRow[]
  unassignedCost?: TripCost; defaultForex?: number | null
}

const USAGE_COLS: { key: UsageKey; label: string }[] = [
  { key: 'SHIP_USAGE', label: 'Ship Usage' },
  { key: 'BAR_COGS', label: 'Bar COGS' },
  { key: 'COMPLIMENTARY', label: 'Complimentary' },
  { key: 'SHRINKAGE', label: 'Shrinkage' },
]
const USAGE_LABEL = Object.fromEntries(USAGE_COLS.map(c => [c.key, c.label])) as Record<UsageKey, string>

/* ── helpers ── */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i + 1)

/** "2026-03" → "Mar-26" */
const period = (key: string | null) => {
  if (!key) return ''
  const [y, m] = key.split('-')
  return `${MONTHS[Number(m) - 1]}-${y.slice(2)}`
}
const dateLabel = (iso: string) => {
  const d = new Date(iso)
  return `${d.getDate()}-${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`
}
const num = (n: number | null | undefined, digits = 0) =>
  !n ? '-' : n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const usd = (n: number | null | undefined, digits = 0) => (!n ? '-' : `$ ${num(n, digits)}`)
const idr = (n: number | null | undefined) => (!n ? '-' : `Rp ${num(n)}`)

const th  = 'px-2 py-1.5 text-center text-[11px] font-bold border border-gray-300 whitespace-nowrap'
const td  = 'px-2 py-1 text-[11px] border border-gray-200 whitespace-nowrap'
const tdR = `${td} text-right tabular-nums`
const tot = 'px-2 py-1.5 text-right text-[11px] font-bold border border-gray-300 whitespace-nowrap tabular-nums text-red-600'

const GROUP_STYLE = {
  trip:    'bg-slate-100',
  revenue: 'bg-blue-100',
  usd:     'bg-emerald-100',
  idr:     'bg-amber-100',
  cost:    'bg-rose-100',
}

/* ══════════════════════════════════════════
   Main component
══════════════════════════════════════════ */
export default function TripStatsTable() {
  const [data, setData]             = useState<TripStatsData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [year, setYear]             = useState(new Date().getFullYear())
  const [yachtId, setYachtId]       = useState('')
  const [forexInput, setForexInput] = useState('')
  const [costTrip, setCostTrip]     = useState<TripRow | null>(null)

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const qs = new URLSearchParams({ year: String(year), ...(yachtId && { yachtId }) })
      const res = await fetch(`/api/stats/finance/trip-stats?${qs}`)
      if (res.ok) {
        const json: TripStatsData = await res.json()
        setData(json)
        if (!yachtId && json.yachtId) setYachtId(json.yachtId)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false); setRefreshing(false) }
  }, [year, yachtId])

  useEffect(() => { fetchData() }, [fetchData])

  const trips = data?.trips ?? []
  // USD→IDR rate used to convert Rupiah cost to USD for Gross Profit; a trip's own booking rate wins.
  const forex = Number(forexInput) || data?.defaultForex || 0
  // Gross Profit (USD) = Net To Samara − trip cost converted to USD.
  const grossProfit = (t: TripRow) => {
    if (!t.cost.total) return t.net
    const rate = t.forex ?? forex
    return rate ? t.net - t.cost.total / rate : null
  }
  const yachtName = data?.yachts.find(y => y.id === (yachtId || data?.yachtId))?.name ?? ''

  const totals = useMemo(() => {
    const s = (f: (t: TripRow) => number) => trips.reduce((acc, t) => acc + (f(t) || 0), 0)
    return {
      pax: s(t => t.pax), days: s(t => t.days), rooms: s(t => t.rooms),
      amount: s(t => t.amount), tnk: s(t => t.tnk), total: s(t => t.total), agentFee: s(t => t.agentFee), net: s(t => t.net),
      rupiah: s(t => t.rupiah ?? 0),
      usdDp: s(t => t.usd.dp), usdPel: s(t => t.usd.pel), usdBal: s(t => t.usd.balance),
      idrDp: s(t => t.idr.dp), idrPel: s(t => t.idr.pel), idrBal: s(t => t.idr.balance),
      idrPaidUsd: s(t => t.idr.paidUsd), idrBalUsd: s(t => t.idr.balanceUsd),
      cost: Object.fromEntries([...USAGE_COLS.map(c => c.key), 'total'].map(k => [k, s(t => t.cost[k as UsageKey | 'total'])])) as TripCost,
      gp: s(t => grossProfit(t) ?? 0),
    }
  }, [trips, forex])

  // Payment status split — by each trip's Net To Samara.
  const status = useMemo(() => {
    const booked = trips.filter(t => t.client)
    const sum = (list: TripRow[]) => list.reduce((s, t) => s + t.net, 0)
    const full = booked.filter(t => t.paidUsd > 0 && t.balanceUsd <= 0.005)
    const dp   = booked.filter(t => t.paidUsd > 0 && t.balanceUsd > 0.005)
    const none = booked.filter(t => t.paidUsd <= 0)
    return {
      full: { count: full.length, amount: sum(full) },
      dp:   { count: dp.length,   amount: sum(dp) },
      none: { count: none.length, amount: sum(none) },
      ar:   booked.reduce((s, t) => s + t.balanceUsd, 0),
      total: sum(booked),
    }
  }, [trips])

  // Money received per payment month (USD equivalent, both currencies) + balance due per due month.
  const monthly = useMemo(() => {
    const map = new Map<string, { dp: number; pel: number; due: number }>()
    const get = (k: string) => { if (!map.has(k)) map.set(k, { dp: 0, pel: 0, due: 0 }); return map.get(k)! }
    for (const t of trips) {
      for (const p of t.payments) { const m = get(p.month); if (p.type === 'DP') m.dp += p.amountUsd; else m.pel += p.amountUsd }
      if (t.dueMonth) get(t.dueMonth).due += t.balanceUsd
    }
    const months = [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => ({ key, ...v }))
    const byYear = new Map<string, { dp: number; pel: number; due: number }>()
    for (const m of months) {
      const y = m.key.slice(0, 4)
      const agg = byYear.get(y) ?? { dp: 0, pel: 0, due: 0 }
      agg.dp += m.dp; agg.pel += m.pel; agg.due += m.due
      byYear.set(y, agg)
    }
    return { months, years: [...byYear.entries()].map(([y, v]) => ({ year: y, ...v })) }
  }, [trips])

  const costCells = (t: TripRow) => {
    const gp = grossProfit(t)
    return [...USAGE_COLS.map(c => t.cost[c.key].toFixed(0)), t.cost.total.toFixed(0), t.net.toFixed(2), gp?.toFixed(2) ?? '']
  }

  const exportCSV = () => {
    const head = ['No Trip', 'Start', 'End', 'D/N', 'Client', 'PAX', 'DAYS', 'Room', 'Salesman',
      'Agent/Direct', 'Period', 'Amount', 'Services', 'Total', 'Agent Fee', 'Net To Samara', 'Forex',
      'IDR Amount', 'USD DP Period', 'USD DP Amount', 'USD Final Payment Period', 'USD Final Payment Amount', 'USD Balance Due',
      'IDR DP Amount', 'IDR DP Period', 'IDR Final Payment Amount', 'IDR Final Payment Period', 'IDR Balance Due', 'Remark', 'IDR Paid (USD)', 'IDR Balance (USD)',
      ...USAGE_COLS.map(c => `${c.label} (IDR)`), 'Total Cost (IDR)', 'Revenue (USD)', 'Gross Profit (USD)']
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [head, ...trips.flatMap(t => (t.lines.length ? t.lines : [t]).map((l, i) => [
      t.tripNumber ?? '', dateLabel(t.startDate), dateLabel(t.endDate), t.dn, l.client, l.pax, t.days, l.rooms || '', l.salesman,
      l.source, period(t.period), l.amount.toFixed(2), l.tnk.toFixed(2), l.total.toFixed(2), l.agentFee.toFixed(2), l.net.toFixed(2), l.forex ?? '',
      l.rupiah?.toFixed(0) ?? '', period(l.usd.dpPeriod), l.usd.dp.toFixed(2), period(l.usd.pelPeriod), l.usd.pel.toFixed(2), l.usd.balance.toFixed(2),
      l.idr.dp.toFixed(0), period(l.idr.dpPeriod), l.idr.pel.toFixed(0), period(l.idr.pelPeriod), l.idr.balance.toFixed(0), l.remark, l.idr.paidUsd.toFixed(2), l.idr.balanceUsd.toFixed(2),
      // Cost is per trip, so it goes on the trip's first line only.
      ...(i === 0 ? costCells(t) : Array(USAGE_COLS.length + 3).fill('')),
    ]))].map(r => r.map(esc).join(','))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
    a.download = `trip-stats-${yachtName.toLowerCase().replace(/\s+/g, '-') || 'yacht'}-${year}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const costTotals = <>
    {USAGE_COLS.map(c => <td key={c.key} className={tot}>{idr(totals.cost[c.key])}</td>)}
    <td className={tot}>{idr(totals.cost.total)}</td>
    <td className={tot}>{usd(totals.net)}</td>
    <td className={tot}>{totals.gp < 0 ? '-' : ''}{usd(Math.abs(totals.gp))}</td>
  </>
  const unassigned = data?.unassignedCost

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold mr-auto">Trip Stats — {yachtName.toUpperCase()} {year}</h2>
        <select value={yachtId} onChange={e => setYachtId(e.target.value)} className="h-9 rounded-md border px-2 text-sm bg-background">
          {data?.yachts.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="h-9 rounded-md border px-2 text-sm bg-background">
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <label className="h-9 flex items-center gap-1.5 rounded-md border px-2 text-sm bg-background" title="USD → IDR rate used to convert IDR trip cost to USD for Gross Profit (a trip booked in IDR uses its own rate)">
          <span className="text-muted-foreground text-xs">USD rate</span>
          <input
            type="number" inputMode="decimal" value={forexInput} onChange={e => setForexInput(e.target.value)}
            placeholder={data?.defaultForex ? String(data.defaultForex) : 'e.g. 16000'}
            className="w-20 bg-transparent outline-none tabular-nums"
          />
        </label>
        <button onClick={() => fetchData(true)} className="h-9 px-3 rounded-md border text-sm flex items-center gap-1.5 hover:bg-muted">
          <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
        <button onClick={exportCSV} disabled={!trips.length} className="h-9 px-3 rounded-md border text-sm flex items-center gap-1.5 hover:bg-muted disabled:opacity-50">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {/* Main per-trip table */}
      <div className="rounded-lg border overflow-hidden shadow-sm bg-white">
        <p className="sm:hidden text-xs text-muted-foreground px-3 py-1.5 border-b bg-gray-50">← Swipe to see all columns</p>
        <div className="overflow-x-auto">
          <table className="text-[11px] border-collapse">
            <thead>
              {/* Totals row on top, like the Excel sheet */}
              <tr>
                <td colSpan={5} className={td} />
                <td className={tot}>{num(totals.pax)}</td>
                <td className={tot}>{num(totals.days)}</td>
                <td className={tot}>{num(totals.rooms)}</td>
                <td colSpan={3} className={td} />
                <td className={tot}>{usd(totals.amount)}</td>
                <td className={tot}>{usd(totals.tnk)}</td>
                <td className={tot}>{usd(totals.total)}</td>
                <td className={tot}>{usd(totals.agentFee)}</td>
                <td className={tot}>{usd(totals.net)}</td>
                <td className={td} />
                <td className={tot}>{idr(totals.rupiah)}</td>
                <td className={td} />
                <td className={tot}>{usd(totals.usdDp)}</td>
                <td className={td} />
                <td className={tot}>{usd(totals.usdPel)}</td>
                <td className={tot}>{usd(totals.usdBal)}</td>
                <td className={tot}>{idr(totals.idrDp)}</td>
                <td className={td} />
                <td className={tot}>{idr(totals.idrPel)}</td>
                <td className={td} />
                <td className={tot}>{idr(totals.idrBal)}</td>
                <td className={td} />
                <td className={tot}>{usd(totals.idrPaidUsd, 2)}</td>
                <td className={tot}>{usd(totals.idrBalUsd, 2)}</td>
                {costTotals}
              </tr>
              <tr>
                <th colSpan={9} className={`${th} ${GROUP_STYLE.trip}`}>{yachtName.toUpperCase()}</th>
                <th colSpan={8} className={`${th} ${GROUP_STYLE.revenue}`}>REVENUE (USD)</th>
                <th colSpan={6} className={`${th} ${GROUP_STYLE.usd}`}>PAYMENT — USD</th>
                <th colSpan={8} className={`${th} ${GROUP_STYLE.idr}`}>PAYMENT — IDR</th>
                <th colSpan={USAGE_COLS.length + 1} className={`${th} ${GROUP_STYLE.cost}`}>TRIP COST — USAGE (IDR)</th>
                <th colSpan={2} className={`${th} ${GROUP_STYLE.revenue}`}>PROFIT (USD)</th>
              </tr>
              <tr>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.trip}`}>No Trip</th>
                <th colSpan={3} className={`${th} ${GROUP_STYLE.trip}`}>Date Trip</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.trip}`}>Client</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.trip}`}>PAX</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.trip}`}>DAYS</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.trip}`}>Room</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.trip}`}>Salesman</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.revenue}`}>Agent/Direct</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.revenue}`}>Period</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.revenue}`}>Amount</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.revenue}`}>Services</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.revenue}`}>Total</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.revenue}`}>Agent Fee</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.revenue}`}>Net To Samara</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.revenue}`}>Forex</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.usd}`}>IDR Amount</th>
                <th colSpan={2} className={`${th} ${GROUP_STYLE.usd}`}>DP</th>
                <th colSpan={2} className={`${th} ${GROUP_STYLE.usd}`}>Final Payment</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.usd}`}>Balance Due</th>
                <th colSpan={2} className={`${th} ${GROUP_STYLE.idr}`}>DP</th>
                <th colSpan={2} className={`${th} ${GROUP_STYLE.idr}`}>Final Payment</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.idr}`}>Balance Due</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.idr}`}>Remark</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.idr}`}>Paid (USD)</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.idr}`}>Balance (USD)</th>
                {USAGE_COLS.map(c => <th key={c.key} rowSpan={2} className={`${th} ${GROUP_STYLE.cost}`}>{c.label}</th>)}
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.cost}`}>Total Cost</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.revenue}`}>Revenue</th>
                <th rowSpan={2} className={`${th} ${GROUP_STYLE.revenue}`}>Gross Profit</th>
              </tr>
              <tr>
                <th className={`${th} ${GROUP_STYLE.trip}`}>Start</th>
                <th className={`${th} ${GROUP_STYLE.trip}`}>End</th>
                <th className={`${th} ${GROUP_STYLE.trip}`}>D/N</th>
                <th className={`${th} ${GROUP_STYLE.usd}`}>Period</th>
                <th className={`${th} ${GROUP_STYLE.usd}`}>Amount</th>
                <th className={`${th} ${GROUP_STYLE.usd}`}>Period</th>
                <th className={`${th} ${GROUP_STYLE.usd}`}>Amount</th>
                <th className={`${th} ${GROUP_STYLE.idr}`}>Amount</th>
                <th className={`${th} ${GROUP_STYLE.idr}`}>Period</th>
                <th className={`${th} ${GROUP_STYLE.idr}`}>Amount</th>
                <th className={`${th} ${GROUP_STYLE.idr}`}>Period</th>
              </tr>
            </thead>
            <tbody>
              {trips.length === 0 && (
                <tr><td colSpan={31 + USAGE_COLS.length + 3} className="px-4 py-10 text-center text-sm text-muted-foreground">No trips for this yacht & year yet.</td></tr>
              )}
              {trips.map(t => {
                // One line per booking; trip-level cells (number, dates, D/N, days, period) span them.
                const lines: (TripLine & { bookingCode?: string })[] = t.lines.length ? t.lines : [t]
                const span = lines.length
                const tripCell = `${td} align-middle bg-white`
                return lines.map((l, i) => (
                  <tr key={`${t.id}-${i}`} className={`hover:bg-muted/40 ${t.closed ? 'text-muted-foreground' : ''} ${i === 0 ? 'border-t-2 border-gray-300' : ''}`}>
                    {i === 0 && <>
                      <td rowSpan={span} className={`${tripCell} text-center font-semibold`}>{t.tripNumber ?? '—'}</td>
                      <td rowSpan={span} className={tripCell}>{dateLabel(t.startDate)}</td>
                      <td rowSpan={span} className={tripCell}>{dateLabel(t.endDate)}</td>
                      <td rowSpan={span} className={tripCell}>{t.dn}</td>
                    </>}
                    <td className={`${td} max-w-[220px] truncate`} title={l.bookingCode ? `${l.client} · ${l.bookingCode}` : l.client}>
                      {l.client || <span className="italic text-muted-foreground">{t.closed ? 'Closed' : 'No bookings yet'}</span>}
                      {t.kind === 'PRIVATE_CHARTER' && <span className="ml-1 text-[9px] font-bold text-orange-600">PC</span>}
                    </td>
                    <td className={`${td} text-center`}>{l.pax || ''}</td>
                    {i === 0 && <td rowSpan={span} className={`${tripCell} text-center`}>{t.days}</td>}
                    <td className={`${td} text-center`}>{l.rooms || ''}</td>
                    <td className={td}>{l.salesman}</td>
                    <td className={td}>{l.source}</td>
                    {i === 0 && <td rowSpan={span} className={tripCell}>{t.client ? period(t.period) : ''}</td>}
                    <td className={tdR}>{usd(l.amount)}</td>
                    <td className={tdR}>{usd(l.tnk)}</td>
                    <td className={tdR}>{usd(l.total)}</td>
                    <td className={tdR}>{usd(l.agentFee)}</td>
                    <td className={tdR}>{usd(l.net)}</td>
                    <td className={tdR}>{l.forex ? idr(l.forex) : ''}</td>
                    <td className={tdR}>{l.rupiah ? idr(l.rupiah) : ''}</td>
                    <td className={td}>{period(l.usd.dpPeriod)}</td>
                    <td className={tdR}>{l.usd.dp ? usd(l.usd.dp) : ''}</td>
                    <td className={td}>{period(l.usd.pelPeriod)}</td>
                    <td className={tdR}>{l.usd.pel ? usd(l.usd.pel) : ''}</td>
                    <td className={`${tdR} ${l.usd.balance > 0 ? 'text-blue-600 font-semibold' : ''}`}>{l.currency === 'USD' && l.client ? usd(l.usd.balance) : ''}</td>
                    <td className={tdR}>{l.idr.dp ? idr(l.idr.dp) : ''}</td>
                    <td className={td}>{period(l.idr.dpPeriod)}</td>
                    <td className={tdR}>{l.idr.pel ? idr(l.idr.pel) : ''}</td>
                    <td className={td}>{period(l.idr.pelPeriod)}</td>
                    <td className={`${tdR} ${l.idr.balance > 0 ? 'text-blue-600 font-semibold' : ''}`}>{l.currency === 'IDR' ? idr(l.idr.balance) : ''}</td>
                    <td className={`${td} max-w-[160px] truncate`} title={l.remark}>{l.remark}</td>
                    <td className={tdR}>{l.idr.paidUsd ? usd(l.idr.paidUsd, 2) : ''}</td>
                    <td className={tdR}>{l.idr.balanceUsd ? usd(l.idr.balanceUsd, 2) : ''}</td>
                    {i === 0 && (() => {
                      const gp = grossProfit(t)
                      return <>
                        {USAGE_COLS.map(c => <td key={c.key} rowSpan={span} className={`${tripCell} text-right tabular-nums`}>{idr(t.cost[c.key])}</td>)}
                        <td rowSpan={span} className={`${tripCell} text-right tabular-nums font-semibold`}>
                          {t.costItems.length
                            ? <button onClick={() => setCostTrip(t)} className="underline decoration-dotted hover:text-blue-600">{idr(t.cost.total)}</button>
                            : '-'}
                        </td>
                        <td rowSpan={span} className={`${tripCell} text-right tabular-nums`}>{usd(t.net)}</td>
                        <td rowSpan={span} className={`${tripCell} text-right tabular-nums font-semibold ${gp != null && gp < 0 ? 'text-red-600' : ''}`}>
                          {gp == null ? <span className="text-muted-foreground font-normal" title="Set a USD rate">?</span> : `${gp < 0 ? '-' : ''}${usd(Math.abs(gp))}`}
                        </td>
                      </>
                    })()}
                  </tr>
                ))
              })}
            </tbody>
            {trips.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50">
                  <td colSpan={5} className={`${td} font-bold text-red-600`}>GRAND TOTAL</td>
                  <td className={tot}>{num(totals.pax)}</td>
                  <td className={tot}>{num(totals.days)}</td>
                  <td className={tot}>{num(totals.rooms)}</td>
                  <td colSpan={3} className={td} />
                  <td className={tot}>{usd(totals.amount)}</td>
                  <td className={tot}>{usd(totals.tnk)}</td>
                  <td className={tot}>{usd(totals.total)}</td>
                  <td className={tot}>{usd(totals.agentFee)}</td>
                  <td className={tot}>{usd(totals.net)}</td>
                  <td className={td} />
                  <td className={tot}>{idr(totals.rupiah)}</td>
                  <td className={td} />
                  <td className={tot}>{usd(totals.usdDp)}</td>
                  <td className={td} />
                  <td className={tot}>{usd(totals.usdPel)}</td>
                  <td className={tot}>{usd(totals.usdBal)}</td>
                  <td className={tot}>{idr(totals.idrDp)}</td>
                  <td className={td} />
                  <td className={tot}>{idr(totals.idrPel)}</td>
                  <td className={td} />
                  <td className={tot}>{idr(totals.idrBal)}</td>
                  <td className={td} />
                  <td className={tot}>{usd(totals.idrPaidUsd, 2)}</td>
                  <td className={tot}>{usd(totals.idrBalUsd, 2)}</td>
                  {costTotals}
                </tr>
                <tr>
                  <td colSpan={19} className={`${td} text-right text-muted-foreground`}>% of Net To Samara</td>
                  <td className={`${tdR} font-semibold`}>{totals.net ? `${Math.round(totals.usdDp / totals.net * 100)}%` : ''}</td>
                  <td className={td} />
                  <td className={`${tdR} font-semibold`}>{totals.net ? `${Math.round(totals.usdPel / totals.net * 100)}%` : ''}</td>
                  <td className={`${tdR} font-semibold`}>{totals.net ? `${Math.round(totals.usdBal / totals.net * 100)}%` : ''}</td>
                  <td colSpan={8 + USAGE_COLS.length + 3} className={td} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground -mt-4">
        Trip cost = usage at moving-average cost, in IDR. Gross Profit (USD) = Net To Samara − trip cost ÷ USD rate. Usage is charged to the trip picked on the Transfer / PO;
        without one, it goes to the trip running that day on this yacht, else the next one to depart. PO payments are cash flow and not counted here.
        {!forex && ' Set a USD rate to see Gross Profit for USD trips.'}
        {!!unassigned?.total && <span className="ml-1 font-semibold text-amber-700">Unassigned usage this year (no matching trip): {idr(unassigned.total)}.</span>}
      </p>

      <Dialog open={!!costTrip} onOpenChange={o => !o && setCostTrip(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Trip Cost — #{costTrip?.tripNumber ?? '—'} {costTrip?.label}</DialogTitle>
          </DialogHeader>
          {costTrip && (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className={`${th} bg-gray-50 text-left`}>Item</th>
                  <th className={`${th} bg-gray-50`}>Type</th>
                  <th className={`${th} bg-gray-50`}>Qty</th>
                  <th className={`${th} bg-gray-50`}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {costTrip.costItems.map((it, i) => (
                  <tr key={i}>
                    <td className={td}>
                      {it.name}
                      {it.byDate && <span className="ml-1 text-[9px] font-semibold text-amber-600" title="Not linked to a trip on its Transfer/PO — allocated by date">BY DATE</span>}
                    </td>
                    <td className={td}>{USAGE_LABEL[it.usageType]}</td>
                    <td className={tdR}>{num(it.qty, it.qty % 1 ? 2 : 0)} {it.unit}</td>
                    <td className={`${tdR} ${it.cost < 0 ? 'text-red-600' : ''}`}>{it.cost < 0 ? '-' : ''}{idr(Math.abs(it.cost))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td colSpan={3} className={`${td} font-bold`}>Total</td>
                  <td className={`${tdR} font-bold`}>{idr(costTrip.cost.total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </DialogContent>
      </Dialog>

      {/* Summaries */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border overflow-hidden shadow-sm bg-white self-start">
          <div className="px-4 py-2 font-bold text-sm bg-slate-100 border-b">Payment Status (USD, Net To Samara)</div>
          <table className="w-full text-xs border-collapse">
            <tbody>
              {[
                ['Full Paid', status.full.count, status.full.amount],
                ['DP', status.dp.count, status.dp.amount],
                ['No Payment', status.none.count, status.none.amount],
              ].map(([label, count, amount]) => (
                <tr key={label as string}>
                  <td className={td}>{label}</td>
                  <td className={`${tdR} text-muted-foreground`}>{count} {count === 1 ? 'trip' : 'trips'}</td>
                  <td className={tdR}>$ {num(amount as number, 2)}</td>
                </tr>
              ))}
              <tr>
                <td className={`${td} font-semibold`}>AR (outstanding)</td>
                <td className={td} />
                <td className={`${tdR} font-semibold text-blue-600`}>$ {num(status.ar, 2)}</td>
              </tr>
              <tr className="bg-gray-50">
                <td className={`${td} font-bold`}>Total</td>
                <td className={td} />
                <td className={`${tdR} font-bold`}>$ {num(status.total, 2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border overflow-hidden shadow-sm bg-white">
          <div className="px-4 py-2 font-bold text-sm bg-slate-100 border-b">Monthly Recap (USD)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className={`${th} bg-gray-50`}>Period</th>
                  <th className={`${th} bg-emerald-50`}>DP Received</th>
                  <th className={`${th} bg-emerald-50`}>Final Payment Received</th>
                  <th className={`${th} bg-blue-50`}>Balance Due</th>
                </tr>
              </thead>
              <tbody>
                {monthly.months.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No payments yet.</td></tr>
                )}
                {monthly.months.map(m => (
                  <tr key={m.key}>
                    <td className={td}>{period(m.key)}</td>
                    <td className={tdR}>{m.dp ? `$ ${num(m.dp)}` : ''}</td>
                    <td className={tdR}>{m.pel ? `$ ${num(m.pel)}` : ''}</td>
                    <td className={tdR}>{m.due ? usd(m.due) : ''}</td>
                  </tr>
                ))}
              </tbody>
              {monthly.years.length > 0 && (
                <tfoot>
                  {monthly.years.map(y => (
                    <tr key={y.year} className="bg-gray-50">
                      <td className={`${td} font-semibold`}>{y.year}</td>
                      <td className={`${tdR} font-semibold`}>$ {num(y.dp)}</td>
                      <td className={`${tdR} font-semibold`}>$ {num(y.pel)}</td>
                      <td className={`${tdR} font-semibold`}>{y.due ? `$ ${num(y.due)}` : ''}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100">
                    <td className={`${td} font-bold`}>Total</td>
                    <td className={`${tdR} font-bold`}>$ {num(monthly.years.reduce((s, y) => s + y.dp, 0))}</td>
                    <td className={`${tdR} font-bold`}>$ {num(monthly.years.reduce((s, y) => s + y.pel, 0))}</td>
                    <td className={`${tdR} font-bold`}>$ {num(monthly.years.reduce((s, y) => s + y.due, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t">
            DP/Final Payments are grouped by the month the payment was received (IDR payments converted to USD). Balance Due is grouped by the final payment due month.
          </p>
        </div>
      </div>
    </div>
  )
}
