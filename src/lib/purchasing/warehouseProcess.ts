import type { getDb } from '@/lib/get-db'
import { notifyPurchasingForRequest, notifyRequester } from '@/lib/notify-purchasing'
import { computeStockChecks, type StockCheckRequest } from '@/lib/purchasing/stockCheck'
import { recordReservation } from '@/lib/purchasing/reservations'
import { createOrAppendTransfer, toBaseQty } from '@/lib/purchasing/transferActions'

type Db = Awaited<ReturnType<typeof getDb>>

// Warehouse's side of a PR: each Warehouse-routed line is first Approved on its own (source
// warehouse + Reserve saved, nothing moves — PATCH .../items/[itemId]/warehouse-check), then
// "Process Purchase Request" (PATCH .../warehouse-forward) decides every approved line at once
// (processWarehouseLine — Reserve 0 → handed to Purchasing to buy straight to the ship; Reserve > 0
// → TR for it + backorder for the rest) and finishes the check, which puts each line's To Be
// Order on a Restock PR (finishWarehouseCheck → addRestockLines).

const REQUEST_SELECT = {
  id: true, status: true, prNumber: true, division: true, requestedById: true, deliveryLocationId: true, warehouseDoneAt: true,
  transfers: { select: { id: true, status: true, fromLocationId: true, items: { select: { itemId: true, requestedQty: true } } } },
  items: {
    select: {
      id: true, itemId: true, itemName: true, quantity: true, unit: true, convertedAt: true, convertedPoId: true,
      warehouseDecision: true, verifyRejectedAt: true, backorderQty: true, backorderLocationId: true, viaWarehouse: true,
      warehouseApprovedAt: true, warehouseReserveQty: true, warehouseFromLocationId: true, warehouseCheckNote: true,
    },
  },
} as const

export async function loadWarehouseRequest(db: Db, id: string) {
  return db.purchaseRequest.findUnique({ where: { id }, select: REQUEST_SELECT })
}
type WarehouseRequest = NonNullable<Awaited<ReturnType<typeof loadWarehouseRequest>>>

/** Warehouse-routed lines still waiting for Process. Rejected lines are settled. */
export function undecidedLines(request: Pick<WarehouseRequest, 'items'>) {
  return request.items.filter(i => i.viaWarehouse && !i.convertedAt && !i.verifyRejectedAt && !i.warehouseDecision)
}

/** Free stock (on hand − PENDING transfers out, base units) per `${itemId}:${locationId}`. */
export async function freeStock(db: Pick<Db, 'stockLot' | 'stockTransferItem'>, keys: { itemId: string; locationId: string }[]) {
  const free = new Map<string, number>()
  for (const { itemId, locationId } of keys) {
    const key = `${itemId}:${locationId}`
    if (free.has(key)) continue
    const [lots, reserved] = await Promise.all([
      db.stockLot.findMany({ where: { itemId, locationId }, select: { quantity: true } }),
      db.stockTransferItem.aggregate({ where: { itemId, transfer: { status: 'PENDING', fromLocationId: locationId } }, _sum: { requestedQty: true } }),
    ])
    free.set(key, Math.max(0, lots.reduce((s, l) => s + l.quantity, 0) - (reserved._sum.requestedQty ?? 0)))
  }
  return free
}

/**
 * Turn one approved line into its decision, atomically (a double Process must not transfer or
 * hand it over twice): Reserve 0 → PURCHASE; Reserve > 0 → TRANSFER of the Reserve on a TR (one
 * per source warehouse, shared across the PR's lines) and the rest of Requested backordered there.
 * Returns null when the line was already decided, { overFree } when stock no longer covers it.
 */
