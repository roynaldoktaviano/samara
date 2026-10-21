import type { getDb } from '@/lib/get-db'
import { toBaseQty } from '@/lib/purchasing/transferActions'

type Db = Awaited<ReturnType<typeof getDb>>

// Warehouse's stock breakdown for a PR line, all in BASE units, against the source
// warehouse (the one the line was transferred from, else the warehouse — not the PR's
// destination — holding the most of it):
//   Ending      = Availability − Reserve − Requested (Requested only while still undecided /
//                 bought; once transferred it's inside Reserve or already out of the StockLot)
//   Shortage    = −Ending when negative
//   To Be Order = Min. Stock − Ending − On Order (≥ 0) — tops the warehouse back up to Min.
//                 Stock, net of what's already on its way there so two PRs don't double-order.
// The part of To Be Order not already bought on this PR's own line (decision PURCHASE buys
// the vessel's Requested directly) becomes `restockQty`, ordered via an auto Restock PR.
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
  items: { id: string; itemId: string | null; quantity: number; unit: string; convertedAt: Date | null; convertedPoId: string | null; warehouseDecision: string | null; verifyRejectedAt: Date | null }[]
  transfers: { id: string; status: string; fromLocationId: string; items: { itemId: string | null }[] }[]
}

export async function computeStockChecks(db: Db, request: StockCheckRequest) {
  const itemIds = [...new Set(request.items.map(i => i.itemId).filter(Boolean) as string[])]
  const checks = new Map<string, StockCheck>() // key: PR item id
  const reservedMap = new Map<string, number>() // key: `${itemId}:${locationId}`
  if (!itemIds.length) return { checks, reservedMap }

  const [masters, warehouses, lots, pendingOut, openPrLines, openPoLines] = await Promise.all([
    db.purchaseItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, minStock: true, baseUnit: true, purchaseUnit: true, conversionFactor: true, isStockTracked: true } }),
    db.stockLocation.findMany({ where: { type: 'WAREHOUSE', isActive: true }, select: { id: true, name: true } }),
    db.stockLot.findMany({ where: { itemId: { in: itemIds }, quantity: { gt: 0 } }, select: { itemId: true, locationId: true, quantity: true } }),
    // Reserve: accepted for a transfer (any PR, this one included) but not yet dispatched —
    // a PENDING transfer only deducts its StockLot on dispatch.
    db.stockTransferItem.findMany({
      where: { itemId: { in: itemIds }, transfer: { status: 'PENDING' } },
      select: { itemId: true, requestedQty: true, transfer: { select: { fromLocationId: true } } },
    }),
    // On Order, part 1: PR lines headed to a warehouse, not yet turned into a PO. This PR's
    // own Restock PRs are left out so its To Be Order still shows what it triggered.
    db.purchaseRequestItem.findMany({
      where: {
        itemId: { in: itemIds }, convertedAt: null, verifyRejectedAt: null,
        request: {
          status: { in: [...OPEN_PR_STATUSES] }, id: { not: request.id }, deliveryLocation: { type: 'WAREHOUSE' },
          OR: [{ restockForRequestId: null }, { restockForRequestId: { not: request.id } }],
        },
      },
      select: { itemId: true, quantity: true, unit: true, request: { select: { deliveryLocationId: true } } },
    }),
    // On Order, part 2: open PO lines to a warehouse, minus what's already been received.
    db.purchaseOrderItem.findMany({
      where: {
        itemId: { in: itemIds },
        order: {
          status: { in: [...OPEN_PO_STATUSES] }, deliveryLocation: { type: 'WAREHOUSE' },
          OR: [{ requestId: null }, { request: { OR: [{ restockForRequestId: null }, { restockForRequestId: { not: request.id } }] } }],
        },
      },
      select: { itemId: true, orderedQty: true, receivedQty: true, order: { select: { deliveryLocationId: true } } },
    }),
  ])

  const masterMap = new Map(masters.map(m => [m.id, m]))
  const whName = new Map(warehouses.map(w => [w.id, w.name]))
  const add = (map: Map<string, number>, key: string, qty: number) => map.set(key, (map.get(key) ?? 0) + qty)

  const stockMap = new Map<string, number>()
  for (const l of lots) if (l.itemId) add(stockMap, `${l.itemId}:${l.locationId}`, l.quantity)
  for (const r of pendingOut) if (r.itemId) add(reservedMap, `${r.itemId}:${r.transfer.fromLocationId}`, r.requestedQty)
  const onOrderMap = new Map<string, number>()
  for (const l of openPrLines) {
    if (!l.itemId || !l.request.deliveryLocationId) continue
    add(onOrderMap, `${l.itemId}:${l.request.deliveryLocationId}`, toBaseQty(l.quantity, l.unit, masterMap.get(l.itemId)))
  }
  for (const l of openPoLines) {
    if (!l.itemId || !l.order.deliveryLocationId) continue
    // PO lines are always in purchase units — receiveGoods() multiplies by conversionFactor too.
    const outstanding = Math.max(0, l.orderedQty - l.receivedQty) * (masterMap.get(l.itemId)?.conversionFactor || 1)
    add(onOrderMap, `${l.itemId}:${l.order.deliveryLocationId}`, outstanding)
  }

  const candidates = warehouses.map(w => w.id).filter(id => id !== request.deliveryLocationId)
  for (const item of request.items) {
    if (!item.itemId || item.verifyRejectedAt) continue
    const master = masterMap.get(item.itemId)
    if (!master || !master.isStockTracked) continue
    const tr = item.convertedAt && !item.convertedPoId
      ? request.transfers.find(t => t.items.some(ti => ti.itemId === item.itemId))
      : null
    const sourceId = tr?.fromLocationId
      ?? [...candidates].sort((a, b) => (stockMap.get(`${item.itemId}:${b}`) ?? 0) - (stockMap.get(`${item.itemId}:${a}`) ?? 0))[0]
    if (!sourceId) continue

    const key = `${item.itemId}:${sourceId}`
    const requested = toBaseQty(item.quantity, item.unit, master)
    const availability = stockMap.get(key) ?? 0
    const reserve = reservedMap.get(key) ?? 0
    const onOrder = onOrderMap.get(key) ?? 0
    const ending = availability - reserve - (tr ? 0 : requested)
    const toBeOrder = Math.max(0, master.minStock - ending - onOrder)
    checks.set(item.id, {
      locationId: sourceId,
      locationName: whName.get(sourceId) ?? '—',
      requested, availability, reserve, onOrder, ending,
      shortage: ending < 0 ? -ending : 0,
      minStock: master.minStock,
      toBeOrder,
      restockQty: Math.max(0, toBeOrder - (item.warehouseDecision === 'PURCHASE' ? requested : 0)),
    })
  }
  return { checks, reservedMap }
}
