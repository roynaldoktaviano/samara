import { getDb } from '@/lib/get-db'
import { attemptFinalizePOStatus, getRouteLocationIds, resolveNextHop, spawnNextTransitLeg } from '@/lib/purchasing/transitChain'

// This function always owns its own $transaction (called with a full client, session- or
// token-resolved — never from inside an existing transaction), unlike transitChain.ts's
// helpers which are composed into a caller's tx.
type Db = Awaited<ReturnType<typeof getDb>>

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
  if (!params.receivePhotoKey) return { ok: false, error: 'Foto penerimaan wajib diupload', status: 400 }

  const toLoc = await db.stockLocation.findUnique({ where: { id: transfer.toLocationId }, select: { name: true } })

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
      const lot = await tx.stockLot.findFirst({ where: lotWhere })
      if (lot) {
        await tx.stockLot.update({ where: { id: lot.id }, data: { quantity: { increment: qty }, updatedAt: new Date() } })
      } else {
        await tx.stockLot.create({
          data: {
            id: crypto.randomUUID(), locationId: transfer.toLocationId, quantity: qty, costPerUnit: 0, updatedAt: new Date(),
            ...(it.itemId ? { itemId: it.itemId } : { itemName: it.itemName }),
          },
        })
      }
      await tx.stockMovement.create({
        data: {
          id: crypto.randomUUID(), fromLocationId: transfer.fromLocationId, toLocationId: transfer.toLocationId, quantity: qty, type: 'TRANSFER_IN', referenceId: transferId, referenceType: 'StockTransfer', createdById: params.movementCreatedById,
          ...(it.itemId ? { itemId: it.itemId } : { itemName: it.itemName }),
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
          items: params.items.map(it => ({ itemId: it.itemId, itemName: it.itemName, requestedQty: Number(it.receivedQty) || 0 })),
        })
      } else {
        await attemptFinalizePOStatus(tx, transfer.purchaseOrderId)
      }
    }
  })

  return { ok: true }
}
