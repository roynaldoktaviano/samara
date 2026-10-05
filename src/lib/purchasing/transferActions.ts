import { getDb } from '@/lib/get-db'
import { movingAverageCost } from '@/lib/valuation'
import { shipUsageOnArrival, USAGE_LOCATION_SELECT } from '@/lib/purchasing/usage'
import { attemptFinalizePOStatus, getRouteLocationIds, resolveNextHop, spawnNextTransitLeg } from '@/lib/purchasing/transitChain'
import { nextSeq } from '@/lib/purchasing/docNumber'

// receiveTransferLeg always owns its own $transaction (called with a full client, session-
// or token-resolved — never from inside an existing transaction), unlike transitChain.ts's
// helpers which are composed into a caller's tx. createOrAppendTransfer only touches
// stockTransfer, so it also accepts a caller's tx (PR convert runs it inside one).
type Db = Awaited<ReturnType<typeof getDb>>

/**
 * Converts a PurchaseRequestItem's requested quantity into base units for comparison
 * against StockLot quantities (always denominated in base units) — same conversion used
 * when adding items to a cart in CreateRequestView / the /request-order catalog. `unit` is
 * the request item's own unit; `master` is its PurchaseItem catalog record (null for
 * custom/non-catalog items, which always pass through unconverted).
 */
export function toBaseQty(
  quantity: number,
  unit: string,
  master: { baseUnit: string; purchaseUnit: string; conversionFactor: number } | null | undefined,
): number {
  return master && unit === master.purchaseUnit && master.purchaseUnit !== master.baseUnit
    ? quantity * (master.conversionFactor || 1)
    : quantity
}

/**
 * Creates a PENDING StockTransfer for a PurchaseRequest's items fulfilled from warehouse
 * stock instead of bought — or appends to an existing PENDING transfer already open for
 * the same PR + source location, so a trickle of per-item decisions from the same PR
 * doesn't fragment into a pile of near-duplicate transfers. Shared by Purchasing's bulk
 * convert-to-PO/Transfer step (PATCH /api/purchasing/requests/[id]) and Warehouse's
 * one-item-at-a-time physical stock check (PATCH .../items/[itemId]/warehouse-check).
 * Returns the transfer number (new or appended-to).
 */
export async function createOrAppendTransfer(db: Pick<Db, 'stockTransfer'>, params: {
  requestId: string
  prNumber: string
  deliveryLocationId: string
  fromLocationId: string
  items: { itemId: string | null; itemName: string; baseQty: number }[]
}): Promise<string> {
  const { requestId, prNumber, deliveryLocationId, fromLocationId, items } = params
  const itemsCreate = items.map(it => ({
    id: crypto.randomUUID(),
    itemId: it.itemId,
    itemName: it.itemName,
    requestedQty: it.baseQty,
  }))

  const existingTransfer = await db.stockTransfer.findFirst({ where: { purchaseRequestId: requestId, fromLocationId, status: 'PENDING' } })
  if (existingTransfer) {
    await db.stockTransfer.update({ where: { id: existingTransfer.id }, data: { items: { create: itemsCreate } } })
    return existingTransfer.transferNumber
  }

  const trPrefix = `TR-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-`
  const seq = nextSeq((await db.stockTransfer.findMany({ where: { transferNumber: { startsWith: trPrefix } }, select: { transferNumber: true } })).map(r => r.transferNumber))
  const transferNumber = `${trPrefix}${String(seq).padStart(3, '0')}`
  await db.stockTransfer.create({
    data: {
      id: crypto.randomUUID(),
      transferNumber,
      fromLocationId,
      toLocationId: deliveryLocationId,
      purchaseRequestId: requestId,
      status: 'PENDING',
      notes: `Auto-created from ${prNumber}`,
      updatedAt: new Date(),
      items: { create: itemsCreate },
    },
  })
  return transferNumber
}

/**
 * Marks a StockTransfer RECEIVED: increments/creates stock lots at the destination,
 * records the TRANSFER_IN movement, updates StockTransferItem.receivedQty, raises a
 * discrepancy exception on mismatch, then continues the PO transit chain if this leg
 * was part of one (see src/lib/purchasing/transitChain.ts). Shared by the staff-session
 * PATCH /api/purchasing/transfers/[id] flow and the no-login PUT /api/crew-receive/[token]
 * flow — re-fetches the transfer itself so it's safe to call from either.
 */
