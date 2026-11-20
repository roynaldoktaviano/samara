// Go-live parity, section B (deal rules) — database side. Idempotent and additive (no column or
// table is dropped or changed), so it is safe to run before the code is deployed, and must be run
// AGAIN right before deploy (it re-syncs deals from the leads that changed meanwhile).
// Writes nothing to Freshsales — it only reads the local Freshsales archive tables.
//
//   npx tsx scripts/migrate-deals-parity-b.ts                  # DDL + triggers (safe), dry-run counts, every active tenant
//   npx tsx scripts/migrate-deals-parity-b.ts samara --apply   # also backfill deals for one tenant
//
// Per tenant:
//  1. DDL: tables Deal / DealNote / DealStageChange, Deal.paymentStatus, Inquiry.dealId, Todo.dealId,
//     User.salesAway, trigger deal_stage_history (parity C2) (raw SQL, not
//     `prisma db push`, because siloina lags the schema by unrelated changes).
//  2. Triggers:
//     - refresh_lead_from_deals(): Lead.stage / stageUpdatedAt / stageUpdatedById / tripType /
//       tripAmount / tripAmountCurrency / lostReason / lostNote / freshsalesDealId = the lead's
//       PRIMARY deal (newest open, else newest). Fired after every Deal insert/update/delete, so
//       every screen that still reads those Lead columns stays right whoever writes the Deal.
//     - lead_owner_to_open_deals: a Lead's owner change moves its OPEN deals with it (every owner
//       path — reassign, claim, chat owner, stagnant sweep — goes through Lead.ownerId).
//  3. Backfill (--apply):
//     a. Freshsales-linked deals via reconcileFreshsalesToErp (one Deal per Freshsales guest deal,
//        Old Pipeline + Agent Outreach skipped, 2nd+ deal stub leads retired).
//     b. ERP-only deals for every other lead that is a pipeline card today: not soft-deleted
//        (unless booked), stage ≠ New or created in the last 30 days or booked; WhatsApp-born leads
//        only with a Sales chat (same filter as the old board). channel MIGRATED, Order ID ERP-<n>.
//     c. Booking link: a lead's booking goes onto its primary deal.
//     d. Inquiry.dealId: each enquiry of a lead → the lead's deal opened last at or before it
//        (+15 min), else its first deal.
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import { importFreshsalesStageHistory, reconcileFreshsalesToErp } from '../src/lib/freshsales-erp-sync'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const apply = process.argv.includes('--apply')
const slugs = process.argv.slice(2).filter(a => !a.startsWith('--'))

