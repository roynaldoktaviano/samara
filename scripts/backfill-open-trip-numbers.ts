/**
 * One-off backfill: recomputes the combined Open Trip + Private Charter trip-number
 * sequence for every yacht+calendar-year that has data, per tenant, using
 * renumberTripYear() (see src/lib/openTripNumbering.ts).
 *
 * Run: npx tsx scripts/backfill-open-trip-numbers.ts
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import { renumberTripYear } from '../src/lib/openTripNumbering'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

async function main() {
  const centralDb = new CentralClient({
    datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } },
  })
  const tenants = await centralDb.tenant.findMany({
    where: { isActive: true },
    select: { slug: true, databaseUrl: true },
  })
  console.log(`Found ${tenants.length} active tenant(s).\n`)

  for (const t of tenants) {
    const db = new PrismaClient({ datasources: { db: { url: t.databaseUrl } } })
    try {
      const [trips, charters] = await Promise.all([
        db.openTrip.findMany({ select: { yachtId: true, endDate: true } }),
        db.booking.findMany({ where: { tripType: 'PRIVATE_CHARTER' }, select: { yachtId: true, endDate: true } }),
      ])
      const keys = new Set([
        ...trips.map(t => `${t.yachtId}|${t.endDate.getFullYear()}`),
        ...charters.filter(c => c.yachtId).map(c => `${c.yachtId}|${c.endDate.getFullYear()}`),
      ])
      console.log(`→ ${t.slug}: ${trips.length} open trip(s), ${charters.length} charter(s) across ${keys.size} yacht+year combo(s)`)
      for (const key of keys) {
        const [yachtId, year] = key.split('|')
        await renumberTripYear(db, yachtId, Number(year))
      }
      console.log(`✓ ${t.slug} done.\n`)
    } finally {
      await db.$disconnect()
    }
  }

  await centralDb.$disconnect()
}

main().catch(e => { console.error('Backfill failed:', e); process.exit(1) })
