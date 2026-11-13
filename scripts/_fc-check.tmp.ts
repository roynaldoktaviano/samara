import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const cs = await db.freshchatConversation.findMany({ where: { messagesSyncedAt: { not: null } }, select: { id: true, channelName: true, channelSource: true, brand: true, userName: true, leadId: true, customerId: true, messageCount: true, lastMessagePreview: true, assignedAgentName: true, lastError: true } })
  console.log(cs)
  const m = await db.freshchatMessage.findMany({ where: { conversationId: cs[0]?.id }, orderBy: { createdAt: 'asc' }, take: 6, select: { actorType: true, actorName: true, messageType: true, text: true, attachments: true, createdAt: true } })
  console.log(JSON.stringify(m, null, 0).slice(0, 1500))
  console.log('with attachments:', await db.freshchatMessage.count({ where: { attachments: { not: undefined } } }))
}
main().finally(() => db.$disconnect())
