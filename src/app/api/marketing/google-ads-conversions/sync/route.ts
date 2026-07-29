import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { rebuildGoogleAdsConversionsSheet } from '@/lib/google-sheets'

// Cron-only endpoint — rebuilds each tenant's Google Ads offline-conversion sheet (see
// src/lib/google-sheets.ts) so Google Ads' own "Google Sheets" conversion import source
// picks up fresh data on its own schedule. Triggered by the self-hosted instrumentation-node.ts
// interval; harmless to call more often than Google actually reads the sheet.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenants = await centralDb.tenant.findMany({ where: { isActive: true }, select: { id: true, slug: true, databaseUrl: true } })
  const results: { tenant: string; ok: boolean; rows?: number; reason?: string }[] = []

  for (const t of tenants) {
    const client = t.databaseUrl === process.env.DATABASE_URL ? db : getTenantDb(t.databaseUrl)
    const sheetId = await getTenantSecret(t.id, 'googleAdsConversionsSheetId')
    try {
      const result = await rebuildGoogleAdsConversionsSheet(client, sheetId ?? null)
      results.push(result.ok ? { tenant: t.slug, ok: true, rows: result.rows } : { tenant: t.slug, ok: false, reason: result.reason })
    } catch (err) {
      results.push({ tenant: t.slug, ok: false, reason: err instanceof Error ? err.message : 'Sync failed' })
    }
  }

  return NextResponse.json({ ok: true, results })
}
