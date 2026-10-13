/**
 * Import of the warehouse's CariStok spreadsheets (Google Sheets "BEVERAGE" / "FOOD", downloaded
 * as .xlsx) into the samara tenant. One run handles one item type (--type), and everything it
 * deletes/replaces is scoped to that type, so the beverage and food imports don't touch each other:
 *
 *  1. History — every row of "Input Barang Masuk" / "Input Barang Keluar" becomes a dated
 *     StockMovement (referenceType 'CariStokImport'), so Stock Card / item history and the
 *     Usage Stats report see the full in/out trail since 28 Nov 2025. Ledger-only: these rows
 *     never touch StockLot balances and carry no usageType (Trip Stats stays clean).
 *       Stock Awal                → INITIAL      → Gudang
 *       Supplier / Belanja        → RECEIPT      → Gudang
 *       Baru ditemukan            → ADJUSTMENT   → Gudang
 *       Retur (from a ship)       → TRANSFER_IN  ship Bar → Gudang
 *       Transfer ke kapal         → TRANSFER_OUT Gudang → ship Bar (beverage) / Galley (food)
 *       Salah hitung / Hilang     → ADJUSTMENT   Gudang →
 *     Re-running replaces the previous import (old CariStokImport rows are deleted first).
 *  2. Catalog — creates sheet items missing from the catalog, deactivates the old duplicate
 *     SKUs left by the July CSV import, fills standardCost where it is still 0 (sheet HPP,
 *     else last PO unit cost).
 *     Quantities in the sheet are in the item's PURCHASE unit (e.g. Beer Bintang = cartons), so they
 *     are multiplied by conversionFactor into base units, and sheet HPP / PO cost divided by it.
 *  3. Balance — sets each item's Gudang Labuan Bajo stock to the sheet's Total Stock (negative
 *     sheet totals clamp to 0), logged as ADJUSTMENT / 'CariStokSync' movements dated now.
 *  4. Open POs — PO lines whose goods the sheet already shows arriving (PO_RECEIPTS) get a
 *     GoodsReceipt dated from the sheet and receivedQty/status advanced, but NO stock lots or
 *     RECEIPT movements: the balance sync above already counts those goods. The matching
 *     history movement is linked to the GR (referenceId) so item history shows it once.
 *  5. Units — fixes items the sheet counts per pack/carton but the catalog called "pcs".
 *
 * Run:  npx tsx scripts/import-caristok-stock.ts BEVERAGE.xlsx --type=BEVERAGE          (dry run)
 *       npx tsx scripts/import-caristok-stock.ts FOOD.xlsx --type=FOOD --apply           (writes)
 * Options: --tenant=samara  --user=roy@samarayachting.com
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import ExcelJS from 'exceljs'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const opt = (k: string, d: string) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const TYPE = opt('type', 'BEVERAGE').toUpperCase()
const FILE = args.find(a => !a.startsWith('--')) ?? `${TYPE}.xlsx`
const TENANT = opt('tenant', 'samara')
const USER_EMAIL = opt('user', 'roy@samarayachting.com')

const WAREHOUSE = 'Gudang Labuan Bajo'
const REF_HISTORY = 'CariStokImport'
const REF_SYNC = 'CariStokSync'

type TypeConfig = {
  shipLocation: string // per-yacht sub-location that "Transfer ke kapal" lands in
  duplicateSkus: Record<string, string>
  productAliases: Record<string, string>
  // Master rows with no code → [category, SKU prefix, item type (default --type)].
  newItemCategory: Record<string, [string, string, string?]>
  // Sheet code → catalog SKU, where the catalog filed the same product under another SKU.
  skuOverride: Record<string, string>
  categoryMap: Record<string, string> // sheet category → catalog category, for new items
  poReceipts: Record<string, { line: string; row: number }[]>
  unitFixes: Record<string, string>
  noPoCost?: string[] // SKUs whose PO unit differs from the sheet's (bulk box vs pcs) — never cost from PO
}

// ─────────────────────────────── BEVERAGE ───────────────────────────────
// Old duplicate SKUs from the July CSV import → the SKU the sheet actually uses.
const DUPLICATE_SKUS: Record<string, string> = { 'RED 20': 'RED 03', 'RED 21': 'RED 13', 'WH 22': 'WH 12', 'WH 23': 'WH 14' }
// Product strings in the history tabs that don't match a master row verbatim.
const PRODUCT_ALIASES: Record<string, string> = {
  'spirit al 20 malibu': 'AL 08',
  'still water': 'CAN 09',
  'champagne ch 01 moet chandon': 'CH 02',
}
// Master rows without a code/category → category + SKU prefix for the new catalog item.
const NEW_ITEM_CATEGORY: Record<string, [string, string, string?]> = {
  'la cuvee laurent pierre brut': ['CHAMPAGNE', 'CH'],
  'beluga nobel': ['SPIRIT', 'AL'],
  'roku': ['SPIRIT', 'AL'],
  'burn cottage vineyard pinot noir': ['RED WINE', 'RED'],
  'la rioja alfa vina ardaza': ['RED WINE', 'RED'],
  'enrico serafino oudeis alfa langa brut': ['WHITE WINE', 'WH'],
  'minute prestige': ['ROSE WINE', 'RS'],
  'heniken': ['SOFT DRINK', 'CAN'],
}

// PO lines already physically received per the sheet. `line` = item SKU, `SKU@unitCost` when a PO
// has two lines for one SKU, or the lowercased itemName for free-text lines; `row` = the
// "Input Barang Masuk" row whose qty/date is the receipt. Lines left out stay open.
const PO_RECEIPTS: Record<string, { line: string; row: number }[]> = {
  'PO-202607-089': [
    { line: 'AL 14', row: 233 }, { line: 'AL 02', row: 234 }, { line: 'AL 15', row: 235 }, { line: 'AL 12', row: 236 },
    { line: 'AL 07', row: 237 }, { line: 'AL 06', row: 238 }, { line: 'AL 08', row: 239 }, { line: 'AL 09', row: 240 },
    { line: 'AL 03', row: 241 },
    { line: 'AL 11@520000', row: 242 }, // ordered as "Tequila Reposado", arrived as Jose Cuervo ×3
    { line: 'AL 18', row: 243 }, { line: 'AL 19', row: 244 },
    { line: 'whispering angels', row: 247 }, { line: 'WH 13', row: 248 },
    { line: 'RED 01', row: 249 }, // Penfold Koonunga — sheet books it as RED 03 (shiraz cabernet) ×3
    { line: 'RED 02', row: 250 },
  ],
  'PO-202609-090': [
    { line: 'AL 03', row: 292 }, { line: 'jose cuervo reposado', row: 293 }, { line: 'smirnof vodka', row: 294 },
    { line: 'bacardi white rum', row: 295 }, { line: 'RED 10', row: 298 }, // 4 of 5 arrived
  ],
  'PO-202609-094': [{ line: 'CAN 05', row: 300 }],
}

// Catalog items the sheet counts per pack/carton (HPP is the pack price) but were set up as "pcs".
const UNIT_FIXES: Record<string, string> = { 'CAN 04': 'pack', 'CAN 06': 'carton', 'CAN 11': 'carton' }

const CONFIGS: Record<string, TypeConfig> = {
  BEVERAGE: {
    shipLocation: 'Bar', duplicateSkus: DUPLICATE_SKUS, productAliases: PRODUCT_ALIASES, newItemCategory: NEW_ITEM_CATEGORY,
    skuOverride: {}, categoryMap: {}, poReceipts: PO_RECEIPTS, unitFixes: UNIT_FIXES,
  },
  // ─────────────────────────────── FOOD ───────────────────────────────
  // The FOOD sheet also carries the warehouse's housekeeping stock under "ETC" (tissue, dish
  // soap, toiletries) — those map onto/are created as HOUSEKEEPING items.
  FOOD: {
    shipLocation: 'Galley', duplicateSkus: {}, productAliases: {},
    skuOverride: {
      'TP 02': 'TP 08', // sheet "Maizena 200gr"; catalog TP 02 is the 750gr pack
      'TP 05': 'TP 09', // sheet "Roti White Mamasuka 250gr"; catalog TP 05 is 500gr
      'ETC 01': 'HK 01', 'ETC 02': 'HK 02', 'ETC 03': 'HK 03', 'ETC 04': 'HK 04',
      'ETC 05': 'BF 11', 'ETC 06': 'SC 12', 'ETC 07': 'SC 13',
    },
    newItemCategory: {
      'salted egg': ['Other', 'ETC'],
      'kunyit bubuk': ['Spice', 'SP'],
      'dilmah pure camomile': ['Breakfast', 'BF'],
      'dilmah green tea mint': ['Breakfast', 'BF'],
      'green tea 8 mint': ['Breakfast', 'BF'],
      'v - soy soya ben original': ['Dairy', 'D'],
      'almon breze': ['Dairy', 'D'],
      'ultra milk': ['Dairy', 'D'],
      'sajiku': ['Flour', 'TP'],
      'mama lime 5 liter': ['Housekeeping', 'HK', 'HOUSEKEEPING'],
      'sunscreen surf zinc': ['Housekeeping', 'HK', 'HOUSEKEEPING'],
      'yves rocker body lotion': ['Housekeeping', 'HK', 'HOUSEKEEPING'],
      'yves rocker bad & shower gell': ['Housekeeping', 'HK', 'HOUSEKEEPING'],
      'yves rocker conditioner': ['Housekeeping', 'HK', 'HOUSEKEEPING'],
      'yves rocker shampo': ['Housekeeping', 'HK', 'HOUSEKEEPING'],
    },
    categoryMap: { BREAKFAST: 'Breakfast', DAIRY: 'Dairy', FROZEN: 'Frozen', TEPUNG: 'Flour', SAUCE: 'Sauce', SPICES: 'Spice', PASTA: 'Pasta', 'GLUTEN FREE': 'Gluten Free', ETC: 'Other' },
    poReceipts: {
      'PO-202607-086': [{ line: 'FR 05', row: 473 }],
      'PO-202609-016': [{ line: 'BF 07', row: 609 }],
      'PO-202608-043': [{ line: 'FR 09', row: 637 }, { line: 'FR 08', row: 638 }], // bacon: 20 of the 45 booked 01/10
      'PO-202608-038': [ // Roxy batch booked 31/08
        { line: 'SP 02', row: 534 }, { line: 'SC 07', row: 535 }, { line: 'SC 02', row: 536 }, { line: 'abc sause tomat', row: 537 },
        { line: 'SC 01', row: 538 }, { line: 'SC 09', row: 539 }, { line: 'SC 05', row: 540 }, { line: 'SP 05', row: 541 },
        { line: 'SP 03', row: 543 }, { line: 'tisue roll kichen', row: 544 }, { line: 'tissue paseo bathroom white roll', row: 545 },
        { line: 'BF 05', row: 546 }, { line: 'SP 06', row: 547 }, { line: 'BF 03', row: 548 }, { line: 'GF 01', row: 549 },
      ],
    },
    unitFixes: {},
    noPoCost: ['FR 01', 'FR 03', 'FR 13'], // oz britts meat is ordered per box, the sheet counts pieces
  },
}
const CFG = CONFIGS[TYPE]
if (!CFG) throw new Error(`Unknown --type=${TYPE} (expected ${Object.keys(CONFIGS).join(' / ')})`)

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return cellValue(v.result as ExcelJS.CellValue)
    if ('richText' in v) return v.richText.map(t => t.text).join('')
    if ('text' in v) return v.text
    if ('error' in v) return null
  }
  return v
}
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const asDate = (v: unknown) => (v instanceof Date && !isNaN(v.getTime()) ? v : null)

// Sheet dates are calendar days (exceljs gives them as UTC midnight). Store at 12:00 WITA so
// the day never shifts in any viewer's timezone; `seq` keeps same-day rows in sheet order.
const dayAt = (d: Date, seq: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 4, 0, 0) + seq * 1000)

function yachtFrom(text: string): string | null {
  const t = norm(text)
  if (/samara\s*(1|i)\b/.test(t)) return 'Samara I'
  if (/samara\s*(2|ii)\b/.test(t)) return 'Samara II'
  if (/mischief|\bmc\b/.test(t)) return 'Mischief'
  if (/otium/.test(t)) return 'Otium'
  return null
}

type MasterRow = { row: number; fullName: string; hpp: number | null; category: string; code: string; name: string; total: number }
type TxRow = { sheet: 'IN' | 'OUT'; row: number; date: Date | null; tipe: string; party: string; ket: string; product: string; qty: number | null; ts: Date | null }

async function readWorkbook(path: string) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)

  const master: MasterRow[] = []
  const ms = wb.getWorksheet('Stock Master')
  if (!ms) throw new Error('Sheet "Stock Master" not found')
  ms.eachRow((r, i) => {
    if (i < 8) return
    const c = (n: number) => cellValue(r.getCell(n).value)
    const fullName = str(c(3))
    if (!fullName || !str(c(6)) && !str(c(5)) && num(c(11)) === null) return // blank template row
    master.push({ row: i, fullName, hpp: num(c(2)), category: str(c(4)), code: str(c(5)), name: str(c(6)) || fullName, total: num(c(11)) ?? 0 })
  })

  const readTx = (name: string, sheet: 'IN' | 'OUT') => {
    const ws = wb.getWorksheet(name)
    if (!ws) throw new Error(`Sheet "${name}" not found`)
    // Column layout differs between workbooks (FOOD's Keluar tab is shifted one column right), so
    // locate it from the header row: Tanggal | Tipe | Party | Nota | Keterangan | Produk | QTY …
    const header = ws.getRow(4)
    let base = 0, tsCol = 0
    header.eachCell((cell, col) => {
      const h = str(cellValue(cell.value)).toLowerCase()
      if (!base && h.includes('tanggal')) base = col
      if (!tsCol && h.includes('waktu asli input nama')) tsCol = col
    })
    if (!base) throw new Error(`"${name}": header row 4 has no Tanggal column`)
    const rows: TxRow[] = []
    ws.eachRow((r, i) => {
      if (i < 5) return
      const c = (n: number) => cellValue(r.getCell(n).value)
      const row: TxRow = {
        sheet, row: i, date: asDate(c(base)), tipe: str(c(base + 1)), party: str(c(base + 2)), ket: str(c(base + 4)),
        product: str(c(base + 5)), qty: num(c(base + 6)), ts: tsCol ? asDate(c(tsCol)) ?? asDate(c(tsCol + 1)) : null,
      }
      if (row.date || row.tipe || row.party || row.product || row.qty !== null) rows.push(row)
    })
    return rows
  }
  return { master, inRows: readTx('Input Barang Masuk', 'IN'), outRows: readTx('Input Barang Keluar', 'OUT') }
}

/** Blank date/tipe/party on a row directly under a filled one = same batch (the warehouse only
 *  typed it once); otherwise fall back to the row's own "waktu asli input" timestamp. */
