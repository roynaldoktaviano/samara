'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Warehouse, Ship, AlertTriangle, Search, X, Layers, FileText, ShoppingCart, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatMoney, formatNumber, formatDate } from '@/lib/format'
import { displayQty, displayUnitCost, hasPurchaseUnit, isMeasureUnit, type UnitInfo } from '@/lib/purchasing/units'

interface StockRow {
  kind: 'stock'
  item: { id: string; sku: string; name: string; category: string; baseUnit: string; purchaseUnit: string; conversionFactor: number; minStock: number; valuationMethod: string }
  qty: number
  costPerUnit: number
  lotsCount: number
  nearestExpiry: string | null
  /** Warehouses only (null elsewhere), base units. */
  replenish: { reserved: number; available: number; toBeOrder: number; pending: number; po: number; sources: ReplenishSource[] } | null
}
interface ReplenishSource { kind: 'PR' | 'PO' | 'TR' | 'HOLD'; id: string; number: string; status: string; createdAt: string; qty: number }
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

// This page counts in the BASE unit (pcs) — only volume/weight base units (ml, g) switch to the
// purchase unit (bottles), with the ml amount underneath.
function stockQty(item: UnitInfo, qty: number) {
  return isMeasureUnit(item.baseUnit) && hasPurchaseUnit(item) ? displayQty(item, qty) : displayQty({ baseUnit: item.baseUnit }, qty)
}
function StockQty({ item, qty, className = '' }: { item: UnitInfo; qty: number; className?: string }) {
  const d = stockQty(item, qty)
  return (
    <span className={className}>
      {formatNumber(d.qty, { decimals: 3 })} <span className="text-xs font-normal text-muted-foreground">{d.unit}</span>
      {d.baseQty !== null && d.baseQty !== 0 && (
        <span className="block text-[10px] font-normal text-muted-foreground">{formatNumber(d.baseQty, { decimals: 3 })} {d.baseUnit}</span>
      )}
    </span>
  )
}

// Qty cell, or a faint dash for 0 / not applicable.
function QtyCell({ item, qty, className = '' }: { item: StockRow['item']; qty: number | null | undefined; className?: string }) {
  if (!qty) return <span className="text-muted-foreground/40">—</span>
  return <StockQty item={item} qty={qty} className={className} />
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', PENDING_APPROVAL: 'Pending approval', ON_PROCESS: 'On process',
  ORDERED: 'Ordered', IN_TRANSIT: 'In transit', PARTIALLY_RECEIVED: 'Partly received',
  PENDING: 'Waiting dispatch', APPROVED: 'Reserve approved, not processed yet',
}
// At a warehouse, "low" means what's still FREE (on hand minus what's promised to ships) is under
// Min — the same number the PR stock check shows as Current Stock.
const availableOf = (r: StockRow) => r.replenish ? r.replenish.available : r.qty
const isLowRow = (r: StockRow) => r.item.minStock > 0 && availableOf(r) < r.item.minStock
const qtyText = (item: StockRow['item'], qty: number) => { const d = stockQty(item, qty); return `${formatNumber(d.qty, { decimals: 3 })} ${d.unit}` }
// Native tooltip on a Pending / PO cell: which documents make up the number.
const sourcesTitle = (item: StockRow['item'], sources: ReplenishSource[] | undefined, kinds: ReplenishSource['kind'][]) =>
  (sources ?? []).filter(x => kinds.includes(x.kind)).map(x => `${x.number} · ${qtyText(item, x.qty)} · ${STATUS_LABEL[x.status] ?? x.status}`).join('\n') || undefined

const expiryLabel = (s: string) => {
  const d = new Date(s)
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000)
  const label = formatDate(d)
  if (days < 0) return <span className="text-destructive font-medium">{label} <span className="text-xs">({Math.abs(days)}d ago)</span></span>
  if (days <= 30) return <span className="text-warning font-medium">{label} <span className="text-xs">({days}d)</span></span>
  return <span className="text-muted-foreground">{label}</span>
}

