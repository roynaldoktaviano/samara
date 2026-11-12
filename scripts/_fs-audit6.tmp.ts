import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const q = async (s: string) => console.log(JSON.stringify(await db.$queryRawUnsafe<any[]>(s), (k,v)=>typeof v==='bigint'?Number(v):v))
async function main() {
  await q(`SELECT count(*) FILTER (WHERE "freshsalesContactId" IS NOT NULL) fs, count(*) FILTER (WHERE "bookingId" IS NOT NULL) bk, count(*) FILTER (WHERE source IS NOT NULL) src FROM "Lead" WHERE "deletedAt" IS NOT NULL`)
  await q(`SELECT source, count(*) FROM "Lead" WHERE "deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC`)
  await q(`SELECT date_trunc('month',"createdAt") m, count(*) FROM "Lead" WHERE "freshsalesContactId" IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 6`)
  await q(`SELECT entity, status, processed, total, "updatedAt" FROM "FreshsalesSyncState" WHERE entity='contacts'`)
}
main().finally(()=>db.$disconnect())
