import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
db.freshsalesSyncState.findMany({ where: { entity: { in: ['erpSyncDelta','erpSyncLease','crawlLease'] } } }).then(r => { for (const s of r) console.log(s.entity, s.status, 'finished', s.finishedAt?.toISOString(), 'updated', s.updatedAt.toISOString(), JSON.stringify(s.cursor).slice(0, 900), s.lastError ?? '') }).finally(() => db.$disconnect())
