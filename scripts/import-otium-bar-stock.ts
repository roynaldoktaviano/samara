/**
 * One-off: set Otium's Bar stock to the bar's own count sheet ("Bar otium stock", Nov 2026 —
 * the last STOCK column, after the 01–07 Sep 2026 trip). Quantities in the sheet are bottles /
 * pieces; items stored in ml (AL 06 / AL 12 / AL 14) are converted ×conversionFactor.
 * Bottles missing from the catalog are created (type BEVERAGE). Each change is logged as an
 * ADJUSTMENT movement, referenceType 'OtiumBarOpname', with no usageType (opening balance — it
 * must not count as usage / shrinkage in Trip Stats). Lot cost = the item's warehouse average
 * cost, else its standardCost. The sheet's per-trip IN/OUT history is NOT imported.
 * Re-runnable: items already at the target are skipped.
 *
 * Run:  npx tsx scripts/import-otium-bar-stock.ts            (dry run)
 *       npx tsx scripts/import-otium-bar-stock.ts --apply    (writes)
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
const REF = 'OtiumBarOpname'
const WAREHOUSE = 'Gudang Labuan Bajo'

// [sheet description, existing SKU | null (create), new item name, category, stock in bottles/pcs]
type Row = [string, string | null, string, string, number]
const ROWS: Row[] = [
  ['Billecart - Salmon le Reserve', 'CH 01', '', 'CHAMPAGNE', 4],
  ['Moet & Chandon Imperial', 'CH 02', '', 'CHAMPAGNE', 4],
  ['La Cuvee Laurent - Perrier Brut', 'CH 03', '', 'CHAMPAGNE', 2],
  ['San Leonino Monsenese Chianti Classico Riserva 2019', 'RED 15', '', 'RED WINE', 2],
  ['Burn Cottage Vineyard Pinot Noir 2020', 'RED 22', '', 'RED WINE', 4],
  ['Rivera Negroamaro Salento 2020', 'RED 07', '', 'RED WINE', 2],
  ['La Rioja Alta Vina Ardaza Reserva 2017', 'RED 23', '', 'RED WINE', 3],
  ['Matua Pinot Noir 2021', 'RED 06', '', 'RED WINE', 2],
  ['Kaiken Malbec 2023', null, 'Kaiken Malbec', 'RED WINE', 2],
  ['Matua Sauvignon Blanc 2023', 'WH 05', '', 'WHITE WINE', 2],
  ['Chateau Forita 2023', 'WH 17', '', 'WHITE WINE', 2],
  ['Christophe et Fils Chablis 2023', 'WH 15', '', 'WHITE WINE', 3],
  ['Trimbach Riesling 2021', 'WH 19', '', 'WHITE WINE', 3],
  ['Enrico Serafino Oudeis Alta Langa Brut 2020', 'WH 24', '', 'WHITE WINE', 1],
  ['Fantinel Prosecco', 'WH 14', '', 'WHITE WINE', 0],
  ['Minut Prestige 2024', 'RS 03', '', 'ROSE WINE', 5],
  ['Absolut', 'AL 14', '', 'SPIRIT', 3],
  ['Beluga Noble', 'AL 20', '', 'SPIRIT', 1],
  ['Grey Goose', null, 'Grey Goose Vodka', 'SPIRIT', 2],
  ['Belvedere', null, 'Belvedere Vodka', 'SPIRIT', 2],
  ['Hendrick', 'AL 17', '', 'SPIRIT', 2.3],
  ['Roku', 'AL 21', '', 'SPIRIT', 1],
  ['Tanqueray', 'AL 16', '', 'SPIRIT', 0],
  ['Monkey', null, 'Monkey 47 Gin', 'SPIRIT', 2],
  ['Bacardi Gold', null, 'Bacardi Gold', 'SPIRIT', 0.7],
  ['Bacardi White', 'AL 06', '', 'SPIRIT', 0.2],
  ['Bacardi Spiced', 'AL 07', '', 'SPIRIT', 1],
  ['Malibu', 'AL 08', '', 'SPIRIT', 0.9],
  ['Diplomatico Reserva Exclusiva', null, 'Diplomatico Reserva Exclusiva', 'SPIRIT', 2],
  ['Flor De Cana 18 YO', null, 'Flor de Cana 18 YO', 'SPIRIT', 2],
  ['Patron Reposado', null, 'Patron Reposado', 'SPIRIT', 1],
  ['Don Julio Blanco', null, 'Don Julio Blanco', 'SPIRIT', 2],
  ['Jose Cuervo Reposado', null, 'Jose Cuervo Reposado', 'SPIRIT', 0.7],
  ['Jose Cuervo Silver', null, 'Jose Cuervo Silver', 'SPIRIT', 2],
  ['Godigo (Mezcal)', null, 'Mezcal Godigo', 'SPIRIT', 1],
  ['Johnnie Walker Gold Label Reserva', null, 'Johnnie Walker Gold Label Reserve', 'SPIRIT', 1.8],
  ['Johnnie Walker Black Label', null, 'Johnnie Walker Black Label', 'SPIRIT', 2],
  ['Jameson Stout Edition', null, 'Jameson Stout Edition', 'SPIRIT', 2],
  ['Chivas Regal 12 YO', null, 'Chivas Regal 12 YO', 'SPIRIT', 1],
  ['Jim Beam', 'AL 03', '', 'SPIRIT', 1],
  ['Bullet', null, 'Bulleit Bourbon', 'SPIRIT', 2],
  ['Glenffiddich Single Malt 12 YO', null, 'Glenfiddich Single Malt 12 YO', 'SPIRIT', 1],
  ['Macallan 18 YO Double Sack', null, 'Macallan 18 YO Double Cask', 'SPIRIT', 1],
  ['Martel VSOP', null, 'Martell VSOP', 'SPIRIT', 1],
  ['Campari', 'AL 05', '', 'SPIRIT', 0.3],
  ['Aperol', 'AL 12', '', 'SPIRIT', 1.7],
  ['Martini Bianco', null, 'Martini Bianco', 'SPIRIT', 1],
  ['Martini Extra Dry', null, 'Martini Extra Dry', 'SPIRIT', 1],
  ['Martini Rosso', null, 'Martini Rosso', 'SPIRIT', 1.6],
  ['Punt e Mes', 'AL 04', '', 'SPIRIT', 0.4],
  ['Cointreau', null, 'Cointreau', 'SPIRIT', 0.4],
  ['Balimoon Triple Sec', 'AL 19', '', 'SPIRIT', 2],
  ['Balimoon Blue Curacao', 'AL 18', '', 'SPIRIT', 1],
  ['Disaronno', null, 'Disaronno', 'SPIRIT', 1],
  ['Kahlua', 'AL 13', '', 'SPIRIT', 0.9],
  ['Baileys', null, 'Baileys', 'SPIRIT', 1],
  ['Ricard', null, 'Ricard', 'SPIRIT', 2],
  ['Liquer 43', null, 'Licor 43', 'SPIRIT', 2],
  ['Limoncetta Di Sorrenta', null, 'Limoncetta di Sorrento', 'SPIRIT', 1],
  ['Arak bali transormed into orage cello', null, 'Arak Bali Orangecello', 'SPIRIT', 0.5],
  ['Bintang 330 ml', 'CAN 05', '', 'SOFT DRINK', 113],
  ['Equil Still Water 670 ml', 'CAN 12', '', 'SOFT DRINK', 12],
  // CAN 11 counted per bottle since 2026-11-13 (carton × 12, see scripts/fix-otium-tequila-equil.ts).
  ['Equil Sparkling Water 670 ml', 'CAN 11', '', 'SOFT DRINK', 30],
]

const round = (n: number) => Math.round(n * 1e6) / 1e6

async function main() {
  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenant = await central.tenant.findFirstOrThrow({ where: { slug: TENANT }, select: { databaseUrl: true } })
  await central.$disconnect()
  const prisma = new PrismaClient({ datasources: { db: { url: tenant.databaseUrl } } })

  const user = await prisma.user.findFirstOrThrow({ where: { email: USER_EMAIL }, select: { id: true } })
  const otium = await prisma.yacht.findFirstOrThrow({ where: { name: 'Otium' }, select: { id: true } })
  const bar = await prisma.stockLocation.findFirstOrThrow({ where: { yachtId: otium.id, isPosBar: true }, select: { id: true, name: true } })
  const warehouse = await prisma.stockLocation.findFirstOrThrow({ where: { name: WAREHOUSE, parentId: null }, select: { id: true } })

  const nextNo: Record<string, number> = {}
  const nextSku = async (prefix: string) => {
    if (nextNo[prefix] == null) {
      const rows = await prisma.purchaseItem.findMany({ where: { sku: { startsWith: `${prefix} ` } }, select: { sku: true } })
      nextNo[prefix] = Math.max(0, ...rows.map(r => parseInt(r.sku.slice(prefix.length + 1), 10) || 0)) + 1
    }
    return `${prefix} ${String(nextNo[prefix]++).padStart(2, '0')}`
  }

  type Plan = { sheet: string; sku: string; name: string; category: string; create: boolean; itemId: string | null; target: number; cur: number; lots: { id: string; quantity: number }[]; cost: number; unit: string }
  const plans: Plan[] = []
  for (const [sheet, sku, newName, category, bottles] of ROWS) {
    let item = sku
      ? await prisma.purchaseItem.findUniqueOrThrow({ where: { sku }, select: { id: true, sku: true, name: true, baseUnit: true, purchaseUnit: true, conversionFactor: true, standardCost: true } })
      : await prisma.purchaseItem.findFirst({ where: { name: { equals: newName, mode: 'insensitive' } }, select: { id: true, sku: true, name: true, baseUnit: true, purchaseUnit: true, conversionFactor: true, standardCost: true } })
    const create = !item
    const factor = item && item.baseUnit !== item.purchaseUnit && item.conversionFactor > 1 && ['ml', 'l', 'cl'].includes(item.baseUnit.toLowerCase()) ? item.conversionFactor : 1
    const target = round(bottles * factor)
    let lots: { id: string; quantity: number }[] = []
    let cost = 0
    if (item) {
      lots = await prisma.stockLot.findMany({ where: { itemId: item.id, locationId: bar.id }, select: { id: true, quantity: true }, orderBy: { createdAt: 'asc' } })
      const wh = await prisma.stockLot.findFirst({ where: { itemId: item.id, locationId: warehouse.id, costPerUnit: { gt: 0 } }, select: { costPerUnit: true } })
      cost = wh?.costPerUnit ?? item.standardCost
    }
    const cur = round(lots.reduce((s, l) => s + l.quantity, 0))
    const plan: Plan = {
      sheet, sku: item?.sku ?? await nextSku(category === 'RED WINE' ? 'RED' : 'AL'), name: item?.name ?? newName, category,
      create, itemId: item?.id ?? null, target, cur, lots, cost, unit: item?.baseUnit ?? 'pcs',
    }
    plans.push(plan)
    const flag = create ? 'NEW ' : cur === target ? '  = ' : '    '
    console.log(`${flag}${plan.sku.padEnd(7)} ${plan.name.padEnd(46)} ${String(cur).padStart(6)} → ${String(target).padStart(6)} ${plan.unit.padEnd(6)} ← ${sheet}`)
  }
  const changes = plans.filter(p => p.create || p.cur !== p.target)
  console.log(`\n${plans.length} rows, ${plans.filter(p => p.create).length} new items, ${changes.length} balance changes at Otium ${bar.name}`)

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
          createdById: user.id, notes: `Otium bar stock sheet (${p.cur} → ${p.target} ${p.unit})`,
        },
      })
    }
  }, { timeout: 120_000 })
  console.log('\nApplied.')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