function fillDown(rows: TxRow[]) {
  const byRow = new Map(rows.map(r => [r.row, r]))
  const notes: string[] = []
  for (const r of rows) {
    const prev = byRow.get(r.row - 1)
    if (!r.date && prev?.date) r.date = prev.date
    if (!r.tipe && prev?.tipe) r.tipe = prev.tipe
    if (!r.party && prev?.party && (!r.tipe || r.tipe === prev.tipe)) r.party = prev.party
    if (!r.date && r.ts) { r.date = r.ts; notes.push(`${r.sheet} row ${r.row}: date from input timestamp ${r.ts.toISOString().slice(0, 10)}`) }
  }
  return notes
}

async function main() {
  const { master, inRows, outRows } = await readWorkbook(FILE)
  const fillNotes = [...fillDown(inRows), ...fillDown(outRows)]

  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenant = await central.tenant.findFirst({ where: { slug: TENANT }, select: { databaseUrl: true } })
  await central.$disconnect()
  if (!tenant) throw new Error(`Tenant ${TENANT} not found`)
  const db = new PrismaClient({ datasources: { db: { url: tenant.databaseUrl } } })

  try {
    const user = await db.user.findFirst({ where: { email: USER_EMAIL }, select: { id: true, name: true } })
    if (!user) throw new Error(`User ${USER_EMAIL} not found in ${TENANT}`)
    const locations = await db.stockLocation.findMany({ select: { id: true, name: true, type: true, yacht: { select: { name: true } } } })
    const warehouse = locations.find(l => l.name === WAREHOUSE)
    if (!warehouse) throw new Error(`Location ${WAREHOUSE} not found`)
    const barOf: Record<string, string> = {} // yacht name → its Bar / Galley location
    for (const l of locations) if (l.name === CFG.shipLocation && l.yacht) barOf[l.yacht.name] = l.id

    const items = await db.purchaseItem.findMany({
      select: { id: true, sku: true, name: true, type: true, standardCost: true, isActive: true, conversionFactor: true, baseUnit: true, purchaseUnit: true, orderItems: { select: { unitCost: true, order: { select: { createdAt: true, status: true } } } } },
    })
    const bySku = new Map(items.map(i => [i.sku, i]))
    const lastPoCost = (i: (typeof items)[number]) =>
      i.orderItems.filter(o => o.unitCost > 0 && o.order.status !== 'CANCELLED').sort((a, b) => +b.order.createdAt - +a.order.createdAt)[0]?.unitCost ?? 0

    // ── 1. Resolve every master row to a catalog SKU (planning new items as needed) ──
    type Plan = { sku: string; name: string; category: string; itemType: string; cost: number; costSource: string; target: number; sheetTotal: number; factor: number; existing?: (typeof items)[number] }
    const plans = new Map<string, Plan>() // by SKU
    const skuByFullName = new Map<string, string>()
    const usedSkus = new Set(items.map(i => i.sku))
    const nextSku = (prefix: string) => {
      for (let n = 1; ; n++) { const s = `${prefix} ${String(n).padStart(2, '0')}`; if (!usedSkus.has(s)) { usedSkus.add(s); return s } }
    }
    const newItems: Plan[] = []
    for (const m of master) {
      let sku = CFG.skuOverride[m.code] ?? m.code
      let existing = sku ? bySku.get(sku) : undefined
      if (!sku) existing = items.find(i => norm(i.name) === norm(m.name))
      if (existing) sku = existing.sku
      let category = m.category
      let itemType = existing?.type ?? TYPE
      if (!existing) {
        const meta = CFG.newItemCategory[norm(m.name)]
        if (meta?.[2]) itemType = meta[2]
        if (!sku && !meta) throw new Error(`Master row ${m.row} "${m.fullName}" has no code and no category mapping`)
        if (!sku) sku = nextSku(meta![1])
        category = meta?.[0] ?? CFG.categoryMap[category.toUpperCase()] ?? (category || TYPE)
      }
      const factor = existing && existing.conversionFactor > 0 ? existing.conversionFactor : 1
      const cur = existing?.standardCost ?? 0
      const po = existing && !CFG.noPoCost?.includes(sku) ? lastPoCost(existing) / factor : 0
      const [cost, costSource] = cur > 0 ? [cur, 'catalog'] : m.hpp ? [m.hpp / factor, 'sheet HPP'] : po > 0 ? [po, 'last PO'] : [0, 'none']
      const plan: Plan = { sku, name: existing?.name ?? m.name, category: category || TYPE, itemType, cost, costSource, target: Math.max(0, m.total) * factor, sheetTotal: m.total, factor, existing }
      plans.set(sku, plan)
      skuByFullName.set(norm(m.fullName), sku)
      if (!existing) newItems.push(plan)
    }
    for (const [alias, sku] of Object.entries(CFG.productAliases)) skuByFullName.set(alias, sku)

    // ── 2. Classify history rows ──
    type Mv = { sku: string; type: string; from: string | null; to: string | null; qty: number; date: Date; notes: string; inRow: number | null }
    const movements: Mv[] = []
    const skipped: string[] = []
    const assumed: string[] = []
    const seqByDay = new Map<string, number>()
    for (const r of [...inRows, ...outRows]) {
      const where = `${r.sheet} row ${r.row}`
      if (!r.product) { if (r.qty) skipped.push(`${where}: qty ${r.qty} without product`); continue }
      const sku = skuByFullName.get(norm(r.product))
      if (!sku) { skipped.push(`${where}: unknown product "${r.product}"`); continue }
      if (r.qty === 0) continue // "Stock Awal 0" placeholders
      if (!r.qty) { skipped.push(`${where}: ${r.product} — no qty`); continue }
      if (!r.date) { skipped.push(`${where}: ${r.product} — no date`); continue }
      const tipe = norm(r.tipe)
      const yacht = yachtFrom(`${r.party} ${r.ket}`)
      const bar = yacht ? barOf[yacht] ?? null : null
      let type: string, from: string | null = null, to: string | null = null
      if (r.sheet === 'IN') {
        to = warehouse.id
        if (tipe.startsWith('stock awal')) type = 'INITIAL'
        else if (tipe.startsWith('retur')) { type = 'TRANSFER_IN'; from = bar; if (!bar) assumed.push(`${where}: retur without ship — logged as return from unknown`) }
        else if (tipe.startsWith('baru ditemukan')) type = 'ADJUSTMENT'
        else { type = 'RECEIPT'; if (!tipe) assumed.push(`${where}: blank tipe → purchase`) }
      } else {
        from = warehouse.id
        if (tipe.startsWith('salah hitung') || tipe.startsWith('penyesuaian')) type = 'ADJUSTMENT'
        else if (tipe.startsWith('transfer') || (!tipe && bar)) {
          type = 'TRANSFER_OUT'; to = bar
          if (!bar) assumed.push(`${where}: transfer without ship "${r.party}"`)
          if (!tipe) assumed.push(`${where}: blank tipe with ship ${yacht} → transfer`)
        } else { type = 'ADJUSTMENT'; assumed.push(`${where}: ${tipe ? `tipe "${r.tipe}"` : 'blank tipe'}, no ship → loss/adjustment`) }
      }
      const dayKey = r.date.toISOString().slice(0, 10)
      const seq = (seqByDay.get(dayKey) ?? 0) + 1
      seqByDay.set(dayKey, seq)
      const label = [r.tipe || (r.sheet === 'IN' ? 'Masuk' : 'Keluar'), r.party, r.ket].filter(Boolean).join(' · ')
      movements.push({ sku, type, from, to, qty: r.qty * (plans.get(sku)?.factor ?? 1), date: dayAt(r.date, seq), notes: `CariStok ${r.sheet === 'IN' ? 'masuk' : 'keluar'} row ${r.row}: ${label}`, inRow: r.sheet === 'IN' ? r.row : null })
    }

    // ── 3. Warehouse balance targets ──
    const skuIds = [...plans.values()].filter(p => p.existing).map(p => p.existing!.id)
    const dupIds = Object.keys(CFG.duplicateSkus).map(s => bySku.get(s)?.id).filter((x): x is string => !!x)
    const lots = await db.stockLot.findMany({ where: { locationId: warehouse.id, itemId: { in: [...skuIds, ...dupIds] } }, orderBy: { createdAt: 'asc' } })
    const lotsByItem = new Map<string, typeof lots>()
    for (const l of lots) { const a = lotsByItem.get(l.itemId!) ?? []; a.push(l); lotsByItem.set(l.itemId!, a) }
    const current = (itemId?: string) => (itemId ? (lotsByItem.get(itemId) ?? []).reduce((s, l) => s + l.quantity, 0) : 0)

    // ── Report ──
    const count = (t: string) => movements.filter(m => m.type === t).length
    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${TYPE}, tenant ${TENANT}, file ${FILE}, as ${user.name}\n`)
    console.log(`History: ${movements.length} movements (INITIAL ${count('INITIAL')}, RECEIPT ${count('RECEIPT')}, TRANSFER_IN/retur ${count('TRANSFER_IN')}, TRANSFER_OUT ${count('TRANSFER_OUT')}, ADJUSTMENT ${count('ADJUSTMENT')})`)
    const range = movements.map(m => +m.date)
    console.log(`  range ${new Date(Math.min(...range)).toISOString().slice(0, 10)} → ${new Date(Math.max(...range)).toISOString().slice(0, 10)}`)
    const perShip: Record<string, number> = {}
    for (const m of movements) if (m.type === 'TRANSFER_OUT') { const y = Object.keys(barOf).find(k => barOf[k] === m.to) ?? '?'; perShip[y] = (perShip[y] ?? 0) + m.qty }
    console.log('  transferred to ships:', perShip)
    console.log(`\nDates filled from input timestamp (${fillNotes.length}):`); fillNotes.forEach(n => console.log('  ' + n))
    console.log(`\nAssumptions (${assumed.length}):`); assumed.forEach(n => console.log('  ' + n))
    console.log(`\nSkipped rows (${skipped.length}):`); skipped.forEach(n => console.log('  ' + n))
    const converted = [...plans.values()].filter(p => p.factor !== 1)
    if (converted.length) console.log(`\nSheet qty treated as purchase unit (× conversionFactor): ${converted.map(p => `${p.sku} ${p.name} ×${p.factor} ${p.existing?.baseUnit}/${p.existing?.purchaseUnit}`).join(', ')}`)
    console.log(`\nNew catalog items (${newItems.length}):`); newItems.forEach(p => console.log(`  + ${p.sku} ${p.name} [${p.itemType} / ${p.category}]`))
    console.log(`\nDuplicates to deactivate:`); for (const [d, keep] of Object.entries(CFG.duplicateSkus)) { const it = bySku.get(d); console.log(`  - ${d} ${it?.name ?? '(missing)'} (gudang ${current(it?.id)} → 0; keeps ${keep})`) }
    const costFills = [...plans.values()].filter(p => p.costSource === 'sheet HPP' || p.costSource === 'last PO')
    console.log(`\nstandardCost fills (${costFills.length}):`); costFills.forEach(p => console.log(`  ${p.sku} ${p.name}: ${p.cost} (${p.costSource})`))
    console.log(`  still no cost: ${[...plans.values()].filter(p => p.costSource === 'none').map(p => p.sku).join(', ')}`)
    console.log(`\nGudang balance changes (ERP → sheet):`)
    let changes = 0
    for (const p of plans.values()) {
      const cur = current(p.existing?.id)
      if (cur === p.target) continue
      changes++
      console.log(`  ${p.sku.padEnd(7)} ${p.name.slice(0, 40).padEnd(40)} ${String(cur).padStart(4)} → ${String(p.target).padStart(4)}${p.sheetTotal < 0 ? `  (sheet ${p.sheetTotal}, clamped)` : ''}`)
    }
    console.log(`  ${changes} item(s) change; total ${[...plans.values()].reduce((s, p) => s + current(p.existing?.id), 0)} → ${[...plans.values()].reduce((s, p) => s + p.target, 0)}`)
    // ── 4. PO receipts without stock ──
    const inByRow = new Map(inRows.map(r => [r.row, r]))
    const pos = await db.purchaseOrder.findMany({
      where: { poNumber: { in: Object.keys(CFG.poReceipts) } },
      select: {
        id: true, poNumber: true, status: true, receipts: { select: { id: true, notes: true } },
        items: { select: { id: true, itemId: true, itemName: true, orderedQty: true, receivedQty: true, unitCost: true, item: { select: { sku: true } } } },
      },
    })
    type GrPlan = { poId: string; poNumber: string; date: Date; rows: number[]; lines: { poItemId: string; itemId: string | null; itemName: string; qty: number; unitCost: number }[]; existingId?: string }
    const grPlans: GrPlan[] = []
    const poStatusAfter = new Map<string, string>()
    for (const [poNumber, wanted] of Object.entries(CFG.poReceipts)) {
      const po = pos.find(p => p.poNumber === poNumber)
      if (!po) { console.log(`\n⚠ ${poNumber} not found — skipped`); continue }
      // A previous --apply already received this PO's sheet rows: keep that GR, just reuse its id.
      const prior = po.receipts.filter(r => r.notes?.startsWith('Received per CariStok sheet'))
      const priorRows = new Map<number, string>()
      for (const g of prior) for (const n of g.notes!.match(/rows ([\d, ]+)/)?.[1].split(',') ?? []) priorRows.set(Number(n.trim()), g.id)
      const received = new Map(po.items.map(i => [i.id, i.receivedQty]))
      const byDate = new Map<string, GrPlan>()
      for (const w of wanted) {
        const [key, cost] = w.line.split('@')
        const line = po.items.find(i => (i.item?.sku === key || norm(i.itemName) === key) && (!cost || i.unitCost === Number(cost)))
        const row = inByRow.get(w.row)
        if (!line || !row?.date || !row.qty) throw new Error(`${poNumber}: cannot resolve line "${w.line}" / sheet row ${w.row}`)
        if (priorRows.has(w.row)) { grPlans.push({ poId: po.id, poNumber, date: row.date, rows: [w.row], lines: [], existingId: priorRows.get(w.row) }); continue }
        const qty = Math.min(row.qty, line.orderedQty - (received.get(line.id) ?? 0))
        if (qty <= 0) continue
        received.set(line.id, (received.get(line.id) ?? 0) + qty)
        const k = row.date.toISOString().slice(0, 10)
        const g = byDate.get(k) ?? { poId: po.id, poNumber, date: row.date, rows: [], lines: [] }
        g.rows.push(w.row)
        g.lines.push({ poItemId: line.id, itemId: line.itemId, itemName: line.itemName, qty, unitCost: line.unitCost })
        byDate.set(k, g)
      }
      grPlans.push(...byDate.values())
      const all = po.items.every(i => (received.get(i.id) ?? 0) >= i.orderedQty)
      poStatusAfter.set(poNumber, all ? 'RECEIVED' : [...received.values()].some(q => q > 0) ? 'PARTIALLY_RECEIVED' : po.status)
      const open = po.items.filter(i => (received.get(i.id) ?? 0) < i.orderedQty).map(i => `${i.item?.sku ?? i.itemName} ${(received.get(i.id) ?? 0)}/${i.orderedQty}`)
      console.log(`\n${poNumber}: ${po.status} → ${poStatusAfter.get(poNumber)}${open.length ? ` (still open: ${open.join(', ')})` : ''}`)
      for (const g of byDate.values()) console.log(`  GR ${g.date.toISOString().slice(0, 10)}: ${g.lines.map(l => `${l.itemName} ×${l.qty}`).join(', ')}`)
      if (prior.length) console.log(`  (${prior.length} GR(s) from a previous run kept)`)
    }

    const unitFixes = Object.entries(CFG.unitFixes).map(([sku, unit]) => ({ it: bySku.get(sku), unit })).filter(u => u.it && u.it.baseUnit === 'pcs' && u.it.conversionFactor === 1)
    console.log(`\nUnit fixes: ${unitFixes.map(u => `${u.it!.sku} ${u.it!.name} pcs → ${u.unit}`).join(', ') || 'none'}`)

    if (!APPLY) { console.log('\nDry run — nothing written. Re-run with --apply.'); return }

    // ── Apply ──
    await db.$transaction(async tx => {
      for (const p of newItems) {
        const created = await tx.purchaseItem.create({
          data: { sku: p.sku, name: p.name, type: p.itemType, category: p.category, baseUnit: 'pcs', purchaseUnit: 'pcs', conversionFactor: 1, standardCost: p.cost },
          select: { id: true, sku: true, name: true, type: true, standardCost: true, isActive: true, conversionFactor: true, baseUnit: true, purchaseUnit: true },
        })
        p.existing = { ...created, orderItems: [] }
      }
      for (const p of costFills) if (p.existing && p.existing.standardCost === 0) await tx.purchaseItem.update({ where: { id: p.existing.id }, data: { standardCost: p.cost } })
      const idBySku = new Map([...plans.values()].map(p => [p.sku, p.existing!.id]))
      const costBySku = new Map([...plans.values()].map(p => [p.sku, p.cost]))

      for (const u of unitFixes) await tx.purchaseItem.update({ where: { id: u.it!.id }, data: { baseUnit: u.unit, purchaseUnit: u.unit } })

      // GRs first, so the matching history movements can point at them.
      const grByRow = new Map<number, string>()
      const prefix = `GR-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-`
      let seq = Math.max(0, ...(await tx.goodsReceipt.findMany({ where: { grNumber: { startsWith: prefix } }, select: { grNumber: true } })).map(r => parseInt(r.grNumber.slice(prefix.length)) || 0))
      for (const g of grPlans) {
        if (g.existingId) { g.rows.forEach(r => grByRow.set(r, g.existingId!)); continue }
        const gr = await tx.goodsReceipt.create({
          data: {
            grNumber: `${prefix}${String(++seq).padStart(3, '0')}`, orderId: g.poId, locationId: warehouse.id, receivedById: user.id,
            receivedAt: dayAt(g.date, 0),
            notes: `Received per CariStok sheet rows ${g.rows.join(', ')} — goods already counted in the warehouse stock sync, so no stock was added.`,
            items: { create: g.lines.map(l => ({ itemId: l.itemId, itemName: l.itemName, receivedQty: l.qty, unitCost: l.unitCost })) },
          },
        })
        g.rows.forEach(r => grByRow.set(r, gr.id))
        for (const l of g.lines) await tx.purchaseOrderItem.update({ where: { id: l.poItemId }, data: { receivedQty: { increment: l.qty } } })
      }
      for (const [poNumber, status] of poStatusAfter) {
        const po = pos.find(p => p.poNumber === poNumber)!
        if (status !== po.status) await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: status as 'RECEIVED' | 'PARTIALLY_RECEIVED' } })
      }

      const removed = await tx.stockMovement.deleteMany({ where: { referenceType: REF_HISTORY, itemId: { in: [...idBySku.values()] } } })
      if (removed.count) console.log(`  replaced ${removed.count} previous import movement(s)`)
      await tx.stockMovement.createMany({
        data: movements.map(m => {
          const cost = costBySku.get(m.sku) ?? 0
          return {
            itemId: idBySku.get(m.sku)!, fromLocationId: m.from, toLocationId: m.to, quantity: m.qty, type: m.type,
            referenceType: REF_HISTORY, referenceId: m.inRow ? grByRow.get(m.inRow) ?? null : null,
            notes: m.notes, unitCost: cost || null, totalCost: cost ? cost * m.qty : null,
            createdById: user.id, createdAt: m.date,
          }
        }),
      })

      const syncLots = async (itemId: string, target: number, cost: number, note: string) => {
        const itemLots = lotsByItem.get(itemId) ?? []
        const cur = itemLots.reduce((s, l) => s + l.quantity, 0)
        if (cur === target) {
          for (const l of itemLots) if (l.costPerUnit === 0 && cost > 0) await tx.stockLot.update({ where: { id: l.id }, data: { costPerUnit: cost } })
          return
        }
        const [keep, ...rest] = itemLots
        if (keep) await tx.stockLot.update({ where: { id: keep.id }, data: { quantity: target, ...(keep.costPerUnit === 0 && cost > 0 ? { costPerUnit: cost } : {}) } })
        else await tx.stockLot.create({ data: { itemId, locationId: warehouse.id, quantity: target, costPerUnit: cost } })
        for (const l of rest) await tx.stockLot.update({ where: { id: l.id }, data: { quantity: 0 } })
        const diff = target - cur
        await tx.stockMovement.create({
          data: {
            itemId, quantity: Math.abs(diff), type: 'ADJUSTMENT', referenceType: REF_SYNC,
            fromLocationId: diff < 0 ? warehouse.id : null, toLocationId: diff > 0 ? warehouse.id : null,
            unitCost: cost || null, totalCost: cost ? cost * Math.abs(diff) : null, createdById: user.id,
            notes: `${note} (${cur} → ${target})`,
          },
        })
      }
      for (const p of plans.values()) {
        await syncLots(p.existing!.id, p.target, p.cost, p.sheetTotal < 0 ? `Synced to CariStok sheet; sheet total ${p.sheetTotal} clamped to 0` : 'Synced to CariStok sheet')
      }
      for (const [dup, keep] of Object.entries(CFG.duplicateSkus)) {
        const it = bySku.get(dup)
        if (!it) continue
        await syncLots(it.id, 0, 0, `Duplicate of ${keep} — stock moved to ${keep} by CariStok sync`)
        await tx.purchaseItem.update({ where: { id: it.id }, data: { isActive: false } })
      }
    }, { timeout: 180_000, maxWait: 20_000 })
    console.log('\n✓ Applied.')
  } finally {
    await db.$disconnect()
  }
}

main().catch(e => { console.error('Import failed:', e); process.exit(1) })
