/**
 * One-off: migrates every PurchaseItem with isStockTracked=false (the old "Non-Stock
 * Item" catalog entries in Purchasing > Items) into a new InventoryItem row, so the
 * new Inventory module (Rooms/Categories/Items/Stock Opname) becomes the single home
 * for these items going forward.
 *
 * The legacy model has no Room/Category concept and no per-row quantity — only a
 * manual `currentLocationId` pointer (see PurchaseItem.currentLocationId). So each
 * migrated item lands under a fallback "Uncategorized" Room + Category at that
 * location (created on demand, reused across items), and quantity is set to 1 with a
 * loud warning logged for manual correction — "how many of this were ever purchased"
 * (summed across StockLot rows, which never merge for non-stock items) is not the
 * same question as "how many exist today," and guessing the latter from the former
 * would be misleadingly precise. Items with no currentLocationId set are skipped
 * entirely and reported, since there's no way to guess where they belong.
 *
 * Idempotent: skips any PurchaseItem that already has a migratedInventoryItem (via
 * InventoryItem.sourcePurchaseItemId, @unique) — safe to re-run after a partial failure
 * or to pick up newly-created legacy items before the Purchasing cutover ships.
 *
 * Run: npx tsx scripts/migrate-non-stock-to-inventory.ts [--dry-run] [--all-tenants]
 *
 * By default only migrates the "default" tenant (process.env.DATABASE_URL) — other
 * tenants may not have the Inventory schema pushed yet (see
 * scripts/push-schema-all-tenants.ts, run that first). Pass --all-tenants once every
 * active tenant's schema is confirmed up to date to fan this out to all of them.
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const DRY_RUN = process.argv.includes('--dry-run')
const ALL_TENANTS = process.argv.includes('--all-tenants')

async function nextVal(db: PrismaClient, key: string): Promise<number> {
  const result = await db.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "Counter" (key, value)
    VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE
    SET value = "Counter".value + 1
    RETURNING value
  `
  return Number(result[0].value)
}

async function migrateTenant(databaseUrl: string, label: string) {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    const legacyItems = await db.purchaseItem.findMany({
      where: { isStockTracked: false, migratedInventoryItem: null },
      orderBy: { createdAt: 'asc' },
    })
    if (legacyItems.length === 0) {
      console.log(`  ${label}: nothing to migrate.`)
      return
    }
    console.log(`  ${label}: found ${legacyItems.length} legacy non-stock item(s).`)

    const systemUser = await db.user.findFirst({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (!systemUser) {
      console.warn(`  ${label}: no ADMIN/SUPER_ADMIN user found — skipping tenant entirely.`)
      return
    }

    const roomCache = new Map<string, string>() // locationId -> InventoryRoom.id
    const categoryCache = new Map<string, string>() // roomId -> InventoryCategory.id

    let migrated = 0
    let skippedNoLocation = 0
    const qtyWarnings: string[] = []

    for (const legacy of legacyItems) {
      if (!legacy.currentLocationId) {
        skippedNoLocation++
        console.warn(`  ${label}: SKIPPED "${legacy.name}" (${legacy.sku}) — no currentLocationId set, needs manual placement.`)
        continue
      }
      const locationId = legacy.currentLocationId

      let roomId = roomCache.get(locationId)
      if (!roomId) {
        if (DRY_RUN) {
          roomId = `dry-run-room-${locationId}`
        } else {
          const room = await db.inventoryRoom.upsert({
            where: { locationId_name: { locationId, name: 'Uncategorized' } },
            update: {},
            create: { id: crypto.randomUUID(), locationId, name: 'Uncategorized', updatedAt: new Date() },
          })
          roomId = room.id
        }
        roomCache.set(locationId, roomId)
      }

      let categoryId = categoryCache.get(roomId)
      if (!categoryId) {
        if (DRY_RUN) {
          categoryId = `dry-run-category-${roomId}`
        } else {
          const category = await db.inventoryCategory.upsert({
            where: { roomId_name: { roomId, name: 'Uncategorized' } },
            update: {},
            create: { id: crypto.randomUUID(), roomId, name: 'Uncategorized', updatedAt: new Date() },
          })
          categoryId = category.id
        }
        categoryCache.set(roomId, categoryId)
      }

      qtyWarnings.push(`${legacy.sku} (${legacy.name})`)

      if (!DRY_RUN) {
        const itemNumber = 'INV-' + String(await nextVal(db, 'inventory-item')).padStart(4, '0')
        await db.inventoryItem.create({
          data: {
            id: crypto.randomUUID(),
            itemNumber,
            name: legacy.name,
            categoryId,
            roomId,
            locationId,
            unitPrice: legacy.standardCost,
            quantity: 1,
            sourcePurchaseItemId: legacy.id,
            createdById: systemUser.id,
            updatedAt: new Date(),
          },
        })
      }
      migrated++
    }

    console.log(`  ${label}: ${DRY_RUN ? 'would migrate' : 'migrated'} ${migrated}, skipped (no location) ${skippedNoLocation}.`)
    if (qtyWarnings.length > 0) {
      console.log(`  ${label}: quantity defaulted to 1 for ${qtyWarnings.length} item(s) — review and correct manually:`)
      for (const w of qtyWarnings) console.log(`    - ${w}`)
    }
  } finally {
    await db.$disconnect()
  }
}

async function main() {
  if (DRY_RUN) console.log('--- DRY RUN: no data will be written ---\n')

  console.log('→ default')
  await migrateTenant(process.env.DATABASE_URL!, 'default')

  if (!ALL_TENANTS) {
    console.log('\n(Skipping other tenants — pass --all-tenants once their schema is up to date.)')
    return
  }

  const centralDb = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenants = await centralDb.tenant.findMany({ where: { isActive: true }, select: { slug: true, databaseUrl: true } })
  for (const t of tenants) {
    if (t.databaseUrl === process.env.DATABASE_URL) continue
    console.log(`→ ${t.slug}`)
    await migrateTenant(t.databaseUrl, t.slug)
  }
  await centralDb.$disconnect()
}

main().catch(e => {
  console.error('Migration failed:', e)
  process.exit(1)
})
