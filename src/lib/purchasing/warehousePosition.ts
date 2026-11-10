import type { getDb } from '@/lib/get-db'
import { toBaseQty } from '@/lib/purchasing/transferActions'
import { warehouseHomeLocationId } from '@/lib/purchasing/warehouseHome'

type Db = Awaited<ReturnType<typeof getDb>>

// ONE replenishment position per item + warehouse, all BASE units. Item by Location
// (GET /api/purchasing/stock) and the PR stock check (stockCheck.ts → the PR item modal, and the
// restock qty Process puts on the PR) both read it, so the two screens always show the same
// To Be Order / Pending / PO:
//
//   Demand      = what ships are still owed from this warehouse:
//                   PENDING transfers out (on the shelf, not dispatched yet)
//                 + backorders waiting here for restock
//                 + ship PR lines still waiting for the warehouse check (whole Requested qty,
//                   at their approved source, else the home warehouse, else the one holding most)
//   Pending     = sent to Purchasing, not on a PO yet (open PR lines headed to the warehouse —
//                 a PR delivered to it, or a restock line for it)
//   PO          = on an open PO to it, not received yet
//   To Be Order = Min. Stock + Demand − Stock − Pending − PO   (≥ 0)
//
// So the number moves To Be Order → Pending (restock line / Create Purchase Request) → PO
// (Purchasing converts) → Stock (received), and two ships short on the same item never make
// the warehouse buy twice: the second sees the first one's restock already Pending.

export type PositionSourceKind = 'PR' | 'PO' | 'TR' | 'BACKORDER' | 'REQUEST'
export interface PositionSource { kind: PositionSourceKind; id: string; number: string; status: string; createdAt: Date; qty: number }
export interface WarehousePosition {
  stock: number
  demand: number
  pending: number
  po: number
  minStock: number
  /** Min + Demand − Stock − Pending − PO, unclamped (negative = covered with room to spare). */
  net: number
  toBeOrder: number
  sources: PositionSource[]
}

const OPEN_PR_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'ON_PROCESS'] as const
const OPEN_PO_STATUSES = ['DRAFT', 'ORDERED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'] as const

export const positionKey = (itemId: string, locationId: string) => `${itemId}:${locationId}`

