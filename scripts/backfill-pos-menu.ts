/**
 * One-off backfill for the new POS module: turns every existing "sold in POS" catalog
 * item into a Global PosMenuItem (yachtId: null) at its current sellingPrice, grouped
 * into a PosCategory per distinct PurchaseItem.category — so /api/cashier/menu (now
 * sourced from PosMenuItem/PosCategory instead of a raw PurchaseItem scan) keeps
 * showing every yacht exactly what it shows today the moment the new route ships.
 * Admin can then reorganize into per-yacht overrides at their own pace.
 *
 * Idempotent: skips items that already have a PosMenuItem row, safe to re-run.
 *
 * Iterates every active tenant (same fan-out as scripts/push-schema-all-tenants.ts),
 * so run scripts/push-schema-all-tenants.ts first — this only writes into tables that
 * must already exist in each tenant's database.
 *
 * Run: npx tsx scripts/backfill-pos-menu.ts [--tenant=<slug>]
 *   --tenant=<slug>  only backfill one tenant (default DB, from .env, if omitted and
 *                    no central DB is configured)
 */
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const onlyTenant = process.argv.find(a => a.startsWith('--tenant='))?.split('=')[1]

async function backfillOne(db: PrismaClient, label: string) {
  const items = await db.purchaseItem.findMany({
    where: { isActive: true, isSoldInPos: true },
    select: { id: true, category: true, sellingPrice: true },
  })
  console.log(`[${label}] ${items.length} POS-eligible item(s) found.`)
  if (items.length === 0) return

  const categoryNames = Array.from(new Set(items.map(i => (i.category?.trim() || 'Uncategorized'))))
  const categoryMap = new Map<string, string>()
  for (const name of categoryNames) {
    const category = await db.posCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    })
    categoryMap.set(name, category.id)
  }

  let created = 0, skipped = 0
  for (const item of items) {
    const existing = await db.posMenuItem.findFirst({ where: { itemId: item.id, yachtId: null } })
    if (existing) { skipped++; continue }
    const categoryId = categoryMap.get(item.category?.trim() || 'Uncategorized')!
    await db.posMenuItem.create({
      data: { itemId: item.id, categoryId, yachtId: null, price: item.sellingPrice },
    })
    created++
  }
  console.log(`[${label}] Created ${created} Global PosMenuItem row(s), skipped ${skipped} already present.`)
}

async function main() {
  const centralUrl = process.env.CENTRAL_DATABASE_URL
  if (!centralUrl) {
    console.log('No CENTRAL_DATABASE_URL set — backfilling the default DATABASE_URL only.')
    const db = new PrismaClient()
    await backfillOne(db, 'default')
    await db.$disconnect()
    return
  }

  const { PrismaClient: CentralClient } = await import('@prisma/central-client')
  const centralDb = new CentralClient({ datasources: { db: { url: centralUrl } } })
  const tenants = await centralDb.tenant.findMany({
    where: { isActive: true, ...(onlyTenant ? { slug: onlyTenant } : {}) },
    select: { slug: true, databaseUrl: true },
  })
  console.log(`Found ${tenants.length} active tenant(s).\n`)

  for (const t of tenants) {
    const db = new PrismaClient({ datasources: { db: { url: t.databaseUrl } } })
    try {
      await backfillOne(db, t.slug)
    } catch (e) {
      console.error(`✗ [${t.slug}] failed:`, e)
    } finally {
      await db.$disconnect()
    }
  }
  await centralDb.$disconnect()
}

main().catch(e => {
  console.error('Backfill failed:', e)
  process.exit(1)
})
