import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { sendCampaign } from '@/lib/marketing'
import type { PrismaClient } from '@prisma/client'

/**
 * Cron-only endpoint (no user session — triggered by Vercel Cron, see vercel.json)
 * that dispatches any campaign whose scheduledAt has passed. Loops every active
 * tenant DB since scheduled sends aren't tied to a logged-in session.
 * Vercel Cron only ever issues GET requests.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenants = await centralDb.tenant.findMany({ where: { isActive: true }, select: { databaseUrl: true, slug: true } })
  const clients: PrismaClient[] = [db, ...tenants.map(t => t.databaseUrl === process.env.DATABASE_URL ? null : getTenantDb(t.databaseUrl)).filter((c): c is PrismaClient => c !== null)]

  const results: { tenant: string; campaignId: string; ok: boolean; error?: string }[] = []

  for (const client of clients) {
    const due = await client.emailCampaign.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
      select: { id: true },
    }).catch(() => [])

    for (const c of due) {
      try {
        await sendCampaign(client, c.id)
        results.push({ tenant: client === db ? 'default' : 'tenant', campaignId: c.id, ok: true })
      } catch (err: any) {
        await client.emailCampaign.update({ where: { id: c.id }, data: { status: 'FAILED', errorMessage: err?.message ?? 'Send failed' } }).catch(() => {})
        results.push({ tenant: client === db ? 'default' : 'tenant', campaignId: c.id, ok: false, error: err?.message })
      }
    }
  }

  return NextResponse.json({ ok: true, dispatched: results.length, results })
}
