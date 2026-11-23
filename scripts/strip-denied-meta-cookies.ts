/**
 * One-off clean-up for handover §2 ("Meta cookies _fbc / _fbp are not read or stored when consent
 * is denied and the region is EU, UK, CH or blank"): the columns already followed that rule, but the
 * raw audit copy (Inquiry.rawPayload, WaTap.rawPayload) still kept the cookies. New rows are fixed in
 * code (src/lib/inquiry-tracking.ts stripMetaCookies); this removes them from rows stored before.
 *
 * Run AFTER the code is deployed (until then the old code keeps writing them):
 *   npx tsx scripts/strip-denied-meta-cookies.ts            # dry run, every active tenant
 *   npx tsx scripts/strip-denied-meta-cookies.ts --apply    # write
 *   npx tsx scripts/strip-denied-meta-cookies.ts samara --apply
 */
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { Prisma, PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import { dropMetaCookies, stripMetaCookies } from '../src/lib/inquiry-tracking'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const apply = process.argv.includes('--apply')
const slugs = process.argv.slice(2).filter(a => !a.startsWith('--'))

type Row = { id: string; adConsent: string | null; consentRegion: string | null; rawPayload: unknown }

function cleaned(r: Row): Record<string, unknown> | null {
  const raw = r.rawPayload
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (!dropMetaCookies(r.adConsent, r.consentRegion)) return null
  const out = stripMetaCookies(raw as Record<string, unknown>, true)
  return Object.keys(out).length === Object.keys(raw).length ? null : out
}

async function runTenant(slug: string, url: string) {
  const db = new PrismaClient({ datasources: { db: { url } } })
  try {
    const tables = [
      { name: 'Inquiry', rows: await db.inquiry.findMany({ where: { adConsent: 'denied' }, select: { id: true, adConsent: true, consentRegion: true, rawPayload: true } }) },
      { name: 'WaTap', rows: await db.waTap.findMany({ where: { adConsent: 'denied' }, select: { id: true, adConsent: true, consentRegion: true, rawPayload: true } }) },
    ]
    for (const t of tables) {
      const todo = (t.rows as Row[]).map(r => ({ id: r.id, raw: cleaned(r) })).filter(x => x.raw)
      console.log(`[${slug}] ${t.name}: ${t.rows.length} denied rows, ${todo.length} still carry Meta cookies in rawPayload`)
      if (!apply) continue
      for (const x of todo) {
        const data = { rawPayload: x.raw as Prisma.InputJsonValue }
        if (t.name === 'Inquiry') await db.inquiry.update({ where: { id: x.id }, data })
        else await db.waTap.update({ where: { id: x.id }, data })
      }
      if (todo.length) console.log(`[${slug}] ${t.name}: cleaned ${todo.length}`)
    }
  } finally {
    await db.$disconnect()
  }
}

async function main() {
  const central = new CentralClient()
  try {
    const tenants = await central.tenant.findMany({ where: { isActive: true, ...(slugs.length ? { slug: { in: slugs } } : {}) }, select: { slug: true, databaseUrl: true } })
    for (const t of tenants) {
      if (!t.databaseUrl) { console.log(`[${t.slug}] no database URL, skipped`); continue }
      await runTenant(t.slug, t.databaseUrl)
    }
  } finally {
    await central.$disconnect()
  }
  if (!apply) console.log('Dry run — nothing written. Add --apply to clean.')
}

main().catch(e => { console.error(e); process.exit(1) })
