import type { getDb } from '@/lib/get-db'
import { toBaseQty } from '@/lib/purchasing/transferActions'

type Db = Awaited<ReturnType<typeof getDb>>

// Warehouse's stock breakdown for a PR line, all in BASE units, against the source warehouse
// (where the line waits on backorder / was transferred from, else the warehouse — not the PR's
// destination — holding the most of it). Mirrors the Warehouse's own order sheet:
//   Availability = stock there − what OTHER requests already reserved (PENDING transfers out)
//   Reserve      = this order's share of it: what it was given (its own PENDING transfer), the
//                  Reserve Warehouse approved, or while still undecided min(Requested, Availability)
//   Ending       = Availability − Reserve (never negative)
//   Shortage     = the part stock can't cover → backordered, shipped once restock lands
//   On Order     = incoming to that warehouse (open PR lines / POs to it) not already promised
//                  to another PR's backorder
//   To Be Order  = (Requested − Availability) + Min. Stock − On Order, written as Shortage +
//                  Min. Stock − Ending − On Order so it keeps using the stock as it was when the
//                  line was decided (Availability drops once its transfer is dispatched). Never
//                  below Shortage − On Order: the backorder must be covered by what's coming in.
// PURCHASE (legacy — lines from before every shortfall went through the warehouse) takes nothing
// from stock: its Requested was bought on its own line, so only the Min. Stock top-up goes on the
// Restock PR (restockQty). New lines are always TRANSFER: Reserve 0 is a full backorder.
export interface StockCheck {
  locationId: string
  locationName: string
  requested: number
  availability: number
  reserve: number
  onOrder: number
  ending: number
  shortage: number
  minStock: number
  toBeOrder: number
  restockQty: number
}

const OPEN_PR_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'ON_PROCESS'] as const
const OPEN_PO_STATUSES = ['DRAFT', 'ORDERED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'] as const

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

  const [masters, warehouses, lots, pendingOut, openPrLines, openPoLines, otherBackorders] = await Promise.all([
    db.purchaseItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, minStock: true, baseUnit: true, purchaseUnit: true, conversionFactor: true } }),
    db.stockLocation.findMany({ where: { type: 'WAREHOUSE', isActive: true }, select: { id: true, name: true } }),
    db.stockLot.findMany({ where: { itemId: { in: itemIds }, quantity: { gt: 0 } }, select: { itemId: true, locationId: true, quantity: true } }),
    // Reserved = accepted for a transfer but not yet dispatched (StockLot only drops on dispatch).
    db.stockTransferItem.findMany({
      where: { itemId: { in: itemIds }, transfer: { status: 'PENDING' } },
      select: { itemId: true, requestedQty: true, transfer: { select: { fromLocationId: true, purchaseRequestId: true } } },
    }),
    // On Order, part 1: PR lines headed to a warehouse (a PR to it, or another PR's restock line),
    // not yet turned into a PO. This PR's own restock lines (and legacy Restock PRs) are left out
    // so its To Be Order still shows what it triggered.
    db.purchaseRequestItem.findMany({
      where: {
        itemId: { in: itemIds }, convertedAt: null, verifyRejectedAt: null,
        OR: [{ restockLocationId: { not: null } }, { request: { deliveryLocation: { type: 'WAREHOUSE' } } }],
        request: {
          status: { in: [...OPEN_PR_STATUSES] }, id: { not: request.id },
          OR: [{ restockForRequestId: null }, { restockForRequestId: { not: request.id } }],
        },
      },
      select: { itemId: true, quantity: true, unit: true, restockLocationId: true, request: { select: { deliveryLocationId: true } } },
    }),
    // On Order, part 2: open PO lines to a warehouse, minus what's already been received.
    db.purchaseOrderItem.findMany({
      where: {
        itemId: { in: itemIds },
        order: {
          status: { in: [...OPEN_PO_STATUSES] }, deliveryLocation: { type: 'WAREHOUSE' },
          OR: [{ requestId: null }, { requestId: { not: request.id }, request: { OR: [{ restockForRequestId: null }, { restockForRequestId: { not: request.id } }] } }],
        },
      },
      select: { itemId: true, orderedQty: true, receivedQty: true, order: { select: { deliveryLocationId: true } } },
    }),
    // Other PRs already waiting on that incoming stock — it isn't free for this one.
    db.purchaseRequestItem.findMany({
      where: { itemId: { in: itemIds }, backorderQty: { gt: 0 }, backorderLocationId: { not: null }, requestId: { not: request.id }, request: { status: { notIn: ['CANCELLED', 'REJECTED'] } } },
      select: { itemId: true, backorderQty: true, backorderLocationId: true },
    }),
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
  const onOrderMap = new Map<string, number>()
  for (const l of openPrLines) {
    const to = l.restockLocationId ?? l.request.deliveryLocationId
    if (!l.itemId || !to) continue
    add(onOrderMap, `${l.itemId}:${to}`, toBaseQty(l.quantity, l.unit, masterMap.get(l.itemId)))
  }
  for (const l of openPoLines) {
    if (!l.itemId || !l.order.deliveryLocationId) continue
    // PO lines are always in purchase units — receiveGoods() multiplies by conversionFactor too.
    add(onOrderMap, `${l.itemId}:${l.order.deliveryLocationId}`, Math.max(0, l.orderedQty - l.receivedQty) * (masterMap.get(l.itemId)?.conversionFactor || 1))
  }
  for (const b of otherBackorders) if (b.itemId) add(onOrderMap, `${b.itemId}:${b.backorderLocationId}`, -b.backorderQty)

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
      ?? [...candidates].sort((a, b) => freeAt(item.itemId!, b) - freeAt(item.itemId!, a))[0]
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
    const onOrder = Math.max(0, onOrderMap.get(key) ?? 0)
    // Restock already on its way counts — two ships short on the same item must not each buy the
    // Min. Stock top-up again. Still never less than the Shortage it can't cover: a backorder
    // only ships once restock lands, so Warehouse holding stock back (Reserve below what's free)
    // must not leave it with nothing to buy.
    const toBeOrder = Math.max(0, shortage - onOrder, shortage + master.minStock - ending - onOrder)

    checks.set(item.id, {
      locationId: sourceId,
      locationName: whName.get(sourceId) ?? '—',
      requested, availability, reserve, onOrder, ending, shortage,
      minStock: master.minStock,
      toBeOrder,
      restockQty: Math.max(0, toBeOrder - (item.warehouseDecision === 'PURCHASE' ? requested : 0)),
    })
  }
  return { checks, reservedMap }
}
