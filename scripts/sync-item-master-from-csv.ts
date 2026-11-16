/**
 * Sync item master fields from the "Item List" CSV export (2026-11-16).
 * Only touches: name, treatment (Type), type (Category), category (Sub-Category), matched by SKU.
 * Run:  npx tsx scripts/sync-item-master-from-csv.ts "<csv>"            (dry run)
 *       npx tsx scripts/sync-item-master-from-csv.ts "<csv>" --apply
 * Options: --tenant=samara
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import * as fs from 'fs'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const TENANT = args.find(a => a.startsWith('--tenant='))?.split('=')[1] ?? 'samara'
const FILE = args.find(a => !a.startsWith('--'))
if (!FILE) throw new Error('CSV path required')

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some(v => v !== '')) rows.push(row)
      row = []
    } else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}

const TREATMENT: Record<string, 'TRADING' | 'CONSUMABLE' | 'ASSET'> = {
  trading: 'TRADING', consumable: 'CONSUMABLE', asset: 'ASSET',
}

const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const titleCase = (v: string) => v.trim().toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())

async function main() {
  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenant = await central.tenant.findFirst({ where: { slug: TENANT }, select: { databaseUrl: true } })
  await central.$disconnect()
  if (!tenant) throw new Error(`Tenant ${TENANT} not found`)
  const db = new PrismaClient({ datasources: { db: { url: tenant.databaseUrl } } })

  const [header, ...body] = parseCsv(fs.readFileSync(FILE!, 'utf8').replace(/^﻿/, ''))
  const col = (n: string) => header.indexOf(n)
  const iSku = col('SKU'), iName = col('Name'), iType = col('Type'), iCat = col('Category'), iSub = col('Sub-Category')

  const csv = new Map<string, { name: string; type: string; cat: string; sub: string }>()
  for (const r of body) {
    const sku = r[iSku].trim()
    if (!sku || csv.has(sku)) continue
    csv.set(sku, { name: r[iName].trim(), type: r[iType].trim(), cat: r[iCat].trim(), sub: r[iSub].trim() })
  }

  const typeConfigs = await db.purchaseItemTypeConfig.findMany()
  const subCats = await db.purchaseItemCategory.findMany()
  const items = await db.purchaseItem.findMany()
  const bySku = new Map(items.map(i => [i.sku, i]))

  const resolveCat = (v: string) =>
    typeConfigs.find(t => t.code.toLowerCase() === v.toLowerCase() || t.label.toLowerCase() === v.toLowerCase())

  const updates: { id: string; sku: string; data: Record<string, unknown>; diff: string[] }[] = []
  const problems: string[] = []
  const missingSubs = new Set<string>()

  for (const [sku, r] of csv) {
    const item = bySku.get(sku)
    if (!item) { problems.push(`NOT IN DB: ${sku} ${r.name}`); continue }
    const treatment = TREATMENT[r.type.toLowerCase()]
    if (!treatment) { problems.push(`BAD TYPE: ${sku} "${r.type}"`); continue }
    const cfg = resolveCat(r.cat)
    if (!cfg) { problems.push(`UNKNOWN CATEGORY: ${sku} "${r.cat}"`); continue }
    // Sub-category: reuse the master spelling (case/accent-insensitive) within that category,
    // otherwise Title Case so "SPIRIT"/"Spirit" collapse into one sub-category.
    const existingSub = subCats.find(s => s.typeCode === cfg.code && norm(s.name) === norm(r.sub))
    const sub = existingSub?.name ?? titleCase(r.sub)
    if (!existingSub) missingSubs.add(`${cfg.code}|${sub}`)

    const data: Record<string, unknown> = {}
    const diff: string[] = []
    if (item.name !== r.name) { data.name = r.name; diff.push(`name "${item.name}" → "${r.name}"`) }
    if (item.treatment !== treatment) { data.treatment = treatment; diff.push(`type ${item.treatment} → ${treatment}`) }
    if (item.type !== cfg.code) { data.type = cfg.code; diff.push(`category ${item.type} → ${cfg.code}`) }
    if (item.category !== sub) { data.category = sub; diff.push(`sub "${item.category}" → "${sub}"`) }
    if (diff.length) updates.push({ id: item.id, sku, data, diff })
  }
  const notInCsv = items.filter(i => !csv.has(i.sku))

  console.log(`CSV SKUs: ${csv.size} | DB items: ${items.length}`)
  console.log(`\n== ${updates.length} items to update ==`)
  for (const u of updates) console.log(`${u.sku}: ${u.diff.join('; ')}`)
  console.log(`\n== Problems (${problems.length}) ==`); problems.forEach(p => console.log(p))
  console.log(`\n== Sub-categories to create (${missingSubs.size}) ==`); missingSubs.forEach(s => console.log(s))
  console.log(`\n== DB items not in CSV (${notInCsv.length}, left untouched) ==`)
  notInCsv.forEach(i => console.log(`${i.sku} ${i.name} [${i.isActive ? 'active' : 'inactive'}]`))

  if (APPLY) {
    for (const s of missingSubs) {
      const [typeCode, name] = s.split('|')
      await db.purchaseItemCategory.upsert({ where: { typeCode_name: { typeCode, name } }, create: { typeCode, name }, update: {} })
    }
    for (const u of updates) await db.purchaseItem.update({ where: { id: u.id }, data: u.data })
    console.log(`\nAPPLIED: ${updates.length} items, ${missingSubs.size} sub-categories`)
  } else console.log('\n(dry run — pass --apply to write)')
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
