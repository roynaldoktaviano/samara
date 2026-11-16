/**
 * Item "Type" rework (2026-11-16): Type = Trading / Consumable / Asset (PurchaseItem.treatment).
 *  - every BEVERAGE item           → TRADING
 *  - every SPARE_PART item         → CONSUMABLE (Spare part retired, merged into Consumable)
 *  - PO line snapshots SPARE_PART  → CONSUMABLE (PurchaseOrderItem.treatment)
 * Needs the TRADING enum value pushed first (`prisma db push`). Past MAINTENANCE usage movements
 * are history and left as they are.
 *
 * Run:  npx tsx scripts/migrate-item-type-trading.ts            (dry run)
 *       npx tsx scripts/migrate-item-type-trading.ts --apply    (writes)
 * Options: --tenant=samara
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const TENANT = args.find(a => a.startsWith('--tenant='))?.split('=')[1] ?? 'samara'

async function main() {
  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenant = await central.tenant.findFirst({ where: { slug: TENANT }, select: { databaseUrl: true } })
  await central.$disconnect()
  if (!tenant) throw new Error(`Tenant ${TENANT} not found`)
  const db = new PrismaClient({ datasources: { db: { url: tenant.databaseUrl } } })

  const bev = await db.purchaseItem.count({ where: { type: 'BEVERAGE', treatment: { not: 'TRADING' } } })
  const spare = await db.purchaseItem.count({ where: { treatment: 'SPARE_PART', type: { not: 'BEVERAGE' } } })
  const poLines = await db.purchaseOrderItem.count({ where: { treatment: 'SPARE_PART' } })
  console.log(`[${TENANT}] Beverage → Trading: ${bev} · Spare part → Consumable: ${spare} items, ${poLines} PO lines`)

  if (APPLY) {
    await db.$transaction([
      db.purchaseItem.updateMany({ where: { type: 'BEVERAGE' }, data: { treatment: 'TRADING' } }),
      db.purchaseItem.updateMany({ where: { treatment: 'SPARE_PART' }, data: { treatment: 'CONSUMABLE' } }),
      db.purchaseOrderItem.updateMany({ where: { treatment: 'SPARE_PART' }, data: { treatment: 'CONSUMABLE' } }),
    ])
    console.log('Applied.')
    console.log(await db.purchaseItem.groupBy({ by: ['treatment'], _count: true }))
  } else {
    console.log('Dry run — pass --apply to write.')
  }
  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