// 10-per-page tablet card view, own pagination per table instance (one per location
// section) — table stays for desktop (lg+), where 8 columns actually fit.
const ITEM_CARD_PAGE_SIZE = 10

function MinCell({ item, isLow }: { item: StockRow['item']; isLow: boolean }) {
  if (!(item.minStock > 0)) return <span className="text-muted-foreground/40">—</span>
  return <span className={isLow ? 'text-destructive font-semibold' : 'text-muted-foreground'}>{qtyText(item, item.minStock)}</span>
}

function StockTable({ rows, locationId, locationName, onOpenLots, onRestock }: {
  rows: StockRow[]; locationId: string; locationName: string
  onOpenLots: (item: StockRow['item'], locationId: string, locationName: string) => void
  /** Opens the Create Purchase Request modal; resolves true once the PR was created. */
  onRestock: (rows: StockRow[], locationId: string, locationName: string) => Promise<boolean>
}) {
  const [cardPage, setCardPage] = useState(1)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // To Be Order / Pending / PO + ordering are warehouse-only (where Min. Stock is kept).
  const isWarehouse = rows.some(r => r.replenish)

  const shown = q.trim()
    ? rows.filter(r => { const t = q.trim().toLowerCase(); return r.item.name.toLowerCase().includes(t) || r.item.sku.toLowerCase().includes(t) })
    : rows
  const totalPages = Math.max(1, Math.ceil(shown.length / ITEM_CARD_PAGE_SIZE))
  const currentPage = Math.min(cardPage, totalPages)
  const pageRows = shown.slice((currentPage - 1) * ITEM_CARD_PAGE_SIZE, currentPage * ITEM_CARD_PAGE_SIZE)

  const selectedRows = rows.filter(r => selected.has(r.item.id))
  const allShownSelected = shown.length > 0 && shown.every(r => selected.has(r.item.id))
  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAllShown = () => setSelected(prev => {
    const n = new Set(prev)
    if (allShownSelected) shown.forEach(r => n.delete(r.item.id)); else shown.forEach(r => n.add(r.item.id))
    return n
  })
  const selectToBeOrder = () => setSelected(new Set(rows.filter(r => (r.replenish?.toBeOrder ?? 0) > 0).map(r => r.item.id)))
  const toBeOrderCount = rows.filter(r => (r.replenish?.toBeOrder ?? 0) > 0).length
  const restock = async (list: StockRow[]) => {
    if (await onRestock(list, locationId, locationName)) setSelected(new Set())
  }
  const orderButton = (row: StockRow, size: 'sm' | 'xs' = 'sm') => (row.replenish?.toBeOrder ?? 0) > 0 && (
    <button
      onClick={e => { e.stopPropagation(); restock([row]) }}
      className={`inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium whitespace-nowrap transition-colors ${size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-6 px-2 text-[11px]'}`}
    >
      <ShoppingCart className="h-3 w-3" /> Order
    </button>
  )

  return (
    <>
      {/* Toolbar: search this location + bulk Create Purchase Request */}
      <div className="flex items-center gap-2 flex-wrap px-4 desktop:px-5 py-2.5 border-b bg-muted/10">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            className="w-full pl-8 pr-7 h-8 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring"
            placeholder="Search item name or SKU…" value={q} onChange={e => { setQ(e.target.value); setCardPage(1) }}
          />
          {q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
        </div>
        {isWarehouse && (
          <div className="flex items-center gap-2 ml-auto">
            {toBeOrderCount > 0 && (
              <button onClick={selectToBeOrder} className="h-8 px-3 text-xs border rounded-md text-muted-foreground hover:bg-muted transition-colors whitespace-nowrap">
                Select all low stock ({toBeOrderCount})
              </button>
            )}
            {selected.size > 0 && (
              <button onClick={() => setSelected(new Set())} className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">Clear</button>
            )}
            <button
              onClick={() => restock(selectedRows)} disabled={selectedRows.length === 0}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <ShoppingCart className="h-3.5 w-3.5" /> Create Purchase Request{selectedRows.length > 0 && ` (${selectedRows.length})`}
            </button>
          </div>
        )}
      </div>

      {shown.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No items match “{q}”.</p>}

      {shown.length > 0 && <div className="hidden desktop:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              {isWarehouse && (
                <th className="pl-5 pr-1 py-2.5 w-8">
                  <input type="checkbox" className="h-4 w-4 accent-primary cursor-pointer align-middle" checked={allShownSelected} onChange={toggleAllShown} aria-label="Select all" />
                </th>
              )}
              <th className="text-left px-5 py-2.5 font-medium">SKU</th>
              <th className="text-left px-5 py-2.5 font-medium">Name</th>
              <th className="text-right px-5 py-2.5 font-medium">Lots</th>
              <th className="text-right px-5 py-2.5 font-medium">Stock</th>
              {isWarehouse && <>
                <th className="text-right px-5 py-2.5 font-medium" title="Promised to a ship, still on the shelf (pending transfer / approved reserve)">Reserved</th>
                <th className="text-right px-5 py-2.5 font-medium" title="Stock − Reserved">Available</th>
              </>}
              <th className="text-right px-5 py-2.5 font-medium">Min</th>
              {isWarehouse && <>
                <th className="text-right px-5 py-2.5 font-medium">To Be Order</th>
                <th className="text-right px-5 py-2.5 font-medium">Pending</th>
                <th className="text-right px-5 py-2.5 font-medium">PO</th>
              </>}
              <th className="text-left px-5 py-2.5 font-medium">Nearest Expiry</th>
              {isWarehouse && <th className="px-5 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map(row => {
              const { item, qty, lotsCount, nearestExpiry, replenish } = row
              const isLow = isLowRow(row)
              const isSel = selected.has(item.id)
              return (
                <tr key={item.id}
                  className={`hover:bg-primary/5 cursor-pointer transition-colors ${isSel ? 'bg-primary/5' : isLow ? 'bg-destructive/5' : ''}`}
                  onClick={() => onOpenLots(item, locationId, locationName)}>
                  {isWarehouse && (
                    <td className="pl-5 pr-1 py-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" className="h-4 w-4 accent-primary cursor-pointer align-middle" checked={isSel} onChange={() => toggle(item.id)} aria-label={`Select ${item.name}`} />
                    </td>
                  )}
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{item.sku}</td>
                  <td className="px-5 py-3">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.category}</p>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted-foreground text-xs">
                    <span className="inline-flex items-center gap-1">
                      {lotsCount}
                      {lotsCount > 1 && <Layers className="h-3 w-3 text-muted-foreground/50" />}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums">
                    <StockQty item={item} qty={qty} />
                  </td>
                  {isWarehouse && <>
                    <td className="px-5 py-3 text-right tabular-nums" title={sourcesTitle(item, replenish?.sources, ['TR', 'HOLD'])}>
                      <QtyCell item={item} qty={replenish?.reserved} className="font-medium text-warning" />
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">
                      <StockQty item={item} qty={replenish?.available ?? qty} />
                    </td>
                  </>}
                  <td className="px-5 py-3 text-right text-xs tabular-nums"><MinCell item={item} isLow={isLow} /></td>
                  {isWarehouse && <>
                    <td className="px-5 py-3 text-right tabular-nums">
                      <QtyCell item={item} qty={replenish?.toBeOrder} className="font-semibold text-destructive" />
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums" title={sourcesTitle(item, replenish?.sources, ['PR'])}>
                      <QtyCell item={item} qty={replenish?.pending} className="font-medium text-warning" />
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums" title={sourcesTitle(item, replenish?.sources, ['PO'])}>
                      <QtyCell item={item} qty={replenish?.po} className="font-medium text-info" />
                    </td>
                  </>}
                  <td className="px-5 py-3 text-sm">
                    {nearestExpiry ? expiryLabel(nearestExpiry) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  {isWarehouse && <td className="px-5 py-3 text-right">{orderButton(row)}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>}

      <div className="desktop:hidden divide-y">
        {pageRows.map(row => {
          const { item, qty, nearestExpiry, replenish } = row
          const isLow = isLowRow(row)
          const isSel = selected.has(item.id)
          return (
            <div key={item.id} role="button" tabIndex={0}
              onClick={() => onOpenLots(item, locationId, locationName)}
              onKeyDown={e => { if (e.key === 'Enter') onOpenLots(item, locationId, locationName) }}
              className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 active:bg-muted/50 transition-colors ${isSel ? 'bg-primary/5' : isLow ? 'bg-destructive/5' : ''}`}>
              {isWarehouse && (
                <input type="checkbox" className="h-4 w-4 mt-0.5 shrink-0 accent-primary cursor-pointer" checked={isSel}
                  onClick={e => e.stopPropagation()} onChange={() => toggle(item.id)} aria-label={`Select ${item.name}`} />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate min-w-0">{item.name}</span>
                  <StockQty item={item} qty={qty} className="text-sm font-semibold tabular-nums shrink-0 text-right" />
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mt-0.5">
                  <span className="truncate min-w-0 font-mono">{item.sku}{nearestExpiry && <> · {expiryLabel(nearestExpiry)}</>}</span>
                  {item.minStock > 0 && <span className="tabular-nums shrink-0">Min <MinCell item={item} isLow={isLow} /></span>}
                </div>
                {replenish && replenish.reserved > 0 && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span>Reserved <QtyCell item={item} qty={replenish.reserved} className="font-medium text-warning" /></span>
                    <span>Available <StockQty item={item} qty={replenish.available} className="font-semibold text-foreground" /></span>
                  </div>
                )}
                {replenish && (replenish.toBeOrder > 0 || replenish.pending > 0 || replenish.po > 0) && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    {replenish.toBeOrder > 0 && <span>To Be Order <QtyCell item={item} qty={replenish.toBeOrder} className="font-semibold text-destructive" /></span>}
                    {replenish.pending > 0 && <span>Pending <QtyCell item={item} qty={replenish.pending} className="font-medium text-warning" /></span>}
                    {replenish.po > 0 && <span>PO <QtyCell item={item} qty={replenish.po} className="font-medium text-info" /></span>}
                    <span className="ml-auto">{orderButton(row, 'xs')}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {totalPages > 1 && (
        <div className="desktop:hidden flex items-center justify-between px-4 py-2.5 border-t bg-muted/10">
          <span className="text-xs text-muted-foreground">{currentPage} / {totalPages}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setCardPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
              className="h-7 px-2.5 text-xs border rounded-md hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Prev</button>
            <button onClick={() => setCardPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
              className="h-7 px-2.5 text-xs border rounded-md hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
          </div>
        </div>
      )}
    </>
  )
}

function NonStockTable({ rows, onOpenPo }: { rows: NonStockRow[]; onOpenPo?: (poId: string) => void }) {
  const [cardPage, setCardPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(rows.length / ITEM_CARD_PAGE_SIZE))
  const currentPage = Math.min(cardPage, totalPages)
  const pageRows = rows.slice((currentPage - 1) * ITEM_CARD_PAGE_SIZE, currentPage * ITEM_CARD_PAGE_SIZE)

  return (
    <>
      <div className="hidden desktop:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-5 py-2.5 font-medium">Item</th>
              <th className="text-right px-5 py-2.5 font-medium">Stock</th>
              <th className="text-left px-5 py-2.5 font-medium">PO No.</th>
              <th className="text-left px-5 py-2.5 font-medium">Arrived</th>
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
                  {formatNumber(r.qty)} <span className="text-xs font-normal text-muted-foreground">{r.unit ?? ''}</span>
                </td>
                <td className="px-5 py-3">
                  {r.poNumber && r.sourcePoId ? (
                    <button
                      onClick={() => onOpenPo?.(r.sourcePoId!)}
                      className="font-mono text-xs text-warning hover:text-warning hover:underline underline-offset-2 transition-colors"
                    >
                      {r.poNumber}
                    </button>
                  ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                </td>
                <td className="px-5 py-3 text-muted-foreground text-xs">{formatDate(r.receivedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="desktop:hidden divide-y">
        {pageRows.map(r => (
          <div key={r.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm truncate min-w-0">{r.itemName}</span>
              <span className="text-sm font-semibold tabular-nums shrink-0">
                {formatNumber(r.qty)} <span className="text-xs font-normal text-muted-foreground">{r.unit ?? ''}</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mt-0.5">
              <span className="truncate min-w-0">
                {r.poNumber && r.sourcePoId ? (
                  <button onClick={() => onOpenPo?.(r.sourcePoId!)} className="font-mono text-warning hover:text-warning hover:underline underline-offset-2 transition-colors">{r.poNumber}</button>
                ) : '—'}
                {' · '}{formatDate(r.receivedAt)}
              </span>
            </div>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="desktop:hidden flex items-center justify-between px-4 py-2.5 border-t bg-muted/10">
          <span className="text-xs text-muted-foreground">{currentPage} / {totalPages}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setCardPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
              className="h-7 px-2.5 text-xs border rounded-md hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Prev</button>
            <button onClick={() => setCardPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
              className="h-7 px-2.5 text-xs border rounded-md hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
          </div>
        </div>
      )}
    </>
  )
}

interface RestockLine { row: StockRow; qty: string; unit: string }
interface RestockDraft { locationId: string; locationName: string; lines: RestockLine[]; notes: string }

// Default order qty = To Be Order, in the same unit the page shows (pcs; bottles for ml items,
// rounded up to whole bottles). The unit picker still lets them order in boxes.
function defaultRestockLine(row: StockRow): RestockLine {
  const { item } = row
  const need = row.replenish?.toBeOrder ?? 0
  if (isMeasureUnit(item.baseUnit) && hasPurchaseUnit(item)) {
    const conv = item.conversionFactor || 1
    return { row, unit: item.purchaseUnit, qty: String(need > 0 ? Math.ceil(need / conv - 1e-9) : 1) }
  }
  return { row, unit: item.baseUnit, qty: String(need > 0 ? Math.ceil(need * 100 - 1e-9) / 100 : 1) }
}

export default function StockPage({ onOpenPo, onOpenRequest, onOpenTransfer }: { onOpenPo?: (poId: string) => void; onOpenRequest?: (requestId: string) => void; onOpenTransfer?: (transferId: string) => void } = {}) {
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

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true)
    const res = await fetch('/api/purchasing/stock')
    if (res.ok) {
      const d: StockData = await res.json()
      setData(d)
    }
    if (!opts.silent) setLoading(false)
  }, [])

  // Create Purchase Request (restock) modal — opened from a table's bulk button or a row's
  // "Order" button; the promise tells the table whether to clear its selection.
  const [restock, setRestock] = useState<RestockDraft | null>(null)
  const [restockSaving, setRestockSaving] = useState(false)
  const restockResolver = useRef<((ok: boolean) => void) | null>(null)
  const openRestock = (rows: StockRow[], locationId: string, locationName: string) => new Promise<boolean>(resolve => {
    restockResolver.current?.(false)
    restockResolver.current = resolve
    setRestock({ locationId, locationName, lines: rows.map(defaultRestockLine), notes: '' })
  })
  const closeRestock = (ok: boolean) => {
    restockResolver.current?.(ok)
    restockResolver.current = null
    setRestock(null)
  }
  const updateRestockLine = (itemId: string, patch: Partial<RestockLine>) =>
    setRestock(r => r && { ...r, lines: r.lines.map(l => l.row.item.id === itemId ? { ...l, ...patch } : l) })
  async function submitRestock() {
    if (!restock || restockSaving) return
    const lines = restock.lines
    if (!lines.length) return
    const bad = lines.find(l => !(Number(l.qty) > 0))
    if (bad) { toast.error(`Quantity for "${bad.row.item.name}" must be greater than 0`); return }
    setRestockSaving(true)
    try {
      const res = await fetch('/api/purchasing/stock/restock-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: restock.locationId,
          notes: restock.notes,
          items: lines.map(l => ({ itemId: l.row.item.id, quantity: Number(l.qty), unit: l.unit })),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'Failed to create purchase request'); return }
      toast.success(`${d.prNumber} sent to Purchasing`, onOpenRequest ? { action: { label: 'Open', onClick: () => onOpenRequest(d.id) } } : undefined)
      closeRestock(true)
      load({ silent: true })
    } finally {
      setRestockSaving(false)
    }
  }

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
        <button onClick={() => load()} className="text-sm border rounded-md px-3 py-2 text-muted-foreground hover:bg-muted transition-colors">Refresh</button>
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
          <div className={`rounded-lg border p-4 ${data.summary.lowStock > 0 ? 'bg-destructive/10 border-destructive/30' : 'bg-card'}`}>
            <p className={`text-xs ${data.summary.lowStock > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>Low Stock</p>
            <p className={`text-2xl font-bold mt-1 ${data.summary.lowStock > 0 ? 'text-destructive' : ''}`}>{data.summary.lowStock}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input className="w-full pl-9 pr-3 h-9 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring" placeholder="Search name, SKU, or PO no…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex rounded-md border overflow-hidden h-9">
          {(['all', 'stock', 'non-stock'] as const).map(k => (
            <button key={k} onClick={() => setItemKind(k)}
              className={`px-3 text-xs font-medium transition-colors ${itemKind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
              {k === 'all' ? 'All Items' : k === 'stock' ? 'Stock Item' : 'Non-Stock Item'}
            </button>
          ))}
        </div>
        {data && data.locations.length > 1 && (
          <select
            className="h-9 border rounded-md px-3 text-sm bg-background focus:ring-1 focus:ring-ring/50 focus:border-ring outline-none"
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
              {stockRows.length > 0 && <StockTable rows={stockRows} locationId={loc.location.id} locationName={loc.location.name} onOpenLots={openLots} onRestock={openRestock} />}
              {stockRows.length > 0 && nonStockRows.length > 0 && (
                <div className="px-5 py-2 bg-muted/30 border-y flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <FileText className="h-3.5 w-3.5" /> Non-Stock Items
                </div>
              )}
              {nonStockRows.length > 0 && <NonStockTable rows={nonStockRows} onOpenPo={onOpenPo} />}
            </>
          )
        }

        if (filterLoc !== 'all') {
          const loc = visibleLocations[0]
          if (!loc) return null
          const lowStockCount = loc.rows.filter((r): r is StockRow => r.kind === 'stock' && isLowRow(r)).length
          const Icon = loc.location.type === 'VESSEL' ? Ship : Warehouse
          return (
            <div className="rounded-xl border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 bg-muted/20 border-b">
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-semibold text-sm">{loc.location.name}</p>
                    <p className="text-xs text-muted-foreground">{loc.rows.length} item{loc.rows.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                {lowStockCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-destructive font-medium">
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
              const lowStockCount = rows.filter((r): r is StockRow => r.kind === 'stock' && isLowRow(r)).length
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
                        <p className="text-xs text-muted-foreground">{rows.length} item{rows.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {lowStockCount > 0 && (
                        <span className="flex items-center gap-1 text-xs text-destructive font-medium">
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

      {/* Create Purchase Request (restock) modal */}
      {restock && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => !restockSaving && closeRestock(false)} />
          <div className="fixed inset-x-0 top-[5vh] mx-auto w-[calc(100%-2rem)] max-w-3xl max-h-[90vh] bg-card rounded-xl shadow-2xl z-50 flex flex-col">
            <div className="flex items-start justify-between px-5 py-4 border-b shrink-0">
              <div>
                <h3 className="font-semibold text-base">Create Purchase Request</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Restock for <span className="font-medium text-foreground">{restock.locationName}</span> · goes straight to Purchasing, no approval needed</p>
              </div>
              <button onClick={() => closeRestock(false)} disabled={restockSaving} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {restock.lines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No items left.</p>
              ) : (
                <div className="divide-y">
                  {restock.lines.map(l => {
                    const { item } = l.row
                    return (
                      <div key={item.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                        <div className="flex-1 min-w-[180px]">
                          <p className="font-medium text-sm">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-mono">{item.sku}</span>
                            {' · '}Available <StockQty item={item} qty={availableOf(l.row)} />
                            {item.minStock > 0 && <> · Min <MinCell item={item} isLow={isLowRow(l.row)} /></>}
                            {(l.row.replenish?.toBeOrder ?? 0) > 0 && <> · To Be Order <StockQty item={item} qty={l.row.replenish!.toBeOrder} className="text-destructive font-semibold" /></>}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input type="number" min={0} step="any" value={l.qty}
                            onChange={e => updateRestockLine(item.id, { qty: e.target.value })}
                            className="w-24 h-8 px-2 text-sm text-right tabular-nums border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring" />
                          {hasPurchaseUnit(item) ? (
                            <select value={l.unit} onChange={e => updateRestockLine(item.id, { unit: e.target.value })}
                              className="h-8 px-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring/50">
                              <option value={item.purchaseUnit}>{item.purchaseUnit}</option>
                              <option value={item.baseUnit}>{item.baseUnit}</option>
                            </select>
                          ) : <span className="text-sm text-muted-foreground w-12">{item.baseUnit}</span>}
                          <button onClick={() => setRestock(r => r && { ...r, lines: r.lines.filter(x => x.row.item.id !== item.id) })}
                            className="h-8 w-8 inline-flex items-center justify-center text-muted-foreground hover:text-destructive" aria-label={`Remove ${item.name}`}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="px-5 py-3 border-t">
                <label className="text-xs text-muted-foreground">Notes (optional)</label>
                <textarea rows={2} value={restock.notes} onChange={e => setRestock(r => r && { ...r, notes: e.target.value })}
                  placeholder={`Restock ${restock.locationName}`}
                  className="mt-1 w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t shrink-0">
              <button onClick={() => closeRestock(false)} disabled={restockSaving} className="h-9 px-4 text-sm border rounded-md hover:bg-muted transition-colors">Cancel</button>
              <button onClick={submitRestock} disabled={restockSaving || restock.lines.length === 0}
                className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                {restockSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                Send to Purchasing ({restock.lines.length})
              </button>
            </div>
          </div>
        </>
      )}

      {/* Lot Register Panel */}
      {lotPanel && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setLotPanel(null)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-card shadow-2xl z-50 flex flex-col">
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
              {(() => {
                // Incoming: the PRs (Pending) / POs behind this item's numbers at this warehouse.
                const row = data?.locations.find(l => l.location.id === lotPanel.locationId)?.rows
                  .find((r): r is StockRow => r.kind === 'stock' && r.item.id === lotPanel.item.id)
                const sources = row?.replenish?.sources ?? []
                if (!sources.length) return null
                const BADGE: Record<ReplenishSource['kind'], { label: string; cls: string }> = {
                  PR: { label: 'Pending', cls: 'bg-warning/10 text-warning' },
                  PO: { label: 'PO', cls: 'bg-info/10 text-info' },
                  TR: { label: 'Transfer', cls: 'bg-orange-500/10 text-orange-600 dark:text-orange-300' },
                  HOLD: { label: 'Approved reserve', cls: 'bg-orange-500/10 text-orange-600 dark:text-orange-300' },
                }
                const open = (src: ReplenishSource) =>
                  src.kind === 'PO' ? onOpenPo?.(src.id) : src.kind === 'TR' ? onOpenTransfer?.(src.id) : onOpenRequest?.(src.id)
                const section = (title: string, list: ReplenishSource[]) => list.length > 0 && (
                  <div className="m-5 mb-0 rounded-lg border overflow-hidden">
                    <div className="px-4 py-2 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</div>
                    <div className="divide-y">
                      {list.map(src => (
                        <div key={`${src.kind}-${src.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                          <div className="min-w-0">
                            <button onClick={() => open(src)}
                              className="font-mono text-xs font-medium hover:underline underline-offset-2 text-primary">{src.number}</button>
                            <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded font-medium ${BADGE[src.kind].cls}`}>{BADGE[src.kind].label}</span>
                            <p className="text-xs text-muted-foreground mt-0.5">{STATUS_LABEL[src.status] ?? src.status} · {formatDate(src.createdAt)}</p>
                          </div>
                          <StockQty item={lotPanel.item} qty={src.qty} className="font-semibold tabular-nums shrink-0 text-right" />
                        </div>
                      ))}
                    </div>
                  </div>
                )
                return <>
                  {section(`Reserved — going out of ${lotPanel.locationName}`, sources.filter(x => x.kind === 'TR' || x.kind === 'HOLD'))}
                  {section(`Incoming to ${lotPanel.locationName}`, sources.filter(x => x.kind === 'PR' || x.kind === 'PO'))}
                </>
              })()}
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
                      {(() => { const t = stockQty(lotPanel.item, lots.reduce((s, l) => s + l.quantity, 0)); return <>
                        <p className="font-bold text-sm sm:text-lg tabular-nums truncate">{formatNumber(t.qty, { decimals: 3 })}</p>
                        <p className="text-xs text-muted-foreground">{t.unit}{t.baseQty !== null && ` · ${formatNumber(t.baseQty, { decimals: 3 })} ${t.baseUnit}`}</p>
                      </> })()}
                    </div>
                    <div className="bg-card px-3 py-3">
                      <p className="text-xs text-muted-foreground">Total Value</p>
                      <p className="font-bold text-sm sm:text-lg tabular-nums truncate">{formatMoney(lots.reduce((s, l) => s + l.quantity * l.costPerUnit, 0))}</p>
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
                        <div key={lot.id} className={`rounded-lg border p-4 ${isExpired ? 'border-destructive/30 bg-destructive/5' : isNearExpiry ? 'border-warning/30 bg-warning/5' : 'bg-card'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-muted-foreground">LOT {idx + 1}</span>
                                {lot.batch && (
                                  <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{lot.batch}</span>
                                )}
                                {isExpired && <span className="text-xs font-semibold text-destructive bg-destructive/15 px-1.5 py-0.5 rounded">EXPIRED</span>}
                                {isNearExpiry && <span className="text-xs font-semibold text-warning bg-warning/15 px-1.5 py-0.5 rounded">NEAR EXPIRY</span>}
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <StockQty item={lotPanel.item} qty={lot.quantity} className="font-semibold tabular-nums" />
                                <span className="text-muted-foreground tabular-nums">@ {formatMoney(displayUnitCost(lotPanel.item, lot.costPerUnit))}</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold tabular-nums">{formatMoney(lot.quantity * lot.costPerUnit)}</p>
                              {lot.expiresAt && (
                                <p className={`text-xs mt-0.5 ${isExpired ? 'text-destructive font-medium' : isNearExpiry ? 'text-warning font-medium' : 'text-muted-foreground'}`}>
                                  Exp: {formatDate(lot.expiresAt)}
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
