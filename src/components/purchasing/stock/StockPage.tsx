'use client'

import { useState, useEffect, useCallback } from 'react'
import { Warehouse, Ship, AlertTriangle, Search, X, Layers, FileText } from 'lucide-react'

interface StockRow {
  kind: 'stock'
  item: { id: string; sku: string; name: string; category: string; baseUnit: string; minStock: number; valuationMethod: string }
  qty: number
  costPerUnit: number
  lotsCount: number
  nearestExpiry: string | null
}
interface NonStockRow {
  kind: 'non-stock'
  id: string
  itemName: string
  unit: string | null
  qty: number
  costPerUnit: number
  sourcePoId: string | null
  poNumber: string | null
  receivedAt: string
}
type Row = StockRow | NonStockRow
interface LocationStock { location: { id: string; name: string; type: string }; rows: Row[] }
interface StockData { locations: LocationStock[]; summary: { totalItems: number; lowStock: number } }
interface StockLot { id: string; quantity: number; costPerUnit: number; batch: string | null; expiresAt: string | null; createdAt: string }

type ItemKindFilter = 'all' | 'stock' | 'non-stock'

const METHOD_LABEL: Record<string, string> = { FIFO: 'FIFO', LIFO: 'LIFO', WEIGHTED_AVERAGE: 'WA', STANDARD: 'STD' }
const METHOD_COLOR: Record<string, string> = { FIFO: 'bg-blue-50 text-blue-700', LIFO: 'bg-purple-50 text-purple-700', WEIGHTED_AVERAGE: 'bg-amber-50 text-amber-700', STANDARD: 'bg-green-50 text-green-700' }

const fmtNum = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n))
const fmtMoney = (n: number) => 'Rp ' + fmtNum(n)
const fmtDate = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

const fmtExpiry = (s: string) => {
  const d = new Date(s)
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000)
  const label = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  if (days < 0) return <span className="text-red-600 font-medium">{label} <span className="text-xs">({Math.abs(days)}d ago)</span></span>
  if (days <= 30) return <span className="text-amber-600 font-medium">{label} <span className="text-xs">({days}d)</span></span>
  return <span className="text-muted-foreground">{label}</span>
}

