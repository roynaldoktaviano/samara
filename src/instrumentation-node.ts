// Node-only instrumentation logic, split into its own file per Next.js's
// recommended pattern (see src/instrumentation.ts) so the Node-only imports
// here (Prisma clients, process.on in tenant-db.ts) never get pulled into the
// Edge Runtime's bundle graph — only dynamically imported from a
// NEXT_RUNTIME === 'nodejs' branch.
import { centralDb } from '@/lib/central-db'
import { db } from '@/lib/db'
import { getTenantDb } from '@/lib/tenant-db'

/**
 * A campaign can only be `SENDING` while a `dispatchCampaignEmails` call is
 * actively running in this Node process's memory (see src/lib/marketing.ts).
 * If the process just started, nothing here could possibly still be running —
 * any campaign found in `SENDING` status is necessarily left over from a
 * previous process that died mid-send (e.g. a deploy or restart). Flip those to
 * `PAUSED` so they're clearly resumable from the Email Campaigns list, instead
 * of silently stuck forever in a state the UI treats as "already sent".
 */
async function recoverInterruptedSends() {
  try {
    const tenants = await centralDb.tenant.findMany({ where: { isActive: true }, select: { slug: true, databaseUrl: true } })
    for (const t of tenants) {
      const client = t.databaseUrl === process.env.DATABASE_URL ? db : getTenantDb(t.databaseUrl)
      const stuck = await client.emailCampaign.updateMany({
        where: { status: 'SENDING' },
        data: { status: 'PAUSED' },
      }).catch(() => ({ count: 0 }))
      if (stuck.count > 0) {
        console.log(`[startup-recovery] "${t.slug}": paused ${stuck.count} campaign(s) interrupted by the last restart`)
      }
    }
  } catch (err) {
    console.error('[startup-recovery] failed:', err)
  }
}

export async function startNodeInstrumentation() {
  await recoverInterruptedSends()

  const intervalMs = 10 * 60 * 1000
  setInterval(async () => {
    try {
      const port = process.env.PORT || 3000
      await fetch(`http://127.0.0.1:${port}/api/marketing/campaigns/dispatch`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
    } catch (err) {
      console.error('[scheduler] dispatch tick failed:', err)
    }
  }, intervalMs)
}
