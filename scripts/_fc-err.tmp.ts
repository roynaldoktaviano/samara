import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
db.freshchatConversation.groupBy({ by: ['lastError'], where: { lastError: { not: null } }, _count: true }).then(r => console.log(r.map(x => `${x._count} × ${x.lastError?.slice(0, 200)}`).join('\n'))).finally(() => db.$disconnect())
