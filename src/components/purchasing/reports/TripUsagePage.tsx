'use client'

import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, Search, ChevronRight, ChevronDown, Download } from 'lucide-react'
import { formatDate, formatDateRange, formatMoney, formatNumber } from '@/lib/format'

// Purchasing › Trip Usage — what each trip took as usage (pemakaian), per yacht & year.
// Same ledger and trip-matching rule as Finance › Trip Stats (see api/purchasing/reports/trip-usage).

type UsageKey = 'SHIP_USAGE' | 'BAR_COGS' | 'COMPLIMENTARY' | 'SHRINKAGE' | 'MAINTENANCE'
interface Line {
  date: string
  itemId: string | null
  itemName: string
  itemType: string | null
  category: string | null
  unit: string
  qty: number
  cost: number
  usageType: UsageKey
  ref: { kind: 'TR' | 'GR' | 'COUNT' | 'POS' | 'OTHER'; number: string | null; id: string | null; poNumber?: string | null }
  byDate: boolean
}
interface Trip { id: string; kind: 'OPEN_TRIP' | 'PRIVATE_CHARTER'; label: string; tripNumber: number | null; startDate: string; endDate: string; pax: number; days: number; lines: Line[]; total: number }
interface Data {
  year: number
  yachtId: string | null
  yachts: { id: string; name: string }[]
  itemTypes: { code: string; label: string }[]
  trips: Trip[]
  unassigned: Line[]
  // Spare parts that reached this ship this year — ship upkeep, never a trip's cost.
  maintenance: Line[]
}

const USAGE_LABEL: Record<UsageKey, string> = { SHIP_USAGE: 'Ship Usage', BAR_COGS: 'Bar Sale', COMPLIMENTARY: 'Complimentary', SHRINKAGE: 'Shrinkage', MAINTENANCE: 'Maintenance' }
const refLabel = (r: Line['ref']) =>
  r.kind === 'TR' ? (r.number ?? 'Transfer')
  : r.kind === 'GR' ? (r.poNumber ? `${r.poNumber}${r.number ? ` · ${r.number}` : ''}` : (r.number ?? 'PO receipt'))
  : r.kind === 'COUNT' ? (r.number ?? 'Stock count')
  : r.kind === 'POS' ? 'POS sales'
  : '—'

