/**
 * Freshsales → ERP sync (src/lib/freshsales-erp-sync.ts). Freshsales is the source of truth.
 *
 *   npx tsx scripts/freshsales-erp-sync.ts dry [outDir]   compare archive vs ERP, write nothing
 *                                                          (counts + changes.csv in outDir)
 *   npx tsx scripts/freshsales-erp-sync.ts apply          write the differences
 *   npx tsx scripts/freshsales-erp-sync.ts pull           pull changes from Freshsales into the archive only
 *   npx tsx scripts/freshsales-erp-sync.ts delta          pull changes from Freshsales, then apply
 *                                                          (same as the 15-min server job)
 */
import { PrismaClient } from '@prisma/client'
import * as fsys from 'fs'
import * as path from 'path'
import { FreshsalesClient } from '../src/lib/freshsales-archive'
import { pullFreshsalesDelta, reconcileFreshsalesToErp, runFreshsalesErpSync } from '../src/lib/freshsales-erp-sync'
import { freshchatFromEnv, runFreshchatSync } from '../src/lib/freshchat-import'
import { mirrorFreshchatToErpChats } from '../src/lib/freshchat-mirror'

const db = new PrismaClient()

async function main() {
  const [cmd = 'dry', outDir = './freshsales-sync-out'] = process.argv.slice(2)
  if (cmd === 'delta' || cmd === 'pull') {
    const domain = process.env.FRESHSALES_DOMAIN, key = process.env.FRESHSALES_API_KEY
    if (!domain || !key) throw new Error('FRESHSALES_DOMAIN / FRESHSALES_API_KEY missing from env')
    if (cmd === 'pull') { console.log(await pullFreshsalesDelta(db, new FreshsalesClient(domain, key))); return }
    const r = await runFreshsalesErpSync(db, new FreshsalesClient(domain, key), `mac-${process.pid}`)
    console.log(r === 'locked' ? 'another process holds the sync lease' : JSON.stringify(r.counts, null, 1))
    const fc = freshchatFromEnv()
    if (fc && r !== 'locked') { console.log(await runFreshchatSync(db, fc)); await mirrorFreshchatToErpChats(db, { apply: true }) }
    return
  }
  const r = await reconcileFreshsalesToErp(db, { apply: cmd === 'apply' })
  console.log(JSON.stringify(Object.fromEntries(Object.entries(r.counts).sort()), null, 1))
  if (cmd === 'dry') {
    fsys.mkdirSync(outDir, { recursive: true })
    const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const lines = ['kind,action,id,fsContactId,name,field,from,to']
    for (const c of r.changes) for (const [f, [a, b]] of Object.entries(c.fields)) lines.push([c.kind, c.action, c.id, c.fsContactId, c.name, f, a, b].map(esc).join(','))
    fsys.writeFileSync(path.join(outDir, 'changes.csv'), lines.join('\n'))
    console.log(`changes.csv: ${lines.length - 1} field changes → ${outDir}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
