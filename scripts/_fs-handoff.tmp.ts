import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  // Deals re-indexed today whose full detail wasn't pulled yet → pending for the archive crawl's dealDetails step
  const n = await db.$executeRawUnsafe(`UPDATE "FreshsalesDeal" SET "detailSyncedAt" = NULL
    WHERE "isDeleted" = false AND "syncedAt" >= NOW() - INTERVAL '6 hours' AND ("detailSyncedAt" IS NULL OR "detailSyncedAt" < NOW() - INTERVAL '6 hours')`)
  await db.freshsalesSyncState.updateMany({ where: { entity: { in: ['erpSyncLease', 'crawlLease'] } }, data: { status: 'IDLE' } })
  const conv = await db.freshsalesContact.count({ where: { isDeleted: false, conversationsSyncedAt: null } })
  console.log('deals queued for detail:', n, '| contacts queued for email/timeline:', conv)
}
main().finally(() => db.$disconnect())
