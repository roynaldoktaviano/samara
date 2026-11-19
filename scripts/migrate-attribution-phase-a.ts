// Go-live parity, section A (lead intake & identity) — database side. Idempotent, additive only
// (no column/table is dropped or changed), so it is safe to run before the code is deployed.
//
//   npx tsx scripts/migrate-attribution-phase-a.ts                 # dry run, every active tenant
//   npx tsx scripts/migrate-attribution-phase-a.ts samara --apply  # apply to one tenant
//
// What it does per tenant:
//  1. Columns: Lead.phoneE164/entrySourceManual, Customer.phoneE164, Inquiry tracking columns
//     (msclkid, fbc/fbp, landing/referrer, IP/UA, session attributes, WA match), table WaTap.
//     Done as raw SQL instead of `prisma db push` because siloina lags the schema by unrelated
//     changes that a full push would apply (with --accept-data-loss).
//  2. SQL function phone_e164() + triggers that keep Lead/Customer.phoneE164 = E.164 of phone
//     on every write, whatever code path writes it. Same rule as toE164() in
//     src/lib/contact-identity.ts (keep +, 00 → +, never guess a country) — change both together.
//  3. Backfill: phoneE164 for existing rows; literal "undefined"/"null" strings the website sent
//     into Inquiry click-ID/UTM columns → NULL; new tracking columns filled from each CF7
//     inquiry's stored raw payload (only where still empty).
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import { trackingFromPayload } from '../src/lib/inquiry-tracking'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const apply = process.argv.includes('--apply')
const slugs = process.argv.slice(2).filter(a => !a.startsWith('--'))

const DDL = [
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "phoneE164" TEXT`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "entrySourceManual" TEXT`,
  `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "phoneE164" TEXT`,
  `CREATE INDEX IF NOT EXISTS "Lead_phoneE164_idx" ON "Lead"("phoneE164")`,
  `CREATE INDEX IF NOT EXISTS "Customer_phoneE164_idx" ON "Customer"("phoneE164")`,
  ...['msclkid', 'lastMsclkid', 'fbc', 'fbp', 'firstLandingUrl', 'landingUrl', 'firstReferrer', 'referrer',
    'ipAddress', 'userAgent', 'sessionAttributes', 'waRef', 'waTapId', 'matchConfidence', 'matchConfidenceById']
    .map(c => `ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "${c}" TEXT`),
  `ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "matchConfidenceAt" TIMESTAMP(3)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Inquiry_waTapId_key" ON "Inquiry"("waTapId")`,
  `CREATE TABLE IF NOT EXISTS "WaTap" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "brand" "WhatsappBrand" NOT NULL,
    "tappedAt" TIMESTAMP(3) NOT NULL,
    "pageUrl" TEXT, "lang" TEXT, "visitorId" TEXT,
    "gclid" TEXT, "gbraid" TEXT, "wbraid" TEXT, "fbclid" TEXT, "msclkid" TEXT, "fbc" TEXT, "fbp" TEXT,
    "utmSource" TEXT, "utmMedium" TEXT, "utmCampaign" TEXT, "utmTerm" TEXT, "utmContent" TEXT,
    "ftUtmSource" TEXT, "ftUtmMedium" TEXT, "ftUtmCampaign" TEXT, "ftGclid" TEXT,
    "referrer" TEXT, "adConsent" TEXT, "consentRegion" TEXT, "ipAddress" TEXT, "userAgent" TEXT,
    "rawPayload" JSONB,
    "matchedConversationId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaTap_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "WaTap_ref_key" ON "WaTap"("ref")`,
  `CREATE INDEX IF NOT EXISTS "WaTap_brand_tappedAt_idx" ON "WaTap"("brand", "tappedAt")`,
  `CREATE INDEX IF NOT EXISTS "WaTap_matchedConversationId_idx" ON "WaTap"("matchedConversationId")`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Inquiry_waTapId_fkey') THEN
       ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_waTapId_fkey" FOREIGN KEY ("waTapId") REFERENCES "WaTap"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  // E.164 — mirror of toE164() in src/lib/contact-identity.ts.
  `CREATE OR REPLACE FUNCTION phone_e164(raw text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $fn$
   DECLARE s text; d text;
   BEGIN
     IF raw IS NULL THEN RETURN NULL; END IF;
     s := btrim(translate(raw, chr(8203) || chr(8204) || chr(8205) || chr(8206) || chr(8207) || chr(8234) || chr(8235) || chr(8236) || chr(8237) || chr(8238) || chr(8288) || chr(65279), ''));
     IF left(s, 1) = '+' THEN d := regexp_replace(substr(s, 2), '\\D', '', 'g');
     ELSIF left(s, 2) = '00' THEN d := regexp_replace(substr(s, 3), '\\D', '', 'g');
     ELSE RETURN NULL;
     END IF;
     IF d ~ '^[1-9][0-9]{6,14}$' THEN RETURN '+' || d; END IF;
     RETURN NULL;
   END $fn$`,
  `CREATE OR REPLACE FUNCTION set_phone_e164() RETURNS trigger LANGUAGE plpgsql AS $fn$
   BEGIN NEW."phoneE164" := phone_e164(NEW.phone); RETURN NEW; END $fn$`,
  `DROP TRIGGER IF EXISTS lead_phone_e164 ON "Lead"`,
  `CREATE TRIGGER lead_phone_e164 BEFORE INSERT OR UPDATE OF phone ON "Lead" FOR EACH ROW EXECUTE FUNCTION set_phone_e164()`,
  `DROP TRIGGER IF EXISTS customer_phone_e164 ON "Customer"`,
  `CREATE TRIGGER customer_phone_e164 BEFORE INSERT OR UPDATE OF phone ON "Customer" FOR EACH ROW EXECUTE FUNCTION set_phone_e164()`,
]

