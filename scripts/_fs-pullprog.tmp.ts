import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const since = new Date(Date.now() - 3 * 3600_000)
  console.log('deals touched in last 3h:', await db.freshsalesDeal.count({ where: { syncedAt: { gte: since } } }), 'with fresh detail:', await db.freshsalesDeal.count({ where: { detailSyncedAt: { gte: since } } }), 'total live', await db.freshsalesDeal.count({ where: { isDeleted: false } }))
}
main().finally(() => db.$disconnect())
