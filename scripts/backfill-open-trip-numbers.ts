/**
 * One-off backfill: assigns OpenTrip.tripNumber to every existing trip, per tenant,
 * using the same rule as renumberOpenTripYear() (trips numbered 1..N within each
 * calendar year of startDate, ordered by startDate then createdAt).
 *
 * Run: npx tsx scripts/backfill-open-trip-numbers.ts
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import { renumberOpenTripYear } from '../src/lib/openTripNumbering'
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
      const years = await db.openTrip.findMany({ select: { startDate: true } })
      const distinctYears = [...new Set(years.map(y => y.startDate.getFullYear()))].sort()
      console.log(`→ ${t.slug}: ${years.length} trip(s) across ${distinctYears.length} year(s) [${distinctYears.join(', ')}]`)
      for (const year of distinctYears) {
        await renumberOpenTripYear(db, year)
      }
      console.log(`✓ ${t.slug} done.\n`)
    } finally {
      await db.$disconnect()
    }
  }

  await centralDb.$disconnect()
}

main().catch(e => { console.error('Backfill failed:', e); process.exit(1) })
