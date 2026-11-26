import type { PrismaClient } from '@prisma/client'

// Ship Inventory (INV-xxxx) rows inside an Initial Stock Opname. They have no catalog
// product (itemId = null) — linked via StockCountItem.inventoryItemId instead, pre-filled
// with the item's current Jumlah, and written back to InventoryItem.quantity on Finish.

export const OPNAME_INVENTORY_SELECT = {
  id: true, itemNumber: true, name: true, brand: true, quantity: true, isActive: true,
  room: { select: { name: true } },
  category: { select: { name: true } },
} as const

export const isShipLocation = (loc: { type: string; yachtId: string | null }) => loc.type === 'VESSEL' || !!loc.yachtId

/** Adds a row for every active Inventory item at the location that the opname doesn't have yet. Returns rows added. */
export async function addInventoryRows(db: PrismaClient, countId: string, locationId: string) {
  const [items, existing] = await Promise.all([
    db.inventoryItem.findMany({ where: { locationId, isActive: true }, select: { id: true, name: true, quantity: true } }),
    db.stockCountItem.findMany({ where: { countId, inventoryItemId: { not: null } }, select: { inventoryItemId: true } }),
  ])
  const have = new Set(existing.map(e => e.inventoryItemId))
  const rows = items.filter(i => !have.has(i.id)).map(i => ({
    id: crypto.randomUUID(), countId, inventoryItemId: i.id, itemName: i.name, systemQty: i.quantity, countedQty: i.quantity,
  }))
  if (rows.length) await db.stockCountItem.createMany({ data: rows })
  return rows.length
}
