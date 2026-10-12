/**
 * Pull Freshsales into the Freshsales* archive tables (see src/lib/freshsales-archive.ts).
 * Idempotent and resumable — re-running continues where the last run stopped.
 *
 * Run: npx tsx scripts/freshsales-archive.ts <step...> [--limit=N]
 * Steps (in order): lookups users contacts dealsIndex activities dealDetails conversations timeline
 *   quick = lookups users contacts dealsIndex activities
 *   all   = every step
 *   status = print progress only
 */
import { PrismaClient } from '@prisma/client'
import {
  FreshsalesClient, syncLookups, syncUsers, syncContacts, syncDealsIndex, syncActivities,
  syncDealDetails, syncPerContact, crawlScopeCount,
} from '../src/lib/freshsales-archive'

const db = new PrismaClient()
const QUICK = ['lookups', 'users', 'contacts', 'dealsIndex', 'activities']
const ALL = [...QUICK, 'dealDetails', 'conversations', 'timeline']

async function status() {
  const [states, counts, scope] = await Promise.all([
    db.freshsalesSyncState.findMany({ orderBy: { entity: 'asc' } }),
    Promise.all([
      db.freshsalesLookup.count(), db.freshsalesUser.count(), db.freshsalesContact.count(),
      db.freshsalesDeal.count(), db.freshsalesDeal.count({ where: { detailSyncedAt: { not: null } } }),
      db.freshsalesActivity.count(), db.freshsalesConversation.count(), db.freshsalesTimelineEvent.count(),
      db.freshsalesContact.count({ where: { OR: [{ leadId: { not: null } }, { customerId: { not: null } }] } }),
    ]),
    crawlScopeCount(db),
  ])
  const [lk, us, ct, dl, dd, ac, cv, tl, linked] = counts
  console.log(`lookups ${lk} | users ${us} | contacts ${ct} (linked to Lead/Customer ${linked}) | deals ${dl} (detail ${dd})`)
  console.log(`activities ${ac} | conversations ${cv} | timeline events ${tl}`)
  console.log(`per-contact crawl scope ${scope.total} — conversations left ${scope.conversationsLeft}, timeline left ${scope.timelineLeft}`)
  for (const s of states) console.log(`  ${s.entity.padEnd(14)} ${s.status.padEnd(8)} ${s.processed}/${s.total ?? '?'} ${s.lastError ? 'ERR ' + s.lastError.slice(0, 120) : ''}`)
}

async function main() {
  const args = process.argv.slice(2)
  const limit = Number(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || undefined
  let steps = args.filter(a => !a.startsWith('--'))
  if (!steps.length || steps.includes('status')) return status()
  steps = steps.flatMap(s => (s === 'all' ? ALL : s === 'quick' ? QUICK : [s]))

  const domain = process.env.FRESHSALES_DOMAIN, key = process.env.FRESHSALES_API_KEY
  if (!domain || !key) throw new Error('FRESHSALES_DOMAIN / FRESHSALES_API_KEY missing from env')
  const fs = new FreshsalesClient(domain, key)
  const t0 = Date.now()
  for (const step of steps) {
    const s = Date.now()
    console.log(`▶ ${step}`)
    let r: unknown
    switch (step) {
      case 'lookups': r = await syncLookups(db, fs); break
      case 'users': r = await syncUsers(db, fs); break
      case 'contacts': r = await syncContacts(db, fs); break
      case 'dealsIndex': r = await syncDealsIndex(db, fs); break
      case 'activities': r = await syncActivities(db, fs); break
      case 'dealDetails': r = await syncDealDetails(db, fs, { limit }); break
      case 'conversations': r = await syncPerContact(db, fs, 'conversations', { limit }); break
      case 'timeline': r = await syncPerContact(db, fs, 'timeline', { limit }); break
      default: throw new Error(`unknown step ${step}`)
    }
    console.log(`✔ ${step}: ${JSON.stringify(r)} in ${Math.round((Date.now() - s) / 1000)}s (${fs.requests} req total)`)
  }
  console.log(`done in ${Math.round((Date.now() - t0) / 60000)} min`)
  await status()
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
