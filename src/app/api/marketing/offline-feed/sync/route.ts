import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { rebuildOfflineFeedSheet } from '@/lib/google-sheets'

// Cron-only (instrumentation-node.ts, every 3h): runs the go-live offline feed per tenant — ledger,
// Google Sheet (googleOfflineFeedSheetId), Meta CAPI when enabled. src/lib/ad-offline-feed.ts
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenants = await centralDb.tenant.findMany({ where: { isActive: true }, select: { id: true, slug: true, databaseUrl: true } })
  const results: Record<string, unknown>[] = []
  for (const t of tenants) {
    const sheetId = await getTenantSecret(t.id, 'googleOfflineFeedSheetId')
    // The ledger freezes rows from the first run — only tenants that set up the feed sheet take part.
    if (!sheetId) { results.push({ tenant: t.slug, ok: false, reason: 'no googleOfflineFeedSheetId' }); continue }
    const client = t.databaseUrl === process.env.DATABASE_URL ? db : getTenantDb(t.databaseUrl)
    try {
      results.push({ tenant: t.slug, ...(await rebuildOfflineFeedSheet(client, sheetId)) })
    } catch (err) {
      results.push({ tenant: t.slug, ok: false, reason: err instanceof Error ? err.message : 'failed' })
    }
  }
  return NextResponse.json({ ok: true, results })
}
