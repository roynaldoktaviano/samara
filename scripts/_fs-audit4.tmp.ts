import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const q = async (s: string) => console.log(JSON.stringify(await db.$queryRawUnsafe<any[]>(s), (k,v)=>typeof v==='bigint'?Number(v):v))
async function main() {
  await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE 'whatsapp%' OR table_name ILIKE 'instagram%' OR table_name ILIKE 'email%' OR table_name ILIKE '%inbox%')`)
  await q(`SELECT brand::text, count(*), min("createdAt") FROM "WhatsappConversation" GROUP BY 1`)
  await q(`SELECT min("createdAt"), max("createdAt"), count(*) FROM "WhatsappMessage"`)
  await q(`SELECT a."actionData"->>'title' t, count(*) FROM "FreshsalesTimelineEvent" a WHERE "actionType"='CHAT_CREATED' GROUP BY 1 ORDER BY 2 DESC LIMIT 15`)
}
main().finally(()=>db.$disconnect())
