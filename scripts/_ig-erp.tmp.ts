import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const q = async (s: string) => console.log(JSON.stringify(await db.$queryRawUnsafe<any[]>(s), (k,v)=>typeof v==='bigint'?Number(v):v))
async function main() {
  await q(`SELECT platform::text, brand::text, "ourAccountUsername", count(*), count("igUsername") uname, min("createdAt")::date FROM "InstagramConversation" GROUP BY 1,2,3`)
  await q(`SELECT brand::text, count(*) FROM "WhatsappConversation" GROUP BY 1`)
  await q(`SELECT "channelSource", "channelName", count(*) n, sum("messageCount") msgs FROM "FreshchatConversation" WHERE "messagesSyncedAt" IS NOT NULL GROUP BY 1,2 ORDER BY 1,3 DESC`)
}
main().finally(() => db.$disconnect())
