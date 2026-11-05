/**
 * Rewrite every stored R2 URL from the old public host (pub-xxx.r2.dev, blocked by
 * Indonesian ISPs) to the new one served by the Cloudflare Worker
 * (cloudflare/r2-files-worker.js). Object keys are unchanged — only the host prefix.
 *
 * Scans EVERY text / varchar / json / jsonb / text[] column in the public schema of the
 * central DB and every active tenant DB, so no per-feature column list to keep in sync.
 *
 * Dry run (default — counts only):  npx tsx scripts/migrate-r2-public-url.ts
 * Apply:                            npx tsx scripts/migrate-r2-public-url.ts --apply
 *
 * Idempotent: a second run finds 0 rows.
 */

import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const OLD = 'https://pub-42f9bfbefb454e26b9d88d877556928e.r2.dev'
const NEW = 'https://files.samarayachting.com'
const APPLY = process.argv.includes('--apply')

type Col = { table_name: string; column_name: string; data_type: string; udt_name: string }

const q = (s: string) => `"${s.replace(/"/g, '""')}"`

async function migrateDb(label: string, url: string) {
  const db = new PrismaClient({ datasources: { db: { url } } })
  try {
    const cols = await db.$queryRawUnsafe<Col[]>(`
      SELECT c.table_name, c.column_name, c.data_type, c.udt_name
      FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        AND (c.data_type IN ('text', 'character varying', 'json', 'jsonb') OR (c.data_type = 'ARRAY' AND c.udt_name IN ('_text', '_varchar')))`)

    let total = 0
    for (const c of cols) {
      const col = `${q(c.table_name)}.${q(c.column_name)}`
      const asText = `${q(c.column_name)}::text`
      const [{ n }] = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM ${q(c.table_name)} WHERE ${asText} LIKE $1`, `%${OLD}%`)
      const count = Number(n)
      if (!count) continue
      total += count
      console.log(`  ${col.padEnd(60)} ${String(count).padStart(6)} row(s)`)

      if (APPLY) {
        // Cast back to the column's own type; json/jsonb/array round-trip through text losslessly
        // (the replaced substring never contains quotes or commas).
        const castBack = c.data_type === 'ARRAY' ? `::${c.udt_name.slice(1)}[]` : c.data_type === 'json' ? '::json' : c.data_type === 'jsonb' ? '::jsonb' : ''
        const updated = await db.$executeRawUnsafe(
          `UPDATE ${q(c.table_name)} SET ${q(c.column_name)} = replace(${asText}, $1, $2)${castBack} WHERE ${asText} LIKE $3`,
          OLD, NEW, `%${OLD}%`)
        if (updated !== count) console.log(`    ! updated ${updated}, expected ${count}`)
      }
    }
    console.log(`  → ${label}: ${total} row(s) ${APPLY ? 'updated' : 'to update'}\n`)
  } finally {
    await db.$disconnect()
  }
}

async function main() {
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}: ${OLD} → ${NEW}\n`)
  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenants = await central.tenant.findMany({ where: { isActive: true }, select: { slug: true, databaseUrl: true } })
  await central.$disconnect()

  console.log('[central]')
  await migrateDb('central', process.env.CENTRAL_DATABASE_URL!)
  for (const t of tenants) {
    console.log(`[${t.slug}]`)
    await migrateDb(t.slug, t.databaseUrl)
  }
  if (!APPLY) console.log('Dry run only — re-run with --apply to write.')
}

main().catch(e => { console.error(e); process.exit(1) })
