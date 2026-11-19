// One-off: fills Inquiry.adConsent / consentRegion from the raw CF7 payload of inquiries that
// arrived before those columns existed. Applies the pre-15-Nov "granted without a banner"
// correction (src/lib/ad-consent.ts → correctLegacyConsent). Only touches rows whose
// adConsent is still null. Dry run by default; pass --apply to write.
//
//   npx tsx scripts/backfill-inquiry-ad-consent.ts            # dry run (DATABASE_URL tenant)
//   npx tsx scripts/backfill-inquiry-ad-consent.ts --apply
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { correctLegacyConsent, normalizeAdConsent, normalizeConsentRegion } from '../src/lib/ad-consent'

const apply = process.argv.includes('--apply')
const db = new PrismaClient()

;(async () => {
  const rows = await db.$queryRaw<{ id: string; createdAt: Date; c: string | null; r: string | null }[]>`
    SELECT id, "createdAt", "rawPayload"->>'ad_consent' AS c, "rawPayload"->>'consent_region' AS r
    FROM "Inquiry"
    WHERE "adConsent" IS NULL AND "rawPayload" ? 'ad_consent'`

  const tally: Record<string, number> = {}
  let corrected = 0
  const updates: { id: string; adConsent: string | null; consentRegion: string | null }[] = []
  for (const row of rows) {
    const region = normalizeConsentRegion(row.r)
    const raw = normalizeAdConsent(row.c)
    const consent = correctLegacyConsent(raw, region, row.createdAt)
    if (raw !== consent) corrected++
    if (!consent && !region) continue
    tally[`${consent ?? '-'} / ${region ?? '-'}`] = (tally[`${consent ?? '-'} / ${region ?? '-'}`] ?? 0) + 1
    updates.push({ id: row.id, adConsent: consent, consentRegion: region })
  }

  console.log(`${rows.length} inquiries with consent in payload, ${updates.length} to fill, ${corrected} granted→not_required corrections`)
  console.table(Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ 'consent / region': k, n })))

  if (!apply) {
    console.log('Dry run — pass --apply to write.')
  } else {
    for (const u of updates) {
      await db.inquiry.update({ where: { id: u.id }, data: { adConsent: u.adConsent, consentRegion: u.consentRegion } })
    }
    console.log(`Updated ${updates.length} inquiries.`)
  }
  await db.$disconnect()
})().catch(async e => { console.error(e); await db.$disconnect(); process.exit(1) })
