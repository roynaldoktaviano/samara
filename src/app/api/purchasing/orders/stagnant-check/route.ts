import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { runStagnantPOCheck } from '@/lib/purchasing/stagnantPOCheck'

/**
 * Cron-only endpoint (no user session — polled by src/instrumentation-node.ts) that
 * nags a PO's creator once it's had no movement for 3 days, and escalates to their
 * manager once it's been 5 days — see runStagnantPOCheck for the actual logic. Same
 * multi-tenant loop shape as /api/marketing/campaigns/dispatch.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenants = await centralDb.tenant.findMany({ where: { isActive: true }, select: { slug: true, databaseUrl: true } })

  const results: { tenant: string; reminded: number; escalated: number }[] = []
  for (const t of tenants) {
    const client = t.databaseUrl === process.env.DATABASE_URL ? db : getTenantDb(t.databaseUrl)
    try {
      const { reminded, escalated } = await runStagnantPOCheck(client)
      results.push({ tenant: t.slug, reminded, escalated })
    } catch (err) {
      console.error(`[po-stagnant-check] "${t.slug}" failed:`, err)
    }
  }

  return NextResponse.json({ ok: true, results })
}
