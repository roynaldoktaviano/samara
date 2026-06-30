import type { PrismaClient } from '@prisma/client'

export interface CashierCartItem {
  itemId: string | null
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
        id: crypto.randomUUID(), saleId, itemId: it.itemId || null,
        name: it.name, unit: it.unit, price: Number(it.price), qty, round,
      },
    })

    if (!it.itemId) continue // ad-hoc item not tied to inventory — no stock movement

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
