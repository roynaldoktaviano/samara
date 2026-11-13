/**
 * One-off: set Mischief's Bar stock (Raja Ampat) to the bar's count list sent by Roy 2026-11-13.
 * Counts come as "N bottles + M ml". Items stored in ml (AL 06 / AL 12 / AL 14) get
 * N × conversionFactor + M ml; bottle items get N + M / BOTTLE_ML (open bottles as a fraction).
 * Same rules as import-otium-bar-stock.ts: missing bottles are created (type BEVERAGE), each change
 * is an ADJUSTMENT movement, referenceType 'MischiefBarOpname', no usageType (opening balance).
 * Only the listed items are touched. Re-runnable.
 *
 * Run:  npx tsx scripts/import-mischief-bar-stock.ts            (dry run)
 *       npx tsx scripts/import-mischief-bar-stock.ts --apply    (writes)
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import crypto from 'crypto'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const APPLY = process.argv.includes('--apply')
const TENANT = 'samara'
const USER_EMAIL = 'roy@samarayachting.com'
const YACHT = 'Mischief'
const REF = 'MischiefBarOpname'
const WAREHOUSE = 'Gudang Labuan Bajo'
// Bottle size assumed for open bottles of items counted in bottles (no ml size on the item).
const BOTTLE_ML = 750

// [list text, existing SKU | null (create), new item name, category, full bottles, extra ml]
type Row = [string, string | null, string, string, number, number]
const ROWS: Row[] = [
  // Spirit & liqueur
  ['hendrick gin', 'AL 17', '', 'SPIRIT', 2, 350],
  ['bombay gin', 'AL 02', '', 'SPIRIT', 3, 0],
  ['tengquiry gin', 'AL 16', '', 'SPIRIT', 0, 600],
  ['east indies gin', 'AL 01', '', 'SPIRIT', 1, 0],
  ['absolut vodca', 'AL 14', '', 'SPIRIT', 2, 0],
  ['smirknoff vodca', 'AL 09', '', 'SPIRIT', 3, 100],
  ['bacardi light rum', 'AL 06', '', 'SPIRIT', 2, 600],
  ['bacardi spice rum', 'AL 07', '', 'SPIRIT', 1, 0],
  ['azul tequila', null, 'Azul Tequila', 'SPIRIT', 2, 0],
  ['jose quervo tequila', 'AL 10', '', 'SPIRIT', 3, 0],
  ['1800 tequila', null, '1800 Tequila', 'SPIRIT', 0, 300],
  ['Aperol', 'AL 12', '', 'SPIRIT', 2, 40],
  ['pun emes vermouth', 'AL 04', '', 'SPIRIT', 2, 80],
  ['campari', 'AL 05', '', 'SPIRIT', 2, 150],
  ['martini rosso', 'AL 41', '', 'SPIRIT', 1, 0],
  ['countrue', 'AL 42', '', 'SPIRIT', 1, 0],
  ['martini extra dry', 'AL 40', '', 'SPIRIT', 2, 0],
  ['poli grand vermouth', null, 'Poli Gran Vermouth', 'SPIRIT', 1, 0],
  ['amaretto', null, 'Amaretto', 'SPIRIT', 1, 200],
  ['baylies', 'AL 44', '', 'SPIRIT', 1, 100],
  ['jeam beam whisky', 'AL 03', '', 'SPIRIT', 1, 600],
  ['gleenfeddic whisky', 'AL 36', '', 'SPIRIT', 1, 0],
  ['cognag heinessy', null, 'Hennessy Cognac', 'SPIRIT', 1, 0],
  ['kahlua', 'AL 13', '', 'SPIRIT', 1, 100],
  ['balimoon panaple', null, 'Balimoon Pineapple', 'SPIRIT', 1, 500],
  ['balimoon blue curracao', 'AL 18', '', 'SPIRIT', 1, 0],
  ['du keiper blue curraccao', null, 'De Kuyper Blue Curacao', 'SPIRIT', 0, 60],
  ['cream de casis', null, 'Creme de Cassis', 'SPIRIT', 0, 400],
  ['malibu', 'AL 08', '', 'SPIRIT', 1, 0],
  ['peach liquer', null, 'Peach Liqueur', 'SPIRIT', 0, 600],
  ['balimoon triple sec', 'AL 19', '', 'SPIRIT', 0, 350],
  ['infuse gin', null, 'Infused Gin (house)', 'SPIRIT', 0, 300],
  ['infuse tequila', null, 'Infused Tequila (house)', 'SPIRIT', 0, 100],
  // White wine
  ['christope et fils chablis', 'WH 15', '', 'WHITE WINE', 7, 0],
  ['famille paquet poully fuisse', 'WH 16', '', 'WHITE WINE', 4, 0],
  ['trimbach reisling elsace', 'WH 19', '', 'WHITE WINE', 5, 0],
  ['Astrolabe sauvinonblanc', 'WH 21', '', 'WHITE WINE', 5, 0],
  ['bott-geyl reisling elsace', 'WH 18', '', 'WHITE WINE', 4, 0],
  ['chattau fortina pape blanc', 'WH 17', '', 'WHITE WINE', 4, 0],
  // Red wine
  ['rivera salento primitivo', 'RED 08', '', 'RED WINE', 3, 0],
  ['two river pinot noir', 'RED 10', '', 'RED WINE', 4, 0],
  ['penfold kununga hill shiraz', 'RED 01', '', 'RED WINE', 4, 0],
  ['vina ardanza reserva', 'RED 23', '', 'RED WINE', 4, 0],
  ['penfold bin 28 shiraz', null, 'Penfolds Bin 28 Shiraz', 'RED WINE', 6, 0],
  ['astrolabe pinot noir', 'RED 17', '', 'RED WINE', 6, 0],
  ['san leonino chianti tuscany', 'RED 15', '', 'RED WINE', 6, 0],
  // Rose
  ['whispring angel', 'RS 01', '', 'ROSE WINE', 8, 0],
  // Champagne
  ['bilcart salmon', 'CH 01', '', 'CHAMPAGNE', 6, 0],
  ['duval roy', null, 'Duval-Leroy Brut', 'CHAMPAGNE', 5, 0],
  ['moet chandon', 'CH 02', '', 'CHAMPAGNE', 6, 0],
]

const SKU_PREFIX: Record<string, string> = { SPIRIT: 'AL', 'RED WINE': 'RED', 'WHITE WINE': 'WH', 'ROSE WINE': 'RS', CHAMPAGNE: 'CH' }
const round = (n: number) => Math.round(n * 1e4) / 1e4

async function main() {
  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenant = await central.tenant.findFirstOrThrow({ where: { slug: TENANT }, select: { databaseUrl: true } })
  await central.$disconnect()
  const prisma = new PrismaClient({ datasources: { db: { url: tenant.databaseUrl } } })

  const user = await prisma.user.findFirstOrThrow({ where: { email: USER_EMAIL }, select: { id: true } })
  const yacht = await prisma.yacht.findFirstOrThrow({ where: { name: YACHT }, select: { id: true } })
  const bar = await prisma.stockLocation.findFirstOrThrow({ where: { yachtId: yacht.id, isPosBar: true }, select: { id: true, name: true } })
  const warehouse = await prisma.stockLocation.findFirstOrThrow({ where: { name: WAREHOUSE, parentId: null }, select: { id: true } })

  const nextNo: Record<string, number> = {}
  const nextSku = async (prefix: string) => {
    if (nextNo[prefix] == null) {
      const rows = await prisma.purchaseItem.findMany({ where: { sku: { startsWith: `${prefix} ` } }, select: { sku: true } })
      nextNo[prefix] = Math.max(0, ...rows.map(r => parseInt(r.sku.slice(prefix.length + 1), 10) || 0)) + 1
    }
    return `${prefix} ${String(nextNo[prefix]++).padStart(2, '0')}`
  }

  type Plan = { sku: string; name: string; category: string; create: boolean; itemId: string | null; target: number; cur: number; lots: { id: string; quantity: number }[]; cost: number; unit: string }
  const plans: Plan[] = []
  const sel = { id: true, sku: true, name: true, baseUnit: true, purchaseUnit: true, conversionFactor: true, standardCost: true } as const
  for (const [text, sku, newName, category, bottles, ml] of ROWS) {
    const item = sku
      ? await prisma.purchaseItem.findUniqueOrThrow({ where: { sku }, select: sel })
      : await prisma.purchaseItem.findFirst({ where: { name: { equals: newName, mode: 'insensitive' } }, select: sel })
    const mlBased = !!item && item.baseUnit.toLowerCase() === 'ml' && item.conversionFactor > 1
    const target = round(mlBased ? bottles * item!.conversionFactor + ml : bottles + ml / BOTTLE_ML)
    let lots: { id: string; quantity: number }[] = []
    let cost = 0
    if (item) {
      lots = await prisma.stockLot.findMany({ where: { itemId: item.id, locationId: bar.id }, select: { id: true, quantity: true }, orderBy: { createdAt: 'asc' } })
      const wh = await prisma.stockLot.findFirst({ where: { itemId: item.id, locationId: warehouse.id, costPerUnit: { gt: 0 } }, select: { costPerUnit: true } })
      cost = wh?.costPerUnit ?? item.standardCost
    }
    const cur = round(lots.reduce((s, l) => s + l.quantity, 0))
    const plan: Plan = {
      sku: item?.sku ?? await nextSku(SKU_PREFIX[category]), name: item?.name ?? newName, category,
      create: !item, itemId: item?.id ?? null, target, cur, lots, cost, unit: item?.baseUnit ?? 'pcs',
    }
    plans.push(plan)
    const flag = plan.create ? 'NEW ' : cur === target ? '  = ' : '    '
    const qty = `${bottles} btl${ml ? ` + ${ml} ml` : ''}`
    console.log(`${flag}${plan.sku.padEnd(7)} ${plan.name.padEnd(42)} ${String(cur).padStart(6)} → ${String(target).padStart(7)} ${plan.unit.padEnd(4)} ← ${text} (${qty})`)
  }
  const changes = plans.filter(p => p.create || p.cur !== p.target)
  console.log(`\n${plans.length} rows, ${plans.filter(p => p.create).length} new items, ${changes.length} balance changes at ${YACHT} ${bar.name}`)

  if (!APPLY) {
    console.log('\nDry run — pass --apply to write.')
    await prisma.$disconnect()
    return
  }

  await prisma.$transaction(async tx => {
    for (const p of changes) {
      let itemId = p.itemId
      if (!itemId) {
        itemId = (await tx.purchaseItem.create({
          data: {
            id: crypto.randomUUID(), sku: p.sku, name: p.name, type: 'BEVERAGE', category: p.category,
            baseUnit: 'pcs', purchaseUnit: 'pcs', conversionFactor: 1, treatment: 'CONSUMABLE',
            isSoldInPos: true, isStockTracked: true, updatedAt: new Date(),
          },
        })).id
      }
      if (p.target === p.cur) continue
      const [keep, ...rest] = p.lots
      if (keep) await tx.stockLot.update({ where: { id: keep.id }, data: { quantity: p.target, ...(p.cost > 0 ? { costPerUnit: p.cost } : {}) } })
      else await tx.stockLot.create({ data: { itemId, locationId: bar.id, quantity: p.target, costPerUnit: p.cost } })
      for (const l of rest) await tx.stockLot.update({ where: { id: l.id }, data: { quantity: 0 } })
      const diff = round(p.target - p.cur)
      await tx.stockMovement.create({
        data: {
          itemId, quantity: Math.abs(diff), type: 'ADJUSTMENT', referenceType: REF,
          fromLocationId: diff < 0 ? bar.id : null, toLocationId: diff > 0 ? bar.id : null,
          unitCost: p.cost || null, totalCost: p.cost ? Math.abs(diff) * p.cost : null,
          createdById: user.id, notes: `${YACHT} bar stock list (${p.cur} → ${p.target} ${p.unit})`,
        },
      })
    }
  }, { timeout: 120_000 })
  console.log('\nApplied.')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
