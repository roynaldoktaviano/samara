import { getDb } from '@/lib/get-db'
import { movingAverageCost } from '@/lib/valuation'
import { shipArrivalRouter, shipUsageOnArrival, USAGE_LOCATION_SELECT } from '@/lib/purchasing/usage'
import { attemptFinalizePOStatus, getRouteLocationIds, resolveNextHop, spawnNextTransitLeg } from '@/lib/purchasing/transitChain'
import { nextSeq } from '@/lib/purchasing/docNumber'
import { notifyPoArrivalToRequester, notifyRequester } from '@/lib/notify-purchasing'
import { allocateBackorders } from '@/lib/purchasing/backorders'
import { effectiveTreatment, usageTypeForTreatment } from '@/lib/purchasing/treatment'

// receiveTransferLeg always owns its own $transaction (called with a full client, session-
// or token-resolved — never from inside an existing transaction), unlike transitChain.ts's
// helpers which are composed into a caller's tx. createOrAppendTransfer only touches
// stockTransfer, so it also accepts a caller's tx (PR convert runs it inside one).
type Db = Awaited<ReturnType<typeof getDb>>

class AlreadyReceivedError extends Error {}

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
  const { requestId, prNumber, deliveryLocationId, fromLocationId } = params
  // One line per item on a transfer: dispatch/receive match lines by item, so a second line for
  // the same item (two PR lines of it, or a backorder landing while the first TR is still
  // PENDING) used to get both lines' quantities overwritten with one value.
  const lineKey = (it: { itemId: string | null; itemName: string }) => it.itemId ?? `name:${it.itemName}`
  const merged = new Map<string, { itemId: string | null; itemName: string; baseQty: number }>()
  for (const it of params.items) {
    const m = merged.get(lineKey(it))
    if (m) m.baseQty += it.baseQty
    else merged.set(lineKey(it), { ...it })
  }
  const items = [...merged.values()]
  const itemsCreate = items.map(it => ({
    id: crypto.randomUUID(),
    itemId: it.itemId,
    itemName: it.itemName,
    requestedQty: it.baseQty,
  }))

  const candidate = await db.stockTransfer.findFirst({
    where: { purchaseRequestId: requestId, fromLocationId, status: 'PENDING' },
    select: { id: true },
  })
  // Lock it and re-check it's still PENDING (every caller runs inside a transaction): a dispatch
  // that got there first means appending would put lines on a TR that has already left — start
  // a new one instead. Lines are read only after the lock, so they're current.
  const locked = candidate
    ? (await db.stockTransfer.updateMany({ where: { id: candidate.id, status: 'PENDING' }, data: { updatedAt: new Date() } })).count > 0
    : false
  const existingTransfer = locked
    ? await db.stockTransfer.findUnique({
        where: { id: candidate!.id },
        include: { items: { select: { id: true, itemId: true, itemName: true } } },
      })
    : null
  if (existingTransfer) {
    const existingLine = (it: { itemId: string | null; itemName: string }) =>
      existingTransfer.items.find(l => lineKey(l) === lineKey(it))
    await db.stockTransfer.update({
      where: { id: existingTransfer.id },
      data: {
        items: {
          create: itemsCreate.filter(it => !existingLine(it)),
          update: items.filter(it => existingLine(it)).map(it => ({
            where: { id: existingLine(it)!.id },
            data: { requestedQty: { increment: it.baseQty } },
          })),
        },
      },
    })
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
  if (transfer.status === 'RECEIVED') return { ok: false, error: 'This transfer has already been received', status: 409 }
  if (transfer.status !== 'DISPATCHED') return { ok: false, error: 'Transfer has not been dispatched yet', status: 409 }
  if (!params.receivePhotoKey) return { ok: false, error: 'Receipt photo is required', status: 400 }

  const [toLoc, fromLoc] = await Promise.all([
    db.stockLocation.findUnique({ where: { id: transfer.toLocationId }, select: { name: true, ...USAGE_LOCATION_SELECT } }),
    db.stockLocation.findUnique({ where: { id: transfer.fromLocationId }, select: USAGE_LOCATION_SELECT }),
  ])
  // Fallback cost for legacy lines dispatched before unitCost was snapshotted.
  const catalogIds = transfer.items.map(ti => ti.itemId).filter(Boolean) as string[]
  const catalog = await db.purchaseItem.findMany({ where: { id: { in: catalogIds } }, select: { id: true, standardCost: true, type: true, treatment: true } })
  const treatmentMap = new Map(catalog.map(i => [i.id, i.treatment]))
  const stdCostMap = new Map(catalog.map(i => [i.id, i.standardCost]))
  const typeMap = new Map(catalog.map(i => [i.id, i.type]))

  // At the final destination on a yacht, each line lands by item type (beverages → the
  // yacht's bar as stock, everything else → usage on the ship; see shipArrivalRouter).
  // A transit stop the goods get forwarded from keeps everything in one place.
  const routeLocationIds = transfer.purchaseOrderId && transfer.originGoodsReceiptId ? await getRouteLocationIds(db, transfer.purchaseOrderId) : null
  const isFinalStop = !routeLocationIds || !resolveNextHop(routeLocationIds, transfer.toLocationId)
  const route = isFinalStop ? await shipArrivalRouter(db, transfer.toLocationId) : null

  let finalizedPoStatus: 'RECEIVED' | 'PARTIALLY_RECEIVED' | null
  try {
    finalizedPoStatus = await db.$transaction(async (tx) => {
      // Claim the transfer first — a double tap (or the crew link and a staff user at once) waits
      // here and then finds it already RECEIVED, instead of adding the stock a second time.
      const claimed = await tx.stockTransfer.updateMany({
        where: { id: transferId, status: 'DISPATCHED' },
        data: {
          status: 'RECEIVED',
          receivedById: params.receivedById,
          receivedByName: params.receivedByName ?? null,
          receivePhotoKey: params.receivePhotoKey,
          receivedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      if (!claimed.count) throw new AlreadyReceivedError()

      for (const it of params.items) {
        const qty = Number(it.receivedQty) || 0
        // Find dispatched qty for discrepancy check
        const transferItem = transfer.items.find(ti => it.itemId ? ti.itemId === it.itemId : ti.itemName === it.itemName)
        const dispatchedQty = transferItem?.dispatchedQty ?? 0
        if (qty <= 0) {
          // Sent but nothing arrived — still a discrepancy to chase, not a silent skip.
          if (dispatchedQty > 0) {
            await tx.inventoryException.create({
              data: {
                id: crypto.randomUUID(), type: 'TRANSFER_DISCREPANCY', itemId: it.itemId || null, itemName: it.itemName,
                locationId: transfer.toLocationId, locationName: toLoc?.name ?? '—', qty: dispatchedQty,
                reason: `Dikirim ${dispatchedQty}, diterima 0`, referenceId: transferId, referenceType: 'StockTransfer',
                status: 'OPEN', updatedAt: new Date(),
              },
            })
          }
          continue
        }

        const dest = route?.(it.itemId ? typeMap.get(it.itemId) : null) ?? (toLoc ? { id: transfer.toLocationId, ...toLoc } : null)
        const destId = dest?.id ?? transfer.toLocationId
        // Stock → ship/galley is usage (pemakaian); ship → stock is a reversal. See usage.ts.
        const usage = dest ? shipUsageOnArrival(fromLoc, dest) : null

        const lotWhere = it.itemId
          ? { itemId: it.itemId, locationId: destId }
          : { itemId: null, itemName: it.itemName, locationId: destId }
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
              id: crypto.randomUUID(), locationId: destId, quantity: qty, costPerUnit: incomingCost, updatedAt: new Date(),
              ...(it.itemId ? { itemId: it.itemId } : { itemName: it.itemName }),
            },
          })
        }
        await tx.stockMovement.create({
          data: {
            id: crypto.randomUUID(), fromLocationId: transfer.fromLocationId, toLocationId: destId, quantity: qty, type: 'TRANSFER_IN', referenceId: transferId, referenceType: 'StockTransfer', createdById: params.movementCreatedById,
            ...(it.itemId ? { itemId: it.itemId } : { itemName: it.itemName }),
            unitCost: incomingCost,
            totalCost: qty * incomingCost * (usage?.sign ?? 1),
            // CONSUMABLE → trip usage, SPARE_PART → ship maintenance, ASSET → none (equipment).
            ...(usage && usageTypeForTreatment(effectiveTreatment(null, it.itemId ? treatmentMap.get(it.itemId) : null)) && {
              usageType: usageTypeForTreatment(effectiveTreatment(null, it.itemId ? treatmentMap.get(it.itemId) : null))!,
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
          return attemptFinalizePOStatus(tx, transfer.purchaseOrderId)
        }
      }
      return null
    })
  } catch (e) {
    if (e instanceof AlreadyReceivedError) return { ok: false, error: 'This transfer has already been received', status: 409 }
    throw e
  }

  // Requester progress: a routed PO's last leg finalizing is the moment its goods reach
  // the final destination; a Gudang stock transfer for a PR (no PO) is done on arrival.
  if (transfer.purchaseOrderId && finalizedPoStatus) {
    const po = await db.purchaseOrder.findUnique({ where: { id: transfer.purchaseOrderId }, select: { poNumber: true } })
    notifyPoArrivalToRequester(db, transfer.purchaseOrderId, finalizedPoStatus, po?.poNumber ?? null, params.receivedById)
  } else if (transfer.purchaseRequestId && !transfer.purchaseOrderId) {
    notifyRequester(db, transfer.purchaseRequestId, {
      type: 'PR_TRANSFER_RECEIVED',
      title: 'Warehouse items have arrived',
      body: `${transfer.transferNumber} (from warehouse stock) has been received at ${toLoc?.name ?? 'the destination'}.`,
      skipUserId: params.receivedById ?? undefined,
    }).catch(console.error)
  }

  // Stock arriving at a warehouse (e.g. a restock PO's transit leg) → ship PR lines
  // backordered there (draft follow-up TRs). No-op for any other destination.
  await allocateBackorders(db, transfer.toLocationId, params.items.map(i => i.itemId))

  return { ok: true }
}
