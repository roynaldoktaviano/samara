import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const rows = await db.$queryRawUnsafe<any[]>(`SELECT brand::text, "displayPhone" FROM "WhatsappConversation" LIMIT 0`).catch(e => String(e.message).slice(0, 120))
  console.log(rows)
  const cols = await db.$queryRawUnsafe<any[]>(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND (column_name ILIKE '%phone%number%' OR column_name ILIKE '%waba%' OR column_name ILIKE '%businessphone%') LIMIT 20`)
  console.log(cols)
}
main().finally(() => db.$disconnect())
