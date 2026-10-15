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

  const port = process.env.PORT || 3000
  const cronHeaders = { Authorization: `Bearer ${process.env.CRON_SECRET}` }

  const intervalMs = 10 * 60 * 1000
  setInterval(async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/api/marketing/campaigns/dispatch`, { headers: cronHeaders })
    } catch (err) {
      console.error('[scheduler] dispatch tick failed:', err)
    }
  }, intervalMs)

  // Evaluates every ACTIVE marketing Automation (pre-trip, post-trip, birthday journeys —
  // see src/lib/automations.ts) and sends whatever's newly due. Hourly is plenty since
  // triggers are day-granularity; the enrollment table's unique constraint makes re-running
  // this any number of times a day harmless (never double-emails the same guest).
  const automationsTickIntervalMs = 60 * 60 * 1000
  setInterval(async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/api/marketing/automations/tick`, { headers: cronHeaders })
    } catch (err) {
      console.error('[scheduler] automations tick failed:', err)
    }
  }, automationsTickIntervalMs)

  // Nags a PO's creator once it's gone 3 days with no movement, and escalates to
  // their manager at 5 days — see src/lib/purchasing/stagnantPOCheck.ts. A few times a
  // day is plenty since the thresholds are day-granularity, and the endpoint's own
  // dedup (renotify window / escalate-once-per-stall) makes re-running it harmless.
  const poStagnantCheckIntervalMs = 3 * 60 * 60 * 1000
  setInterval(async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/api/purchasing/orders/stagnant-check`, { headers: cronHeaders })
    } catch (err) {
      console.error('[scheduler] PO stagnant check tick failed:', err)
    }
  }, poStagnantCheckIntervalMs)

  // Moves Sales Pipeline leads to the next rep after 24h without follow-up — see
  // src/lib/lead-stagnant.ts. Every 10 minutes so a lead moves within ~10 min of hitting
  // 24h; the clock restarts on every hand-over, so re-running it is harmless.
  // Only scheduled when LEAD_STAGNANT_CHECK=on (see LEAD_STAGNANT_ENABLED).
  const leadStagnantCheckIntervalMs = 10 * 60 * 1000
  if (process.env.LEAD_STAGNANT_CHECK === 'on') setInterval(async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/api/leads/stagnant-check`, { headers: cronHeaders })
    } catch (err) {
      console.error('[scheduler] lead stagnant check tick failed:', err)
    }
  }, leadStagnantCheckIntervalMs)

  // Freshsales archive crawl (src/lib/freshsales-archive.ts) — pulls emails / deal details /
  // timelines into the Freshsales* tables until done. Production only (a local `next dev` on
  // the same DB must not crawl); FRESHSALES_ARCHIVE_SYNC=off disables it. runArchiveCrawl's
  // lease keeps it from running alongside the Mac script, and every tick resumes where the last
  // run stopped, so deploys/restarts just pause it.
  if (process.env.NODE_ENV === 'production' && process.env.FRESHSALES_ARCHIVE_SYNC !== 'off') {
    let crawling = false
    let lastSkip = ''
    // Logs why a tick did nothing, once per reason, so the server log shows it without spamming
    const skip = (why: string) => { if (why !== lastSkip) console.log(`[freshsales-archive] idle: ${why}`); lastSkip = why }
    const crawlTick = async () => {
      if (crawling) return
      crawling = true
      try {
        const { FreshsalesClient, runArchiveCrawl, archiveCrawlComplete } = await import('@/lib/freshsales-archive')
        const complete = await archiveCrawlComplete(db).catch((e: unknown) => { skip(`archive tables unavailable (${(e as Error)?.message?.slice(0, 120)})`); return null })
        if (complete === null) return
        if (complete) return skip('archive complete')
        const { getTenantSecret } = await import('@/lib/tenant-secrets')
        const tenant = await centralDb.tenant.findFirst({ where: { databaseUrl: process.env.DATABASE_URL }, select: { id: true } })
        const apiKey = (tenant && await getTenantSecret(tenant.id, 'freshsalesApiKey')) || process.env.FRESHSALES_API_KEY
        const domain = (tenant && await getTenantSecret(tenant.id, 'freshsalesDomain')) || process.env.FRESHSALES_DOMAIN
        if (!apiKey || !domain) return skip(`no Freshsales credentials (tenant ${tenant ? 'found' : 'not matched to DATABASE_URL'})`)
        const log = (m: string) => console.log(`[freshsales-archive]${m.startsWith(' ') ? '' : ' '}${m}`)
        const fs = new FreshsalesClient(domain, apiKey, log)
        const result = await runArchiveCrawl(db, fs, `server-${process.pid}`, log)
        if (result === 'locked') skip('another process holds the crawl lease')
        else { lastSkip = ''; if (result === 'done') log('crawl complete') }
      } catch (err) {
        console.error('[freshsales-archive] crawl tick failed:', err)
      } finally {
        crawling = false
      }
    }
    setTimeout(crawlTick, 2 * 60_000)
    setInterval(crawlTick, 10 * 60_000)
  }

  // Creates the next copy of weekly/monthly/yearly My Works tasks once their date arrives —
  // see spawnRecurringTodos in src/lib/todo.ts. Hourly is plenty for day-granularity dates, and
  // the per-series claim makes re-running it harmless.
  const myWorksRecurringIntervalMs = 60 * 60 * 1000
  setInterval(async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/api/my-works/recurring-tick`, { headers: cronHeaders })
    } catch (err) {
      console.error('[scheduler] my-works recurring tick failed:', err)
    }
  }, myWorksRecurringIntervalMs)

  // Rebuilds the Google Ads offline-conversion Google Sheet — full-refresh/idempotent (see
  // rebuildGoogleAdsConversionsSheet), so running this more often than Google Ads actually
  // reads the sheet is harmless. A few hours' cadence is enough for same-day attribution.
  const googleAdsSyncIntervalMs = 3 * 60 * 60 * 1000
  setInterval(async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/api/marketing/google-ads-conversions/sync`, { headers: cronHeaders })
    } catch (err) {
      console.error('[scheduler] google-ads-conversions sync tick failed:', err)
    }
  }, googleAdsSyncIntervalMs)
}
