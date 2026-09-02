import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { runAutomationsTick } from '@/lib/automations'

/**
 * Cron-only endpoint (see src/instrumentation-node.ts) that evaluates every ACTIVE
 * automation across every tenant and sends whatever's newly due. Same multi-tenant
 * loop shape as /api/marketing/campaigns/dispatch, since this also runs with no
 * logged-in session.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenants = await centralDb.tenant.findMany({ where: { isActive: true }, select: { id: true, slug: true, databaseUrl: true } })
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://erp.samarayachting.com'

  const results: { tenant: string; automationId: string; enrolled: number; sent: number; failed: number }[] = []

  for (const t of tenants) {
    const client = t.databaseUrl === process.env.DATABASE_URL ? db : getTenantDb(t.databaseUrl)
    const apiKey = await getTenantSecret(t.id, 'resendApiKey')
    if (!apiKey) continue
    try {
      const tenantResults = await runAutomationsTick(client, apiKey, appUrl)
      for (const r of tenantResults) results.push({ tenant: t.slug, ...r })
    } catch (err) {
      console.error(`[automations-tick] "${t.slug}" failed:`, err)
    }
  }

  return NextResponse.json({ ok: true, results })
}
