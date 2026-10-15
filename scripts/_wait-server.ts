import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
;(async () => {
  const start = Date.now()
  for (;;) {
    const r = await db.freshsalesSyncState.findUnique({ where: { entity: 'crawlLease' } })
    const owner = (r?.cursor as { owner?: string } | null)?.owner ?? ''
    if (r?.status === 'RUNNING' && owner.startsWith('server-')) { console.log('TAKEN', owner, r.updatedAt.toISOString(), `${Math.round((Date.now() - start) / 1000)}s`); break }
    if (Date.now() - start > 14 * 60_000) { console.log('NOT TAKEN after 14 min', r?.status, owner); break }
    await new Promise(res => setTimeout(res, 20_000))
  }
  await db.$disconnect()
})()
