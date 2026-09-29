/**
 * One-off backfill: seeds every catalog StockLot whose costPerUnit is still 0 (legacy transfer
 * receipts, opname-created lots, POS negative lots) with its item's standardCost, so moving-average
 * costing (see movingAverageCost in src/lib/valuation.ts) starts from a real value. Lots whose item
 * has no standardCost yet are left at 0 and listed.
 *
 * Run:  npx tsx scripts/backfill-zero-cost-lots.ts          (dry run, per tenant)
 *       npx tsx scripts/backfill-zero-cost-lots.ts --apply  (writes)
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const APPLY = process.argv.includes('--apply')

async function main() {
  const centralDb = new CentralClient({
    datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } },
  })
  const tenants = await centralDb.tenant.findMany({
    where: { isActive: true },
    select: { slug: true, databaseUrl: true },
  })
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${tenants.length} active tenant(s).\n`)

  for (const t of tenants) {
    const db = new PrismaClient({ datasources: { db: { url: t.databaseUrl } } })
    try {
      const lots = await db.stockLot.findMany({
        where: { costPerUnit: 0, itemId: { not: null } },
        select: { id: true, quantity: true, item: { select: { name: true, standardCost: true } }, location: { select: { name: true } } },
      })
      const fixable = lots.filter(l => (l.item?.standardCost ?? 0) > 0)
      const missing = lots.filter(l => (l.item?.standardCost ?? 0) <= 0)
      console.log(`→ ${t.slug}: ${lots.length} zero-cost lot(s), ${fixable.length} fixable, ${missing.length} without standardCost`)
      for (const l of missing) console.log(`   ! no cost: ${l.item?.name} @ ${l.location.name} (qty ${l.quantity})`)

      if (APPLY) {
        for (const l of fixable) {
          await db.stockLot.update({ where: { id: l.id }, data: { costPerUnit: l.item!.standardCost } })
        }
        console.log(`✓ ${t.slug}: ${fixable.length} lot(s) updated.\n`)
      } else {
        console.log('')
      }
    } finally {
      await db.$disconnect()
    }
  }

  await centralDb.$disconnect()
}

main().catch(e => { console.error('Backfill failed:', e); process.exit(1) })
