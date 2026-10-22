import type { getDb } from '@/lib/get-db'
import { notifyPurchasingForRequest, notifyRequester } from '@/lib/notify-purchasing'
import { computeStockChecks, type StockCheckRequest } from '@/lib/purchasing/stockCheck'
import { generatePrNumber } from '@/lib/purchasing/docNumber'

type Db = Awaited<ReturnType<typeof getDb>>

// Warehouse's side of a PR, one line at a time: "Process" decides each Warehouse-routed line on
// the spot (see PATCH .../items/[itemId]/warehouse-check) — out of stock → handed to Purchasing to
// buy straight to the ship; some stock → TR for what's free + backorder for the rest — and sends
// that line's To Be Order to Purchasing right away as a Restock PR line. Once the last line is
// processed the check finishes by itself (finishWarehouseCheck).

const REQUEST_SELECT = {
  id: true, status: true, prNumber: true, division: true, requestedById: true, deliveryLocationId: true, warehouseDoneAt: true,
  transfers: { select: { id: true, status: true, fromLocationId: true, items: { select: { itemId: true, requestedQty: true } } } },
  items: {
    select: {
      id: true, itemId: true, itemName: true, quantity: true, unit: true, convertedAt: true, convertedPoId: true,
      warehouseDecision: true, verifyRejectedAt: true, backorderQty: true, backorderLocationId: true, viaWarehouse: true,
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

/**
 * Put each given line's To Be Order (its restockQty — Shortage + top-up to Min. Stock, net of
 * On Order) on a Restock PR to its source warehouse, straight to Purchasing (ON_PROCESS, no
 * stock check of its own). Reuses this PR's open Restock PR for that warehouse if Purchasing
 * hasn't converted it yet, else starts a new one. An item already on any of this PR's Restock
 * PRs is skipped, so calling it again (Process, then Finish) never double-orders. Qty rounds UP
 * to whole purchase units when the item buys in a bigger unit (1100 ml short → 2 bottles).
 * Returns the Restock PR numbers touched.
 */
export async function addRestockLines(db: Db, request: WarehouseRequest, lineIds: string[] | 'all', userId: string): Promise<string[]> {
  const { checks } = await computeStockChecks(db, request as unknown as StockCheckRequest)
  const already = await db.purchaseRequestItem.findMany({
    where: { request: { restockForRequestId: request.id }, itemId: { not: null } },
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
  const byWarehouse = new Map<string, typeof lines>()
  for (const l of lines) byWarehouse.set(l.check.locationId, [...(byWarehouse.get(l.check.locationId) ?? []), l])

  const touched: string[] = []
  for (const [locationId, whLines] of byWarehouse) {
    const now = new Date()
    const itemsCreate = whLines.map(({ item, check }) => {
      const m = masterMap.get(item.itemId!)
      const conv = m?.conversionFactor || 1
      const inPurchaseUnit = !!m && m.purchaseUnit !== m.baseUnit && conv > 1
      return {
        id: crypto.randomUUID(),
        itemId: item.itemId,
        itemName: m?.name ?? item.itemName,
        quantity: inPurchaseUnit ? Math.ceil(check.restockQty / conv - 1e-9) : Math.ceil(check.restockQty * 100 - 1e-9) / 100,
        unit: inPurchaseUnit ? m!.purchaseUnit : (m?.baseUnit ?? item.unit),
        warehouseDecision: 'PURCHASE' as const,
        warehouseCheckedById: userId,
        warehouseCheckedAt: now,
        notes: `Shortage ${check.shortage} · Ending ${check.ending} · Min ${check.minStock} · On order ${check.onOrder} (${m?.baseUnit ?? ''})`,
      }
    })
    const open = await db.purchaseRequest.findFirst({
      where: { restockForRequestId: request.id, deliveryLocationId: locationId, status: 'ON_PROCESS' },
      select: { id: true, prNumber: true },
    })
    const restock = open
      ? await db.purchaseRequest.update({ where: { id: open.id }, data: { updatedAt: now, items: { create: itemsCreate } }, select: { id: true, prNumber: true } })
      : await db.purchaseRequest.create({
          data: {
            id: crypto.randomUUID(),
            prNumber: await generatePrNumber(db),
            requestedById: userId,
            deliveryLocationId: locationId,
            restockForRequestId: request.id,
            division: request.division as never,
            purpose: 'STOCK_INVENTORY',
            notes: `Restock — To Be Order from ${request.prNumber}`,
            status: 'ON_PROCESS',
            verifiedById: userId,
            verifiedAt: now,
            warehouseDoneAt: now,
            updatedAt: now,
            items: { create: itemsCreate },
          },
          select: { id: true, prNumber: true },
        })
    await notifyPurchasingForRequest(
      db, request.division, 'PR_RESTOCK_CREATED', 'Restock Gudang',
      `${restock.prNumber} — perlu dibeli: ${whLines.map(l => l.item.itemName).join(', ')} (To Be Order dari ${request.prNumber}).`,
      restock.id,
    )
    touched.push(restock.prNumber)
  }
  return touched
}

/**
 * Close Warehouse's check on a PR: stamp warehouseDoneAt (once — a double call is a no-op),
 * sweep any To Be Order not yet on a Restock PR (lines processed before this flow existed),
 * then CONVERTED if nothing is left for Purchasing, else ON_PROCESS. Returns null when it was
 * already finished.
 */
export async function finishWarehouseCheck(db: Db, id: string, userId: string) {
  const claimed = await db.purchaseRequest.updateMany({ where: { id, warehouseDoneAt: null }, data: { warehouseDoneAt: new Date() } })
  if (!claimed.count) return null
  const request = (await loadWarehouseRequest(db, id))!
  const restocks = await addRestockLines(db, request, 'all', userId)

  const items = request.items
  const remaining = items.filter(i => !i.convertedAt && !i.verifyRejectedAt)
  const backordered = items.filter(i => i.backorderQty > 0)
  const toPurchasing = items.filter(i => i.viaWarehouse && i.warehouseDecision === 'PURCHASE' && !i.convertedAt && !i.verifyRejectedAt)
  const backorderNote = backordered.length ? ` ${backordered.length} item dikirim sebagian — sisanya menyusul setelah restock tiba di gudang.` : ''
  const now = new Date()

  if (remaining.length === 0) {
    const updated = await db.purchaseRequest.update({
      where: { id },
      data: { status: 'CONVERTED', convertedById: userId, convertedAt: now, verifiedById: userId, verifiedAt: now, updatedAt: now },
    })
    await notifyRequester(db, id, {
      type: 'PR_FULFILLED_FROM_STOCK',
      title: backordered.length ? 'Request Diproses Gudang' : 'Request Selesai dari Stok Gudang',
      body: backordered.length
        ? `${request.prNumber} diproses gudang.${backorderNote}`
        : `${request.prNumber} sudah dipenuhi dari stok gudang.`,
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
    title: 'Cek gudang selesai',
    body: `${request.prNumber} sudah dicek Gudang${toPurchasing.length ? ` — ${toPurchasing.length} item tidak ada di gudang dan dibelikan Purchasing` : ''}.${backorderNote}`,
    skipUserId: userId,
  })
  return { updated, restocks, remaining: remaining.map(i => i.itemName) }
}
