import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const q = (s: string) => db.$queryRawUnsafe<any[]>(s)
async function main() {
  const out: Record<string, any> = {}
  out.tl = await q(`SELECT "actionType", "targetType", count(*) n FROM "FreshsalesTimelineEvent" GROUP BY 1,2 ORDER BY 3 DESC LIMIT 60`)
  out.act = await q(`SELECT a.kind::text, l.name type, count(*) n FROM "FreshsalesActivity" a LEFT JOIN "FreshsalesLookup" l ON l.kind='ACTIVITY_TYPE' AND l."fsId"=a."typeFsId" GROUP BY 1,2 ORDER BY 3 DESC`)
  out.conv = await q(`SELECT channel, direction, count(*) n FROM "FreshsalesConversation" GROUP BY 1,2`)
  out.convRawKeys = await q(`SELECT DISTINCT jsonb_object_keys(raw::jsonb) k FROM (SELECT raw FROM "FreshsalesConversation" LIMIT 200) x`)
  out.dealCF = await q(`SELECT k, count(*) FROM (SELECT jsonb_object_keys("customFields"::jsonb) k FROM "FreshsalesDeal" WHERE "customFields" IS NOT NULL) x GROUP BY 1 ORDER BY 2 DESC`)
  out.contactRawKeys = await q(`SELECT k, count(*) FROM (SELECT jsonb_object_keys(raw::jsonb) k FROM "FreshsalesContact" WHERE raw IS NOT NULL) x GROUP BY 1 ORDER BY 2 DESC LIMIT 80`)
  console.log(JSON.stringify(out, (k,v)=>typeof v==='bigint'?Number(v):v))
}
main().finally(()=>db.$disconnect())
