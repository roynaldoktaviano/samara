/**
 * One-off: widens CandidateStatus from {NEW, SCREENING, INTERVIEW, OFFER, HIRED, REJECTED}
 * to the 7-stage recruitment pipeline {TALENT_POOL, SHORTLISTED, ASSESSMENT, INTERVIEW,
 * OFFER, HIRED, REJECTED} (matching the proto-2 mockup's "Move candidate" stages).
 *
 * Must run BEFORE `prisma db push` drops the old NEW/SCREENING enum labels — Postgres
 * refuses to drop an enum label still referenced by a row. Adds the new labels first
 * (ALTER TYPE ... ADD VALUE, each its own statement — Postgres won't let a new enum
 * label be used in the same transaction it was added in), then remaps existing rows:
 * NEW -> TALENT_POOL (the new pipeline's own starting stage), SCREENING -> SHORTLISTED
 * (closest existing-stage match to an initial vetting pass).
 *
 * Run: npx tsx scripts/migrate-candidate-status-stages.ts
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

async function migrateOne(databaseUrl: string, label: string) {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    for (const value of ['TALENT_POOL', 'SHORTLISTED', 'ASSESSMENT']) {
      await db.$executeRawUnsafe(`ALTER TYPE "CandidateStatus" ADD VALUE IF NOT EXISTS '${value}'`)
    }
    const toTalentPool = await db.$executeRawUnsafe(`UPDATE "Candidate" SET status = 'TALENT_POOL' WHERE status = 'NEW'`)
    const toShortlisted = await db.$executeRawUnsafe(`UPDATE "Candidate" SET status = 'SHORTLISTED' WHERE status = 'SCREENING'`)
    console.log(`✓ ${label}: ${toTalentPool} NEW -> TALENT_POOL, ${toShortlisted} SCREENING -> SHORTLISTED`)
  } finally {
    await db.$disconnect()
  }
}

async function main() {
  await migrateOne(process.env.DATABASE_URL!, 'default')

  const centralDb = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenants = await centralDb.tenant.findMany({ where: { isActive: true }, select: { slug: true, databaseUrl: true } })
  for (const t of tenants) {
    if (t.databaseUrl === process.env.DATABASE_URL) continue
    await migrateOne(t.databaseUrl, t.slug)
  }
  await centralDb.$disconnect()
}

main().catch(e => {
  console.error('Migration failed:', e)
  process.exit(1)
})
