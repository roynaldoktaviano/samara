import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
db.freshsalesSyncState.findMany({ where: { entity: { in: ['contacts','dealsIndex','activities'] } } }).then(r => { for (const s of r) console.log(s.entity, s.status, s.processed, s.total, s.updatedAt.toISOString(), (s.cursor as any)?.page ?? '') }).finally(() => db.$disconnect())
