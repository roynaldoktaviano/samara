/**
 * One-off import of Purchasing's linen list (sheet "Purchasing - Rosalina - Linen", Oct 2026) into
 * the samara tenant's stock catalog. Every product × size becomes its own PurchaseItem
 * (type HOUSEKEEPING, category "Linen", SKU "LN nn", minStock 4 — Purchasing's minimum per item),
 * and its Gudang Labuan Bajo balance is set to the sheet's "Stock Gudang", logged as
 * ADJUSTMENT / 'LinenImport'. The sheet's per-ship columns are requests, not on-board stock, so
 * they are not imported. Re-runnable: existing items (matched by name) are updated, not duplicated.
 *
 * Run:  npx tsx scripts/import-linen-stock.ts            (dry run)
 *       npx tsx scripts/import-linen-stock.ts --apply    (writes)
 * Options: --tenant=samara  --user=roy@samarayachting.com
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const opt = (k: string, d: string) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const TENANT = opt('tenant', 'samara')
const USER_EMAIL = opt('user', 'roy@samarayachting.com')

const WAREHOUSE = 'Gudang Labuan Bajo'
const REF = 'LinenImport'
const CATEGORY = 'Linen'
const MIN_STOCK = 4

// [name (without size), size, Stock Gudang]
const ROWS: [string, string, number][] = [
  ['Fitted Sheet TC-300 Plain White', '80x200x30cm', 0],
  ['Fitted Sheet TC-300 Plain White', '120x200x30cm', 4],
  ['Fitted Sheet TC-300 Plain White', '140x200x30cm', 0],
  ['Fitted Sheet TC-300 Plain White', '160x200x30cm', 0],
  ['Fitted Sheet TC-300 Plain White', '180x200x30cm', 4],
  ['Fitted Sheet TC-300 Plain White', '80x200cm', 1],
  ['Fitted Sheet TC-300 Plain White', '140x200cm', 0],
  ['Fitted Sheet TC-300 Plain White', '160x200cm', 2],
  ['Fitted Sheet TC-300 Plain White', '180x200cm', 8],
  ['Fitted Sheet TC-300 Plain White', '220x230cm', 3],
  ['Fitted Sheet TC-300 Plain White', '280x280cm', 2],
  ['Fitted Sheet TC-400 Plain White', '180x200x30cm', 0],
  ['Fitted Sheet TC-400 Plain White', '200x200x30cm', 0],
  ['Fitted Sheet TC-400 Plain White', '260x230cm', 0],
  ['Fitted Sheet TC-400 Plain White', '280x230cm', 0],
  ['Inner Duvet Microfiber Plain White', '140x200cm', 0],
  ['Inner Duvet Microfiber Plain White', '160x200cm', 0],
  ['Inner Duvet Microfiber Plain White', '180x200cm', 0],
  ['Inner Duvet Microfiber Plain White', '220x230cm', 4],
  ['Inner Duvet Microfiber Plain White', '240x230cm', 5],
  ['Inner Duvet Microfiber Plain White', '260x230cm', 9],
  // The sheet lists 120x230 twice ("Queen Size" and plain) — one item.
  ['Duvet Cover TC-300 Plain White', '120x230cm', 0],
  ['Duvet Cover TC-300 Plain White', '140x200cm', 0],
  ['Duvet Cover TC-300 Plain White', '160x200cm', 0],
  ['Duvet Cover TC-300 Plain White', '160x230cm', 0],
  ['Duvet Cover TC-300 Plain White', '220x230cm', 10],
  ['Duvet Cover TC-300 Plain White', '240x240cm', 0],
  ['Duvet Cover TC-300 Plain White', '260x230cm', 5],
  ['Duvet Cover TC-300 Plain White', '280x230cm', 5],
  ['Bath Towel White', '68x140cm', 0],
  ['Pool Towel', '85x150cm', 0],
  ['Face Towel / Cool Towel', '30x30cm', 0],
  ['Oshibori', '25x25cm', 0],
  ['Pillow Case Standard TC-300 Plain White', '50x75cm', 0],
  ['Pillow Silicon', '50x70cm', 5],
  ['Pillow Supreme', '', 5],
  ['Pillow Microfiber', '', 2],
  ['Pillow Comforter', '', 9],
  ['Pillow Cozy Lila', '', 4],
  ['Mattress Protector', '160x200cm', 5],
  ['Mattress Protector', '180x200cm', 2],
]

async function main() {
  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenant = await central.tenant.findFirst({ where: { slug: TENANT }, select: { databaseUrl: true } })
  await central.$disconnect()
  if (!tenant) throw new Error(`Tenant ${TENANT} not found`)
  const prisma = new PrismaClient({ datasources: { db: { url: tenant.databaseUrl } } })

  const user = await prisma.user.findFirstOrThrow({ where: { email: USER_EMAIL }, select: { id: true } })
  const warehouse = await prisma.stockLocation.findFirstOrThrow({ where: { name: WAREHOUSE, parentId: null }, select: { id: true } })

  const lnSkus = await prisma.purchaseItem.findMany({ where: { sku: { startsWith: 'LN ' } }, select: { sku: true } })
  let nextNo = Math.max(0, ...lnSkus.map(s => parseInt(s.sku.slice(3), 10) || 0)) + 1

  const plans = []
  for (const [base, size, stock] of ROWS) {
    const name = size ? `${base} ${size}` : base
    const existing = await prisma.purchaseItem.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true, sku: true, stockLots: { where: { locationId: warehouse.id }, select: { id: true, quantity: true, costPerUnit: true } } },
    })
    const sku = existing?.sku ?? `LN ${String(nextNo++).padStart(2, '0')}`
    const cur = existing?.stockLots.reduce((s, l) => s + l.quantity, 0) ?? 0
    plans.push({ name, sku, stock, cur, existing })
    console.log(`${existing ? 'update' : 'create'}  ${sku.padEnd(6)} ${name.padEnd(52)} gudang ${cur} → ${stock}`)
  }
  console.log(`\n${plans.filter(p => !p.existing).length} new items, ${plans.filter(p => p.existing).length} existing; total gudang ${plans.reduce((s, p) => s + p.stock, 0)} pcs`)

  if (!APPLY) {
    console.log('\nDry run — pass --apply to write.')
    await prisma.$disconnect()
    return
  }

  await prisma.$transaction(async tx => {
    for (const p of plans) {
      const itemId = p.existing
        ? (await tx.purchaseItem.update({ where: { id: p.existing.id }, data: { minStock: MIN_STOCK, isActive: true } })).id
        : (await tx.purchaseItem.create({
            data: {
              sku: p.sku, name: p.name, type: 'HOUSEKEEPING', category: CATEGORY,
              baseUnit: 'pcs', purchaseUnit: 'pcs', conversionFactor: 1,
              minStock: MIN_STOCK, isSoldInPos: false, isStockTracked: true,
            },
          })).id
      if (p.stock === p.cur) continue
      const lots = p.existing?.stockLots ?? []
      const [keep, ...rest] = lots
      if (keep) await tx.stockLot.update({ where: { id: keep.id }, data: { quantity: p.stock } })
      else await tx.stockLot.create({ data: { itemId, locationId: warehouse.id, quantity: p.stock, costPerUnit: 0 } })
      for (const l of rest) await tx.stockLot.update({ where: { id: l.id }, data: { quantity: 0 } })
      const diff = p.stock - p.cur
      await tx.stockMovement.create({
        data: {
          itemId, quantity: Math.abs(diff), type: 'ADJUSTMENT', referenceType: REF,
          fromLocationId: diff < 0 ? warehouse.id : null, toLocationId: diff > 0 ? warehouse.id : null,
          createdById: user.id, notes: `Linen list import (${p.cur} → ${p.stock})`,
        },
      })
    }
  }, { timeout: 60_000 })
  console.log('\nApplied.')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