export async function computeWarehousePositions(db: Db, opts: { itemIds?: string[] } = {}) {
  const itemFilter = opts.itemIds ? { in: opts.itemIds } : { not: null }
  const warehouses = await db.stockLocation.findMany({ where: { type: 'WAREHOUSE', isActive: true }, select: { id: true } })
  const whIds = warehouses.map(w => w.id)
  const positions = new Map<string, WarehousePosition>()
  /** Where each undecided ship PR line's demand was counted — stockCheck needs it. */
  const lineSource = new Map<string, string>()
  if (!whIds.length || (opts.itemIds && !opts.itemIds.length)) return { positions, lineSource }

  const [masters, lots, pendingOut, backorders, undecided, prLines, poLines, homeId] = await Promise.all([
    db.purchaseItem.findMany({ where: opts.itemIds ? { id: { in: opts.itemIds } } : {}, select: { id: true, minStock: true, baseUnit: true, purchaseUnit: true, conversionFactor: true } }),
    db.stockLot.findMany({ where: { itemId: itemFilter, locationId: { in: whIds }, quantity: { gt: 0 } }, select: { itemId: true, locationId: true, quantity: true } }),
    db.stockTransferItem.findMany({
      where: { itemId: itemFilter, transfer: { status: 'PENDING', fromLocationId: { in: whIds } } },
      select: { itemId: true, requestedQty: true, transfer: { select: { id: true, transferNumber: true, status: true, createdAt: true, fromLocationId: true } } },
    }),
    db.purchaseRequestItem.findMany({
      where: { itemId: itemFilter, backorderQty: { gt: 0 }, backorderLocationId: { in: whIds }, request: { status: { notIn: ['CANCELLED', 'REJECTED'] } } },
      select: { itemId: true, backorderQty: true, backorderLocationId: true, request: { select: { id: true, prNumber: true, status: true, createdAt: true } } },
    }),
    db.purchaseRequestItem.findMany({
      where: {
        itemId: itemFilter, viaWarehouse: true, warehouseDecision: null, convertedAt: null, verifyRejectedAt: null,
        request: { status: { in: ['DRAFT', 'ON_PROCESS'] }, warehouseDoneAt: null },
      },
      select: { id: true, itemId: true, quantity: true, unit: true, warehouseFromLocationId: true, request: { select: { id: true, prNumber: true, status: true, createdAt: true, deliveryLocationId: true } } },
    }),
    db.purchaseRequestItem.findMany({
      where: {
        itemId: itemFilter, convertedAt: null, verifyRejectedAt: null,
        request: { status: { in: [...OPEN_PR_STATUSES] } },
        OR: [{ restockLocationId: { in: whIds } }, { restockLocationId: null, request: { deliveryLocationId: { in: whIds } } }],
      },
      select: { itemId: true, quantity: true, unit: true, restockLocationId: true, request: { select: { id: true, prNumber: true, status: true, createdAt: true, deliveryLocationId: true } } },
    }),
    db.purchaseOrderItem.findMany({
      where: { itemId: itemFilter, order: { status: { in: [...OPEN_PO_STATUSES] }, deliveryLocationId: { in: whIds } } },
      select: { itemId: true, orderedQty: true, receivedQty: true, order: { select: { id: true, poNumber: true, status: true, createdAt: true, deliveryLocationId: true } } },
    }),
    warehouseHomeLocationId(db),
  ])

  const masterMap = new Map(masters.map(m => [m.id, m]))
  const pos = (itemId: string, locationId: string) => {
    const key = positionKey(itemId, locationId)
    let p = positions.get(key)
    if (!p) {
      p = { stock: 0, demand: 0, pending: 0, po: 0, minStock: masterMap.get(itemId)?.minStock ?? 0, net: 0, toBeOrder: 0, sources: [] }
      positions.set(key, p)
    }
    return p
  }
  const addSource = (p: WarehousePosition, src: PositionSource) => {
    const same = p.sources.find(x => x.kind === src.kind && x.id === src.id)
    if (same) same.qty += src.qty; else p.sources.push(src)
  }

  for (const l of lots) if (l.itemId) pos(l.itemId, l.locationId).stock += l.quantity
  for (const t of pendingOut) {
    if (!t.itemId) continue
    const p = pos(t.itemId, t.transfer.fromLocationId)
    p.demand += t.requestedQty // transfer qty is already base units
    addSource(p, { kind: 'TR', id: t.transfer.id, number: t.transfer.transferNumber, status: t.transfer.status, createdAt: t.transfer.createdAt, qty: t.requestedQty })
  }
  for (const b of backorders) {
    if (!b.itemId || !b.backorderLocationId) continue
    const p = pos(b.itemId, b.backorderLocationId)
    p.demand += b.backorderQty
    addSource(p, { kind: 'BACKORDER', id: b.request.id, number: b.request.prNumber, status: b.request.status, createdAt: b.request.createdAt, qty: b.backorderQty })
  }
  for (const l of undecided) {
    if (!l.itemId) continue
    const candidates = whIds.filter(id => id !== l.request.deliveryLocationId)
    const source = l.warehouseFromLocationId
      ?? (homeId && candidates.includes(homeId) ? homeId : null)
      ?? [...candidates].sort((a, b) => (positions.get(positionKey(l.itemId!, b))?.stock ?? 0) - (positions.get(positionKey(l.itemId!, a))?.stock ?? 0))[0]
    if (!source) continue
    lineSource.set(l.id, source)
    const qty = toBaseQty(l.quantity, l.unit, masterMap.get(l.itemId))
    const p = pos(l.itemId, source)
    p.demand += qty
    addSource(p, { kind: 'REQUEST', id: l.request.id, number: l.request.prNumber, status: l.request.status, createdAt: l.request.createdAt, qty })
  }
  for (const l of prLines) {
    const to = l.restockLocationId ?? l.request.deliveryLocationId
    if (!l.itemId || !to) continue
    const qty = toBaseQty(l.quantity, l.unit, masterMap.get(l.itemId))
    const p = pos(l.itemId, to)
    p.pending += qty
    addSource(p, { kind: 'PR', id: l.request.id, number: l.request.prNumber, status: l.request.status, createdAt: l.request.createdAt, qty })
  }
  for (const l of poLines) {
    if (!l.itemId || !l.order.deliveryLocationId) continue
    // PO lines are in purchase units — receiveGoods() multiplies by conversionFactor too.
    const qty = Math.max(0, l.orderedQty - l.receivedQty) * (masterMap.get(l.itemId)?.conversionFactor || 1)
    if (qty <= 0) continue
    const p = pos(l.itemId, l.order.deliveryLocationId)
    p.po += qty
    addSource(p, { kind: 'PO', id: l.order.id, number: l.order.poNumber, status: l.order.status, createdAt: l.order.createdAt, qty })
  }
  for (const p of positions.values()) {
    p.net = Math.round((p.minStock + p.demand - p.stock - p.pending - p.po) * 1000) / 1000
    p.toBeOrder = Math.max(0, p.net)
  }
  return { positions, lineSource }
}
