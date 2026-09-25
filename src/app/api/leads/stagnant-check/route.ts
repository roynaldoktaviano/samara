import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { runLeadStagnantCheck } from '@/lib/lead-stagnant'

/**
 * Cron-only endpoint (no user session — polled by src/instrumentation-node.ts) that moves
 * Sales Pipeline leads to another rep after 24h without follow-up — see
 * runLeadStagnantCheck. Same multi-tenant loop shape as /api/purchasing/orders/stagnant-check.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenants = await centralDb.tenant.findMany({ where: { isActive: true }, select: { slug: true, databaseUrl: true } })

  const results: { tenant: string; reassigned: number; escalated: number }[] = []
  for (const t of tenants) {
    const client = t.databaseUrl === process.env.DATABASE_URL ? db : getTenantDb(t.databaseUrl)
    try {
      const { reassigned, escalated } = await runLeadStagnantCheck(client)
      results.push({ tenant: t.slug, reassigned, escalated })
    } catch (err) {
      console.error(`[lead-stagnant-check] "${t.slug}" failed:`, err)
    }
  }

  return NextResponse.json({ ok: true, results })
}
