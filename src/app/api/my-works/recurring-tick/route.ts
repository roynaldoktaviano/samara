import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { spawnRecurringTodos } from '@/lib/todo'
import { emitTenantEvent } from '@/lib/realtime-bus'

/**
 * Cron-only endpoint (no user session — polled by src/instrumentation-node.ts) that creates the
 * next copy of every weekly/monthly/yearly My Works task whose date has arrived — see
 * spawnRecurringTodos. Board loads do the same for the viewer's own tasks, so this mainly makes
 * sure assignees get notified on the day even if nobody opens My Works.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenants = await centralDb.tenant.findMany({ where: { isActive: true }, select: { id: true, slug: true, databaseUrl: true } })

  const results: { tenant: string; spawned: number }[] = []
  for (const t of tenants) {
    const client = t.databaseUrl === process.env.DATABASE_URL ? db : getTenantDb(t.databaseUrl)
    try {
      const spawned = await spawnRecurringTodos(client, t.id)
      if (spawned) emitTenantEvent(t.id, 'my-works')
      results.push({ tenant: t.slug, spawned })
    } catch (err) {
      console.error(`[my-works-recurring] "${t.slug}" failed:`, err)
    }
  }

  return NextResponse.json({ ok: true, results })
}