// Inquiry columns the website sometimes filled with the literal "undefined".
const CLEAN_COLUMNS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'lastGclid', 'lastGbraid', 'lastWbraid', 'lastFbclid',
  'utmSource', 'utmMedium', 'utmCampaign', 'utmTerm', 'utmContent', 'lastSource', 'lastMedium', 'lastCampaign', 'lastTerm', 'lastContent']

// The JS rule, to cross-check the SQL function on real data.
function toE164(raw: string | null): string | null {
  if (!raw) return null
  const s = raw.replace(/[​-‏‪-‮⁠-⁤﻿]/g, '').trim()
  let d: string
  if (s.startsWith('+')) d = s.slice(1).replace(/\D/g, '')
  else if (s.startsWith('00')) d = s.slice(2).replace(/\D/g, '')
  else return null
  return /^[1-9]\d{6,14}$/.test(d) ? `+${d}` : null
}

async function migrate(slug: string, url: string) {
  const db = new PrismaClient({ datasources: { db: { url } } })
  try {
    console.log(`\n=== ${slug} ===`)
    const enumOk = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM pg_type WHERE typname = 'WhatsappBrand'`)
    if (Number(enumOk[0].n) === 0) throw new Error('enum WhatsappBrand missing — this tenant is too far behind the schema')

    const hasCol = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM information_schema.columns WHERE table_name = 'Lead' AND column_name = 'phoneE164'`)
    console.log(`Lead.phoneE164 exists already: ${Number(hasCol[0].n) > 0}`)

    // What phones would convert (same rule as the SQL function).
    for (const t of ['Lead', 'Customer'] as const) {
      const rows = await db.$queryRawUnsafe<{ phone: string }[]>(`SELECT phone FROM "${t}" WHERE "deletedAt" IS NULL AND phone IS NOT NULL AND btrim(phone) <> ''`)
      const ok = rows.filter(r => toE164(r.phone)).length
      console.log(`${t}: ${rows.length} with a phone → ${ok} E.164 (${rows.length - ok} have no country code / invalid, left null)`)
    }
    for (const c of CLEAN_COLUMNS) {
      const r = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM "Inquiry" WHERE lower(btrim("${c}")) IN ('undefined', 'null')`)
      if (Number(r[0].n)) console.log(`Inquiry.${c}: ${r[0].n} literal "undefined"/"null" → NULL`)
    }

    if (!apply) { console.log('Dry run — pass --apply to write.'); return }

    for (const stmt of DDL) await db.$executeRawUnsafe(stmt)
    console.log('Schema + triggers applied.')

    // SQL rule must agree with the JS rule.
    const sample = await db.$queryRawUnsafe<{ phone: string; e: string | null }[]>(`SELECT phone, phone_e164(phone) e FROM "Lead" WHERE phone IS NOT NULL LIMIT 5000`)
    const mismatch = sample.filter(r => (r.e ?? null) !== toE164(r.phone))
    if (mismatch.length) throw new Error(`phone_e164() disagrees with toE164() on ${mismatch.length} rows, e.g. ${JSON.stringify(mismatch.slice(0, 3))}`)

    for (const t of ['Lead', 'Customer']) {
      const n = await db.$executeRawUnsafe(`UPDATE "${t}" SET "phoneE164" = phone_e164(phone) WHERE "phoneE164" IS DISTINCT FROM phone_e164(phone)`)
      console.log(`${t}.phoneE164 backfilled: ${n}`)
    }
    for (const c of CLEAN_COLUMNS) {
      const n = await db.$executeRawUnsafe(`UPDATE "Inquiry" SET "${c}" = NULL WHERE lower(btrim("${c}")) IN ('undefined', 'null')`)
      if (n) console.log(`Inquiry.${c}: ${n} cleared`)
    }

    // Tracking columns from stored CF7 payloads (fill-only).
    const inqs = await db.inquiry.findMany({ where: { source: 'CF7' }, select: { id: true, rawPayload: true, msclkid: true, lastMsclkid: true, fbc: true, fbp: true, firstLandingUrl: true, landingUrl: true, firstReferrer: true, referrer: true, ipAddress: true, userAgent: true, sessionAttributes: true } })
    let filled = 0
    for (const i of inqs) {
      const p = i.rawPayload as Record<string, unknown> | null
      if (!p || typeof p !== 'object') continue
      const t = trackingFromPayload(p)
      const patch: Record<string, string> = {}
      for (const k of ['msclkid', 'lastMsclkid', 'fbc', 'fbp', 'firstLandingUrl', 'landingUrl', 'firstReferrer', 'referrer', 'ipAddress', 'userAgent', 'sessionAttributes'] as const) {
        const v = t[k]
        if (typeof v === 'string' && v && !i[k]) patch[k] = v
      }
      if (Object.keys(patch).length) { await db.inquiry.update({ where: { id: i.id }, data: patch }); filled++ }
    }
    console.log(`CF7 inquiries with tracking columns filled from raw payload: ${filled} / ${inqs.length}`)
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
