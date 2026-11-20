import type { PrismaClient } from '@prisma/client'
import { sendPushToUser } from '@/lib/push'
import { OPEN_STAGES } from '@/lib/deal-maker'

// A WhatsApp chat matched to a website tap only by timing with 2+ candidate taps (LOW, src/lib/wa-tap.ts)
// may carry the wrong guest's click IDs. Freshsales snippet 92 gave the deal owner a task to check it by
// hand; LOW is never uploaded to Google / Meta until sales change Click ID match to Medium / Confident.
// Called from two places, because the tap and the deal can arrive in either order:
//  - right after the chat deal maker (src/lib/deal-chat.ts) — the usual case;
//  - when a late tap is linked to an existing chat as LOW (src/lib/wa-tap.ts linkTap).
// One task per deal + ref: the title carries the ref and is the dedup key.

const TASK_MS = 4 * 60 * 60 * 1000

export async function ensureLowMatchTask(db: PrismaClient, inquiryId: string | null | undefined): Promise<void> {
  if (!inquiryId) return
  const inq = await db.inquiry.findUnique({
    where: { id: inquiryId },
    select: {
      id: true, matchConfidence: true, matchConfidenceById: true, waRef: true, dealId: true, leadId: true, customerId: true, url: true,
      whatsappConversationId: true,
    },
  })
  // A person already set the confidence by hand → nothing to check.
  if (!inq || inq.matchConfidence !== 'LOW' || inq.matchConfidenceById) return

  let dealId = inq.dealId
  if (!dealId && (inq.leadId || inq.customerId)) {
    const conv = inq.whatsappConversationId
      ? await db.whatsappConversation.findUnique({ where: { id: inq.whatsappConversationId }, select: { brand: true } })
      : null
    const deal = await db.deal.findFirst({
      where: {
        deletedAt: null, stage: { in: OPEN_STAGES },
        ...(conv?.brand ? { brand: conv.brand } : {}),
        OR: [...(inq.leadId ? [{ leadId: inq.leadId }] : []), ...(inq.customerId ? [{ customerId: inq.customerId }] : [])],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    dealId = deal?.id ?? null
    if (dealId) await db.inquiry.update({ where: { id: inq.id }, data: { dealId } })
  }
  if (!dealId) return // no deal yet — the chat deal maker calls this again once it has one
  const deal = await db.deal.findUnique({ where: { id: dealId }, select: { ownerId: true, stage: true } })
  if (!deal?.ownerId || !OPEN_STAGES.includes(deal.stage)) return

  const title = `LOW confidence WhatsApp match${inq.waRef ? ` (${inq.waRef})` : ''}: please check by hand`
  if (await db.todo.findFirst({ where: { dealId, title }, select: { id: true } })) return

  const notes = [
    'This chat was matched to a website WhatsApp tap only by timing, and 2 or more taps fit — the click IDs on it could belong to another visitor.',
    'Check the match on the lead\'s inquiry. If it is right, correct the click IDs if needed, then change Click ID match to Medium or Confident so it can be uploaded to Google and Meta. While it is Low it is never uploaded.',
    inq.url ? `Tap page: ${inq.url}` : null,
  ].filter(Boolean).join('\n\n')
  await db.todo.create({
    data: { userId: deal.ownerId, title, notes, type: 'Sales Pipeline', priority: 'MEDIUM', dueDate: new Date(Date.now() + TASK_MS), dealId },
  })
  const body = 'Matched by timing only (2+ website taps fit). Check it before it can be uploaded to Google / Meta.'
  await db.notification.create({ data: { userId: deal.ownerId, type: 'DEAL_ENQUIRY', title, body } })
  await sendPushToUser(db, deal.ownerId, { title, body, url: '/' }).catch(() => {})
}
