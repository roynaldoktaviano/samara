/**
 * One-off follow-up to import-otium-bar-stock.ts (2026-11-13, Roy's decisions):
 *  1. Jose Cuervo Reposado / Silver get their own items — undo the Otium Bar stock that the first
 *     run put on AL 10 / AL 11 (delete those OtiumBarOpname movements + zero the bar lots).
 *     Re-run import-otium-bar-stock.ts --apply afterwards to create the two items with their stock.
 *  2. CAN 11 Equil Sparkling Water counted per bottle: base carton → bottle, purchase unit carton
 *     × 12. All stored quantities rescale ×12 (same helper as the item edit form).
 *
 * Run:  npx tsx scripts/fix-otium-tequila-equil.ts            (dry run)
 *       npx tsx scripts/fix-otium-tequila-equil.ts --apply
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import { rescaleItemBaseQuantities } from '../src/lib/purchasing/rescaleItemUnits'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const APPLY = process.argv.includes('--apply')
const PER_CARTON = 12

async function main() {
  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenant = await central.tenant.findFirstOrThrow({ where: { slug: 'samara' }, select: { databaseUrl: true } })
  await central.$disconnect()
  const prisma = new PrismaClient({ datasources: { db: { url: tenant.databaseUrl } } })

  const otium = await prisma.yacht.findFirstOrThrow({ where: { name: 'Otium' }, select: { id: true } })
  const bar = await prisma.stockLocation.findFirstOrThrow({ where: { yachtId: otium.id, isPosBar: true }, select: { id: true } })

  const tequila = await prisma.purchaseItem.findMany({ where: { sku: { in: ['AL 10', 'AL 11'] } }, select: { id: true, sku: true, name: true } })
  for (const t of tequila) {
    const lots = await prisma.stockLot.findMany({ where: { itemId: t.id, locationId: bar.id }, select: { quantity: true } })
    const mv = await prisma.stockMovement.count({ where: { itemId: t.id, referenceType: 'OtiumBarOpname' } })
    console.log(`${t.sku} ${t.name}: Otium Bar ${lots.reduce((s, l) => s + l.quantity, 0)} → 0, delete ${mv} OtiumBarOpname movement(s)`)
  }

  const can11 = await prisma.purchaseItem.findUniqueOrThrow({ where: { sku: 'CAN 11' }, select: { id: true, baseUnit: true, purchaseUnit: true, conversionFactor: true, standardCost: true, sellingPrice: true, minStock: true, stockLots: { where: { quantity: { not: 0 } }, select: { quantity: true, location: { select: { name: true } } } } } })
  const already = can11.baseUnit === 'bottle'
  console.log(`CAN 11: ${can11.baseUnit}/${can11.purchaseUnit}×${can11.conversionFactor} → bottle/carton×${PER_CARTON}${already ? ' (already done)' : ''}`)
  for (const l of can11.stockLots) console.log(`   ${l.location.name}: ${l.quantity} → ${already ? l.quantity : l.quantity * PER_CARTON} bottles`)

  if (!APPLY) { console.log('\nDry run — pass --apply to write.'); await prisma.$disconnect(); return }

  await prisma.$transaction(async tx => {
    for (const t of tequila) {
      await tx.stockMovement.deleteMany({ where: { itemId: t.id, referenceType: 'OtiumBarOpname' } })
      await tx.stockLot.updateMany({ where: { itemId: t.id, locationId: bar.id }, data: { quantity: 0 } })
    }
    if (!already) {
      await rescaleItemBaseQuantities(tx, can11.id, PER_CARTON)
      await tx.purchaseItem.update({
        where: { id: can11.id },
        data: {
          baseUnit: 'bottle', purchaseUnit: 'carton', conversionFactor: PER_CARTON,
          standardCost: can11.standardCost / PER_CARTON, sellingPrice: can11.sellingPrice / PER_CARTON,
          minStock: can11.minStock * PER_CARTON,
        },
      })
    }
  }, { timeout: 60_000 })
  console.log('\nApplied.')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
