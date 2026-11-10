import type { getDb } from '@/lib/get-db'
import { toBaseQty } from '@/lib/purchasing/transferActions'
import { approvedHolds } from '@/lib/purchasing/approvedHolds'
import { computeWarehousePositions } from '@/lib/purchasing/warehousePosition'

type Db = Awaited<ReturnType<typeof getDb>>

// Warehouse's stock breakdown for a PR line, all in BASE units, against the source warehouse
// (where the line waits on backorder / was transferred from, else the warehouse — not the PR's
// destination — holding the most of it). Mirrors the Warehouse's own order sheet:
//   On Hand      = stock on the shelf there (Item by Location's Stock column)
//   Availability = stock there − what OTHER requests already reserved (PENDING transfers out,
//                  and Reserves Warehouse approved but hasn't processed yet — approvedHolds.ts)
//   Reserve      = this order's share of it: what it was given (its own PENDING transfer), the
//                  Reserve Warehouse approved, or while still undecided min(Requested, Availability)
//   Ending       = Availability − Reserve (never negative)
//   Shortage     = the part stock can't cover → backordered, shipped once restock lands
//   To Be Order / Pending / PO = the WAREHOUSE-level position (warehousePosition.ts), identical
//                  to Item by Location: Min + Demand (every ship's claim on that warehouse,
//                  this line included) − Stock − Pending − PO. It doesn't depend on how much
//                  this line reserves — a smaller Reserve only turns stock into backorder.
//   On Order     = Pending + PO (kept for older callers)
//   restockQty   = what Process puts on this PR's restock line = To Be Order at that moment.
// PURCHASE (legacy — lines bought straight to the ship) isn't warehouse demand at all.
export interface StockCheck {
  locationId: string
  locationName: string
  requested: number
  /** On the shelf at the source warehouse — the same number as Item by Location's Stock column. */
  onHand: number
  availability: number
  reserve: number
  onOrder: number
  pending: number
  po: number
  ending: number
  shortage: number
  minStock: number
  toBeOrder: number
  restockQty: number
}


export interface StockCheckRequest {
  id: string
  deliveryLocationId: string | null
  items: {
    id: string; itemId: string | null; quantity: number; unit: string
    convertedAt: Date | null; convertedPoId: string | null; warehouseDecision: string | null; verifyRejectedAt: Date | null
    backorderQty: number; backorderLocationId: string | null; viaWarehouse: boolean
    warehouseReserveQty?: number | null; warehouseFromLocationId?: string | null
  }[]
  transfers: { id: string; status: string; fromLocationId: string; items: { itemId: string | null; requestedQty: number }[] }[]
}

