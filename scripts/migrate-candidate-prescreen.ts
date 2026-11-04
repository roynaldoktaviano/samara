/**
 * One-off: adds the Prescreen round to Candidates (HR menu update 2026-11-04 —
 * "Sebelum Assessment, bisa ditambahkan 'Prescreen'").
 *
 *  - CandidateStatus gets PRESCREEN, placed BEFORE 'ASSESSMENT' so the enum order matches
 *    the pipeline (New → Shortlisted → Prescreen → Assessment → HR Interview → …).
 *    `prisma db push` would only append it at the end, which is why this runs first.
 *  - Candidate gets prescreenScheduledAt / prescreenMeetingLink / prescreenResult /
 *    prescreenNotes (all nullable — existing rows are untouched).
 *
 * Purely additive and idempotent: no existing row or value is changed, safe to re-run.
 * After this, `prisma db push` should report the DB already in sync.
 *
 * Run it BEFORE deploying the code — the new code selects the prescreen* columns and
 * would fail on a DB that doesn't have them yet.
 *
 * Run: npx tsx scripts/migrate-candidate-prescreen.ts [tenant-slug ...]
 *      (no slugs = every active tenant)
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

async function migrateOne(databaseUrl: string, label: string) {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    await db.$executeRawUnsafe(`ALTER TYPE "CandidateStatus" ADD VALUE IF NOT EXISTS 'PRESCREEN' BEFORE 'ASSESSMENT'`)
    // InterviewResult arrived with the HR/User interview split; a DB that hasn't had its
    // db push for that yet won't have it, and prescreenResult needs it.
    await db.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "InterviewResult" AS ENUM ('PASSED', 'ON_HOLD', 'FAILED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `)
    await db.$executeRawUnsafe(`
      ALTER TABLE "Candidate"
        ADD COLUMN IF NOT EXISTS "prescreenScheduledAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "prescreenMeetingLink" TEXT,
        ADD COLUMN IF NOT EXISTS "prescreenResult" "InterviewResult",
        ADD COLUMN IF NOT EXISTS "prescreenNotes" TEXT
    `)
    console.log(`✓ ${label}: PRESCREEN stage + prescreen* columns in place`)
  } finally {
    await db.$disconnect()
  }
}

async function main() {
  const only = process.argv.slice(2)
  const centralDb = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenants = await centralDb.tenant.findMany({ where: { isActive: true }, select: { slug: true, databaseUrl: true } })
  await centralDb.$disconnect()
  for (const t of tenants) {
    if (only.length && !only.includes(t.slug)) continue
    await migrateOne(t.databaseUrl, t.slug)
  }
}

main().catch(e => {
  console.error('Migration failed:', e)
  process.exit(1)
})