export async function receiveTransferLeg(db: Db, transferId: string, params: {
  items: { itemId: string | null; itemName: string; receivedQty: number }[]
  receivePhotoKey: string
  receivedByName: string | null
  receivedById: string | null
  movementCreatedById: string
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const transfer = await db.stockTransfer.findUnique({ where: { id: transferId }, include: { items: true } })
  if (!transfer) return { ok: false, error: 'Not found', status: 404 }
  if (transfer.status !== 'DISPATCHED') return { ok: false, error: 'Transfer belum dikirim', status: 409 }
  if (!params.receivePhotoKey) return { ok: false, error: 'Receipt photo is required', status: 400 }

  const [toLoc, fromLoc] = await Promise.all([
    db.stockLocation.findUnique({ where: { id: transfer.toLocationId }, select: { name: true, ...USAGE_LOCATION_SELECT } }),
    db.stockLocation.findUnique({ where: { id: transfer.fromLocationId }, select: USAGE_LOCATION_SELECT }),
  ])
  // Stock → ship/galley is usage (pemakaian); ship → stock is a reversal. See usage.ts.
  const usage = toLoc ? shipUsageOnArrival(fromLoc, toLoc) : null
  // Fallback cost for legacy lines dispatched before unitCost was snapshotted.
  const catalogIds = transfer.items.map(ti => ti.itemId).filter(Boolean) as string[]
  const stdCostMap = new Map((await db.purchaseItem.findMany({ where: { id: { in: catalogIds } }, select: { id: true, standardCost: true } })).map(i => [i.id, i.standardCost]))

  await db.$transaction(async (tx) => {
    for (const it of params.items) {
      if (!it.receivedQty) continue
      const qty = Number(it.receivedQty)
      if (qty <= 0) continue

      // Find dispatched qty for discrepancy check
      const transferItem = transfer.items.find(ti => it.itemId ? ti.itemId === it.itemId : ti.itemName === it.itemName)
      const dispatchedQty = transferItem?.dispatchedQty ?? 0

      const lotWhere = it.itemId
        ? { itemId: it.itemId, locationId: transfer.toLocationId }
        : { itemId: null, itemName: it.itemName, locationId: transfer.toLocationId }
      // The cost carried from the source location is blended into the destination's
      // moving average (see movingAverageCost in src/lib/valuation.ts).
      const incomingCost = transferItem?.unitCost || (it.itemId ? stdCostMap.get(it.itemId) ?? 0 : 0)
      const lot = await tx.stockLot.findFirst({ where: lotWhere })
      if (lot) {
        await tx.stockLot.update({
          where: { id: lot.id },
          data: { quantity: { increment: qty }, costPerUnit: movingAverageCost(lot.quantity, lot.costPerUnit, qty, incomingCost), updatedAt: new Date() },
        })
      } else {
        await tx.stockLot.create({
          data: {
            id: crypto.randomUUID(), locationId: transfer.toLocationId, quantity: qty, costPerUnit: incomingCost, updatedAt: new Date(),
            ...(it.itemId ? { itemId: it.itemId } : { itemName: it.itemName }),
          },
        })
      }
      await tx.stockMovement.create({
        data: {
          id: crypto.randomUUID(), fromLocationId: transfer.fromLocationId, toLocationId: transfer.toLocationId, quantity: qty, type: 'TRANSFER_IN', referenceId: transferId, referenceType: 'StockTransfer', createdById: params.movementCreatedById,
          ...(it.itemId ? { itemId: it.itemId } : { itemName: it.itemName }),
          unitCost: incomingCost,
          totalCost: qty * incomingCost * (usage?.sign ?? 1),
          ...(usage && {
            usageType: 'SHIP_USAGE' as const,
            yachtId: usage.yachtId,
            openTripId: transfer.openTripId,
            tripBookingId: transfer.tripBookingId,
          }),
        },
      })
      await tx.stockTransferItem.updateMany({ where: { transferId, itemId: it.itemId || null, itemName: it.itemName }, data: { receivedQty: qty } })

      // Auto-create Transfer Discrepancy exception if qty doesn't match
      if (dispatchedQty > 0 && qty !== dispatchedQty) {
        await tx.inventoryException.create({
          data: {
            id: crypto.randomUUID(),
            type: 'TRANSFER_DISCREPANCY',
            itemId: it.itemId || null,
            itemName: it.itemName,
            locationId: transfer.toLocationId,
            locationName: toLoc?.name ?? '—',
            qty: Math.abs(qty - dispatchedQty),
            reason: `Dikirim ${dispatchedQty}, diterima ${qty}`,
            referenceId: transferId,
            referenceType: 'StockTransfer',
            status: 'OPEN',
            updatedAt: new Date(),
          },
        })
      }
    }
    await tx.stockTransfer.update({
      where: { id: transferId },
      data: {
        status: 'RECEIVED',
        receivedById: params.receivedById,
        receivedByName: params.receivedByName ?? null,
        receivePhotoKey: params.receivePhotoKey,
        receivedAt: new Date(),
        updatedAt: new Date(),
      },
    })

    // If this transfer was one leg of a PO's transit route, chain the next leg (or, if
    // this was the final stop, let the PO finalize to RECEIVED/PARTIALLY_RECEIVED).
    if (transfer.purchaseOrderId && transfer.originGoodsReceiptId) {
      const routeLocationIds = await getRouteLocationIds(tx, transfer.purchaseOrderId)
      const nextHop = routeLocationIds ? resolveNextHop(routeLocationIds, transfer.toLocationId) : null
      if (nextHop) {
        await spawnNextTransitLeg(tx, {
          purchaseOrderId: transfer.purchaseOrderId,
          originGoodsReceiptId: transfer.originGoodsReceiptId,
          legSequence: (transfer.legSequence ?? 1) + 1,
          fromLocationId: transfer.toLocationId,
          toLocationId: nextHop,
          items: params.items.map(it => {
            const ti = transfer.items.find(t => it.itemId ? t.itemId === it.itemId : t.itemName === it.itemName)
            return { itemId: it.itemId, itemName: it.itemName, requestedQty: Number(it.receivedQty) || 0, unitCost: ti?.unitCost ?? 0 }
          }),
        })
      } else {
        await attemptFinalizePOStatus(tx, transfer.purchaseOrderId)
      }
    }
  })

  return { ok: true }
}