export async function processWarehouseLine(db: Db, request: Pick<WarehouseRequest, 'id' | 'prNumber' | 'deliveryLocationId'>, line: WarehouseRequest['items'][number], userId: string) {
  const catalogItemId = line.itemId!
  const fromLocationId = line.warehouseFromLocationId!
  const reserveQty = line.warehouseReserveQty ?? 0
  const master = await db.purchaseItem.findUnique({ where: { id: catalogItemId }, select: { baseUnit: true, purchaseUnit: true, conversionFactor: true } })
  const baseQty = toBaseQty(line.quantity, line.unit, master)

  return db.$transaction(async tx => {
    const free = (await freeStock(tx, [{ itemId: catalogItemId, locationId: fromLocationId }])).get(`${catalogItemId}:${fromLocationId}`) ?? 0
    if (reserveQty > free + 1e-6) return { overFree: free }
    const now = new Date()
    const base = { warehouseCheckedById: userId, warehouseCheckedAt: now }

    if (reserveQty <= 0) {
      const claimed = await tx.purchaseRequestItem.updateMany({
        where: { id: line.id, convertedAt: null, warehouseDecision: null },
        data: { ...base, warehouseDecision: 'PURCHASE' },
      })
      if (!claimed.count) return null
      await recordReservation(tx, { requestItemId: line.id, locationId: fromLocationId, stockQty: free, reservedQty: 0, source: 'WAREHOUSE_CHECK' })
      return { outcome: 'PURCHASE' as const, transferNumber: null, sendQty: 0, backorderQty: 0 }
    }

    const backorderQty = Math.max(0, baseQty - reserveQty)
    const claimed = await tx.purchaseRequestItem.updateMany({
      where: { id: line.id, convertedAt: null, warehouseDecision: null },
      data: {
        ...base,
        warehouseDecision: 'TRANSFER',
        convertedAt: now,
        backorderQty,
        backorderLocationId: backorderQty > 0 ? fromLocationId : null,
      },
    })
    if (!claimed.count) return null
    const transferNumber = await createOrAppendTransfer(tx, {
      requestId: request.id,
      prNumber: request.prNumber,
      deliveryLocationId: request.deliveryLocationId!,
      fromLocationId,
      items: [{ itemId: catalogItemId, itemName: line.itemName, baseQty: reserveQty }],
    })
    await recordReservation(tx, { requestItemId: line.id, locationId: fromLocationId, stockQty: free, reservedQty: reserveQty, source: 'WAREHOUSE_CHECK', transferNumber })
    return { outcome: 'TRANSFER' as const, transferNumber, sendQty: reserveQty, backorderQty }
  })
}

/**
 * Put each given line's To Be Order (its restockQty — Shortage + top-up to Min. Stock, net of
 * On Order) on THIS PR as a restock line (restockLocationId = its source warehouse): Purchasing
 * buys it from the PR it's already working on, delivered to the warehouse rather than the ship.
 * No separate Restock PR. An item that already has a restock line here is skipped, so calling it
 * again (Process, then Finish) never double-orders. Qty rounds UP to whole purchase units when
 * the item buys in a bigger unit (1100 ml short → 2 bottles). Returns the item names added.
 */
export async function addRestockLines(db: Db, request: WarehouseRequest, lineIds: string[] | 'all', userId: string): Promise<string[]> {
  const { checks } = await computeStockChecks(db, request as unknown as StockCheckRequest)
  const already = await db.purchaseRequestItem.findMany({
    where: { requestId: request.id, restockLocationId: { not: null }, itemId: { not: null } },
    select: { itemId: true },
  })
  const restocked = new Set(already.map(a => a.itemId!))
  const lines = request.items
    .filter(i => lineIds === 'all' || lineIds.includes(i.id))
    .map(item => ({ item, check: checks.get(item.id) }))
    .filter((l): l is { item: (typeof request.items)[number]; check: NonNullable<typeof l.check> } =>
      !!l.check && l.check.restockQty > 0 && !!l.item.itemId && !restocked.has(l.item.itemId))
  if (!lines.length) return []

  const masters = await db.purchaseItem.findMany({
    where: { id: { in: lines.map(l => l.item.itemId!) } },
    select: { id: true, name: true, baseUnit: true, purchaseUnit: true, conversionFactor: true },
  })
  const masterMap = new Map(masters.map(m => [m.id, m]))
  const now = new Date()
  await db.purchaseRequestItem.createMany({
    data: lines.map(({ item, check }) => {
      const m = masterMap.get(item.itemId!)
      const conv = m?.conversionFactor || 1
      const inPurchaseUnit = !!m && m.purchaseUnit !== m.baseUnit && conv > 1
      return {
        id: crypto.randomUUID(),
        requestId: request.id,
        itemId: item.itemId,
        itemName: m?.name ?? item.itemName,
        quantity: inPurchaseUnit ? Math.ceil(check.restockQty / conv - 1e-9) : Math.ceil(check.restockQty * 100 - 1e-9) / 100,
        unit: inPurchaseUnit ? m!.purchaseUnit : (m?.baseUnit ?? item.unit),
        restockLocationId: check.locationId,
        viaWarehouse: false,
        warehouseCheckedById: userId,
        warehouseCheckedAt: now,
        notes: `Restock to ${check.locationName} — Shortage ${check.shortage} · Ending ${check.ending} · Min ${check.minStock} · On order ${check.onOrder} (${m?.baseUnit ?? ''})`,
      }
    }),
  })
  const names = lines.map(l => masterMap.get(l.item.itemId!)?.name ?? l.item.itemName)
  await notifyPurchasingForRequest(
    db, request.division, 'PR_RESTOCK_CREATED', 'Warehouse Restock',
    `${request.prNumber} — restock to buy for the warehouse: ${names.join(', ')}.`,
    request.id,
  )
  return names
}

