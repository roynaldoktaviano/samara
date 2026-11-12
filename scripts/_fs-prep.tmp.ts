import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  await db.freshsalesSyncState.update({ where: { entity: 'dealsIndex' }, data: { status: 'DONE', cursor: {} } })
  const n = await db.$executeRawUnsafe(`UPDATE "FreshsalesContact" SET "conversationsSyncedAt" = NULL, "timelineSyncedAt" = NULL
    WHERE "isDeleted" = false AND ("timelineSyncedAt" IS NULL OR "fsUpdatedAt" > "timelineSyncedAt" OR "lastContactedAt" > "conversationsSyncedAt")`)
  console.log('contacts queued for history re-pull:', n)
}
main().finally(() => db.$disconnect())
