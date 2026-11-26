/**
 * ERP → company-Drive offline-conversion sheets (Jay, 25 Nov 2026 — src/lib/ad-offline-sheets.ts).
 * Needs the erp-sheets-writer key: OFFLINE_CONV_SA_KEY_FILE=/path/key.json (or OFFLINE_CONV_SA_KEY_JSON).
 *
 *   npx tsx scripts/offline-sheets.ts --test          append 4 stage rows + 1 booking row, Order IDs "test-…",
 *                                                     synthetic data (no guest data) — for Jay's format check
 *   npx tsx scripts/offline-sheets.ts --remove-test   delete every row whose Order ID starts with "test-"
 *   npx tsx scripts/offline-sheets.ts --preview       real rows from the deals: print what would be appended (no write)
 *   npx tsx scripts/offline-sheets.ts --apply         real rows: append the new ones (what the 00:00 cron does)
 *
 *   npx tsx scripts/offline-sheets.ts --fix-ac-values [--write]
 *                                                     ONE-OFF: set the AC rows already in the Stages sheet to the brand's AC
 *                                                     value (preview unless --write). Only before Data Manager's first pull!
 *
 * Add --brand mischief / --brand otium to work on that brand's sheets (its deals only); default is Samara.
 *
 * Sheet IDs: GOOGLE_OFFLINE_[MISCHIEF_|OTIUM_]STAGES_SHEET_ID / …BOOKING_SHEET_ID, else the sheets below.
 * Runs against DATABASE_URL (Samara tenant — Mischief / Otium deals live there too).
 */
import { PrismaClient } from '@prisma/client'
import { appendOfflineSheetRows, buildOfflineSheetRows, buildTestRows, fixAcValues, removeTestRows, STAGES_HEADER, BOOKING_HEADER, type SheetBrand } from '../src/lib/ad-offline-sheets'

const has = (f: string) => process.argv.includes(f)
const brandArg = (process.argv[process.argv.indexOf('--brand') + 1] ?? '').toUpperCase()
const BRAND_IDS: Record<SheetBrand, { stagesSheetId: string; bookingSheetId: string }> = {
  SAMARA: {
    stagesSheetId: process.env.GOOGLE_OFFLINE_STAGES_SHEET_ID || '1VZonTEH8LUrNWaqTDIXubOdE_SYZsaoFyJdHMDWK4l8',
    bookingSheetId: process.env.GOOGLE_OFFLINE_BOOKING_SHEET_ID || '1BKPNUR0SeAERNbZRLxnWfmgcFFWcorVUfVw679XHcBw',
  },
  MISCHIEF: {
    stagesSheetId: process.env.GOOGLE_OFFLINE_MISCHIEF_STAGES_SHEET_ID || '1O4lsFiKUtj26HmP-l3cJdXElhoFkHB82u8fIO9txawA',
    bookingSheetId: process.env.GOOGLE_OFFLINE_MISCHIEF_BOOKING_SHEET_ID || '16nF6WknNN2Yv8GUewaGeqFcTXYuJpgoeV4OXeVbkEus',
  },
  OTIUM: {
    stagesSheetId: process.env.GOOGLE_OFFLINE_OTIUM_STAGES_SHEET_ID || '1n3ukSci1eHCEbrAQyfJG6BzN37CEXz5HoVvOiwXZgxg',
    bookingSheetId: process.env.GOOGLE_OFFLINE_OTIUM_BOOKING_SHEET_ID || '1Trg4rN60YZqgXoMJD7_bpsjDfT_tCYKStAraG33nIe8',
  },
}
if (has('--brand') && !(brandArg in BRAND_IDS)) throw new Error(`--brand ${brandArg.toLowerCase()}: samara, mischief or otium`)
const brand = (has('--brand') ? brandArg : 'SAMARA') as SheetBrand
const ids = BRAND_IDS[brand]

function show(title: string, header: readonly string[], rows: (string | number)[][]) {
  console.log(`\n${title}: ${rows.length} row(s)`)
  if (rows.length) console.table(rows.slice(0, 20).map(r => Object.fromEntries(header.map((h, i) => [h, typeof r[i] === 'string' && String(r[i]).length > 24 ? String(r[i]).slice(0, 21) + '…' : r[i]]))))
}

async function main() {
  console.log(`Brand: ${brand}`)
  if (has('--fix-ac-values')) {
    const changes = await fixAcValues(ids, brand, { dryRun: !has('--write') })
    console.log(`${has('--write') ? 'Updated' : 'Would update'} ${changes.length} AC row(s)`)
    const byStage: Record<string, number> = {}
    for (const c of changes) byStage[`${c.stage} ${c.from} → ${c.to}`] = (byStage[`${c.stage} ${c.from} → ${c.to}`] ?? 0) + 1
    console.log(byStage)
    return
  }
  if (has('--remove-test')) { console.log('Deleted test rows:', await removeTestRows(ids)); return }
  if (has('--test')) {
    const rows = buildTestRows(new Date(), brand)
    const res = await appendOfflineSheetRows(ids, rows)
    if (!res.ok) throw new Error(res.reason)
    show('Stages appended', STAGES_HEADER, res.stages.rows)
    show('Booking appended', BOOKING_HEADER, res.booking.rows)
    return
  }
  if (has('--preview') || has('--apply')) {
    const db = new PrismaClient()
    try {
      const built = await buildOfflineSheetRows(db, new Date(), brand)
      const res = await appendOfflineSheetRows(ids, built, { dryRun: !has('--apply') })
      if (!res.ok) throw new Error(res.reason)
      show(has('--apply') ? 'Stages appended' : 'Stages would append', STAGES_HEADER, res.stages.rows)
      show(has('--apply') ? 'Booking appended' : 'Booking would append', BOOKING_HEADER, res.booking.rows)
      console.log(`\nAlready in the sheet: ${res.stages.alreadyThere + res.booking.alreadyThere}. Skipped: ${built.skipped.length}`)
      for (const s of built.skipped.slice(0, 30)) console.log('  ', s.action, s.orderId, '—', s.reason)
    } finally { await db.$disconnect() }
    return
  }
  console.log('Pass --test, --remove-test, --preview or --apply')
}

main().catch(e => { console.error(e); process.exit(1) })