/**
 * Close Warehouse's check on a PR: stamp warehouseDoneAt (once — a double call is a no-op),
 * add any To Be Order not yet on a restock line (lines processed before this flow existed),
 * then CONVERTED if nothing is left for Purchasing, else ON_PROCESS. Returns null when it was
 * already finished.
 */
export async function finishWarehouseCheck(db: Db, id: string, userId: string) {
  const claimed = await db.purchaseRequest.updateMany({ where: { id, warehouseDoneAt: null }, data: { warehouseDoneAt: new Date() } })
  if (!claimed.count) return null
  const request = (await loadWarehouseRequest(db, id))!
  const restocks = await addRestockLines(db, request, 'all', userId)

  const items = request.items
  // Restock lines just added are Purchasing's to buy — they keep the PR On Process too.
  const remaining = [...items.filter(i => !i.convertedAt && !i.verifyRejectedAt).map(i => i.itemName), ...restocks]
  const backordered = items.filter(i => i.backorderQty > 0)
  const toPurchasing = items.filter(i => i.viaWarehouse && i.warehouseDecision === 'PURCHASE' && !i.convertedAt && !i.verifyRejectedAt)
  const backorderNote = backordered.length ? ` ${backordered.length} ${backordered.length === 1 ? 'item was' : 'items were'} partially shipped — the rest will follow once the restock arrives at the warehouse.` : ''
  const now = new Date()

  if (remaining.length === 0) {
    const updated = await db.purchaseRequest.update({
      where: { id },
      data: { status: 'CONVERTED', convertedById: userId, convertedAt: now, verifiedById: userId, verifiedAt: now, updatedAt: now },
    })
    await notifyRequester(db, id, {
      type: 'PR_FULFILLED_FROM_STOCK',
      title: backordered.length ? 'Request Processed by Warehouse' : 'Request Fulfilled from Warehouse Stock',
      body: backordered.length
        ? `${request.prNumber} was processed by the warehouse.${backorderNote}`
        : `${request.prNumber} has been fulfilled from warehouse stock.`,
      skipUserId: userId,
    })
    return { updated, restocks, remaining: [] as string[] }
  }

  const updated = await db.purchaseRequest.update({
    where: { id },
    data: { status: 'ON_PROCESS', verifiedById: userId, verifiedAt: now, updatedAt: now },
  })
  await notifyRequester(db, id, {
    type: 'PR_FORWARDED_FROM_WAREHOUSE',
    title: 'Warehouse check complete',
    body: `${request.prNumber} has been checked by Warehouse${toPurchasing.length ? ` — ${toPurchasing.length} ${toPurchasing.length === 1 ? 'item is' : 'items are'} not in the warehouse and will be purchased by Purchasing` : ''}.${backorderNote}`,
    skipUserId: userId,
  })
  return { updated, restocks, remaining }
}
