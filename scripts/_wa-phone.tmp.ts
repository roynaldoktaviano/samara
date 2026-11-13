import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  console.log((await db.whatsappConversation.findMany({ select: { phone: true } })).map(p => p.phone.replace(/\d(?=\d{4})/g, '•')))
  console.log((await db.freshchatConversation.findMany({ where: { channelSource: 'WHATSAPP', userPhone: { not: null } }, select: { userPhone: true }, take: 5 })).map(p => p.userPhone!.replace(/\d(?=\d{4})/g, '•')))
  console.log(await db.freshchatConversation.findMany({ where: { channelSource: { in: ['INSTA', 'FB_NATIVE'] } }, select: { channelName: true, userName: true }, take: 8 }))
  console.log(await db.instagramConversation.findMany({ select: { platform: true, igUsername: true, displayName: true, brand: true } }))
}
main().finally(() => db.$disconnect())
