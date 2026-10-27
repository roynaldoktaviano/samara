import type { Prisma, PrismaClient } from '@prisma/client'

type DbOrTx = PrismaClient | Prisma.TransactionClient

type Units = { baseUnit: string; purchaseUnit: string; conversionFactor: number }

// Stock, ledger, transfer lines and recipes all store quantities in the item's BASE unit. When an
// item's base unit changes (e.g. Aperol "pcs" → "ml", 1 pcs = 700 ml), those numbers must be
// rescaled too — otherwise 3 bottles silently become 3 ml at Rp 500.000/ml.
//
// Returns how many new base units one old base unit is, or null when it can't be told safely.
// A change of conversionFactor alone (base unit kept) is a correction of the purchase pack size,
// and stored base quantities stay valid → 1.
export function baseUnitRatio(prev: Units, next: Units): number | null {
  const oldF = prev.conversionFactor > 0 ? prev.conversionFactor : 1
  const newF = next.conversionFactor > 0 ? next.conversionFactor : 1
  if (prev.baseUnit === next.baseUnit) return 1
  // The purchase unit is the anchor: 1 old purchase unit = oldF old base = newF new base.
  if (prev.purchaseUnit === next.purchaseUnit) return newF / oldF
  // The old base unit became the purchase unit (pcs → ml with purchase unit pcs).
  if (next.purchaseUnit === prev.baseUnit) return newF
  // The old purchase unit became the base unit (pcs per carton → carton).
  if (next.baseUnit === prev.purchaseUnit) return 1 / oldF
  return null
}

/** Rescales every base-unit quantity/cost stored for this item by `ratio` (new base per old base). */
export async function rescaleItemBaseQuantities(db: DbOrTx, itemId: string, ratio: number) {
  if (ratio === 1) return
  await db.stockLot.updateMany({ where: { itemId }, data: { quantity: { multiply: ratio }, costPerUnit: { divide: ratio } } })
  // totalCost is a value, not per unit → unchanged.
  await db.stockMovement.updateMany({ where: { itemId }, data: { quantity: { multiply: ratio }, unitCost: { divide: ratio } } })
  await db.stockTransferItem.updateMany({
    where: { itemId },
    data: { requestedQty: { multiply: ratio }, dispatchedQty: { multiply: ratio }, receivedQty: { multiply: ratio }, unitCost: { divide: ratio } },
  })
  await db.stockCountItem.updateMany({ where: { itemId }, data: { systemQty: { multiply: ratio }, countedQty: { multiply: ratio } } })
  await db.posRecipeLine.updateMany({ where: { itemId }, data: { qty: { multiply: ratio } } })
  await db.purchaseRequestItem.updateMany({ where: { itemId, backorderQty: { not: 0 } }, data: { backorderQty: { multiply: ratio } } })
}