export default function StockPage({ onOpenPo }: { onOpenPo?: (poId: string) => void } = {}) {
  const [data, setData] = useState<StockData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [openLoc, setOpenLoc] = useState<string | null>(null)
  const [filterLoc, setFilterLoc] = useState<string>('all')
  const [itemKind, setItemKind] = useState<ItemKindFilter>('all')

  // Lot register panel — stock (catalog) items only; a non-stock row is already
  // a single untouched lot (see receipts/route.ts), so there's nothing to drill
  // into beyond what the row itself shows.
  const [lotPanel, setLotPanel] = useState<{ item: StockRow['item']; locationId: string; locationName: string } | null>(null)
  const [lots, setLots] = useState<StockLot[]>([])
  const [lotsLoading, setLotsLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/purchasing/stock')
    if (res.ok) {
      const d: StockData = await res.json()
      setData(d)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function openLots(item: StockRow['item'], locationId: string, locationName: string) {
    setLotPanel({ item, locationId, locationName })
    setLotsLoading(true)
    setLots([])
    const res = await fetch(`/api/purchasing/stock/lots?itemId=${item.id}&locationId=${locationId}`)
    if (res.ok) setLots(await res.json())
    setLotsLoading(false)
  }

  const matchesSearch = (r: Row) => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.kind === 'stock'
      ? r.item.name.toLowerCase().includes(q) || r.item.sku.toLowerCase().includes(q)
      : r.itemName.toLowerCase().includes(q) || (r.poNumber ?? '').toLowerCase().includes(q)
  }
  const filtered = (rows: Row[]) => rows.filter(r => matchesSearch(r) && (itemKind === 'all' || r.kind === itemKind))

  const StockTable = ({ rows, locationId, locationName }: { rows: StockRow[]; locationId: string; locationName: string }) => (
    <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-xs text-muted-foreground">
        <tr>
          <th className="text-left px-5 py-2.5 font-medium">SKU</th>
          <th className="text-left px-5 py-2.5 font-medium">Name</th>
          <th className="text-left px-5 py-2.5 font-medium">Method</th>
          <th className="text-right px-5 py-2.5 font-medium">Lots</th>
          <th className="text-right px-5 py-2.5 font-medium">Stock</th>
          <th className="text-right px-5 py-2.5 font-medium">Min</th>
          <th className="text-left px-5 py-2.5 font-medium">Nearest Expiry</th>
          <th className="text-right px-5 py-2.5 font-medium">Value</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map(({ item, qty, costPerUnit, lotsCount, nearestExpiry }) => {
          const isLow = item.minStock > 0 && qty < item.minStock
          const method = item.valuationMethod ?? 'FIFO'
          return (
            <tr key={item.id}
              className={`hover:bg-[#bdac7e]/5 cursor-pointer transition-colors ${isLow ? 'bg-red-50/40' : ''}`}
              onClick={() => openLots(item, locationId, locationName)}>
              <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{item.sku}</td>
              <td className="px-5 py-3">
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.category}</p>
              </td>
              <td className="px-5 py-3">
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${METHOD_COLOR[method] ?? 'bg-muted text-muted-foreground'}`}>
                  {METHOD_LABEL[method] ?? method}
                </span>
              </td>
              <td className="px-5 py-3 text-right tabular-nums text-muted-foreground text-xs">
                <span className="inline-flex items-center gap-1">
                  {lotsCount}
                  {lotsCount > 1 && <Layers className="h-3 w-3 text-muted-foreground/50" />}
                </span>
              </td>
              <td className={`px-5 py-3 text-right font-semibold tabular-nums ${isLow ? 'text-red-600' : ''}`}>
                {fmtNum(qty)} <span className="text-xs font-normal text-muted-foreground">{item.baseUnit}</span>
              </td>
              <td className="px-5 py-3 text-right text-muted-foreground text-xs tabular-nums">
                {item.minStock > 0 ? `${fmtNum(item.minStock)} ${item.baseUnit}` : '—'}
              </td>
              <td className="px-5 py-3 text-sm">
                {nearestExpiry ? fmtExpiry(nearestExpiry) : <span className="text-muted-foreground/40">—</span>}
              </td>
              <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">Rp {fmtNum(qty * costPerUnit)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
    </div>
  )

  const NonStockTable = ({ rows }: { rows: NonStockRow[] }) => (
    <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-xs text-muted-foreground">
        <tr>
          <th className="text-left px-5 py-2.5 font-medium">Item</th>
          <th className="text-right px-5 py-2.5 font-medium">Stock</th>
          <th className="text-left px-5 py-2.5 font-medium">PO No.</th>
          <th className="text-left px-5 py-2.5 font-medium">Arrived</th>
          <th className="text-right px-5 py-2.5 font-medium">Value</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map(r => (
          <tr key={r.id} className="hover:bg-muted/20 transition-colors">
            <td className="px-5 py-3">
              <p className="font-medium">{r.itemName}</p>
              <p className="text-xs text-muted-foreground">Non-stock item</p>
            </td>
            <td className="px-5 py-3 text-right font-semibold tabular-nums">
              {fmtNum(r.qty)} <span className="text-xs font-normal text-muted-foreground">{r.unit ?? ''}</span>
            </td>
            <td className="px-5 py-3">
              {r.poNumber && r.sourcePoId ? (
                <button
                  onClick={() => onOpenPo?.(r.sourcePoId!)}
                  className="font-mono text-xs text-amber-700 hover:text-amber-900 hover:underline underline-offset-2 transition-colors"
                >
                  {r.poNumber}
                </button>
              ) : <span className="text-muted-foreground/40 text-xs">—</span>}
            </td>
            <td className="px-5 py-3 text-muted-foreground text-xs">{fmtDate(r.receivedAt)}</td>
            <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{fmtMoney(r.qty * r.costPerUnit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )

  if (loading) return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2"><div className="h-7 w-48 rounded bg-muted" /><div className="h-4 w-64 rounded bg-muted" /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="rounded-lg border bg-card p-4 space-y-2"><div className="h-3 w-24 rounded bg-muted" /><div className="h-7 w-12 rounded bg-muted" /></div>)}
      </div>
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <div key={i} className="rounded-lg border p-5 flex items-center justify-between"><div className="flex items-center gap-3"><div className="h-4 w-4 rounded bg-muted" /><div className="space-y-1.5"><div className="h-4 w-32 rounded bg-muted" /><div className="h-3 w-48 rounded bg-muted" /></div></div><div className="h-4 w-4 rounded bg-muted" /></div>)}
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Item by Location</h2>
          <p className="text-muted-foreground text-sm mt-1">Real-time item balance per location. Click a stock item to see lot detail.</p>
        </div>
        <button onClick={load} className="text-sm border rounded-md px-3 py-2 text-muted-foreground hover:bg-muted transition-colors">Refresh</button>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Items</p>
            <p className="text-2xl font-bold mt-1">{data.summary.totalItems}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Active Locations</p>
            <p className="text-2xl font-bold mt-1">{data.locations.length}</p>
          </div>
          <div className={`rounded-lg border p-4 ${data.summary.lowStock > 0 ? 'bg-red-50 border-red-200' : 'bg-card'}`}>
            <p className={`text-xs ${data.summary.lowStock > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>Low Stock</p>
            <p className={`text-2xl font-bold mt-1 ${data.summary.lowStock > 0 ? 'text-red-700' : ''}`}>{data.summary.lowStock}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input className="w-full pl-9 pr-3 h-9 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e]" placeholder="Search name, SKU, or PO no..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex rounded-md border overflow-hidden h-9">
          {(['all', 'stock', 'non-stock'] as const).map(k => (
            <button key={k} onClick={() => setItemKind(k)}
              className={`px-3 text-xs font-medium transition-colors ${itemKind === k ? 'bg-[#bdac7e] text-white' : 'text-muted-foreground hover:bg-muted'}`}>
              {k === 'all' ? 'All Items' : k === 'stock' ? 'Stock Item' : 'Non-Stock Item'}
            </button>
          ))}
        </div>
        {data && data.locations.length > 1 && (
          <select
            className="h-9 border rounded-md px-3 text-sm bg-background focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] outline-none"
            value={filterLoc}
            onChange={e => setFilterLoc(e.target.value)}
          >
            <option value="all">All Locations</option>
            {data.locations.map(({ location }) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
        )}
      </div>

      {!data || data.locations.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <Warehouse className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No items yet</p>
          <p className="text-xs mt-1">Items will appear here after goods are received from a supplier.</p>
        </div>
      ) : (() => {
        const visibleLocations = filterLoc === 'all'
          ? data.locations
          : data.locations.filter(l => l.location.id === filterLoc)

        const locationBody = (loc: LocationStock) => {
          const filteredRows = filtered(loc.rows)
          const stockRows = filteredRows.filter((r): r is StockRow => r.kind === 'stock')
          const nonStockRows = filteredRows.filter((r): r is NonStockRow => r.kind === 'non-stock')
          if (filteredRows.length === 0) return <p className="text-sm text-muted-foreground text-center py-10">No items match.</p>
          return (
            <>
              {stockRows.length > 0 && <StockTable rows={stockRows} locationId={loc.location.id} locationName={loc.location.name} />}
              {stockRows.length > 0 && nonStockRows.length > 0 && (
                <div className="px-5 py-2 bg-muted/30 border-y flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <FileText className="h-3.5 w-3.5" /> Non-Stock Items
                </div>
              )}
              {nonStockRows.length > 0 && <NonStockTable rows={nonStockRows} />}
            </>
          )
        }

        if (filterLoc !== 'all') {
          const loc = visibleLocations[0]
          if (!loc) return null
          const totalValue = loc.rows.reduce((s, r) => s + r.qty * r.costPerUnit, 0)
          const lowStockCount = loc.rows.filter((r): r is StockRow => r.kind === 'stock' && r.item.minStock > 0 && r.qty < r.item.minStock).length
          const Icon = loc.location.type === 'VESSEL' ? Ship : Warehouse
          return (
            <div className="rounded-xl border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 bg-muted/20 border-b">
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-semibold text-sm">{loc.location.name}</p>
                    <p className="text-xs text-muted-foreground">{loc.rows.length} item{loc.rows.length !== 1 ? 's' : ''} · Value: Rp {fmtNum(totalValue)}</p>
                  </div>
                </div>
                {lowStockCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" /> {lowStockCount} low stock
                  </span>
                )}
              </div>
              {locationBody(loc)}
            </div>
          )
        }

        return (
          <div className="space-y-3">
            {visibleLocations.map(loc => {
              const { location, rows } = loc
              const filteredRows = filtered(rows)
              if (filteredRows.length === 0 && (search || itemKind !== 'all')) return null
              const isOpen = openLoc === location.id
              const totalValue = rows.reduce((s, r) => s + r.qty * r.costPerUnit, 0)
              const lowStockCount = rows.filter((r): r is StockRow => r.kind === 'stock' && r.item.minStock > 0 && r.qty < r.item.minStock).length
              const Icon = location.type === 'VESSEL' ? Ship : Warehouse
              return (
                <div key={location.id} className="rounded-xl border overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left"
                    onClick={() => setOpenLoc(isOpen ? null : location.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-semibold text-sm">{location.name}</p>
                        <p className="text-xs text-muted-foreground">{rows.length} item{rows.length !== 1 ? 's' : ''} · Value: Rp {fmtNum(totalValue)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {lowStockCount > 0 && (
                        <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                          <AlertTriangle className="h-3.5 w-3.5" /> {lowStockCount} low stock
                        </span>
                      )}
                      <span className="text-muted-foreground text-sm">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t">
                      {locationBody(loc)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Lot Register Panel */}
      {lotPanel && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setLotPanel(null)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b shrink-0">
              <div>
                <p className="text-xs text-muted-foreground font-mono">{lotPanel.item.sku}</p>
                <h3 className="font-semibold text-base mt-0.5">{lotPanel.item.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{lotPanel.locationName} · {lotPanel.item.baseUnit}</p>
              </div>
              <button onClick={() => setLotPanel(null)} className="text-muted-foreground hover:text-foreground mt-0.5">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {lotsLoading ? (
                <div className="p-5 space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="rounded-lg border p-4 space-y-2 animate-pulse">
                      <div className="h-3 w-24 rounded bg-muted" />
                      <div className="h-4 w-16 rounded bg-muted" />
                    </div>
                  ))}
                </div>
              ) : lots.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground">
                  <Layers className="h-8 w-8 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No active lots found.</p>
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-px bg-border m-5 mb-0 rounded-lg overflow-hidden border">
                    <div className="bg-card px-3 py-3">
                      <p className="text-xs text-muted-foreground">Total Qty</p>
                      <p className="font-bold text-sm sm:text-lg tabular-nums truncate">{fmtNum(lots.reduce((s, l) => s + l.quantity, 0))}</p>
                      <p className="text-xs text-muted-foreground">{lotPanel.item.baseUnit}</p>
                    </div>
                    <div className="bg-card px-3 py-3">
                      <p className="text-xs text-muted-foreground">Total Value</p>
                      <p className="font-bold text-sm sm:text-lg tabular-nums truncate">{fmtMoney(lots.reduce((s, l) => s + l.quantity * l.costPerUnit, 0))}</p>
                    </div>
                    <div className="bg-card px-3 py-3">
                      <p className="text-xs text-muted-foreground">Lots</p>
                      <p className="font-bold text-sm sm:text-lg tabular-nums">{lots.length}</p>
                    </div>
                  </div>

                  {/* Lot list */}
                  <div className="p-5 space-y-2">
                    {lots.map((lot, idx) => {
                      const isExpired = lot.expiresAt && new Date(lot.expiresAt) < new Date()
                      const isNearExpiry = lot.expiresAt && !isExpired && Math.ceil((new Date(lot.expiresAt).getTime() - Date.now()) / 86400000) <= 30
                      return (
                        <div key={lot.id} className={`rounded-lg border p-4 ${isExpired ? 'border-red-200 bg-red-50/40' : isNearExpiry ? 'border-amber-200 bg-amber-50/30' : 'bg-card'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-muted-foreground">LOT {idx + 1}</span>
                                {lot.batch && (
                                  <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{lot.batch}</span>
                                )}
                                {isExpired && <span className="text-xs font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">EXPIRED</span>}
                                {isNearExpiry && <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">NEAR EXPIRY</span>}
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <span className="font-semibold tabular-nums">{fmtNum(lot.quantity)} <span className="text-xs font-normal text-muted-foreground">{lotPanel.item.baseUnit}</span></span>
                                <span className="text-muted-foreground tabular-nums">@ {fmtMoney(lot.costPerUnit)}</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold tabular-nums">{fmtMoney(lot.quantity * lot.costPerUnit)}</p>
                              {lot.expiresAt && (
                                <p className={`text-xs mt-0.5 ${isExpired ? 'text-red-600 font-medium' : isNearExpiry ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                                  Exp: {new Date(lot.expiresAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                              )}
                              {!lot.expiresAt && <p className="text-xs text-muted-foreground/40 mt-0.5">No expiry</p>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
