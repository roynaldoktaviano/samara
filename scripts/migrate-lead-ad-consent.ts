// Lead.adConsent / adConsentAt / adConsentById — ad consent recorded by sales for leads that never
// saw the website banner (src/lib/ad-consent.ts manualConsentRows). Nullable columns only; safe to
// re-run. Usage: npx tsx scripts/migrate-lead-ad-consent.ts [slug…]   (no slug = every active tenant)
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const DDL = [
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "adConsent" TEXT`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "adConsentAt" TIMESTAMP(3)`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "adConsentById" TEXT`,
]

async function main() {
  const slugs = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenants = await central.tenant.findMany({
    where: { isActive: true, ...(slugs.length ? { slug: { in: slugs } } : {}) },
    select: { slug: true, databaseUrl: true },
  })
  await central.$disconnect()
  for (const t of tenants) {
    const db = new PrismaClient({ datasources: { db: { url: t.databaseUrl } } })
    for (const sql of DDL) await db.$executeRawUnsafe(sql)
    const cols = await db.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'Lead' AND column_name LIKE 'adConsent%'`
    console.log(t.slug, cols.map(c => c.column_name).sort().join(', '))
    await db.$disconnect()
  }
}
main().catch(e => { console.error(e); process.exit(1) })
