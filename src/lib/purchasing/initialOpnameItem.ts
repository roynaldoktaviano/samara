import type { PrismaClient } from '@prisma/client'

// Stock Opname Awal's Add/Edit Product popups use the same full form as Items & Pricing
// (see components/purchasing/items/ItemFormFields), so the opname routes return and accept
// the same product fields. standardCost stays read-only (driven by GR), never written here.
export const OPNAME_ITEM_SELECT = {
  id: true, sku: true, name: true, type: true, category: true,
  baseUnit: true, purchaseUnit: true, conversionFactor: true,
  standardCost: true, sellingPrice: true, valuationMethod: true,
  minStock: true, reorderQty: true, imageKey: true, isSoldInPos: true, isStockTracked: true,
} as const

/** Validates the Items & Pricing form body; returns the PurchaseItem fields to write or an error. */
export async function parseOpnameItemForm(db: PrismaClient, body: Record<string, unknown>, editingId?: string) {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const sku = str(body.sku).toUpperCase()
  const name = str(body.name)
  const type = str(body.type)
  const category = str(body.category)
  const baseUnit = str(body.baseUnit)
  const purchaseUnit = str(body.purchaseUnit)
  if (!sku || !name || !type || !category || !baseUnit || !purchaseUnit) {
    return { error: 'SKU, nama, type, kategori, base unit, dan purchase unit wajib diisi' } as const
  }
  const typeConfig = await db.purchaseItemTypeConfig.findUnique({ where: { code: type } })
  if (!typeConfig || !typeConfig.isActive) return { error: 'Type tidak valid' } as const
  const skuConflict = await db.purchaseItem.findFirst({ where: { sku, ...(editingId ? { NOT: { id: editingId } } : {}) }, select: { id: true } })
  if (skuConflict) return { error: `SKU "${sku}" sudah digunakan` } as const

  return {
    data: {
      sku, name, type, category, baseUnit, purchaseUnit,
      conversionFactor: Number(body.conversionFactor) || 1,
      sellingPrice: Number(body.sellingPrice) || 0,
      minStock: Number(body.minStock) || 0,
      reorderQty: Number(body.reorderQty) || 0,
      imageKey: typeof body.imageKey === 'string' && body.imageKey ? body.imageKey : null,
      isSoldInPos: body.isSoldInPos !== undefined ? Boolean(body.isSoldInPos) : true,
    },
  } as const
}
