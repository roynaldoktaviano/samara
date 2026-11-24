// Schema for the marketing won-deal audit (2026-11-24): Deal.isTest/bookingType/enquiryChannel/enquiryTripType/
// amountUsd/fxRate, Inquiry.brand/tripTypeStd/firstTouchAt, FreshsalesDealFix, DealAttribution (ad attribution per deal).
// Raw, idempotent SQL instead of `prisma db push` because siloina lags the schema by unrelated
// changes (a push there would apply that whole backlog).
//   npx tsx scripts/migrate-deal-quality.ts                  # dry run, every active tenant
//   npx tsx scripts/migrate-deal-quality.ts siloina --apply  # apply to one tenant
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const apply = process.argv.includes('--apply')
const slugs = process.argv.slice(2).filter(a => !a.startsWith('--'))

const DDL = [
  `ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS "FreshsalesDealFix" (
    "dealId" TEXT NOT NULL,
    "isTest" BOOLEAN,
    "isAgent" BOOLEAN,
    "amount" DOUBLE PRECISION,
    "currency" TEXT,
    "wonAt" TIMESTAMP(3),
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FreshsalesDealFix_pkey" PRIMARY KEY ("dealId")
  )`,
  // Booking type / enquiry channel / enquiry trip type / USD amount on Deal; brand / std trip type /
  // first-touch time on Inquiry; ContactAttribution (first touch + last paid click per person).
  `DO $$ BEGIN CREATE TYPE "DealBookingType" AS ENUM ('DIRECT', 'AGENT', 'REPEAT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "DealEnquiryChannel" AS ENUM ('WEB_FORM', 'WHATSAPP', 'EMAIL', 'META_LEAD_FORM', 'INSTAGRAM', 'MESSENGER', 'AGENT', 'PHONE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "bookingType" "DealBookingType"`,
  `ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "enquiryChannel" "DealEnquiryChannel"`,
  `ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "enquiryTripType" "TripType"`,
  `ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "amountUsd" DOUBLE PRECISION`,
  `ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "fxRate" DOUBLE PRECISION`,
  `ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "brand" "WhatsappBrand"`,
  `ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "tripTypeStd" "TripType"`,
  `ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "firstTouchAt" TIMESTAMP(3)`,
  // Ads are attributed PER DEAL (DealAttribution); the same-day per-person ContactAttribution is not created.
  `CREATE TABLE IF NOT EXISTS "DealAttribution" (
    "id" TEXT NOT NULL, "dealId" TEXT NOT NULL, "firstInquiryId" TEXT,
    "firstSource" TEXT, "firstMedium" TEXT, "firstCampaign" TEXT, "firstTerm" TEXT, "firstContent" TEXT,
    "firstLandingUrl" TEXT, "firstReferrer" TEXT, "firstGclid" TEXT, "firstGbraid" TEXT, "firstWbraid" TEXT, "firstFbclid" TEXT,
    "firstBrand" "WhatsappBrand", "firstAt" TIMESTAMP(3), "firstOrigin" TEXT,
    "lastPaidNetwork" TEXT, "lastPaidSource" TEXT, "lastPaidMedium" TEXT, "lastPaidCampaign" TEXT, "lastPaidTerm" TEXT, "lastPaidContent" TEXT,
    "lastPaidLandingUrl" TEXT, "lastPaidGclid" TEXT, "lastPaidGbraid" TEXT, "lastPaidWbraid" TEXT, "lastPaidFbclid" TEXT, "lastPaidCtwaClid" TEXT,
    "lastPaidBrand" "WhatsappBrand", "lastPaidAt" TIMESTAMP(3), "lastPaidOrigin" TEXT,
    "adRole" TEXT, "adNetwork" TEXT, "adEvidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DealAttribution_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "DealAttribution" ADD COLUMN IF NOT EXISTS "firstInquiryId" TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DealAttribution_dealId_key" ON "DealAttribution"("dealId")`,
  `CREATE INDEX IF NOT EXISTS "DealAttribution_lastPaidAt_idx" ON "DealAttribution"("lastPaidAt")`,
  `CREATE INDEX IF NOT EXISTS "DealAttribution_adRole_idx" ON "DealAttribution"("adRole")`,
  `DO $$ BEGIN ALTER TABLE "DealAttribution" ADD CONSTRAINT "DealAttribution_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
]

async function migrate(slug: string, url: string) {
  const db = new PrismaClient({ datasources: { db: { url } } })
  try {
    const [deal] = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM information_schema.tables WHERE table_name = 'Deal'`
    if (!Number(deal.n)) { console.log(`- ${slug}: no Deal table, skipped`); return }
    const [col] = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM information_schema.columns WHERE table_name = 'Deal' AND column_name = 'isTest'`
    const [fix] = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM information_schema.tables WHERE table_name = 'FreshsalesDealFix'`
    const [ca] = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM information_schema.tables WHERE table_name = 'DealAttribution'`
    const [bt] = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM information_schema.columns WHERE table_name = 'Deal' AND column_name = 'bookingType'`
    const p = (n: bigint) => (Number(n) ? 'present' : 'MISSING')
    console.log(`${slug}: Deal.isTest ${p(col.n)} · FreshsalesDealFix ${p(fix.n)} · Deal.bookingType ${p(bt.n)} · DealAttribution ${p(ca.n)}`)
    if (!apply) return
    for (const sql of DDL) await db.$executeRawUnsafe(sql)
    console.log(`✓ ${slug}: applied`)
  } finally {
    await db.$disconnect()
  }
}

;(async () => {
  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenants = await central.tenant.findMany({
    where: { isActive: true, ...(slugs.length ? { slug: { in: slugs } } : {}) },
    select: { slug: true, databaseUrl: true },
  })
  await central.$disconnect()
  if (!tenants.length) throw new Error('No matching active tenant')
  let failed = 0
  for (const t of tenants) {
    try { await migrate(t.slug, t.databaseUrl) } catch (e) { failed++; console.error(`✗ ${t.slug}:`, e instanceof Error ? e.message : e) }
  }
  process.exit(failed ? 1 : 0)
})()
