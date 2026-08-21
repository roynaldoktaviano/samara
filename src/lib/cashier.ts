import type { PrismaClient } from '@prisma/client'

export interface CashierCartItem {
  itemId: string | null
  packageId?: string | null
  name: string
  price: number
  qty: number
  unit: string
}

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

/** Records cart items against a sale, deducting vessel stock and logging movements. Returns the items' total value. */
export async function applyItemsToSale(
  tx: Tx, saleId: string, locationId: string, items: CashierCartItem[], round: number, userId: string,
): Promise<number> {
  let addedTotal = 0
  for (const it of items) {
    const qty = Number(it.qty)
    if (!qty || qty <= 0) continue
    addedTotal += qty * Number(it.price)

    await tx.cashierSaleItem.create({
      data: {
        id: crypto.randomUUID(), saleId, itemId: it.itemId || null, packageId: it.packageId || null,
        name: it.name, unit: it.unit, price: Number(it.price), qty, round,
      },
    })

    if (!it.itemId) continue // package or ad-hoc item, not tied to inventory — no stock movement

    const lot = await tx.stockLot.findFirst({ where: { itemId: it.itemId, locationId } })
    const currentQty = lot?.quantity ?? 0

    if (currentQty < qty) {
      await tx.inventoryException.create({
        data: {
          id: crypto.randomUUID(), type: 'NEGATIVE_STOCK', itemId: it.itemId, itemName: it.name,
          locationId, locationName: '', qty: qty - currentQty,
          reason: `Stock kurang saat cashier sale ${saleId}`,
          referenceId: saleId, referenceType: 'CashierSale', status: 'OPEN', updatedAt: new Date(),
        },
      })
    }

    if (lot) {
      await tx.stockLot.update({ where: { id: lot.id }, data: { quantity: { decrement: qty }, updatedAt: new Date() } })
    } else {
      await tx.stockLot.create({ data: { id: crypto.randomUUID(), itemId: it.itemId, locationId, quantity: -qty, costPerUnit: 0, updatedAt: new Date() } })
    }

    await tx.stockMovement.create({
      data: {
        id: crypto.randomUUID(), itemId: it.itemId, fromLocationId: locationId, quantity: qty,
        type: 'POS_SALE', referenceId: saleId, referenceType: 'CashierSale', createdById: userId,
      },
    })
  }
  return addedTotal
}

export type DiscountResolution =
  | { ok: true; discountId: string; discountName: string; discountAmount: number }
  | { ok: false; error: string }

/**
 * Validates a discount against a yacht and computes its amount off the sale's current
 * item subtotal — always server-side, never trusting a client-sent discount amount.
 * PERCENT is a percentage of the subtotal; FIXED is a flat amount, both clamped so the
 * discount can never exceed the subtotal.
 */
export async function resolveDiscount(tx: Tx, discountId: string, yachtId: string, subtotal: number): Promise<DiscountResolution> {
  const discount = await tx.posDiscount.findUnique({ where: { id: discountId } })
  if (!discount || !discount.isActive) return { ok: false, error: 'Discount not found or inactive' }
  if (discount.yachtId && discount.yachtId !== yachtId) return { ok: false, error: 'Discount is not available for this yacht' }
  const now = new Date()
  if (discount.startDate && now < discount.startDate) return { ok: false, error: 'Discount is not active yet' }
  if (discount.endDate && now > discount.endDate) return { ok: false, error: 'Discount has expired' }

  const raw = discount.type === 'PERCENT' ? subtotal * (discount.value / 100) : discount.value
  const discountAmount = Math.max(0, Math.min(raw, subtotal))
  return { ok: true, discountId: discount.id, discountName: discount.name, discountAmount }
}
