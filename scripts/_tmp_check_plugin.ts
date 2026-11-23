import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' }); dotenv.config({ path: '.env' })
async function main() {
  const since = new Date(Date.now() - 3 * 3600_000)
  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const fails = await central.webhookFailureLog.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 20, select: { source: true, reason: true, tenantSlug: true, createdAt: true, detail: true } })
  console.log('Failures last 3h:', fails.length ? '' : 'none'); for (const f of fails) console.log(' ', f.createdAt.toISOString(), f.source, f.reason, (f.detail ?? '').slice(0, 120))
  const t = await central.tenant.findFirst({ where: { slug: 'samara' }, select: { databaseUrl: true } }); await central.$disconnect()
  const db = new PrismaClient({ datasources: { db: { url: t!.databaseUrl } } })
  const cf7 = await db.$queryRaw<any[]>`SELECT "createdAt", split_part(coalesce("rawPayload"->>'page-url', url, ''), '/', 3) host,
      "rawPayload" ? 'user_agent' ua, "rawPayload" ? 'form_id' fid, "rawPayload"->>'form_id' form_id, coalesce("rawPayload"->>'_fbp','') <> '' fbp
    FROM "Inquiry" WHERE source = 'CF7' AND "createdAt" >= ${since} ORDER BY "createdAt" DESC LIMIT 15`
  console.log('CF7 last 3h:'); for (const r of cf7) console.log(' ', new Date(r.createdAt).toISOString(), r.host, 'user_agent', r.ua, 'form_id', r.form_id ?? '-', '_fbp', r.fbp)
  const taps = await db.$queryRaw<any[]>`SELECT ref, brand, "tappedAt", "createdAt", "pageUrl", "matchedConversationId" IS NOT NULL matched, "userAgent" IS NOT NULL ua FROM "WaTap" WHERE "createdAt" >= ${since} ORDER BY "createdAt" DESC LIMIT 15`
  console.log('WaTap last 3h:', taps.length ? '' : 'none'); for (const r of taps) console.log(' ', new Date(r.createdAt).toISOString(), r.ref, r.brand, r.pageUrl, 'matched', r.matched, 'ua', r.ua)
  const pv = await db.$queryRaw<any[]>`SELECT split_part(url, '/', 3) host, max("createdAt") last, count(*)::int n FROM "PageView" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 2 DESC`
  console.log("Page views last 3h:"); for (const r of pv) console.log(" ", r.host, r.n, new Date(r.last).toISOString())
  await db.$disconnect()
}
main().catch(e => { console.error(e.message); process.exit(1) })
