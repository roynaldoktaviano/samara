'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, Search, ArrowUpDown } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'

interface UsageItem {
  id: string
  sku: string
  name: string
  category: string
  isActive: boolean
  unit: string
  issued: number
  returned: number
  net: number
  loss: number
  value: number
  lossValue: number
  avgWeek: number
  avgMonth: number
  byShip: Record<string, number>
  warehouseStock: number
  shipStock: number
  weeksCover: number | null
  lastIssued: string | null
}
interface UsageData {
  range: { from: string; to: string; days: number; cutoff: string | null }
  ships: string[]
  items: UsageItem[]
  monthly: { month: string; label: string; units: number; value: number; byShip: Record<string, number> }[]
  categories: { category: string; net: number; value: number }[]
  totals: { net: number; value: number; avgWeek: number; avgMonth: number; valuePerMonth: number; loss: number; lossValue: number; lowCover: number }
}

const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const PRESETS = [
  { label: 'Last 3 Mo', get: () => { const n = new Date(); return { from: toISO(new Date(n.getFullYear(), n.getMonth() - 2, 1)), to: '' } } },
  { label: 'Last 6 Mo', get: () => { const n = new Date(); return { from: toISO(new Date(n.getFullYear(), n.getMonth() - 5, 1)), to: '' } } },
  { label: 'This Year', get: () => ({ from: toISO(new Date(new Date().getFullYear(), 0, 1)), to: '' }) },
  { label: 'All time', get: () => ({ from: '', to: '' }) },
]
const ITEM_TYPES = [
  { value: 'BEVERAGE', label: 'Beverage' },
  { value: 'FOOD', label: 'Food' },
  { value: 'HOUSEKEEPING', label: 'Housekeeping' },
]
const SHIP_COLORS = ['#bdac7e', '#0f766e', '#be185d', '#4f46e5', '#ea580c', '#64748b']

const fmtNum = (n: number, d = 0) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(n)
const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n))
const fmtShort = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(Math.round(n))
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

type SortKey = 'name' | 'net' | 'avgWeek' | 'avgMonth' | 'value' | 'warehouseStock' | 'weeksCover' | 'loss'

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'red' | 'amber' }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-foreground'
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function CoverBadge({ weeks }: { weeks: number | null }) {
  if (weeks === null) return <span className="text-muted-foreground">—</span>
  const cls = weeks < 2 ? 'bg-red-100 text-red-700' : weeks < 4 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>{weeks >= 52 ? '52+ wk' : `${fmtNum(weeks, 1)} wk`}</span>
}

