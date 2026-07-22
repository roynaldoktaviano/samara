import { Prisma } from '@prisma/client'
import { getDb } from '@/lib/get-db'

type Db = Awaited<ReturnType<typeof getDb>>
type DbOrTx = Db | Prisma.TransactionClient

async function generateTransitTrNumber(db: DbOrTx) {
  const prefix = `TR-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-`
  const last = await db.stockTransfer.findFirst({ where: { transferNumber: { startsWith: prefix } }, orderBy: { transferNumber: 'desc' }, select: { transferNumber: true } })
  const seq = last ? (parseInt(last.transferNumber.split('-').pop() ?? '0') || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

/** Ordered [stop1, stop2, ..., stopN, deliveryLocationId] for a PO's shipping route, or null if the PO has no delivery location. */
export async function getRouteLocationIds(db: DbOrTx, orderId: string): Promise<string[] | null> {
  const po = await db.purchaseOrder.findUnique({
    where: { id: orderId },
    select: { deliveryLocationId: true, transitStops: { orderBy: { sequence: 'asc' }, select: { locationId: true } } },
  })
  if (!po?.deliveryLocationId) return null
  return [...po.transitStops.map(s => s.locationId), po.deliveryLocationId]
}

/** Where the next leg of the route should go after arriving at `currentLocationId`, or null if that was the final stop. */
export function resolveNextHop(routeLocationIds: string[], currentLocationId: string): string | null {
  const idx = routeLocationIds.indexOf(currentLocationId)
  if (idx >= 0 && idx < routeLocationIds.length - 1) return routeLocationIds[idx + 1]
  return null
}

/**
 * Auto-creates the next StockTransfer leg of a PO's transit chain (status PENDING — still
 * needs a real dispatch+receive with photo proof like any other transfer). `legSequence` is
 * 1-based; `originGoodsReceiptId` stays constant across every leg spawned from one shipment,
 * so a later partial delivery gets its own independent chain.
 */
export async function spawnNextTransitLeg(tx: DbOrTx, params: {
  purchaseOrderId: string
  originGoodsReceiptId: string
  legSequence: number
  fromLocationId: string
  toLocationId: string
  items: { itemId: string | null; itemName: string; requestedQty: number }[]
}) {
  const transferNumber = await generateTransitTrNumber(tx)
  return tx.stockTransfer.create({
    data: {
      id: crypto.randomUUID(),
      transferNumber,
      fromLocationId: params.fromLocationId,
      toLocationId: params.toLocationId,
      purchaseOrderId: params.purchaseOrderId,
      originGoodsReceiptId: params.originGoodsReceiptId,
      legSequence: params.legSequence,
      status: 'PENDING',
      updatedAt: new Date(),
      items: {
        create: params.items
          .filter(it => it.requestedQty > 0)
          .map(it => ({ id: crypto.randomUUID(), itemId: it.itemId, itemName: it.itemName, requestedQty: it.requestedQty })),
      },
    },
  })
}

/**
 * Sets PO status to RECEIVED/PARTIALLY_RECEIVED once every transit leg for it has settled
 * (no more PENDING/DISPATCHED transfers) — mirrors the item receivedQty/orderedQty thresholds
 * used for non-routed POs, just deferred until goods physically reach the final destination.
 * No-ops (returns null) while any leg is still open.
 */
export async function attemptFinalizePOStatus(db: DbOrTx, orderId: string): Promise<'RECEIVED' | 'PARTIALLY_RECEIVED' | null> {
  const openLegs = await db.stockTransfer.count({ where: { purchaseOrderId: orderId, status: { in: ['PENDING', 'DISPATCHED'] } } })
  if (openLegs > 0) return null
  const poItems = await db.purchaseOrderItem.findMany({ where: { orderId } })
  const allReceived = poItems.every(pi => pi.receivedQty >= pi.orderedQty)
  const anyReceived = poItems.some(pi => pi.receivedQty > 0)
  const newStatus = allReceived ? 'RECEIVED' as const : anyReceived ? 'PARTIALLY_RECEIVED' as const : null
  if (newStatus) await db.purchaseOrder.update({ where: { id: orderId }, data: { status: newStatus, updatedAt: new Date() } })
  return newStatus
}
