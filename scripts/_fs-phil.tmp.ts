import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const q = async (s: string) => console.log(JSON.stringify(await db.$queryRawUnsafe<any[]>(s), (k,v)=>typeof v==='bigint'?Number(v):v))
async function main() {
  await q(`SELECT p.name pipeline, s.name stage, count(*) n, min(d."fsCreatedAt")::date oldest, max(d."fsCreatedAt")::date newest
    FROM "FreshsalesDeal" d JOIN "FreshsalesUser" u ON u.id=d."ownerFsId" JOIN "FreshsalesLookup" s ON s.kind='DEAL_STAGE' AND s."fsId"=d."stageFsId" JOIN "FreshsalesLookup" p ON p.kind='DEAL_PIPELINE' AND p."fsId"=d."pipelineFsId"
    WHERE NOT d."isDeleted" AND u.name ILIKE '%philippe%' AND s.extra->>'forecast_type'='Open' GROUP BY 1,2 ORDER BY 3 DESC`)
  await q(`SELECT u.name erp_owner, count(*) FROM "Lead" l JOIN "FreshsalesDeal" d ON d.id=l."freshsalesDealId" JOIN "FreshsalesUser" f ON f.id=d."ownerFsId" LEFT JOIN "User" u ON u.id=l."ownerId" JOIN "FreshsalesLookup" s ON s.kind='DEAL_STAGE' AND s."fsId"=d."stageFsId" WHERE f.name ILIKE '%philippe%' AND s.extra->>'forecast_type'='Open' GROUP BY 1`)
}
main().finally(() => db.$disconnect())
