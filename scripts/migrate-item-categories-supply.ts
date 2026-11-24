// Item Category (PurchaseItemTypeConfig) restructure, 2026-11-24:
//   Food, Beverage            → unchanged
//   Fuel                      → new, no Sub-Category
//   Asset                     → new; Maintenance items with Type = Asset move here
//   Supply                    → new; Maintenance (rest) + Housekeeping merge here, sub-categories carried over
//   Maintenance, Housekeeping, Material, Diving → deactivated (kept, not deleted)
//
// Only PurchaseItem.type stores the category code. Dry-run by default; pass --apply to write.
// Usage: npx tsx scripts/migrate-item-categories-supply.ts [--apply]
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const OLD_TO_SUPPLY = ['MAINTENANCE', 'HOUSEKEEPING']
const DEACTIVATE = ['MAINTENANCE', 'HOUSEKEEPING', 'MATERIAL', 'DIVING']
const NEW_TYPES = [
  { code: 'FUEL', label: 'Fuel' },
  { code: 'ASSET', label: 'Asset' },
  { code: 'SUPPLY', label: 'Supply' },
]

async function main() {
  console.log(APPLY ? '=== APPLY ===' : '=== DRY RUN (pass --apply to write) ===')

  const oldCats = await db.purchaseItemCategory.findMany({ where: { typeCode: { in: OLD_TO_SUPPLY } }, orderBy: { createdAt: 'asc' } })
  const assetItems = await db.purchaseItem.findMany({ where: { type: { in: OLD_TO_SUPPLY }, treatment: 'ASSET' }, select: { id: true, sku: true, name: true, category: true } })
  const supplyItems = await db.purchaseItem.findMany({ where: { type: { in: OLD_TO_SUPPLY }, NOT: { treatment: 'ASSET' } }, select: { id: true, category: true, type: true } })

  // Supply sub-categories = active old ones (first wins on duplicate name) + any name items actually use.
  const supplySubs = new Map<string, string>()
  for (const c of oldCats) if (c.isActive && !supplySubs.has(c.name)) supplySubs.set(c.name, c.skuPrefix)
  for (const i of supplyItems) if (i.category && !supplySubs.has(i.category)) supplySubs.set(i.category, oldCats.find(c => c.name === i.category)?.skuPrefix ?? '')

  // Asset starts with General + Other; the legacy "Non-Stock" label isn't carried over (those items → General).
  const assetSubOf = (c: string) => (!c || c === 'Non-Stock' ? 'General' : c)
  const assetSubs = new Map<string, string>([['General', ''], ['Other', '']])
  for (const i of assetItems) if (!assetSubs.has(assetSubOf(i.category))) assetSubs.set(assetSubOf(i.category), oldCats.find(c => c.name === i.category)?.skuPrefix ?? '')

  console.log('New categories:', NEW_TYPES.map(t => t.label).join(', '))
  console.log(`Supply sub-categories (${supplySubs.size}):`, [...supplySubs.keys()].join(', '))
  console.log(`Asset sub-categories (${assetSubs.size}):`, [...assetSubs.keys()].join(', '))
  console.log(`Items → Asset (${assetItems.length}):`, assetItems.map(i => `${i.sku} ${i.name} [${i.category} → ${assetSubOf(i.category)}]`).join('; '))
  console.log('Supply items still on "Non-Stock":', supplyItems.filter(i => i.category === 'Non-Stock').length)
  const byOld = supplyItems.reduce<Record<string, number>>((m, i) => ((m[i.type] = (m[i.type] ?? 0) + 1), m), {})
  console.log(`Items → Supply (${supplyItems.length}):`, byOld)
  console.log('Deactivate:', DEACTIVATE.join(', '))

  if (!APPLY) return

  await db.$transaction(async tx => {
    // Sequential creates keep the display order (createdAt asc): Food, Beverage, Fuel, Asset, Supply.
    for (const t of NEW_TYPES) {
      await tx.purchaseItemTypeConfig.upsert({ where: { code: t.code }, create: { code: t.code, label: t.label, isActive: true }, update: { label: t.label, isActive: true } })
    }
    for (const [name, skuPrefix] of supplySubs) {
      await tx.purchaseItemCategory.upsert({ where: { typeCode_name: { typeCode: 'SUPPLY', name } }, create: { typeCode: 'SUPPLY', name, skuPrefix }, update: { isActive: true } })
    }
    for (const [name, skuPrefix] of assetSubs) {
      await tx.purchaseItemCategory.upsert({ where: { typeCode_name: { typeCode: 'ASSET', name } }, create: { typeCode: 'ASSET', name, skuPrefix }, update: { isActive: true } })
    }
    const a = { count: 0 }
    for (const i of assetItems) { await tx.purchaseItem.update({ where: { id: i.id }, data: { type: 'ASSET', category: assetSubOf(i.category) } }); a.count++ }
    const s = await tx.purchaseItem.updateMany({ where: { id: { in: supplyItems.map(i => i.id) } }, data: { type: 'SUPPLY' } })
    const d = await tx.purchaseItemTypeConfig.updateMany({ where: { code: { in: DEACTIVATE } }, data: { isActive: false } })
    console.log(`Applied: ${a.count} → Asset, ${s.count} → Supply, ${d.count} categories deactivated`)
  })
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
