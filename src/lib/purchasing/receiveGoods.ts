import { getDb } from '@/lib/get-db'
import { notifyByRole, notifyPoArrivalToRequester } from '@/lib/notify-purchasing'
import { movingAverageCost } from '@/lib/valuation'
import { shipArrivalRouter, shipUsageOnArrival, USAGE_LOCATION_SELECT } from '@/lib/purchasing/usage'
import { attemptFinalizePOStatus, resolveNextHop, spawnNextTransitLeg } from '@/lib/purchasing/transitChain'
import { nextSeq } from '@/lib/purchasing/docNumber'
import { poLineNetRatio } from '@/lib/po-payment'
import { allocateBackorders } from '@/lib/purchasing/backorders'
import { effectiveTreatment, usageTypeForTreatment } from '@/lib/purchasing/treatment'
import { nextVal } from '@/lib/counter'

type Db = Awaited<ReturnType<typeof getDb>>

export async function generateGrNumber(db: Db) {
  const prefix = `GR-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-`
  const seq = nextSeq((await db.goodsReceipt.findMany({ where: { grNumber: { startsWith: prefix } }, select: { grNumber: true } })).map(r => r.grNumber))
  return `${prefix}${String(seq).padStart(3, '0')}`
}

export interface ReceiveGoodsItemInput {
  itemId?: string | null
  poItemId?: string | null
  itemName: string
  unit?: string
  receivedQty: number
  unitCost?: number
  outcome?: string
  batch?: string
  expiryDate?: string
  notes?: string
}

/**
 * Creates a GoodsReceipt for a PurchaseOrder: increments/creates stock lots, records RECEIPT
 * movements, advances PurchaseOrderItem.receivedQty, raises discrepancy/outcome exceptions,
 * updates standardCost, continues the transit chain if this leg was part of one, then
 * finalizes PO status. Shared by the staff-session POST /api/purchasing/receipts flow and the
 * no-login PUT /api/po-receive/[token] flow (see src/app/po-receive/[token]/page.tsx) — re-fetches
 * the PO itself so it's safe to call from either. Exactly one of receivedById/receivedByEmployeeId
 * should be set; movementCreatedById must always be a real User (StockMovement.createdById is
 * required) — the no-login flow falls back to PurchaseOrder.createdById, mirroring how
 * receiveTransferLeg falls back to StockTransfer.dispatchedById.
 */
