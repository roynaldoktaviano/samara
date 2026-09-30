import type { PrismaClient } from '@prisma/client'
import { effectiveConsumptionMode } from '@/lib/purchasing/consumptionMode'
import { USAGE_LOCATION_SELECT } from '@/lib/purchasing/usage'

export interface CashierCartItem {
  itemId: string | null
  packageId?: string | null
  recipeId?: string | null
  name: string
  price: number
  qty: number
  unit: string
}

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

/**
 * Who a sale's bar usage is charged to. Usage is only recorded when the sale's location holds
 * stock (the POS bar) — at an EXPENSE_ON_RECEIVE location the goods were already expensed
 * when they arrived, so recording them again would double count.
 */
interface UsageContext {
  holdsStock: boolean
  usageType: 'BAR_COGS' | 'COMPLIMENTARY'
  yachtId: string
  openTripId: string | null
  tripBookingId: string | null
}

async function usageContext(tx: Tx, saleId: string, locationId: string): Promise<UsageContext> {
  const [sale, location] = await Promise.all([
    tx.cashierSale.findUnique({
      where: { id: saleId },
      select: { yachtId: true, payMethod: true, booking: { select: { id: true, tripType: true, openTripId: true } } },
    }),
    tx.stockLocation.findUnique({ where: { id: locationId }, select: USAGE_LOCATION_SELECT }),
  ])
  const b = sale?.booking
  return {
    holdsStock: !!location && effectiveConsumptionMode(location) === 'HOLD_AS_STOCK',
    usageType: sale?.payMethod === 'Complimentary' ? 'COMPLIMENTARY' : 'BAR_COGS',
    yachtId: sale?.yachtId ?? location?.yachtId ?? '',
    // A private charter is its own trip; an Open Trip booking is charged to the shared trip.
    // No booking (e.g. a staff purchase) → Trip Stats allocates it by date.
    openTripId: b && b.tripType !== 'PRIVATE_CHARTER' ? b.openTripId : null,
    tripBookingId: b?.tripType === 'PRIVATE_CHARTER' ? b.id : null,
  }
}

/** Deducts `qty` (base unit) of one item from the sale's location, logging the movement and its cost. */
async function deductStock(
  tx: Tx, p: { saleId: string; locationId: string; itemId: string; name: string; qty: number; userId: string; ctx: UsageContext; notes?: string },
) {
  const lot = await tx.stockLot.findFirst({ where: { itemId: p.itemId, locationId: p.locationId } })
  const currentQty = lot?.quantity ?? 0

  if (currentQty < p.qty) {
    await tx.inventoryException.create({
      data: {
        id: crypto.randomUUID(), type: 'NEGATIVE_STOCK', itemId: p.itemId, itemName: p.name,
        locationId: p.locationId, locationName: '', qty: p.qty - currentQty,
        reason: `Insufficient stock on cashier sale ${p.saleId}`,
        referenceId: p.saleId, referenceType: 'CashierSale', status: 'OPEN', updatedAt: new Date(),
      },
    })
  }

  // Moving-average cost at the bar; a lot with no cost yet (or none at all) falls back to the
  // item's last purchase cost so the sale is still costed.
  let unitCost = lot?.costPerUnit ?? 0
  if (!unitCost) {
    const item = await tx.purchaseItem.findUnique({ where: { id: p.itemId }, select: { standardCost: true } })
    unitCost = item?.standardCost ?? 0
  }

  if (lot) {
    await tx.stockLot.update({ where: { id: lot.id }, data: { quantity: { decrement: p.qty }, updatedAt: new Date() } })
  } else {
    await tx.stockLot.create({ data: { id: crypto.randomUUID(), itemId: p.itemId, locationId: p.locationId, quantity: -p.qty, costPerUnit: unitCost, updatedAt: new Date() } })
  }

  await tx.stockMovement.create({
    data: {
      id: crypto.randomUUID(), itemId: p.itemId, fromLocationId: p.locationId, quantity: p.qty,
      type: 'POS_SALE', referenceId: p.saleId, referenceType: 'CashierSale', createdById: p.userId,
      notes: p.notes ?? null,
      unitCost,
      totalCost: p.qty * unitCost,
      ...(p.ctx.holdsStock && {
        usageType: p.ctx.usageType,
        yachtId: p.ctx.yachtId || null,
        openTripId: p.ctx.openTripId,
        tripBookingId: p.ctx.tripBookingId,
      }),
    },
  })
}

/**
 * Records cart items against a sale, deducting bar stock and logging costed usage movements.
 * A plain item deducts itself; a Menu (recipe) deducts each ingredient × qty; a package never
 * deducts stock. Returns the items' total value.
 */
export async function applyItemsToSale(
  tx: Tx, saleId: string, locationId: string, items: CashierCartItem[], round: number, userId: string,
): Promise<number> {
  let addedTotal = 0
  let ctx: UsageContext | null = null
  for (const it of items) {
    const qty = Number(it.qty)
    if (!qty || qty <= 0) continue
    addedTotal += qty * Number(it.price)

    const recipeId = it.recipeId || null
    const itemId = recipeId ? null : it.itemId || null
    await tx.cashierSaleItem.create({
      data: {
        id: crypto.randomUUID(), saleId, itemId, packageId: it.packageId || null, recipeId,
        name: it.name, unit: it.unit, price: Number(it.price), qty, round,
      },
    })

    if (!itemId && !recipeId) continue // package or ad-hoc item, not tied to inventory — no stock movement
    ctx ??= await usageContext(tx, saleId, locationId)

    if (itemId) {
      await deductStock(tx, { saleId, locationId, itemId, name: it.name, qty, userId, ctx })
      continue
    }
    const lines = await tx.posRecipeLine.findMany({ where: { recipeId: recipeId! }, include: { item: { select: { name: true } } } })
    for (const l of lines) {
      await deductStock(tx, { saleId, locationId, itemId: l.itemId, name: l.item.name, qty: l.qty * qty, userId, ctx, notes: `${qty} × ${it.name}` })
    }
  }
  return addedTotal
}

/** Re-labels a sale's bar usage as COMPLIMENTARY when it closes as Complimentary (items were added as BAR_COGS). */
export async function markSaleComplimentary(tx: Tx, saleId: string) {
  await tx.stockMovement.updateMany({
    where: { referenceId: saleId, referenceType: 'CashierSale', usageType: 'BAR_COGS' },
    data: { usageType: 'COMPLIMENTARY' },
  })
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
