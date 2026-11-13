import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const r = await db.$queryRawUnsafe<any[]>(`
    WITH ids AS (
      SELECT "actionData"->>'conversation_id' cid, "contactFsId" c FROM "FreshsalesTimelineEvent" WHERE "actionType" LIKE 'CONVERSATION_%' AND "actionData"->>'conversation_id' IS NOT NULL
      UNION SELECT "actionData"->'freshchat'->>'conversation_id', "contactFsId" FROM "FreshsalesTimelineEvent" WHERE "actionType" LIKE 'CHAT_%'
      UNION SELECT raw->>'conversation_id', "contactFsIds"[1] FROM "FreshsalesActivity" WHERE raw->>'conversation_id' IS NOT NULL)
    SELECT count(DISTINCT cid) convs, count(DISTINCT c) contacts FROM ids WHERE cid IS NOT NULL`)
  console.log(JSON.stringify(r, (k, v) => typeof v === 'bigint' ? Number(v) : v))
}
main().finally(() => db.$disconnect())
