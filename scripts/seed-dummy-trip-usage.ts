/**
 * Sample data for Purchasing › Trip Usage (Usage Detail tab): for each yacht, the 4 latest
 * finished trips of the year get 4–7 food/housekeeping items as SHIP_USAGE, valued at the item's
 * last purchase cost ± a few % (stands in for the moving-average cost).
 *
 * Only usage-ledger rows are written (StockMovement, referenceType DUMMY_TRIP_USAGE) — no stock
 * lots, POs or payments change. They DO show up in Finance › Trip Stats and item history until
 * removed, so remove them once the demo is done.
 *
 * Run:  npx tsx scripts/seed-dummy-trip-usage.ts           (dry run — shows what it would add)
 *       npx tsx scripts/seed-dummy-trip-usage.ts --apply   (writes)
 *       npx tsx scripts/seed-dummy-trip-usage.ts --remove  (deletes every dummy row)
 */
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import crypto from 'crypto'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const APPLY = process.argv.includes('--apply')
const REMOVE = process.argv.includes('--remove')
const MARKER = 'DUMMY_TRIP_USAGE'
const TRIPS_PER_YACHT = 4

// Deterministic so a dry run shows exactly what --apply will write.
let seed = 20261109
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const pick = <T,>(arr: T[], n: number) => {
  const copy = [...arr]
  const out: T[] = []
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0])
  return out
}

const db = new PrismaClient()

async function main() {
  if (REMOVE) {
    const { count } = await db.stockMovement.deleteMany({ where: { referenceType: MARKER } })
    console.log(`Removed ${count} dummy usage row(s).`)
    return
  }
  const existing = await db.stockMovement.count({ where: { referenceType: MARKER } })
  if (existing) { console.log(`${existing} dummy rows already exist — run with --remove first.`); return }

  const user = await db.user.findFirst({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } }, select: { id: true } })
  if (!user) throw new Error('No admin user to own the rows')
  const items = await db.purchaseItem.findMany({
    where: { standardCost: { gt: 0 }, treatment: 'CONSUMABLE', type: { in: ['FOOD', 'HOUSEKEEPING'] } },
    select: { id: true, name: true, baseUnit: true, standardCost: true },
    orderBy: { name: 'asc' },
  })
  const yachts = await db.yacht.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
  const year = new Date().getFullYear()
  const start = new Date(Date.UTC(year, 0, 1))
  const now = new Date()

  const rows: Parameters<typeof db.stockMovement.create>[0]['data'][] = []
  let grand = 0
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${items.length} candidate items\n`)
  for (const y of yachts) {
    const [ots, pcs] = await Promise.all([
      db.openTrip.findMany({
        where: { yachtId: y.id, endDate: { gte: start, lt: now }, status: { notIn: ['cancelled', 'closed'] } },
        select: { id: true, tripNumber: true, startDate: true, title: true },
      }),
      db.booking.findMany({
        where: { yachtId: y.id, tripType: 'PRIVATE_CHARTER', endDate: { gte: start, lt: now }, status: { not: 'cancelled' } },
        select: { id: true, tripNumber: true, startDate: true, bookingCode: true },
      }),
    ])
    const trips = [
      ...ots.map(t => ({ ...t, label: t.title, openTripId: t.id as string | null, tripBookingId: null as string | null })),
      ...pcs.map(c => ({ ...c, label: c.bookingCode, openTripId: null as string | null, tripBookingId: c.id as string | null })),
    ].sort((a, b) => b.startDate.getTime() - a.startDate.getTime()).slice(0, TRIPS_PER_YACHT)

    for (const t of trips) {
      const chosen = pick(items, 4 + Math.floor(rand() * 4))
      let tripTotal = 0
      for (const it of chosen) {
        const qty = 1 + Math.floor(rand() * 10)
        // ±8% around last purchase cost — moving averages drift from the latest invoice.
        const unitCost = Math.round(it.standardCost! * (0.92 + rand() * 0.16) / 100) * 100
        const totalCost = qty * unitCost
        tripTotal += totalCost
        rows.push({
          id: crypto.randomUUID(), itemId: it.id, quantity: qty, type: 'TRANSFER_IN',
          referenceType: MARKER, notes: '[DUMMY] Trip Usage sample data',
          unitCost, totalCost, usageType: 'SHIP_USAGE', yachtId: y.id,
          openTripId: t.openTripId, tripBookingId: t.tripBookingId,
          createdById: user.id, createdAt: t.startDate,
        })
      }
      grand += tripTotal
      console.log(`${y.name.padEnd(10)} #${String(t.tripNumber ?? '—').padEnd(4)} ${t.label.slice(0, 30).padEnd(30)} ${chosen.length} items  Rp ${tripTotal.toLocaleString('id-ID')}`)
    }
  }
  console.log(`\n${rows.length} rows, total Rp ${grand.toLocaleString('id-ID')}`)
  if (!APPLY) { console.log('Dry run — nothing written. Add --apply to write.'); return }
  await db.stockMovement.createMany({ data: rows as never })
  console.log('Written. Remove later with --remove.')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