interface ItemRow { key: string; itemName: string; category: string | null; usageType: UsageKey; unit: string; qty: number; cost: number }
function byItem(lines: Line[]): ItemRow[] {
  const map = new Map<string, ItemRow>()
  for (const l of lines) {
    const key = `${l.usageType}|${l.itemId ?? l.itemName}`
    const r = map.get(key) ?? { key, itemName: l.itemName, category: l.category, usageType: l.usageType, unit: l.unit, qty: 0, cost: 0 }
    r.qty += l.qty
    r.cost += l.cost
    map.set(key, r)
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost)
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'amber' }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums mt-0.5 ${tone === 'amber' ? 'text-warning' : 'text-foreground'}`}>
        {value}
        {sub && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{sub}</span>}
      </p>
    </div>
  )
}

// A native <select> dressed as a pill: muted label + bold value + chevron.
function FilterChip({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="relative inline-flex items-center h-8 rounded-full bg-muted/60 hover:bg-muted pl-3 pr-7 text-sm cursor-pointer transition-colors focus-within:ring-1 focus-within:ring-border">
      <span className="text-muted-foreground mr-1.5">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="appearance-none bg-transparent font-medium outline-none cursor-pointer">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-muted-foreground" />
    </label>
  )
}

function LinesTable({ lines, mode }: { lines: Line[]; mode: 'item' | 'detail' }) {
  const th = 'px-3 py-2 font-medium whitespace-nowrap'
  const td = 'px-3 py-2'
  if (!lines.length) return <p className="px-5 py-4 text-sm text-muted-foreground italic">No usage recorded.</p>
  if (mode === 'item') {
    const rows = byItem(lines)
    return (
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground border-b">
          <tr>
            <th className={`${th} text-left pl-5`}>Item</th>
            <th className={`${th} text-left`}>Category</th>
            <th className={`${th} text-left`}>Type</th>
            <th className={`${th} text-right`}>Qty</th>
            <th className={`${th} text-right pr-5`}>Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(r => (
            <tr key={r.key} className="hover:bg-muted/20">
              <td className={`${td} pl-5 font-medium`}>{r.itemName}</td>
              <td className={`${td} text-muted-foreground`}>{r.category ?? '—'}</td>
              <td className={`${td} text-muted-foreground text-xs`}>{USAGE_LABEL[r.usageType]}</td>
              <td className={`${td} text-right tabular-nums whitespace-nowrap ${r.qty < 0 ? 'text-destructive' : ''}`}>{formatNumber(r.qty, { decimals: 2 })} <span className="text-xs text-muted-foreground">{r.unit}</span></td>
              <td className={`${td} text-right tabular-nums whitespace-nowrap pr-5 ${r.cost < 0 ? 'text-destructive' : ''}`}>{formatMoney(r.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground border-b">
        <tr>
          <th className={`${th} text-left pl-5`}>Date</th>
          <th className={`${th} text-left`}>Document</th>
          <th className={`${th} text-left`}>Item</th>
          <th className={`${th} text-left`}>Type</th>
          <th className={`${th} text-right`}>Qty</th>
          <th className={`${th} text-right pr-5`}>Cost</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {lines.map((l, i) => (
          <tr key={i} className="hover:bg-muted/20">
            <td className={`${td} pl-5 whitespace-nowrap text-muted-foreground`}>{formatDate(l.date, 'short')}</td>
            <td className={`${td} whitespace-nowrap`}>
              <span className="text-xs font-medium">{refLabel(l.ref)}</span>
              {l.byDate && <span className="ml-1.5 text-[9px] font-semibold text-warning" title="Not linked to a trip on its Transfer/PO — allocated by date">BY DATE</span>}
            </td>
            <td className={`${td} font-medium`}>{l.itemName}</td>
            <td className={`${td} text-muted-foreground text-xs`}>{l.qty < 0 ? 'Returned' : USAGE_LABEL[l.usageType]}</td>
            <td className={`${td} text-right tabular-nums whitespace-nowrap ${l.qty < 0 ? 'text-destructive' : ''}`}>{formatNumber(l.qty, { decimals: 2 })} <span className="text-xs text-muted-foreground">{l.unit}</span></td>
            <td className={`${td} text-right tabular-nums whitespace-nowrap pr-5 ${l.cost < 0 ? 'text-destructive' : ''}`}>{formatMoney(l.cost)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Order Pattern: items × trips matrix of what came onto the ship (Ship Usage, net of returns),
// so gaps between orders show how long a delivery lasted. Food etc. is expensed on arrival — no
// ship stock is counted — so "lasts" is inferred: average number of trips between orders.
// Per guest/day = qty of every order but the last (still running) ÷ Σ(pax × days) of the
// trips those orders covered. Only trips that have started are columns.
interface PatternRow { key: string; name: string; unit: string; byTrip: Map<string, number>; orders: number; lasts: number | null; perPaxDay: number | null; sinceLast: number }
function buildPattern(trips: Trip[]): { cols: Trip[]; rows: PatternRow[] } {
  const now = Date.now()
  const cols = trips.filter(t => new Date(t.startDate).getTime() <= now)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
  const map = new Map<string, { name: string; unit: string; byTrip: Map<string, number> }>()
  for (const t of cols) for (const l of t.lines) {
    if (l.usageType !== 'SHIP_USAGE') continue
    const key = l.itemId ?? l.itemName
    const r = map.get(key) ?? { name: l.itemName, unit: l.unit, byTrip: new Map() }
    r.byTrip.set(t.id, (r.byTrip.get(t.id) ?? 0) + l.qty)
    map.set(key, r)
  }
  const rows: PatternRow[] = []
  for (const [key, r] of map) {
    const idx = cols.map((t, i) => ((r.byTrip.get(t.id) ?? 0) > 0 ? i : -1)).filter(i => i >= 0)
    if (!idx.length) continue
    const spans = idx.slice(1).map((v, i) => v - idx[i])
    const covered = cols.slice(idx[0], idx[idx.length - 1])
    const paxDays = covered.reduce((s, t) => s + t.pax * t.days, 0)
    const qtyCovered = idx.slice(0, -1).reduce((s, i) => s + (r.byTrip.get(cols[i].id) ?? 0), 0)
    rows.push({
      key, name: r.name, unit: r.unit, byTrip: r.byTrip, orders: idx.length,
      lasts: spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : null,
      perPaxDay: spans.length && paxDays > 0 ? qtyCovered / paxDays : null,
      sinceLast: cols.length - 1 - idx[idx.length - 1],
    })
  }
  rows.sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name))
  return { cols, rows }
}

function OrderPattern({ trips }: { trips: Trip[] }) {
  const { cols, rows } = useMemo(() => buildPattern(trips), [trips])
  if (!cols.length) return <p className="px-5 py-10 text-center text-sm text-muted-foreground">No trips have started yet this year.</p>
  if (!rows.length) return <p className="px-5 py-10 text-center text-sm text-muted-foreground">No goods sent to this ship yet. Orders appear here once Transfers / POs to the ship are received.</p>
  const th = 'px-2 py-2 font-medium text-center whitespace-nowrap'
  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-separate border-spacing-0">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 bg-background text-left px-4 py-2 font-medium border-b min-w-[200px]">Item</th>
            {cols.map(t => (
              <th key={t.id} className={`${th} border-b min-w-[52px]`} title={`${t.label} · ${formatDateRange(t.startDate, t.endDate)} · ${t.pax} pax`}>
                <div className="text-foreground">#{t.tripNumber ?? '—'}</div>
                <div className="font-normal text-[10px]">{formatDate(t.startDate, 'short')}</div>
              </th>
            ))}
            <th className={`${th} border-b border-l pl-4`}>Lasts</th>
            <th className={`${th} border-b pr-4`} title="Average quantity per guest per day, from completed order cycles">Per guest/day</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} className="group">
              <td className="sticky left-0 z-10 bg-background group-hover:bg-muted/40 px-4 py-2 border-b">
                <span className="font-medium">{r.name}</span>
                <span className="ml-1 text-xs text-muted-foreground">{r.unit}</span>
              </td>
              {cols.map(t => {
                const q = r.byTrip.get(t.id) ?? 0
                return (
                  <td key={t.id} className="px-2 py-2 text-center tabular-nums border-b group-hover:bg-muted/40">
                    {q > 0
                      ? <span className="inline-block min-w-[32px] rounded bg-success/10 text-success font-medium px-1.5 py-0.5">{formatNumber(q, { decimals: 2 })}</span>
                      : q < 0 ? <span className="text-destructive">{formatNumber(q, { decimals: 2 })}</span>
                      : <span className="text-muted-foreground/40">·</span>}
                  </td>
                )
              })}
              <td className="px-2 py-2 pl-4 text-center whitespace-nowrap border-b border-l group-hover:bg-muted/40">
                {r.lasts !== null
                  ? <span className="font-medium tabular-nums">±{formatNumber(Math.round(r.lasts * 10) / 10, { decimals: 2 })} trip{r.lasts === 1 ? '' : 's'}</span>
                  : <span className="text-xs text-muted-foreground" title="Only one order so far — no next order to measure against">running</span>}
              </td>
              <td className="px-2 py-2 pr-4 text-center whitespace-nowrap tabular-nums border-b group-hover:bg-muted/40">
                {r.perPaxDay !== null ? <>{formatNumber(Math.round(r.perPaxDay * 1000) / 1000, { decimals: 2 })} <span className="text-xs text-muted-foreground">{r.unit}</span></> : <span className="text-muted-foreground/60">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

async function exportXlsx(data: Data, trips: Trip[], unassigned: Line[]) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const yacht = data.yachts.find(y => y.id === data.yachtId)?.name ?? ''
  const styleHeader = (ws: import('exceljs').Worksheet) => {
    const r = ws.getRow(1)
    r.font = { bold: true }
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1EDE3' } }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }
  const tripCols = [
    { header: 'Trip #', key: 'no', width: 8 },
    { header: 'Trip', key: 'trip', width: 34 },
    { header: 'Start', key: 'start', width: 12, style: { numFmt: 'dd mmm yyyy' } },
    { header: 'End', key: 'end', width: 12, style: { numFmt: 'dd mmm yyyy' } },
  ]
  const groups: { trip: Trip | null; lines: Line[] }[] = [...trips.map(t => ({ trip: t, lines: t.lines })), ...(unassigned.length ? [{ trip: null, lines: unassigned }] : [])]
  const tripCells = (t: Trip | null) => ({
    no: t?.tripNumber ?? '', trip: t ? t.label : 'Unassigned', start: t ? new Date(t.startDate) : '', end: t ? new Date(t.endDate) : '',
  })

  const ws1 = wb.addWorksheet('By item')
  ws1.columns = [
    ...tripCols,
    { header: 'Item', key: 'item', width: 34 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Qty', key: 'qty', width: 10, style: { numFmt: '#,##0.##' } },
    { header: 'Unit', key: 'unit', width: 8 },
    { header: 'Cost (IDR)', key: 'cost', width: 14, style: { numFmt: '#,##0' } },
  ]
  for (const g of groups) for (const r of byItem(g.lines)) {
    ws1.addRow({ ...tripCells(g.trip), item: r.itemName, category: r.category ?? '', type: USAGE_LABEL[r.usageType], qty: r.qty, unit: r.unit, cost: Math.round(r.cost) })
  }
  styleHeader(ws1)

  const ws2 = wb.addWorksheet('Detail')
  ws2.columns = [
    ...tripCols,
    { header: 'Date', key: 'date', width: 12, style: { numFmt: 'dd mmm yyyy' } },
    { header: 'Document', key: 'doc', width: 26 },
    { header: 'Item', key: 'item', width: 34 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Qty', key: 'qty', width: 10, style: { numFmt: '#,##0.##' } },
    { header: 'Unit', key: 'unit', width: 8 },
    { header: 'Cost (IDR)', key: 'cost', width: 14, style: { numFmt: '#,##0' } },
    { header: 'By date', key: 'byDate', width: 9 },
  ]
  for (const g of groups) for (const l of g.lines) {
    ws2.addRow({
      ...tripCells(g.trip), date: new Date(l.date), doc: refLabel(l.ref), item: l.itemName, category: l.category ?? '',
      type: l.qty < 0 ? 'Returned' : USAGE_LABEL[l.usageType], qty: l.qty, unit: l.unit, cost: Math.round(l.cost), byDate: l.byDate ? 'Yes' : '',
    })
  }
  styleHeader(ws2)

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `Trip Usage ${yacht} ${data.year}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export default function TripUsagePage() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [yachtId, setYachtId] = useState('')
  const [itemType, setItemType] = useState('')
  const [search, setSearch] = useState('')
  const [hideEmpty, setHideEmpty] = useState(true)
  const [mode, setMode] = useState<'item' | 'detail'>('item')
  const [view, setView] = useState<'trips' | 'pattern' | 'maintenance'>('trips')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams({ year: String(year), ...(yachtId && { yachtId }), ...(itemType && { type: itemType }) })
    const res = await fetch(`/api/purchasing/reports/trip-usage?${qs}`)
    if (res.ok) {
      const d: Data = await res.json()
      setData(d)
      if (!yachtId && d.yachtId) setYachtId(d.yachtId)
    }
    setLoading(false)
  }, [year, yachtId, itemType])

  useEffect(() => { load() }, [load])

  const q = search.trim().toLowerCase()
  const filterLines = useCallback((lines: Line[]) => q ? lines.filter(l => l.itemName.toLowerCase().includes(q)) : lines, [q])
  const trips = useMemo(() => {
    if (!data) return []
    return data.trips
      .map(t => { const lines = filterLines(t.lines); return { ...t, lines, total: lines.reduce((s, l) => s + l.cost, 0) } })
      .filter(t => !hideEmpty || t.lines.length > 0)
  }, [data, filterLines, hideEmpty])
  // Order Pattern needs every trip as a column, empty ones included — gaps are the point.
  const allTrips = useMemo(() => (data?.trips ?? []).map(t => ({ ...t, lines: filterLines(t.lines) })), [data, filterLines])
  const unassigned = useMemo(() => filterLines(data?.unassigned ?? []), [data, filterLines])
  const unassignedTotal = unassigned.reduce((s, l) => s + l.cost, 0)
  const maintenance = useMemo(() => filterLines(data?.maintenance ?? []), [data, filterLines])
  const grandTotal = trips.reduce((s, t) => s + t.total, 0)
  const withUsage = trips.filter(t => t.lines.length > 0)
  const toggle = (id: string) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const yachtName = data?.yachts.find(y => y.id === yachtId)?.name

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Trip Usage</h2>
          <p className="text-muted-foreground text-sm mt-1">Goods taken as usage per trip</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={load} title="Refresh"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={async () => { if (!data) return; setExporting(true); try { await exportXlsx(data, trips, unassigned) } finally { setExporting(false) } }}
            disabled={!data || exporting}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium border hover:bg-muted transition-colors disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>

      <div className="flex gap-6 border-b -mt-2">
        {([['trips', 'Per Trip'], ['pattern', 'Order Pattern'], ['maintenance', 'Maintenance']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`-mb-px pb-2.5 text-sm font-medium border-b-2 transition-colors ${view === v ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Filters — one quiet row of chips; search pushed right. */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip label="Yacht" value={yachtId} onChange={v => { setYachtId(v); setOpen(new Set()) }}
          options={(data?.yachts ?? []).map(y => ({ value: y.id, label: y.name }))} />
        <FilterChip label="Year" value={String(year)} onChange={v => { setYear(Number(v)); setOpen(new Set()) }}
          options={Array.from({ length: 4 }, (_, i) => String(thisYear + 1 - i)).map(y => ({ value: y, label: y }))} />
        <FilterChip label="Type" value={itemType} onChange={setItemType}
          options={[{ value: '', label: 'All' }, ...(data?.itemTypes ?? []).map(t => ({ value: t.code, label: t.label }))]} />
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item"
            className="h-8 w-full rounded-full bg-muted/60 pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:bg-background focus:ring-1 focus:ring-border" />
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 rounded-lg border divide-y md:divide-y-0 md:divide-x">
        <Stat label="Trips with usage" value={String(withUsage.length)} sub={`of ${data?.trips.length ?? 0} in ${year}`} />
        <Stat label="Total cost" value={formatMoney(grandTotal)} />
        <Stat label="Avg per trip" value={withUsage.length ? formatMoney(grandTotal / withUsage.length) : '—'} />
        <Stat label="Unassigned" value={formatMoney(unassignedTotal)} sub={unassigned.length ? `${unassigned.length} lines` : undefined} tone={unassigned.length ? 'amber' : undefined} />
      </div>

      {view === 'maintenance' ? (
        <div className="rounded-lg border overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b">
            <p className="text-sm font-medium">
              {yachtName ?? 'Ship'} <span className="text-muted-foreground font-normal">· spare parts received in {year} — ship upkeep, not charged to any trip</span>
            </p>
            <div className="flex items-center gap-4">
              <p className="text-sm font-semibold tabular-nums">{formatMoney(maintenance.reduce((s, l) => s + l.cost, 0))}</p>
              <div className="inline-flex rounded-md bg-muted p-0.5 text-xs">
                {(['item', 'detail'] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${mode === m ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    {m === 'item' ? 'By item' : 'Detail'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {loading && !data
            ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</p>
            : <div className="overflow-x-auto"><LinesTable lines={maintenance} mode={mode} /></div>}
        </div>
      ) : view === 'pattern' ? (
        <div className="rounded-lg border overflow-hidden">
          <div className="px-4 py-2.5 border-b">
            <p className="text-sm font-medium">
              {yachtName ?? 'Ship'} <span className="text-muted-foreground font-normal">· goods sent to the ship per trip</span>
            </p>
          </div>
          {loading && !data
            ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</p>
            : <OrderPattern trips={allTrips} />}
        </div>
      ) : (<>
      <div className="rounded-lg border overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b">
          <p className="text-sm font-medium">
            {yachtName ?? 'Trips'} <span className="text-muted-foreground font-normal">· {trips.length} trip{trips.length === 1 ? '' : 's'}</span>
          </p>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" className="accent-foreground" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)} />
              Hide empty trips
            </label>
            <div className="inline-flex rounded-md bg-muted p-0.5 text-xs">
              {(['item', 'detail'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${mode === m ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  {m === 'item' ? 'By item' : 'Detail'}
                </button>
              ))}
            </div>
          </div>
        </div>
        {loading && !data ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : !trips.length ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No trips{hideEmpty ? ' with usage' : ''} for this yacht in {year}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b bg-muted/20">
                <tr>
                  <th className="w-8" />
                  <th className="text-left px-3 py-2.5 font-medium">#</th>
                  <th className="text-left px-3 py-2.5 font-medium">Trip</th>
                  <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Dates</th>
                  <th className="text-right px-3 py-2.5 font-medium">Items</th>
                  <th className="text-right px-5 py-2.5 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {trips.map(t => {
                  const isOpen = open.has(t.id)
                  const itemCount = new Set(t.lines.map(l => l.itemId ?? l.itemName)).size
                  return (
                    <Fragment key={t.id}>
                      <tr onClick={() => toggle(t.id)} className={`cursor-pointer hover:bg-muted/30 ${isOpen ? 'bg-muted/20' : ''}`}>
                        <td className="pl-3"><ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} /></td>
                        <td className="px-3 py-3 tabular-nums font-semibold">{t.tripNumber ?? '—'}</td>
                        <td className="px-3 py-3">
                          <span className="font-medium">{t.label}</span>
                          <span className={`ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${t.kind === 'OPEN_TRIP' ? 'bg-info/10 text-info' : 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'}`}>
                            {t.kind === 'OPEN_TRIP' ? 'Open Trip' : 'Private Charter'}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">{formatDateRange(t.startDate, t.endDate)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{itemCount}</td>
                        <td className="px-5 py-3 text-right tabular-nums font-semibold whitespace-nowrap">{formatMoney(t.total)}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={6} className="p-0 bg-muted/10 border-t">
                            <LinesTable lines={t.lines} mode={mode} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {unassigned.length > 0 && (
        <div className="rounded-lg border border-warning/30 overflow-hidden">
          <div className="px-5 py-3 bg-warning/10 border-b border-warning/30 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-warning">Unassigned usage — no trip on this yacht to charge it to</p>
            <p className="text-sm font-semibold text-warning tabular-nums">{formatMoney(unassignedTotal)}</p>
          </div>
          <div className="overflow-x-auto"><LinesTable lines={unassigned} mode={mode} /></div>
        </div>
      )}
      </>)}

      <p className="text-[11px] text-muted-foreground">
        Usage is charged to the trip picked on the Transfer / PO; without one (marked BY DATE), to the trip running that day on this yacht, else the next one to depart.
        Returns from the ship to stock show as negative. Same numbers as Finance › Trip Stats.
        {view === 'pattern' && ' Order Pattern: food & supplies are counted as used on arrival, so "Lasts" is estimated from the gap between orders; Per guest/day = qty of completed order cycles ÷ (pax × days). Bar stock (POS sales) is not shown here.'}
      </p>
    </div>
  )
}
