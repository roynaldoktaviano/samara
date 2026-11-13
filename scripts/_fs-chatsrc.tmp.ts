import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const q = async (s: string) => console.log(JSON.stringify(await db.$queryRawUnsafe<any[]>(s), (k,v)=>typeof v==='bigint'?Number(v):v))
async function main() {
  await q(`SELECT "actionData"->>'group_name' ch, count(*) n, min("occurredAt")::date first, max("occurredAt")::date last FROM "FreshsalesTimelineEvent" WHERE "actionType"='CONVERSATION_CREATED' GROUP BY 1 ORDER BY 2 DESC LIMIT 15`)
  await q(`SELECT count(*) FROM "FreshsalesTimelineEvent" WHERE raw::text ILIKE '%instagram%'`)
  await q(`SELECT count(DISTINCT ("actionData"->'freshchat'->>'conversation_id')) convs, count(DISTINCT "contactFsId") contacts FROM "FreshsalesTimelineEvent" WHERE "actionType" IN ('CHAT_CREATED','CHAT_MODIFIED')`)
}
main().finally(() => db.$disconnect())