export default function UsageStatsPage() {
  const [itemType, setItemType] = useState('BEVERAGE')
  const initial = PRESETS[1].get()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [preset, setPreset] = useState('Last 6 Mo')
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'avgMonth', dir: -1 })

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams({ type: itemType, ...(from && { from }), ...(to && { to }) })
    const res = await fetch(`/api/purchasing/reports/usage?${qs}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [itemType, from, to])

  useEffect(() => { load() }, [load])

  const applyPreset = (p: typeof PRESETS[number]) => { const r = p.get(); setFrom(r.from); setTo(r.to); setPreset(p.label) }

  const rows = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.items
      .filter(r => (!category || r.category === category) && (!q || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)))
      .sort((a, b) => {
        if (sort.key === 'name') return a.name.localeCompare(b.name) * sort.dir
        const av = a[sort.key] ?? Infinity
        const bv = b[sort.key] ?? Infinity
        return ((av as number) - (bv as number)) * sort.dir
      })
  }, [data, search, category, sort])

  const toggleSort = (key: SortKey) => setSort(s => s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'name' || key === 'weeksCover' ? 1 : -1 })

  const SortTh = ({ k, children, className = '' }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`px-3 py-2 font-medium cursor-pointer select-none hover:text-foreground ${className}`} onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1">{children}<ArrowUpDown className={`h-3 w-3 ${sort.key === k ? 'text-amber-600' : 'opacity-30'}`} /></span>
    </th>
  )

  const chartData = data?.monthly.map(m => ({ label: m.label, ...m.byShip })) ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Usage Stats</h2>
          <p className="text-muted-foreground text-sm mt-1">Average consumption per item — issued from the warehouse to each ship, minus returns</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={itemType} onChange={e => { setItemType(e.target.value); setCategory('') }}
            className="h-9 border rounded-md px-3 text-sm bg-background focus:ring-1 outline-none">
            {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button onClick={load} className="flex items-center gap-1.5 h-9 px-3 text-sm border rounded-md text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => applyPreset(p)}
            className={`h-8 px-3 rounded-md text-xs font-medium transition-colors border ${preset === p.label ? 'border-amber-500 bg-amber-500 text-white' : 'border-input bg-background text-muted-foreground hover:bg-muted'}`}>
            {p.label}
          </button>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset('') }}
          className="h-8 px-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-amber-500" />
        <span className="text-xs text-muted-foreground">→</span>
        <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset('') }}
          className="h-8 px-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-amber-500" />
        {data && !loading && (
          <span className="text-xs text-muted-foreground ml-2">
            {fmtDate(data.range.from)} – {fmtDate(data.range.to)} · {data.range.days} days
          </span>
        )}
      </div>

      {loading && !data ? (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted" />)}</div>
          <div className="h-64 rounded-lg bg-muted" />
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">No usage recorded in this period.</div>
      ) : (
        <div className={`space-y-5 ${loading ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Tile label="Avg used / week" value={`${fmtNum(data.totals.avgWeek, 1)} units`} sub={`${fmtNum(data.totals.net)} units in period`} />
            <Tile label="Avg used / month" value={`${fmtNum(data.totals.avgMonth, 1)} units`} />
            <Tile label="Avg cost / month" value={fmtMoney(data.totals.valuePerMonth)} sub={`${fmtMoney(data.totals.value)} in period`} />
            <Tile label="Items under 4 weeks of stock" value={String(data.totals.lowCover)} tone={data.totals.lowCover > 0 ? 'amber' : undefined} sub="warehouse stock ÷ avg weekly use" />
            <Tile label="Lost / miscounted" value={`${fmtNum(data.totals.loss)} units`} tone={data.totals.loss > 0 ? 'red' : undefined} sub={data.totals.lossValue > 0 ? fmtMoney(data.totals.lossValue) : undefined} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-lg border p-4">
              <p className="text-sm font-semibold mb-3">Monthly usage by ship (units)</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip formatter={(v: number, n: string) => [fmtNum(v, 1), n]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} cursor={{ fill: 'rgba(189,172,126,0.08)' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {data.ships.map((s, i) => <Bar key={s} dataKey={s} stackId="a" fill={SHIP_COLORS[i % SHIP_COLORS.length]} radius={i === data.ships.length - 1 ? [4, 4, 0, 0] : undefined} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm font-semibold mb-3">By category</p>
              <div className="space-y-2.5">
                {data.categories.map(c => {
                  const pct = data.totals.value > 0 ? (c.value / data.totals.value) * 100 : 0
                  return (
                    <button key={c.category} onClick={() => setCategory(category === c.category ? '' : c.category)} className={`w-full text-left rounded-md px-2 py-1.5 transition-colors ${category === c.category ? 'bg-amber-50 ring-1 ring-amber-300' : 'hover:bg-muted'}`}>
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">{c.category}</span>
                        <span className="text-muted-foreground">{fmtNum(c.net)} units · {fmtShort(c.value)}</span>
                      </div>
                      <div className="h-1.5 rounded bg-muted mt-1"><div className="h-1.5 rounded bg-[#bdac7e]" style={{ width: `${pct}%` }} /></div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="rounded-lg border">
            <div className="flex flex-wrap items-center gap-2 p-3 border-b">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item or SKU…"
                  className="h-8 pl-8 pr-3 text-sm rounded-md border border-input bg-background w-56 focus:outline-none focus:ring-1 focus:ring-amber-500" />
              </div>
              <select value={category} onChange={e => setCategory(e.target.value)} className="h-8 border rounded-md px-2 text-sm bg-background">
                <option value="">All categories</option>
                {data.categories.map(c => <option key={c.category} value={c.category}>{c.category}</option>)}
              </select>
              <span className="text-xs text-muted-foreground ml-auto">{rows.length} items</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b bg-muted/40">
                    <SortTh k="name">Item</SortTh>
                    <SortTh k="net" className="text-right">Used</SortTh>
                    <SortTh k="avgWeek" className="text-right">Avg / wk</SortTh>
                    <SortTh k="avgMonth" className="text-right">Avg / mo</SortTh>
                    {data.ships.map(s => <th key={s} className="px-3 py-2 font-medium text-right whitespace-nowrap">{s}</th>)}
                    <SortTh k="value" className="text-right">Cost</SortTh>
                    <SortTh k="warehouseStock" className="text-right">Warehouse</SortTh>
                    <SortTh k="weeksCover" className="text-right">Cover</SortTh>
                    <SortTh k="loss" className="text-right">Lost</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.name}{!r.isActive && <span className="ml-1.5 text-[10px] text-muted-foreground">(inactive)</span>}</div>
                        <div className="text-[11px] text-muted-foreground">{r.sku} · {r.category} · {r.unit}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtNum(r.net, 1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.avgWeek, 1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.avgMonth, 1)}</td>
                      {data.ships.map(s => <td key={s} className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.byShip[s] ? fmtNum(r.byShip[s], 1) : '—'}</td>)}
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">{r.value > 0 ? fmtMoney(r.value) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.warehouseStock, 1)}</td>
                      <td className="px-3 py-2 text-right"><CoverBadge weeks={r.weeksCover} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.loss ? <span className="text-red-600">{fmtNum(r.loss, 1)}</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Used = issued to ships − returns, in each item&apos;s purchase unit. Averages are over the days in range that have data.
            Cover = warehouse stock ÷ average weekly use. Cost uses the item&apos;s current average cost.
            {data.range.cutoff && <> History up to {fmtDate(new Date(new Date(data.range.cutoff).getTime() - 86400000).toISOString())} comes from the imported CariStok sheet; later movements from ERP transfers.</>}
          </p>
        </div>
      )}
    </div>
  )
}
