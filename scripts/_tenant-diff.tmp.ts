import { PrismaClient as CentralClient } from '@prisma/central-client'
import { spawnSync } from 'child_process'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' }); dotenv.config({ path: '.env' })
async function main() {
  const c = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const ts = await c.tenant.findMany({ where: { isActive: true }, select: { slug: true, databaseUrl: true, directUrl: true } })
  for (const t of ts) {
    const r = spawnSync('npx', ['prisma', 'migrate', 'diff', '--from-url', t.directUrl || t.databaseUrl, '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], { encoding: 'utf8' })
    const sql = (r.stdout || '').split('\n').filter(l => /^(ALTER|CREATE|DROP)/.test(l))
    console.log(`== ${t.slug}: ${sql.length} statements`); console.log(sql.slice(0, 40).join('\n')); if (r.status) console.log((r.stderr||'').slice(-400))
  }
  await c.$disconnect()
}
main()
