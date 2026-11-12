import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const q = (s: string) => db.$queryRawUnsafe<any[]>(s)
async function main() {
  const out: Record<string, any> = {}
  out.enum = (await q(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='LeadStage' ORDER BY e.enumsortorder`)).map(r=>r.enumlabel).join(',')
  out.leadCols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name='Lead'`)).map(r=>r.column_name).join(',')
  out.sync = await q(`SELECT 'contact' t, max("syncedAt") m, max("fsUpdatedAt") u FROM "FreshsalesContact" UNION ALL SELECT 'deal', max("syncedAt"), max("fsUpdatedAt") FROM "FreshsalesDeal" UNION ALL SELECT 'conv', max("syncedAt"), max("occurredAt") FROM "FreshsalesConversation" UNION ALL SELECT 'tl', max("syncedAt"), max("occurredAt") FROM "FreshsalesTimelineEvent"`)
  out.leads = await q(`SELECT count(*) total, count(*) FILTER (WHERE "deletedAt" IS NULL) alive, count("freshsalesContactId") fslinked, count("ownerId") owned, count(*) FILTER (WHERE source IS NULL) nosrc FROM "Lead"`)
  out.leadStage = await q(`SELECT stage::text, count(*) FROM "Lead" WHERE "deletedAt" IS NULL GROUP BY 1`)
  out.cust = await q(`SELECT count(*) total, count(*) FILTER (WHERE "deletedAt" IS NULL) alive, count("freshsalesContactId") fslinked, count("ownerId") owned FROM "Customer"`)
  out.fsc = await q(`SELECT count(*) total, count(*) FILTER (WHERE "isDeleted") del, count("leadId") lead, count("customerId") cust, count(*) FILTER (WHERE "leadId" IS NULL AND "customerId" IS NULL) unlinked, count("ownerFsId") owner FROM "FreshsalesContact"`)
  out.fsd = await q(`SELECT count(*) total, count(*) FILTER (WHERE "isDeleted") del, count(*) FILTER (WHERE cardinality("contactFsIds")>0) withc, count("ownerFsId") owner FROM "FreshsalesDeal"`)
  out.pipelines = await q(`SELECT p.name pipeline, s.name stage, s.extra->>'forecast_type' ft, count(d.id) n FROM "FreshsalesDeal" d LEFT JOIN "FreshsalesLookup" s ON s.kind='DEAL_STAGE' AND s."fsId"=d."stageFsId" LEFT JOIN "FreshsalesLookup" p ON p.kind='DEAL_PIPELINE' AND p."fsId"=d."pipelineFsId" WHERE NOT d."isDeleted" GROUP BY 1,2,3,s.position ORDER BY 1,s.position`)
  out.users = await q(`SELECT f.id,f.name,f.email,f."isActive",u.email erp, u.role FROM "FreshsalesUser" f LEFT JOIN "User" u ON u.id=f."userId"`)
  out.lookupKinds = await q(`SELECT kind::text, count(*) FROM "FreshsalesLookup" GROUP BY 1`)
  out.bookings = await q(`SELECT count(*) total, count(*) FILTER (WHERE status::text<>'cancelled') live FROM "Booking"`)
  console.log(JSON.stringify(out, (k,v)=>typeof v==='bigint'?Number(v):v, 1))
}
main().finally(()=>db.$disconnect())
