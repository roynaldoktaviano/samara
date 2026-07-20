/**
 * Fan out the current tenant schema (prisma/schema.prisma) to every active
 * tenant database. Run this after any schema change that's already been
 * pushed/tested against one tenant, to bring the rest in sync.
 *
 * Run: npx tsx scripts/push-schema-all-tenants.ts
 *
 * Continues past a failed tenant rather than aborting the whole run — a
 * summary of pass/fail is printed at the end.
 */

import { PrismaClient as CentralClient } from '@prisma/central-client'
import { spawnSync } from 'child_process'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

async function main() {
  const centralDb = new CentralClient({
    datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } },
  })

  const tenants = await centralDb.tenant.findMany({
    where: { isActive: true },
    select: { slug: true, databaseUrl: true, directUrl: true },
  })
  console.log(`Found ${tenants.length} active tenant(s).\n`)

  const results: { slug: string; ok: boolean }[] = []

  for (const t of tenants) {
    console.log(`→ Pushing schema to "${t.slug}"...`)
    const result = spawnSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
      env: {
        ...process.env,
        DATABASE_URL: t.databaseUrl,
        DIRECT_URL: t.directUrl || t.databaseUrl,
      },
      stdio: 'inherit',
    })
    const ok = result.status === 0
    results.push({ slug: t.slug, ok })
    console.log(ok ? `✓ "${t.slug}" done.\n` : `✗ "${t.slug}" FAILED — continuing to the next tenant.\n`)
  }

  console.log('──────────────────────────────────────────────')
  console.log('Summary:')
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.slug}`)
  console.log('──────────────────────────────────────────────')

  await centralDb.$disconnect()
  if (results.some(r => !r.ok)) process.exit(1)
}

main().catch(e => {
  console.error('Fan-out schema push failed:', e)
  process.exit(1)
})