const DDL = [
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "salesAway" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "dealId" TEXT`,
  `ALTER TABLE "Todo" ADD COLUMN IF NOT EXISTS "dealId" TEXT`,
  `CREATE TABLE IF NOT EXISTS "Deal" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "freshsalesDealId" TEXT,
    "leadId" TEXT,
    "customerId" TEXT,
    "brand" "WhatsappBrand" NOT NULL DEFAULT 'SAMARA',
    "tripType" "TripType",
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "stageUpdatedAt" TIMESTAMP(3),
    "stageUpdatedById" TEXT,
    "ownerId" TEXT,
    "ownerAssignedAt" TIMESTAMP(3),
    "amount" DOUBLE PRECISION,
    "currency" TEXT,
    "lostReason" "LeadLostReason",
    "lostNote" TEXT,
    "bookingId" TEXT,
    "travelStartDate" TIMESTAMP(3),
    "travelEndDate" TIMESTAMP(3),
    "guestCount" INTEGER,
    "channel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
  )`,
  // Yacht of the enquiry (Freshsales Product Interest minus PC / OT) — src/lib/deal-product-interest.ts
  `ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "productInterest" TEXT`,
  `CREATE TABLE IF NOT EXISTS "DealNote" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SYSTEM',
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealNote_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Deal_orderId_key" ON "Deal"("orderId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Deal_freshsalesDealId_key" ON "Deal"("freshsalesDealId")`,
  `CREATE INDEX IF NOT EXISTS "Deal_leadId_idx" ON "Deal"("leadId")`,
  `CREATE INDEX IF NOT EXISTS "Deal_customerId_idx" ON "Deal"("customerId")`,
  `CREATE INDEX IF NOT EXISTS "Deal_ownerId_idx" ON "Deal"("ownerId")`,
  `CREATE INDEX IF NOT EXISTS "Deal_stage_idx" ON "Deal"("stage")`,
  `CREATE INDEX IF NOT EXISTS "Deal_brand_stage_idx" ON "Deal"("brand", "stage")`,
  `CREATE INDEX IF NOT EXISTS "Deal_bookingId_idx" ON "Deal"("bookingId")`,
  `CREATE INDEX IF NOT EXISTS "Deal_createdAt_idx" ON "Deal"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "Deal_deletedAt_idx" ON "Deal"("deletedAt")`,
  `CREATE INDEX IF NOT EXISTS "DealNote_dealId_createdAt_idx" ON "DealNote"("dealId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "Inquiry_dealId_idx" ON "Inquiry"("dealId")`,
  `CREATE INDEX IF NOT EXISTS "Todo_dealId_idx" ON "Todo"("dealId")`,
  // Parity C: payment status (Won needs it) + stage history
  `ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT`,
  `CREATE TABLE IF NOT EXISTS "DealStageChange" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromStage" "LeadStage",
    "toStage" "LeadStage" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL,
    "changedById" TEXT,
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealStageChange_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "DealStageChange_dealId_changedAt_idx" ON "DealStageChange"("dealId", "changedAt")`,
  `CREATE INDEX IF NOT EXISTS "DealStageChange_toStage_changedAt_idx" ON "DealStageChange"("toStage", "changedAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DealStageChange_dealId_toStage_changedAt_key" ON "DealStageChange"("dealId", "toStage", "changedAt")`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealStageChange_dealId_fkey') THEN
       ALTER TABLE "DealStageChange" ADD CONSTRAINT "DealStageChange_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
  // Stage history (parity C2): one row per stage a deal enters, whoever writes it. Only touches Deal
  // tables, so it is installed on every tenant (also one whose Lead table lags).
  `CREATE OR REPLACE FUNCTION deal_stage_history() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE v_at TIMESTAMP(3); v_by TEXT;
   BEGIN
     IF TG_OP = 'UPDATE' AND OLD.stage IS NOT DISTINCT FROM NEW.stage THEN RETURN NULL; END IF;
     IF TG_OP = 'INSERT' THEN
       v_at := COALESCE(NEW."stageUpdatedAt", NEW."createdAt"); v_by := NEW."stageUpdatedById";
     ELSIF NEW."stageUpdatedAt" IS DISTINCT FROM OLD."stageUpdatedAt" AND NEW."stageUpdatedAt" IS NOT NULL THEN
       v_at := NEW."stageUpdatedAt"; v_by := NEW."stageUpdatedById";
     ELSE
       v_at := now(); v_by := NULL;
     END IF;
     INSERT INTO "DealStageChange" (id, "dealId", "fromStage", "toStage", "changedAt", "changedById", source)
     VALUES ('dsc_' || md5(random()::text || clock_timestamp()::text), NEW.id,
             CASE WHEN TG_OP = 'UPDATE' THEN OLD.stage END, NEW.stage, v_at, v_by,
             COALESCE(NULLIF(current_setting('app.stage_source', true), ''), 'SYSTEM'))
     ON CONFLICT ("dealId", "toStage", "changedAt") DO NOTHING;
     RETURN NULL;
   END $$`,
  `DROP TRIGGER IF EXISTS deal_stage_history ON "Deal"`,
  `CREATE TRIGGER deal_stage_history AFTER INSERT OR UPDATE OF stage ON "Deal" FOR EACH ROW EXECUTE FUNCTION deal_stage_history()`,
  ...[
    ['Todo', 'Todo_dealId_fkey', `FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE`],
    ['Deal', 'Deal_leadId_fkey', `FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE`],
    ['Deal', 'Deal_customerId_fkey', `FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE`],
    ['Deal', 'Deal_stageUpdatedById_fkey', `FOREIGN KEY ("stageUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`],
    ['Deal', 'Deal_ownerId_fkey', `FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`],
    ['Deal', 'Deal_bookingId_fkey', `FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE`],
    ['DealNote', 'DealNote_dealId_fkey', `FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    ['DealNote', 'DealNote_createdById_fkey', `FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`],
    ['Inquiry', 'Inquiry_dealId_fkey', `FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE`],
  ].map(([table, name, def]) => `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
       ALTER TABLE "${table}" ADD CONSTRAINT "${name}" ${def};
     END IF;
   END $$`),
]

const TRIGGERS = [
  `CREATE OR REPLACE FUNCTION refresh_lead_from_deals(lid TEXT) RETURNS void LANGUAGE plpgsql AS $$
   DECLARE d RECORD;
   BEGIN
     IF lid IS NULL THEN RETURN; END IF;
     SELECT stage, "stageUpdatedAt", "stageUpdatedById", "tripType", amount, currency, "lostReason", "lostNote", "freshsalesDealId"
       INTO d FROM "Deal"
      WHERE "leadId" = lid AND "deletedAt" IS NULL
      ORDER BY (stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')) DESC, "createdAt" DESC, id DESC
      LIMIT 1;
     IF NOT FOUND THEN RETURN; END IF;
     UPDATE "Lead" SET stage = d.stage, "stageUpdatedAt" = d."stageUpdatedAt", "stageUpdatedById" = d."stageUpdatedById",
            "tripType" = d."tripType", "tripAmount" = d.amount, "tripAmountCurrency" = d.currency,
            "lostReason" = d."lostReason", "lostNote" = d."lostNote", "freshsalesDealId" = d."freshsalesDealId"
      WHERE id = lid
        AND (stage, "stageUpdatedAt", "stageUpdatedById", "tripType", "tripAmount", "tripAmountCurrency", "lostReason", "lostNote", "freshsalesDealId")
            IS DISTINCT FROM (d.stage, d."stageUpdatedAt", d."stageUpdatedById", d."tripType", d.amount, d.currency, d."lostReason", d."lostNote", d."freshsalesDealId");
   END $$`,
  `CREATE OR REPLACE FUNCTION deal_mirror_to_lead() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF TG_OP = 'DELETE' THEN PERFORM refresh_lead_from_deals(OLD."leadId"); RETURN NULL; END IF;
     PERFORM refresh_lead_from_deals(NEW."leadId");
     IF TG_OP = 'UPDATE' AND OLD."leadId" IS DISTINCT FROM NEW."leadId" THEN PERFORM refresh_lead_from_deals(OLD."leadId"); END IF;
     RETURN NULL;
   END $$`,
  `DROP TRIGGER IF EXISTS deal_mirror_to_lead ON "Deal"`,
  `CREATE TRIGGER deal_mirror_to_lead AFTER INSERT OR UPDATE OR DELETE ON "Deal" FOR EACH ROW EXECUTE FUNCTION deal_mirror_to_lead()`,
  `CREATE OR REPLACE FUNCTION lead_owner_to_open_deals() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     UPDATE "Deal" SET "ownerId" = NEW."ownerId", "ownerAssignedAt" = COALESCE(NEW."ownerAssignedAt", now()), "updatedAt" = now()
      WHERE "leadId" = NEW.id AND "deletedAt" IS NULL AND stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')
        AND "ownerId" IS DISTINCT FROM NEW."ownerId";
     RETURN NULL;
   END $$`,
  `DROP TRIGGER IF EXISTS lead_owner_to_open_deals ON "Lead"`,
  `CREATE TRIGGER lead_owner_to_open_deals AFTER UPDATE OF "ownerId" ON "Lead" FOR EACH ROW
     WHEN (OLD."ownerId" IS DISTINCT FROM NEW."ownerId") EXECUTE FUNCTION lead_owner_to_open_deals()`,
]

// Brand of an ERP-only lead: its newest Sales WhatsApp chat, else IG/Messenger chat, else lead
// source suffix, else the newest website inquiry (same tripType/hostname rule as brandForInquiry).
const BRAND_SQL = `COALESCE(
  (SELECT w.brand::text FROM "WhatsappConversation" w WHERE w."leadId" = l.id AND w.category = 'SALES' ORDER BY w."lastMessageAt" DESC LIMIT 1),
  (SELECT i.brand::text FROM "InstagramConversation" i WHERE i."leadId" = l.id AND i.brand IS NOT NULL ORDER BY i."lastMessageAt" DESC LIMIT 1),
  CASE WHEN l.source ~ '_(SAMARA|OTIUM|MISCHIEF)$' THEN substring(l.source from '_(SAMARA|OTIUM|MISCHIEF)$') END,
  (SELECT CASE
            WHEN q."tripType" ~* 'otium|#OT\\M' THEN 'OTIUM'
            WHEN q."tripType" ~* 'mischief|#MC|\\(MC\\)' THEN 'MISCHIEF'
            WHEN q.website ~* 'otium' THEN 'OTIUM'
            WHEN q.website ~* 'mischief' THEN 'MISCHIEF'
            ELSE 'SAMARA' END
     FROM "Inquiry" q WHERE q."leadId" = l.id ORDER BY q."createdAt" DESC LIMIT 1),
  'SAMARA')`

const CHANNEL_SQL = `CASE
  WHEN l.source LIKE 'WHATSAPP_%' THEN 'WHATSAPP'
  WHEN l.source LIKE 'INSTAGRAM_%' THEN 'INSTAGRAM'
  WHEN l.source LIKE 'MESSENGER_%' THEN 'MESSENGER'
  ELSE 'MIGRATED' END`

// Leads that are a pipeline card today but have no deal yet (old board filters, see header 3b).
const ERP_ONLY_WHERE = `
  NOT EXISTS (SELECT 1 FROM "Deal" d WHERE d."leadId" = l.id)
  AND (l.source IS NULL OR l.source <> 'FRESHSALES_DEAL')
  AND (l."deletedAt" IS NULL OR l."bookingId" IS NOT NULL)
  AND (l.stage <> 'NEW' OR l."createdAt" >= now() - interval '30 days' OR l."bookingId" IS NOT NULL)
  AND (l.source IS NULL OR l.source NOT LIKE 'WHATSAPP_%'
       OR EXISTS (SELECT 1 FROM "WhatsappConversation" w WHERE w."leadId" = l.id AND w.category = 'SALES'))
  -- a Freshsales-linked lead whose only deals are Old Pipeline / Agent Outreach is not a guest deal
  AND NOT (l."freshsalesDealId" IS NOT NULL AND EXISTS (
       SELECT 1 FROM "FreshsalesDeal" fd JOIN "FreshsalesLookup" p ON p.kind = 'DEAL_PIPELINE' AND p."fsId" = fd."pipelineFsId"
        WHERE fd.id = l."freshsalesDealId" AND p.name ~* '^(agent outreach pipeline|old pipeline)$'))`

async function migrate(slug: string, url: string) {
  const db = new PrismaClient({ datasources: { db: { url } } })
  try {
    const enums = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'LeadStage' AND e.enumlabel IN ('INITIAL_MESSAGE_SENT', 'INVOICE_SENT')`)
    if (Number(enums[0].n) < 2) { console.log(`[${slug}] SKIPPED — LeadStage enum is not on the Freshsales stage set yet (run scripts/migrate-lead-stages-freshsales.ts first)`); return }

    for (const stmt of DDL) await db.$executeRawUnsafe(stmt)
    // The mirror writes these Lead columns — a tenant whose Lead table lags the schema (siloina)
    // would get an error on every Deal write, so it gets no triggers until its schema catches up.
    const leadCols = new Set((await db.$queryRawUnsafe<{ c: string }[]>(`SELECT column_name c FROM information_schema.columns WHERE table_name = 'Lead'`)).map(r => r.c))
    const missing = ['stage', 'stageUpdatedAt', 'stageUpdatedById', 'tripType', 'tripAmount', 'tripAmountCurrency', 'lostReason', 'lostNote', 'freshsalesDealId', 'ownerId', 'ownerAssignedAt', 'bookingId'].filter(c => !leadCols.has(c))
    if (missing.length) {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS deal_mirror_to_lead ON "Deal"`)
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS lead_owner_to_open_deals ON "Lead"`)
      console.log(`[${slug}] DDL in place; triggers NOT installed — Lead lacks ${missing.join(', ')} (push this tenant's schema first, then re-run). Backfill skipped.`)
      return
    }
    for (const stmt of TRIGGERS) await db.$executeRawUnsafe(stmt)
    console.log(`[${slug}] DDL + triggers in place`)

    const hasFs = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM "FreshsalesDeal"`).then(r => Number(r[0].n) > 0, () => false)
    const before = Number((await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM "Deal"`))[0].n)
    console.log(`[${slug}] deals now: ${before}; Freshsales archive: ${hasFs ? 'yes' : 'none'}`)

    // a. Freshsales deals
    if (hasFs) {
      const r = await reconcileFreshsalesToErp(db, { apply, log: m => console.log(`[${slug}] ${m}`) })
      const keys = Object.keys(r.counts).filter(k => /^deal|FS deals|lead: created|retired/.test(k)).sort()
      for (const k of keys) console.log(`[${slug}]   ${k}: ${r.counts[k]}`)
    }

    // b. ERP-only deals
    const erpOnly = Number((await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM "Lead" l WHERE ${ERP_ONLY_WHERE}`))[0].n)
    console.log(`[${slug}] b. ERP-only lead cards without a deal: ${erpOnly}`)
    if (apply && erpOnly) {
      const n = await db.$executeRawUnsafe(`
        INSERT INTO "Deal" (id, "orderId", "leadId", brand, "tripType", stage, "stageUpdatedAt", "stageUpdatedById", "ownerId", "ownerAssignedAt",
                            amount, currency, "lostReason", "lostNote", "bookingId", "travelStartDate", "travelEndDate", "guestCount", "productInterest", channel, "createdAt", "updatedAt")
        SELECT 'mig_' || l.id, NULL, l.id, (${BRAND_SQL})::"WhatsappBrand", l."tripType", l.stage, l."stageUpdatedAt", l."stageUpdatedById", l."ownerId", l."ownerAssignedAt",
               l."tripAmount", l."tripAmountCurrency", l."lostReason", l."lostNote", l."bookingId", l."travelStartDate", l."travelEndDate", l."guestCount",
               l."productInterest", ${CHANNEL_SQL}, l."createdAt", now()
          FROM "Lead" l WHERE ${ERP_ONLY_WHERE}
        ON CONFLICT (id) DO NOTHING`)
      // Order IDs: ERP-<n> from the shared counter, oldest first
      const ids = await db.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "Deal" WHERE "orderId" IS NULL AND "freshsalesDealId" IS NULL ORDER BY "createdAt", id`)
      for (const { id } of ids) {
        const v = await db.$queryRawUnsafe<{ value: number }[]>(`INSERT INTO "Counter" (key, value) VALUES ('deal_order_id', 1) ON CONFLICT (key) DO UPDATE SET value = "Counter".value + 1 RETURNING value`)
        await db.$executeRawUnsafe(`UPDATE "Deal" SET "orderId" = $1 WHERE id = $2`, `ERP-${v[0].value}`, id)
      }
      console.log(`[${slug}]   created ${n} ERP-only deals, ${ids.length} Order IDs assigned`)
    }

    if (!apply) { console.log(`[${slug}] dry run — pass --apply to backfill`); return }

    // c. booking → primary deal of the lead (if that deal has none)
    const booked = await db.$executeRawUnsafe(`
      UPDATE "Deal" d SET "bookingId" = l."bookingId", "updatedAt" = now()
        FROM "Lead" l
       WHERE l."bookingId" IS NOT NULL AND d."bookingId" IS NULL AND d.id = (
         SELECT x.id FROM "Deal" x WHERE x."leadId" = l.id AND x."deletedAt" IS NULL
          ORDER BY (x.stage NOT IN ('CLOSED_WON','CLOSED_LOST')) DESC, x."createdAt" DESC, x.id DESC LIMIT 1)
         AND NOT EXISTS (SELECT 1 FROM "Deal" y WHERE y."bookingId" = l."bookingId")`)
    console.log(`[${slug}] c. bookings linked to deals: ${booked}`)

    // d. enquiries → deals
    const linked = await db.$executeRawUnsafe(`
      UPDATE "Inquiry" q SET "dealId" = COALESCE(
        (SELECT d.id FROM "Deal" d WHERE d."leadId" = q."leadId" AND d."deletedAt" IS NULL AND d."createdAt" <= q."createdAt" + interval '15 minutes' ORDER BY d."createdAt" DESC LIMIT 1),
        (SELECT d.id FROM "Deal" d WHERE d."leadId" = q."leadId" AND d."deletedAt" IS NULL ORDER BY d."createdAt" ASC LIMIT 1))
       WHERE q."dealId" IS NULL AND q."leadId" IS NOT NULL`)
    console.log(`[${slug}] d. enquiries linked to deals: ${linked}`)

    // e. stage history of Freshsales deals from the Freshsales timeline (parity C2 — conversion times)
    if (hasFs) console.log(`[${slug}] e. stage history rows imported from the Freshsales timeline: ${await importFreshsalesStageHistory(db)}`)

    const after = await db.$queryRawUnsafe<{ stage: string; n: bigint }[]>(`SELECT stage::text, count(*) n FROM "Deal" WHERE "deletedAt" IS NULL GROUP BY 1 ORDER BY 1`)
    console.log(`[${slug}] deals by stage: ${after.map(r => `${r.stage}=${r.n}`).join(', ')}`)
  } finally {
    await db.$disconnect()
  }
}

async function main() {
  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenants = await central.tenant.findMany({
    where: { isActive: true, ...(slugs.length ? { slug: { in: slugs } } : {}) },
    select: { slug: true, databaseUrl: true },
  })
  await central.$disconnect()
  if (!tenants.length) throw new Error('No matching active tenant')
  for (const t of tenants) await migrate(t.slug, t.databaseUrl)
}

main().catch(e => { console.error(e); process.exit(1) })
