import type { getDb } from '@/lib/get-db'
import { toBaseQty } from '@/lib/purchasing/transferActions'
import { warehouseHomeLocationId } from '@/lib/purchasing/warehouseHome'

type Db = Awaited<ReturnType<typeof getDb>>

// ONE replenishment position per item + warehouse, all BASE units — every PR / PO / TR combined.
// Only Item by Location (GET /api/purchasing/stock) shows it; PR screens deliberately stay per
// request (stockCheck.ts):
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
//   Requested   = the FULL qty of every ship PR line still open here (it has a pending transfer,
//                 a backorder, or waits for the warehouse check) — stays the same while the line
//                 is filled batch by batch ("merge cell", user 2026-11-12); Demand is what's left
//   Reserve     = held on the shelf now: PENDING transfers out + Reserves Warehouse approved on
//                 lines not processed yet (approvedHolds.ts). A backorder is NOT Reserve — it's
//                 the part that has to be ordered
//   Received    = the part of still-open POs to it that already arrived (GR, now in Stock)
//
// So the number moves To Be Order → Pending (restock line / Create Purchase Request) → PO
// (Purchasing converts) → Stock (received).

export type PositionSourceKind = 'PR' | 'PO' | 'TR' | 'BACKORDER' | 'REQUEST'
export interface PositionSource { kind: PositionSourceKind; id: string; number: string; status: string; createdAt: Date; qty: number }
export interface WarehousePosition {
  stock: number
  demand: number
  /** Full qty of the open ship PR lines behind Demand (doesn't shrink as batches ship). */
  requested: number
  /** Of Demand, what is already held from stock (pending TRs out + approved Reserves). */
  reserve: number
  pending: number
  po: number
  /** Already received (GR) on POs to this warehouse that are still open. */
  received: number
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
      select: { itemId: true, requestedQty: true, transfer: { select: { id: true, transferNumber: true, status: true, createdAt: true, fromLocationId: true, purchaseRequestId: true } } },
    }),
    db.purchaseRequestItem.findMany({
      where: { itemId: itemFilter, backorderQty: { gt: 0 }, backorderLocationId: { in: whIds }, request: { status: { notIn: ['CANCELLED', 'REJECTED'] } } },
      select: { id: true, itemId: true, quantity: true, unit: true, backorderQty: true, backorderLocationId: true, request: { select: { id: true, prNumber: true, status: true, createdAt: true } } },
    }),
    db.purchaseRequestItem.findMany({
      where: {
        itemId: itemFilter, viaWarehouse: true, warehouseDecision: null, convertedAt: null, verifyRejectedAt: null,
        request: { status: { in: ['DRAFT', 'ON_PROCESS'] }, warehouseDoneAt: null },
      },
      select: { id: true, itemId: true, quantity: true, unit: true, warehouseFromLocationId: true, warehouseApprovedAt: true, warehouseReserveQty: true, request: { select: { id: true, prNumber: true, status: true, createdAt: true, deliveryLocationId: true } } },
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
      p = { stock: 0, demand: 0, requested: 0, reserve: 0, pending: 0, po: 0, received: 0, minStock: masterMap.get(itemId)?.minStock ?? 0, net: 0, toBeOrder: 0, sources: [] }
      positions.set(key, p)
    }
    return p
  }
  const addSource = (p: WarehousePosition, src: PositionSource) => {
    const same = p.sources.find(x => x.kind === src.kind && x.id === src.id)
    if (same) same.qty += src.qty; else p.sources.push(src)
  }

  // Requested counts each open ship PR line's full qty once per warehouse.
  const counted = new Set<string>()
  const addRequested = (p: WarehousePosition, key: string, lineId: string, qty: number) => {
    if (counted.has(`${key}|${lineId}`)) return
    counted.add(`${key}|${lineId}`)
    p.requested += qty
  }
  // The PR lines a pending transfer ships (same PR + item); a transfer without one counts itself.
  const trRequestIds = [...new Set(pendingOut.map(t => t.transfer.purchaseRequestId).filter((x): x is string => !!x))]
  const trLines = trRequestIds.length ? await db.purchaseRequestItem.findMany({
    where: { requestId: { in: trRequestIds }, itemId: itemFilter, restockLocationId: null, verifyRejectedAt: null },
    select: { id: true, requestId: true, itemId: true, quantity: true, unit: true },
  }) : []

  for (const l of lots) if (l.itemId) pos(l.itemId, l.locationId).stock += l.quantity
  for (const t of pendingOut) {
    if (!t.itemId) continue
    const p = pos(t.itemId, t.transfer.fromLocationId)
    const key = positionKey(t.itemId, t.transfer.fromLocationId)
    p.demand += t.requestedQty // transfer qty is already base units
    p.reserve += t.requestedQty
    const lines = trLines.filter(l => l.requestId === t.transfer.purchaseRequestId && l.itemId === t.itemId)
    if (lines.length) for (const l of lines) addRequested(p, key, l.id, toBaseQty(l.quantity, l.unit, masterMap.get(t.itemId)))
    else addRequested(p, key, `TR:${t.transfer.id}`, t.requestedQty)
    addSource(p, { kind: 'TR', id: t.transfer.id, number: t.transfer.transferNumber, status: t.transfer.status, createdAt: t.transfer.createdAt, qty: t.requestedQty })
  }
  for (const b of backorders) {
    if (!b.itemId || !b.backorderLocationId) continue
    const p = pos(b.itemId, b.backorderLocationId)
    p.demand += b.backorderQty
    addRequested(p, positionKey(b.itemId, b.backorderLocationId), b.id, toBaseQty(b.quantity, b.unit, masterMap.get(b.itemId)))
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
    addRequested(p, positionKey(l.itemId, source), l.id, qty)
    // Approved Reserve = a hold on the shelf already (same rule as approvedHolds.ts).
    if (l.warehouseApprovedAt && l.warehouseFromLocationId === source && (l.warehouseReserveQty ?? 0) > 0) p.reserve += Math.min(qty, l.warehouseReserveQty!)
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
    const conv = masterMap.get(l.itemId)?.conversionFactor || 1
    const qty = Math.max(0, l.orderedQty - l.receivedQty) * conv
    if (l.receivedQty > 0) pos(l.itemId, l.order.deliveryLocationId).received += Math.min(l.receivedQty, l.orderedQty) * conv
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
