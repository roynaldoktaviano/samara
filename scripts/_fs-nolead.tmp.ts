import { PrismaClient } from '@prisma/client'
import * as fsys from 'fs'
const db = new PrismaClient()
async function main() {
  const rows = fsys.readFileSync(process.argv[2], 'utf8').split('\n').slice(1).filter(l => l.includes('no ERP lead'))
  const ids = rows.map(l => l.split(',')[0].replace(/"/g, ''))
  const deals = await db.freshsalesDeal.findMany({ where: { id: { in: ids } }, select: { id: true, contactFsIds: true } })
  for (const d of deals) {
    const cs = await db.freshsalesContact.findMany({ where: { id: { in: d.contactFsIds } }, select: { id: true, isDeleted: true, email: true, leadId: true } })
    console.log(d.id, 'contacts:', d.contactFsIds.length, JSON.stringify(cs.map(c => [c.isDeleted, !!c.email, c.leadId])))
  }
}
main().finally(() => db.$disconnect())
