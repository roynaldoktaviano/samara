import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { sendCampaign } from '@/lib/marketing'
import { getTenantSecret } from '@/lib/tenant-secrets'

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

  const tenants = await centralDb.tenant.findMany({ where: { isActive: true }, select: { id: true, slug: true, databaseUrl: true } })
  const targets = tenants.map(t => ({
    tenantId: t.id,
    slug: t.slug,
    client: t.databaseUrl === process.env.DATABASE_URL ? db : getTenantDb(t.databaseUrl),
  }))

  const results: { tenant: string; campaignId: string; ok: boolean; error?: string }[] = []

  for (const { tenantId, slug, client } of targets) {
    const due = await client.emailCampaign.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
      select: { id: true },
    }).catch(() => [])
    if (due.length === 0) continue

    const apiKey = await getTenantSecret(tenantId, 'resendApiKey')

    for (const c of due) {
      try {
        if (!apiKey) throw new Error('RESEND_API_KEY not configured')
        await sendCampaign(client, c.id, apiKey)
        results.push({ tenant: slug, campaignId: c.id, ok: true })
      } catch (err: any) {
        await client.emailCampaign.update({ where: { id: c.id }, data: { status: 'FAILED', errorMessage: err?.message ?? 'Send failed' } }).catch(() => {})
        results.push({ tenant: slug, campaignId: c.id, ok: false, error: err?.message })
      }
    }
  }

  return NextResponse.json({ ok: true, dispatched: results.length, results })
}
