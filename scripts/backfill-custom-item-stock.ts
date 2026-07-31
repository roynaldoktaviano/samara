/**
 * One-off backfill: create StockLot/StockMovement rows for GoodsReceiptItem
 * rows that were received before custom (non-catalog) PO items started
 * generating stock records — see src/app/api/purchasing/receipts/route.ts.
 *
 * Idempotent: skips receipts that already have a matching StockMovement
 * (referenceId = the GoodsReceipt id, itemName match), so it's safe to re-run.
 *
 * Run: npx tsx scripts/backfill-custom-item-stock.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const items = await db.goodsReceiptItem.findMany({
    where: { itemId: null, receivedQty: { gt: 0 } },
    include: { receipt: { select: { id: true, locationId: true, orderId: true, receivedById: true, receivedAt: true } } },
    orderBy: { receipt: { receivedAt: 'asc' } },
  })
  console.log(`Found ${items.length} custom (non-catalog) receipt line(s) to backfill.`)

  let created = 0
  let skipped = 0

  for (const it of items) {
    const { receipt } = it
    if (!receipt.receivedById) { skipped++; continue }
    const already = await db.stockMovement.findFirst({
      where: { referenceId: receipt.id, referenceType: 'GoodsReceipt', itemName: it.itemName, itemId: null },
      select: { id: true },
    })
    if (already) { skipped++; continue }

    const poItem = await db.purchaseOrderItem.findFirst({
      where: { orderId: receipt.orderId, itemId: null, itemName: it.itemName },
      select: { unit: true },
    })

    const lot = await db.stockLot.findFirst({ where: { itemId: null, itemName: it.itemName, locationId: receipt.locationId } })
    if (lot) {
      await db.stockLot.update({ where: { id: lot.id }, data: { quantity: { increment: it.receivedQty }, updatedAt: receipt.receivedAt } })
    } else {
      await db.stockLot.create({
        data: {
          id: crypto.randomUUID(), locationId: receipt.locationId, itemName: it.itemName, unit: poItem?.unit ?? null,
          quantity: it.receivedQty, costPerUnit: it.unitCost, createdAt: receipt.receivedAt, updatedAt: receipt.receivedAt,
        },
      })
    }
    await db.stockMovement.create({
      data: {
        id: crypto.randomUUID(), itemName: it.itemName, toLocationId: receipt.locationId, quantity: it.receivedQty,
        type: 'RECEIPT', referenceId: receipt.id, referenceType: 'GoodsReceipt', createdById: receipt.receivedById, createdAt: receipt.receivedAt,
      },
    })
    created++
  }

  console.log(`Done. Backfilled ${created} line(s), skipped ${skipped} already-backfilled line(s).`)
  await db.$disconnect()
}

main().catch(e => {
  console.error('Backfill failed:', e)
  process.exit(1)
})
