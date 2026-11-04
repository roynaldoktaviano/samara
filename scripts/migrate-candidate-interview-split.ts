/**
 * One-off: splits CandidateStatus INTERVIEW into HR_INTERVIEW + USER_INTERVIEW (HR menu
 * update 2026-11-04 — Talent Pool → Candidates, Recruitment Request menu).
 *
 * Must run BEFORE `prisma db push` — otherwise push recreates the enum without INTERVIEW
 * and the cast fails on rows still holding it. Renames the label in place (every existing
 * INTERVIEW row becomes HR_INTERVIEW, no UPDATE needed), then adds USER_INTERVIEW right
 * after it. Idempotent: safe to re-run.
 *
 * Also grants the new 'hr-recruitment' module to every role whose Roles & Permissions
 * override already includes 'hr-candidates' (samara's HR row) — overrides don't pick up
 * new modules on their own.
 *
 * Run it together with the deploy — the code currently in production still writes
 * 'INTERVIEW' and can't read 'HR_INTERVIEW'.
 *
 * Run: npx tsx scripts/migrate-candidate-interview-split.ts [tenant-slug ...]
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
    const labels = await db.$queryRawUnsafe<{ enumlabel: string }[]>(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'CandidateStatus'`,
    )
    const has = (v: string) => labels.some(l => l.enumlabel === v)
    if (has('INTERVIEW') && !has('HR_INTERVIEW')) {
      await db.$executeRawUnsafe(`ALTER TYPE "CandidateStatus" RENAME VALUE 'INTERVIEW' TO 'HR_INTERVIEW'`)
    }
    await db.$executeRawUnsafe(`ALTER TYPE "CandidateStatus" ADD VALUE IF NOT EXISTS 'USER_INTERVIEW' AFTER 'HR_INTERVIEW'`)
    const [{ count }] = await db.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) AS count FROM "Candidate" WHERE status = 'HR_INTERVIEW'`)
    const granted = await db.$executeRawUnsafe(
      `UPDATE "RoleModuleAccess" SET modules = array_append(modules, 'hr-recruitment'), "updatedAt" = NOW()
       WHERE 'hr-candidates' = ANY(modules) AND NOT ('hr-recruitment' = ANY(modules))`,
    )
    console.log(`✓ ${label}: INTERVIEW → HR_INTERVIEW (${count} candidate(s) now in HR Interview), USER_INTERVIEW added, hr-recruitment granted to ${granted} role override(s)`)
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
