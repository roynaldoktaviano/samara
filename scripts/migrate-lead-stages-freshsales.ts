/**
 * One-off: switches LeadStage to the Freshsales Deals stages (Roy, 2026-11-11 — see
 * src/lib/lead-pipeline.ts / src/lib/lead-stage-auto.ts).
 *
 * Run it TWICE around `prisma db push`:
 *
 *   1. npx tsx scripts/migrate-lead-stages-freshsales.ts [tenant-slug ...]
 *        Renames CONTACTED → INITIAL_MESSAGE_SENT in place, adds the new labels, and moves
 *        any QUALIFIED / OPPORTUNITY lead to ACTIVE_COMMUNICATION and UNQUALIFIED to
 *        CLOSED_LOST (reason OTHER, note "Unqualified"). After this no row uses an old label,
 *        so db push can drop them when it recreates the enum.
 *   2. npx prisma db push   (per tenant DB)
 *   3. npx tsx scripts/migrate-lead-stages-freshsales.ts [tenant-slug ...]
 *        Now that Lead.lastInboundAt / lastOutboundAt exist, backfills them from the
 *        lead's WhatsApp / Instagram / Messenger chats so follow-up tracking starts with
 *        the right history.
 *
 * Idempotent: every step checks before acting, so re-running is safe.
 * No slugs = every active tenant.
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const NEW_LABELS = ['INITIAL_MESSAGE_SENT', 'ACTIVE_COMMUNICATION', 'FOLLOW_UP_1', 'FOLLOW_UP_2', 'BOOKING_CONFIRMATION', 'INVOICE_SENT']

async function migrateOne(databaseUrl: string, label: string) {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    const labels = (await db.$queryRawUnsafe<{ enumlabel: string }[]>(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'LeadStage'`,
    )).map(l => l.enumlabel)
    const has = (v: string) => labels.includes(v)

    // ── Phase 1: enum labels + rows on old labels ──
    if (has('CONTACTED') && !has('INITIAL_MESSAGE_SENT')) {
      await db.$executeRawUnsafe(`ALTER TYPE "LeadStage" RENAME VALUE 'CONTACTED' TO 'INITIAL_MESSAGE_SENT'`)
    }
    for (const v of NEW_LABELS) await db.$executeRawUnsafe(`ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS '${v}'`)

    let moved = 0
    if (has('QUALIFIED') || has('OPPORTUNITY')) {
      moved += await db.$executeRawUnsafe(
        `UPDATE "Lead" SET stage = 'ACTIVE_COMMUNICATION', "stageUpdatedAt" = NOW() WHERE stage::text IN ('QUALIFIED', 'OPPORTUNITY')`,
      )
    }
    if (has('UNQUALIFIED')) {
      moved += await db.$executeRawUnsafe(
        `UPDATE "Lead" SET stage = 'CLOSED_LOST', "lostReason" = COALESCE("lostReason", 'OTHER'), "lostNote" = COALESCE("lostNote", 'Unqualified'), "stageUpdatedAt" = NOW()
         WHERE stage::text = 'UNQUALIFIED'`,
      )
    }

    // ── Phase 2 (after db push): seed last in/out timestamps from the chats ──
    const cols = (await db.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'Lead' AND column_name IN ('lastInboundAt', 'lastOutboundAt')`,
    )).map(c => c.column_name)
    let seeded = 0
    if (cols.length === 2) {
      seeded = await db.$executeRawUnsafe(`
        UPDATE "Lead" l SET
          "lastInboundAt"  = GREATEST(l."lastInboundAt", x.inbound),
          "lastOutboundAt" = GREATEST(l."lastOutboundAt", x.outbound)
        FROM (
          SELECT "leadId", MAX(inbound) AS inbound, MAX(outbound) AS outbound FROM (
            SELECT "leadId", "lastInboundAt" AS inbound, "lastOutboundAt" AS outbound FROM "WhatsappConversation" WHERE "leadId" IS NOT NULL
            UNION ALL
            SELECT c."leadId",
              (SELECT MAX(m."createdAt") FROM "InstagramMessage" m WHERE m."conversationId" = c.id AND m.direction = 'IN'),
              (SELECT MAX(m."createdAt") FROM "InstagramMessage" m WHERE m."conversationId" = c.id AND m.direction = 'OUT')
            FROM "InstagramConversation" c WHERE c."leadId" IS NOT NULL
          ) chats GROUP BY "leadId"
        ) x
        WHERE l.id = x."leadId"
          AND (x.inbound IS NOT NULL OR x.outbound IS NOT NULL)
          AND (l."lastInboundAt" IS DISTINCT FROM GREATEST(l."lastInboundAt", x.inbound)
            OR l."lastOutboundAt" IS DISTINCT FROM GREATEST(l."lastOutboundAt", x.outbound))
      `)
    }

    const counts = await db.$queryRawUnsafe<{ stage: string; count: bigint }[]>(`SELECT stage::text AS stage, COUNT(*) AS count FROM "Lead" GROUP BY stage ORDER BY stage`)
    console.log(`✓ ${label}: ${moved} lead(s) moved off old stages; ${cols.length === 2 ? `${seeded} lead(s) got chat timestamps` : 'timestamps skipped (run again after db push)'}`)
    console.log('   ' + counts.map(c => `${c.stage}=${c.count}`).join(', '))
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
