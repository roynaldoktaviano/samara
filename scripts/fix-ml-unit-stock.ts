// One-off: items switched pcs → ml/gr (1 pcs = N ml) before the items API rescaled stored
// quantities, so their bottle counts read as ml (AL 06 / AL 12 / AL 14 on 2026-10-27).
// Detects them by a per-bottle cost still sitting on a ml/gr base unit, so re-running is safe.
// Run:  npx tsx scripts/fix-ml-unit-stock.ts            (dry run)
//       npx tsx scripts/fix-ml-unit-stock.ts --apply    (writes)
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import { rescaleItemBaseQuantities } from '../src/lib/purchasing/rescaleItemUnits'
import { isMeasureUnit } from '../src/lib/purchasing/units'
dotenv.config({ path: '.env.local' }); dotenv.config({ path: '.env' })
const APPLY = process.argv.includes('--apply')
// A bottle costs ~Rp 100k+, a ml / gr well under Rp 10k.
const PER_BOTTLE_COST = 10000
async function main() {
  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const t = await central.tenant.findFirst({ where: { slug: 'samara' }, select: { databaseUrl: true } })
  const db = new PrismaClient({ datasources: { db: { url: t!.databaseUrl } } })
  const all = await db.purchaseItem.findMany({ where: { conversionFactor: { gt: 1 } }, include: { stockLots: { include: { location: { select: { name: true } } } }, posRecipeLines: { include: { recipe: { select: { name: true, createdAt: true } } } } } })
  const items = all.filter(it => isMeasureUnit(it.baseUnit) && it.standardCost >= PER_BOTTLE_COST)
  if (!items.length) console.log('Nothing to convert.')
  for (const it of items) {
    const ratio = it.conversionFactor // was pcs ×1, now ml/pcs × factor
    // Min stock below one bottle was saved in the old pcs count (AL 06: 3 → 3 ml); AL 12's 1400 was entered in ml.
    const minStock = it.minStock > 0 && it.minStock < ratio ? it.minStock * ratio : it.minStock
    console.log(`\n${it.sku} ${it.name}: ${it.baseUnit}/${it.purchaseUnit}×${ratio}`)
    console.log('  lots:', it.stockLots.map(l => `${l.location.name} ${l.quantity} → ${l.quantity * ratio} ${it.baseUnit} @${(l.costPerUnit / ratio).toFixed(2)}`).join('; '))
    console.log(`  standardCost ${it.standardCost} → ${(it.standardCost / ratio).toFixed(2)}, minStock ${it.minStock} → ${minStock}`)
    // Recipe lines are entered in ml by whoever builds the menu — keep them.
    if (it.posRecipeLines.length) console.log('  recipe lines kept:', it.posRecipeLines.map(r => `${r.recipe.name} ${r.qty}`).join(', '))
    if (!APPLY) continue
    await db.$transaction(async tx => {
      await rescaleItemBaseQuantities(tx, it.id, ratio)
      for (const r of it.posRecipeLines) await tx.posRecipeLine.update({ where: { id: r.id }, data: { qty: r.qty } })
      await tx.purchaseItem.update({ where: { id: it.id }, data: { standardCost: it.standardCost / ratio, sellingPrice: it.sellingPrice / ratio, minStock } })
    })
    console.log('  APPLIED')
  }
  if (items.length && !APPLY) console.log('\nDry run — add --apply to write.')
  await db.$disconnect(); await central.$disconnect()
}
main()
