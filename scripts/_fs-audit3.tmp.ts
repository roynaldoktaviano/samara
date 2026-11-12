import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const q = (s: string) => db.$queryRawUnsafe<any[]>(s)
async function main() {
  for (const t of ['CHAT_CREATED','CONVERSATION_CREATED','CSMS_CREATED','CHAT_MODIFIED','OWNER_CHANGE','STAGE_CHANGE']) {
    const r = await q(`SELECT "actionableType","actionData",raw FROM "FreshsalesTimelineEvent" WHERE "actionType"='${t}' ORDER BY "occurredAt" DESC LIMIT 1`)
    console.log('=== '+t, JSON.stringify(r[0]).slice(0,1500))
  }
  const a = await q(`SELECT a.title, left(a.body,600) body, a."startAt", a."contactFsIds", a."dealFsIds", l.name FROM "FreshsalesActivity" a LEFT JOIN "FreshsalesLookup" l ON l.kind='ACTIVITY_TYPE' AND l."fsId"=a."typeFsId" WHERE a.kind='SALES_ACTIVITY' ORDER BY a."startAt" DESC NULLS LAST LIMIT 4`)
  console.log('=== ACT', JSON.stringify(a))
  console.log(JSON.stringify(await q(`SELECT l.name, min(a."startAt"), max(a."startAt"), avg(length(a.body))::int avglen FROM "FreshsalesActivity" a LEFT JOIN "FreshsalesLookup" l ON l.kind='ACTIVITY_TYPE' AND l."fsId"=a."typeFsId" GROUP BY 1`)))
}
main().finally(()=>db.$disconnect())
