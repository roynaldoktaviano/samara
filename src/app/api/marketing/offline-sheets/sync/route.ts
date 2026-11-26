import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { getTenantSecret, getTenantSecretStatus } from '@/lib/tenant-secrets'
import { syncOfflineConversionSheets, SHEET_BRANDS, type SheetBrand } from '@/lib/ad-offline-sheets'
import type { TenantSecretKey } from '@/lib/tenant-secrets-definitions'

const SHEET_KEYS: Record<SheetBrand, [TenantSecretKey, TenantSecretKey]> = {
  SAMARA: ['googleOfflineStagesSheetId', 'googleOfflineBookingSheetId'],
  MISCHIEF: ['googleOfflineMischiefStagesSheetId', 'googleOfflineMischiefBookingSheetId'],
  OTIUM: ['googleOfflineOtiumStagesSheetId', 'googleOfflineOtiumBookingSheetId'],
}

// Cron-only (instrumentation-node.ts, daily 00:00 WITA): appends new offline-conversion rows to the
// company-Drive Stages + Booking sheets (one pair per brand: Samara, Mischief, Otium) that Data Manager pulls 01:00–03:00. src/lib/ad-offline-sheets.ts
// Off unless OFFLINE_SHEETS_ENABLED=1. ?dryRun=1 reports what would be appended without writing.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'
  if (!dryRun && process.env.OFFLINE_SHEETS_ENABLED !== '1') return NextResponse.json({ ok: true, skipped: 'OFFLINE_SHEETS_ENABLED is not 1' })

  const tenants = await centralDb.tenant.findMany({ where: { isActive: true }, select: { id: true, slug: true, databaseUrl: true } })
  const results: Record<string, unknown>[] = []
  for (const t of tenants) {
    const isMain = t.databaseUrl === process.env.DATABASE_URL
    const status = await getTenantSecretStatus(t.id)
    const client = isMain ? db : getTenantDb(t.databaseUrl)
    // One pair of sheets per brand; each brand's deals go to its own pair only.
    for (const brand of SHEET_BRANDS) {
      const [stagesKey, bookingKey] = SHEET_KEYS[brand]
      // Env fallback (GOOGLE_OFFLINE_*_SHEET_ID) counts only for the main tenant — another tenant's deals
      // must never land in Samara's sheets; other tenants need their own stored sheet IDs.
      if (!isMain && !(status[stagesKey] && status[bookingKey])) continue
      const [stagesSheetId, bookingSheetId] = await Promise.all([getTenantSecret(t.id, stagesKey), getTenantSecret(t.id, bookingKey)])
      if (!stagesSheetId || !bookingSheetId) { results.push({ tenant: t.slug, brand, ok: false, reason: 'sheet IDs not set' }); continue }
      try {
        const r = await syncOfflineConversionSheets(client, { stagesSheetId, bookingSheetId }, { dryRun, brand })
        results.push({ tenant: t.slug, brand, dryRun, ...r })
      } catch (err) {
        console.error('[offline-sheets]', t.slug, brand, err)
        results.push({ tenant: t.slug, brand, ok: false, reason: err instanceof Error ? err.message : 'failed' })
      }
    }
  }
  return NextResponse.json({ ok: true, results })
}
