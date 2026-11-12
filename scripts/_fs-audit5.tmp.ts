import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const q = async (s: string) => console.log(JSON.stringify(await db.$queryRawUnsafe<any[]>(s), (k,v)=>typeof v==='bigint'?Number(v):v))
async function main() {
  await q(`SELECT kind::text, "fsId", name FROM "FreshsalesLookup" WHERE kind IN ('DEAL_REASON','DEAL_PAYMENT_STATUS','DEAL_TYPE','DEAL_PIPELINE')`)
  await q(`SELECT d.name, d.amount, d."fsCreatedAt", d."closedDate", d."customFields"->>'cf_date_window_start' ws, d."customFields"->>'cf_products' prod, d."customFields"->>'cf_product_interest' pi, d."customFields"->>'cf_route' route, d."customFields"->>'cf_deposit_received_at' dep FROM "FreshsalesDeal" d JOIN "FreshsalesLookup" s ON s.kind='DEAL_STAGE' AND s."fsId"=d."stageFsId" WHERE s.name='Won' ORDER BY d."fsCreatedAt" DESC LIMIT 8`)
  await q(`SELECT min("createdAt"), min("startDate"), count(*) FILTER (WHERE "salespersonId" IS NOT NULL) sp FROM "Booking" WHERE status::text<>'cancelled'`)
  await q(`SELECT date_trunc('year', d."fsCreatedAt") y, s.name, count(*) FROM "FreshsalesDeal" d JOIN "FreshsalesLookup" s ON s.kind='DEAL_STAGE' AND s."fsId"=d."stageFsId" WHERE s.name IN ('Won') GROUP BY 1,2 ORDER BY 1`)
}
main().finally(()=>db.$disconnect())