// preferredSourceId: the warehouse to check against when the line has no source of its own yet
// (no backorder / transfer / approval) — the WAREHOUSE role's home warehouse (warehouseHome.ts).
export async function computeStockChecks(db: Db, request: StockCheckRequest, opts: { preferredSourceId?: string | null } = {}) {
  const itemIds = [...new Set(request.items.map(i => i.itemId).filter(Boolean) as string[])]
  const checks = new Map<string, StockCheck>() // key: PR item id
  const reservedMap = new Map<string, number>() // ALL pending reservations, key `${itemId}:${locationId}`
  if (!itemIds.length) return { checks, reservedMap }

  const [masters, warehouses, lots, pendingOut, { positions, lineSource }, { byRequest: holds }] = await Promise.all([
    db.purchaseItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, minStock: true, baseUnit: true, purchaseUnit: true, conversionFactor: true } }),
    db.stockLocation.findMany({ where: { type: 'WAREHOUSE', isActive: true }, select: { id: true, name: true } }),
    db.stockLot.findMany({ where: { itemId: { in: itemIds }, quantity: { gt: 0 } }, select: { itemId: true, locationId: true, quantity: true } }),
    // Reserved = accepted for a transfer but not yet dispatched (StockLot only drops on dispatch).
    db.stockTransferItem.findMany({
      where: { itemId: { in: itemIds }, transfer: { status: 'PENDING' } },
      select: { itemId: true, requestedQty: true, transfer: { select: { fromLocationId: true, purchaseRequestId: true } } },
    }),
    computeWarehousePositions(db, { itemIds }),
    // Warehouse-approved Reserves not processed yet — held from the moment of Approve.
    approvedHolds(db, { itemIds }),
  ])

  const masterMap = new Map(masters.map(m => [m.id, m]))
  const whName = new Map(warehouses.map(w => [w.id, w.name]))
  const add = (map: Map<string, number>, key: string, qty: number) => map.set(key, (map.get(key) ?? 0) + qty)

  const stockMap = new Map<string, number>()
  for (const l of lots) if (l.itemId) add(stockMap, `${l.itemId}:${l.locationId}`, l.quantity)
  const othersReserved = new Map<string, number>()
  for (const r of pendingOut) {
    if (!r.itemId) continue
    const key = `${r.itemId}:${r.transfer.fromLocationId}`
    add(reservedMap, key, r.requestedQty)
    if (r.transfer.purchaseRequestId !== request.id) add(othersReserved, key, r.requestedQty)
  }
  for (const h of holds) {
    add(reservedMap, h.key, h.qty)
    if (h.requestId !== request.id) add(othersReserved, h.key, h.qty)
  }
  const candidates = warehouses.map(w => w.id).filter(id => id !== request.deliveryLocationId)
  // Free stock = on hand minus what other requests already reserved there — the default source
  // is where the most of it is FREE, not merely on the shelf (that can all be promised already).
  const freeAt = (itemId: string, locationId: string) =>
    (stockMap.get(`${itemId}:${locationId}`) ?? 0) - (othersReserved.get(`${itemId}:${locationId}`) ?? 0)
  for (const item of request.items) {
    // Direct-to-Purchasing lines never touch warehouse stock — nothing to break down.
    if (!item.itemId || item.verifyRejectedAt || !item.viaWarehouse) continue
    // Non-stock items are checked too — they ship from the warehouse like any other.
    const master = masterMap.get(item.itemId)
    if (!master) continue

    const ownTransfers = request.transfers.filter(t => t.status !== 'CANCELLED' && t.items.some(ti => ti.itemId === item.itemId))
    const sourceId = item.backorderLocationId
      ?? ownTransfers[0]?.fromLocationId
      ?? item.warehouseFromLocationId
      ?? (opts.preferredSourceId && candidates.includes(opts.preferredSourceId) ? opts.preferredSourceId : null)
      // Most FREE stock first; on a tie (typically all 0 because everything on the shelf is
      // already reserved) the warehouse actually holding it wins — not just the first in the list.
      ?? [...candidates].sort((a, b) =>
        (freeAt(item.itemId!, b) - freeAt(item.itemId!, a))
        || ((stockMap.get(`${item.itemId}:${b}`) ?? 0) - (stockMap.get(`${item.itemId}:${a}`) ?? 0)))[0]
    if (!sourceId) continue

    const key = `${item.itemId}:${sourceId}`
    const requested = toBaseQty(item.quantity, item.unit, master)
    const availability = Math.max(0, (stockMap.get(key) ?? 0) - (othersReserved.get(key) ?? 0))
    const accepted = item.warehouseDecision === 'TRANSFER' && !!item.convertedAt
    const ownPending = ownTransfers
      .filter(t => t.status === 'PENDING' && t.fromLocationId === sourceId)
      .reduce((s, t) => s + t.items.filter(ti => ti.itemId === item.itemId).reduce((a, ti) => a + ti.requestedQty, 0), 0)

    let reserve: number, shortage: number
    if (accepted) { reserve = ownPending; shortage = item.backorderQty }
    else if (item.warehouseDecision === 'PURCHASE') { reserve = 0; shortage = requested }
    // Approved, not processed yet: Warehouse's own Reserve (capped at what's free now).
    else if (item.warehouseReserveQty != null && item.warehouseFromLocationId === sourceId) {
      reserve = Math.min(item.warehouseReserveQty, availability); shortage = Math.max(0, requested - reserve)
    }
    else { reserve = Math.min(requested, availability); shortage = requested - reserve }
    const ending = Math.max(0, availability - reserve)
    // Warehouse-level position — the same numbers Item by Location shows. An undecided line's
    // demand is counted at its default source; if this check runs against another warehouse
    // (Admin picked it), move the line's claim there.
    const position = positions.get(key)
    const undecided = item.viaWarehouse && !item.warehouseDecision && !item.convertedAt
    const ownMoved = undecided && lineSource.get(item.id) !== sourceId ? requested : 0
    const net = (position?.net ?? master.minStock - (stockMap.get(key) ?? 0)) + ownMoved
    const toBeOrder = Math.max(0, Math.round(net * 1000) / 1000)
    const pendingIn = position?.pending ?? 0
    const poIn = position?.po ?? 0
    const onOrder = pendingIn + poIn

    checks.set(item.id, {
      locationId: sourceId,
      locationName: whName.get(sourceId) ?? '—',
      requested, onHand: stockMap.get(key) ?? 0, availability, reserve, onOrder, pending: pendingIn, po: poIn, ending, shortage,
      minStock: master.minStock,
      toBeOrder,
      restockQty: toBeOrder,
    })
  }
  return { checks, reservedMap }
}
