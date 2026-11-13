/**
 * Freshchat chat history → ERP (src/lib/freshchat-import.ts). Read-only copy, attachments → R2.
 *   npx tsx scripts/freshchat-import.ts full [--limit=N] [--concurrency=N]   every conversation not pulled yet
 *   npx tsx scripts/freshchat-import.ts delta                                 new + recently active (15-min job)
 *   npx tsx scripts/freshchat-import.ts mirror [--apply] [--limit=N]          copy into ERP WA / IG / Messenger threads (dry run without --apply)
 *   npx tsx scripts/freshchat-import.ts status
 * Needs FRESHCHAT_API_TOKEN + FRESHCHAT_API_URL in .env.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { freshchatFromEnv, runFreshchatSync } from '../src/lib/freshchat-import'
import { mirrorFreshchatToErpChats } from '../src/lib/freshchat-mirror'

const db = new PrismaClient()
async function main() {
  const args = process.argv.slice(2)
  const num = (k: string) => Number(args.find(a => a.startsWith(`--${k}=`))?.split('=')[1]) || undefined
  const cmd = args.find(a => !a.startsWith('--')) ?? 'status'
  if (cmd === 'status') {
    const [total, done, msgs, failed, bySource] = await Promise.all([
      db.freshchatConversation.count(), db.freshchatConversation.count({ where: { messagesSyncedAt: { not: null } } }),
      db.freshchatMessage.count(), db.freshchatConversation.count({ where: { lastError: { not: null } } }),
      db.freshchatConversation.groupBy({ by: ['channelSource'], _count: true }),
    ])
    console.log({ conversations: total, synced: done, messages: msgs, withError: failed, bySource: bySource.map(b => `${b.channelSource}: ${b._count}`) })
    return
  }
  if (cmd === 'mirror') { await mirrorFreshchatToErpChats(db, { apply: args.includes('--apply'), limit: num('limit') }); return }
  const fc = freshchatFromEnv()
  if (!fc) throw new Error('FRESHCHAT_API_TOKEN / FRESHCHAT_API_URL missing from env')
  console.log(await runFreshchatSync(db, fc, { full: cmd === 'full', limit: num('limit'), concurrency: num('concurrency') }))
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