export async function receiveGoods(db: Db, params: {
  orderId: string
  locationId: string
  notes?: string | null
  receivePhotoKey?: string | null
  receiverName?: string | null
  receivedById: string | null
  receivedByEmployeeId: string | null
  movementCreatedById: string
  items: ReceiveGoodsItemInput[]
}) {
  const { orderId, items } = params
  if (!items.length) return { ok: false, error: 'At least 1 item is required', status: 400 }

  const po = await db.purchaseOrder.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      deliveryLocationId: true,
      poNumber: true,
      supplierName: true,
      bookingId: true,
      openTripId: true,
      deliveryLocation: { select: { name: true } },
      transitStops: { orderBy: { sequence: 'asc' }, select: { locationId: true, location: { select: { name: true } } } },
    },
  })
  if (!po) return { ok: false, error: 'PO not found', status: 404 }
  if (!['IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(po.status))
    return { ok: false, error: 'Items can only be received once the PO is In Transit', status: 400 }

  // When the PO has a transit route, goods from the supplier can only land at the first
  // transit stop — the caller-supplied locationId is ignored/overridden for routed POs.
  const firstStop = po.transitStops[0]
  const hasRoute = !!firstStop
  const effectiveLocationId = hasRoute ? firstStop.locationId : params.locationId
  const receivingLocationName = hasRoute ? firstStop.location.name : null
  const locationNameForExceptions = receivingLocationName ?? po.deliveryLocation?.name ?? effectiveLocationId

  const grNumber = await generateGrNumber(db)

  // A PO delivered straight to a ship/galley (no warehouse in between) is usage on arrival —
  // except beverages, which land in the yacht's bar as stock (see shipArrivalRouter). A routed
  // PO's first stop is only a waypoint, so it keeps everything where it is.
  const receivingLoc = await db.stockLocation.findUnique({ where: { id: effectiveLocationId }, select: { id: true, ...USAGE_LOCATION_SELECT } })
  const route = hasRoute ? null : await shipArrivalRouter(db, effectiveLocationId)

  const itemIds = items.map(it => it.itemId).filter(Boolean) as string[]
  const purchaseItemsData = await db.purchaseItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, conversionFactor: true, standardCost: true, baseUnit: true, name: true, isStockTracked: true, type: true, treatment: true },
  })
  const conversionMap = new Map(purchaseItemsData.map(i => [i.id, i.conversionFactor]))
  const itemDataMap = new Map(purchaseItemsData.map(i => [i.id, i]))
  const stockTrackedMap = new Map(purchaseItemsData.map(i => [i.id, i.isStockTracked]))

  const { gr, newStatus } = await db.$transaction(async (tx) => {
    // Resolved once up front (rather than per-item inside the loop below) so the same
    // lookup can also seed GoodsReceiptItem.sourceInventoryItemId at create time.
    const poItemsByLineIndex = await Promise.all(items.map(it =>
      it.poItemId
        ? tx.purchaseOrderItem.findUnique({ where: { id: it.poItemId } })
        : tx.purchaseOrderItem.findFirst({ where: { orderId, itemId: it.itemId || null, itemName: it.itemName } }),
    ))

    // Received value uses the PO line's price AFTER its per-line discount, so stock lots /
    // moving-average cost reflect what was actually paid.
    const netUnitCost = (i: number) => {
      const raw = Number(items[i].unitCost) || 0
      const po = poItemsByLineIndex[i]
      return po ? raw * poLineNetRatio(po) : raw
    }

    const gr = await tx.goodsReceipt.create({
      data: {
        id: crypto.randomUUID(),
        grNumber,
        orderId,
        receivedById: params.receivedById,
        receivedByEmployeeId: params.receivedByEmployeeId,
        receiverName: params.receiverName?.trim() || null,
        locationId: effectiveLocationId,
        notes: params.notes?.trim() || null,
        receivePhotoKey: params.receivePhotoKey || null,
        receivedAt: new Date(),
        items: {
          create: items.map((it, i) => ({
            id: crypto.randomUUID(),
            itemId: it.itemId || null,
            itemName: it.itemName,
            receivedQty: Number(it.receivedQty),
            unitCost: netUnitCost(i),
            outcome: it.outcome || 'ACCEPTED',
            condition: it.outcome || 'good',
            batch: it.batch?.trim() || null,
            expiryDate: it.expiryDate ? new Date(it.expiryDate) : null,
            notes: it.notes?.trim() || null,
            sourceInventoryItemId: poItemsByLineIndex[i]?.sourceInventoryItemId ?? null,
          })),
        },
      },
      include: { items: true },
    })

    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!it.receivedQty) continue
      const purchaseQty = Number(it.receivedQty)
      if (purchaseQty <= 0) continue

      // Advance the PO line's receivedQty regardless of whether it's linked to a master item —
      // custom/non-stock lines (e.g. one-off purchases) still need to reach RECEIVED status.
      const poItem = poItemsByLineIndex[i]
      if (poItem) {
        await tx.purchaseOrderItem.update({ where: { id: poItem.id }, data: { receivedQty: { increment: purchaseQty } } })
      }

      // Lines requested against a specific existing InventoryItem (see "Convert to Stock"'s
      // sibling picker in Purchase Request creation) never touch StockLot/StockMovement at
      // all — they have no PurchaseItem catalog link, and their stock ledger IS the
      // InventoryItem row itself, incremented directly by the physical quantity received.
      if (poItem?.sourceInventoryItemId) {
        await tx.inventoryItem.update({
          where: { id: poItem.sourceInventoryItemId },
          data: { quantity: { increment: Math.round(purchaseQty) } },
        })
        continue
      }

      // How this line is treated on a ship (src/lib/purchasing/treatment.ts). An ASSET reaching
      // its final ship destination with a Room/Category on its PO line becomes an InventoryItem
      // there — equipment, not usage, so no stock lot / usage movement and never a trip cost.
      const treatment = effectiveTreatment(poItem?.treatment, it.itemId ? itemDataMap.get(it.itemId)?.treatment : null)
      const arrivalLoc = route?.(it.itemId ? itemDataMap.get(it.itemId)?.type : null) ?? null
      if (treatment === 'ASSET' && arrivalLoc?.yachtId && poItem?.inventoryCategoryId) {
        const category = await tx.inventoryCategory.findUnique({
          where: { id: poItem.inventoryCategoryId },
          select: { id: true, roomId: true, room: { select: { locationId: true } } },
        })
        if (category) {
          await tx.inventoryItem.create({
            data: {
              id: crypto.randomUUID(),
              itemNumber: 'INV-' + String(await nextVal('inventory-item', db)).padStart(4, '0'),
              name: it.itemId ? (itemDataMap.get(it.itemId)?.name ?? it.itemName) : it.itemName,
              categoryId: category.id,
              roomId: category.roomId,
              locationId: category.room.locationId,
              quantity: Math.max(1, Math.round(purchaseQty)),
              unitPrice: netUnitCost(i),
              vendorName: po.supplierName ?? null,
              purchaseDate: new Date(),
              sourcePoId: orderId,
              notes: `Received on ${grNumber} (${po.poNumber ?? 'PO'})`,
              createdById: params.movementCreatedById,
            },
          })
          continue
        }
      }

      // Stock lot / movement: applies to catalog items and to custom/non-catalog
      // PO lines alike (e.g. one-off purchases like "Grab" or event flowers) —
      // custom lines are keyed by (itemName, locationId) instead of itemId.
      const factor = it.itemId ? (conversionMap.get(it.itemId) ?? 1) : 1
      const baseQty = purchaseQty * factor                                // e.g. 1 carton × 24 = 24 cans
      const purchaseUnitCost = netUnitCost(i)                            // actual invoice price
      const baseCostPerUnit = factor > 1 && purchaseUnitCost > 0         // e.g. 48000 / 24 = 2000/can
        ? purchaseUnitCost / factor
        : purchaseUnitCost

      // Catalog items merge into one running-balance lot per item+location (stock
      // is fungible). Non-catalog items, and catalog items explicitly marked
      // isStockTracked: false (a promoted "non-stock" master item — see
      // /api/purchasing/requests/[id]/items/[itemId]), don't merge — each receipt
      // gets its own lot tagged with sourcePoId, so it stays traceable to exactly
      // the PO/date/cost that brought it in, without ever pooling into a location's
      // stock balance or feeding min-stock/reorder logic.
      const isStockTracked = it.itemId ? (stockTrackedMap.get(it.itemId) ?? true) : false
      const dest = route?.(it.itemId ? itemDataMap.get(it.itemId)?.type : null) ?? receivingLoc
      const destId = dest?.id ?? effectiveLocationId
      const usage = dest ? shipUsageOnArrival(null, dest) : null
      // CONSUMABLE → trip usage, SPARE_PART → ship maintenance, ASSET (no Room/Category to land
      // in) → no usage at all — it's still equipment, just held as stock until registered.
      const usageType = usageTypeForTreatment(treatment)
      const incomingCost = baseCostPerUnit || (it.itemId ? itemDataMap.get(it.itemId)?.standardCost ?? 0 : 0)
      if (it.itemId && isStockTracked) {
        // Moving average: the location's running cost is re-blended with this receipt's
        // invoice price, so later transfers/usage are valued at the true average cost.
        const lot = await tx.stockLot.findFirst({ where: { itemId: it.itemId, locationId: destId } })
        if (lot) {
          await tx.stockLot.update({
            where: { id: lot.id },
            data: {
              quantity: { increment: baseQty },
              costPerUnit: movingAverageCost(lot.quantity, lot.costPerUnit, baseQty, incomingCost),
              updatedAt: new Date(),
            },
          })
        } else {
          await tx.stockLot.create({
            data: { id: crypto.randomUUID(), locationId: destId, quantity: baseQty, costPerUnit: incomingCost, updatedAt: new Date(), itemId: it.itemId },
          })
        }
      } else {
        await tx.stockLot.create({
          data: {
            id: crypto.randomUUID(), locationId: destId, quantity: baseQty, costPerUnit: baseCostPerUnit, updatedAt: new Date(),
            itemName: it.itemName, unit: it.unit?.trim() || null, sourcePoId: orderId,
          },
        })
      }
      await tx.stockMovement.create({
        data: {
          id: crypto.randomUUID(), toLocationId: destId, quantity: baseQty, type: 'RECEIPT', referenceId: gr.id, referenceType: 'GoodsReceipt', createdById: params.movementCreatedById,
          ...(it.itemId ? { itemId: it.itemId } : { itemName: it.itemName }),
          unitCost: incomingCost,
          totalCost: baseQty * incomingCost,
          ...(usage && usageType && {
            usageType,
            yachtId: usage.yachtId,
            openTripId: po.openTripId,
            tripBookingId: po.bookingId,
          }),
        },
      })

      // Everything below (discrepancy checks, standard cost) only applies to
      // stock-tracked items linked to the master catalog — non-stock items don't
      // carry a standardCost/min-stock concept to keep in sync.
      if (!it.itemId || !isStockTracked) continue

      if (poItem) {
        // Auto-create Receiving Discrepancy exception if qty received ≠ qty remaining
        const remaining = poItem.orderedQty - poItem.receivedQty
        const discrepancy = purchaseQty - remaining
        if (Math.abs(discrepancy) > 0.0001) {
          const itemInfo = itemDataMap.get(it.itemId)
          const unitCostForValue = netUnitCost(i) || itemInfo?.standardCost || 0
          await tx.inventoryException.create({
            data: {
              id: crypto.randomUUID(),
              type: 'RECEIVING_DISCREPANCY',
              itemId: it.itemId,
              itemName: it.itemName,
              locationId: effectiveLocationId,
              locationName: locationNameForExceptions,
              qty: Math.abs(discrepancy),
              value: Math.abs(discrepancy) * unitCostForValue,
              reason: `${discrepancy < 0 ? 'Short' : 'Over'} delivery on ${po.poNumber ?? orderId} from ${po.supplierName ?? 'supplier'}. Expected ${remaining} ${itemInfo?.baseUnit ?? ''}, received ${purchaseQty} ${itemInfo?.baseUnit ?? ''}.`,
              referenceId: gr.id,
              referenceType: 'GoodsReceipt',
              status: 'OPEN',
              updatedAt: new Date(),
            },
          })
        }
      }

      // Auto-create exception if outcome ≠ ACCEPTED
      const outcome = it.outcome || 'ACCEPTED'
      if (['DAMAGED', 'WRONG_ITEM', 'REJECTED'].includes(outcome)) {
        const itemInfo = itemDataMap.get(it.itemId)
        const outcomeLabel: Record<string, string> = {
          DAMAGED: 'Damaged goods received',
          WRONG_ITEM: 'Wrong item received',
          REJECTED: 'Goods rejected on receipt',
        }
        await tx.inventoryException.create({
          data: {
            id: crypto.randomUUID(),
            type: 'RECEIVING_DISCREPANCY',
            itemId: it.itemId,
            itemName: it.itemName,
            locationId: effectiveLocationId,
            locationName: locationNameForExceptions,
            qty: purchaseQty,
            value: purchaseQty * (netUnitCost(i) || itemDataMap.get(it.itemId)?.standardCost || 0),
            reason: `${outcomeLabel[outcome]}: ${purchaseQty} ${itemDataMap.get(it.itemId)?.baseUnit ?? ''} on ${po.poNumber ?? orderId} from ${po.supplierName ?? 'supplier'}`,
            referenceId: gr.id,
            referenceType: 'GoodsReceipt',
            status: 'OPEN',
            updatedAt: new Date(),
          },
        })
      }

      // Auto-update standard cost per BASE unit
      if (baseCostPerUnit > 0) {
        await tx.purchaseItem.update({ where: { id: it.itemId }, data: { standardCost: baseCostPerUnit } })
      }
    }

    // If this PO has a transit route, spawn the next leg (first stop -> next stop/final
    // destination) as a normal StockTransfer — still needs its own dispatch+receive.
    // Inventory-linked lines are excluded: they already incremented their InventoryItem
    // above (StockTransfer legs move StockLot balances, which these lines never touch),
    // so forwarding them further isn't meaningful — a routed PO carrying such a line only
    // makes sense if it's the sole/final stop, matching effectiveLocationId already.
    if (hasRoute) {
      const routeLocationIds = [...po.transitStops.map(s => s.locationId), po.deliveryLocationId!]
      const nextHop = resolveNextHop(routeLocationIds, effectiveLocationId)
      const transferableItems = gr.items.filter(i => !i.sourceInventoryItemId)
      if (nextHop && transferableItems.length > 0) {
        await spawnNextTransitLeg(tx, {
          purchaseOrderId: orderId,
          originGoodsReceiptId: gr.id,
          legSequence: 1,
          fromLocationId: effectiveLocationId,
          toLocationId: nextHop,
          // GR lines are in purchase units, but stock lots/transfers are in base units.
          items: transferableItems.map(i => {
            const factor = i.itemId ? (conversionMap.get(i.itemId) ?? 1) : 1
            return {
              itemId: i.itemId,
              itemName: i.itemName,
              requestedQty: i.receivedQty * factor,
              unitCost: i.unitCost > 0 ? i.unitCost / factor : (i.itemId ? itemDataMap.get(i.itemId)?.standardCost ?? 0 : 0),
            }
          }),
        })
      }
    }

    // Update PO status — no-ops while any transit leg for this PO is still open, including
    // the one just spawned above, so a routed PO only finalizes once goods physically reach
    // the final destination.
    const newStatus = await attemptFinalizePOStatus(tx, orderId)

    return { gr, newStatus }
  })

  if (newStatus) {
    const label = newStatus === 'RECEIVED' ? 'Items Received' : 'Items Partially Received'
    const msg = newStatus === 'RECEIVED'
      ? `${po.poNumber} from ${po.supplierName ?? 'supplier'} has been fully received at the warehouse`
      : `${po.poNumber} from ${po.supplierName ?? 'supplier'} was partially received — check the receipt details`
    notifyByRole(db, ['PURCHASING', 'ADMIN'], newStatus === 'RECEIVED' ? 'PO_RECEIVED' : 'PO_PARTIALLY_RECEIVED',
      label, msg, orderId,
    ).catch(console.error)
    notifyPoArrivalToRequester(db, orderId, newStatus, po.poNumber, params.receivedById)
  }

  // Restock landing in a warehouse → ship PR lines backordered there (draft follow-up TRs).
  await allocateBackorders(db, effectiveLocationId, items.map(i => i.itemId ?? null))

  return { ok: true, gr, newStatus }
}

