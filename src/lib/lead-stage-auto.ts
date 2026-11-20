import type { PrismaClient, LeadStage } from '@prisma/client'
import { BOOKING_STAGES, CONVERSATION_STAGES, FOLLOW_UP_DUE_DAYS, FOLLOW_UP_GAP_HOURS } from '@/lib/lead-pipeline'
import { sendPushToUser } from '@/lib/push'

// Automatic Sales Pipeline moves (Roy, 2026-11-11) — see the stage list in lead-pipeline.ts.
// Every hook here is best-effort: callers .catch() it so a pipeline hiccup never fails a send,
// a webhook or a payment. Sales can always drag a card by hand on top of this.

const HOUR = 60 * 60 * 1000

// Stages now live on the Deal (src/lib/deal-maker.ts); a lead's Lead.stage just mirrors its
// primary deal (DB trigger). Message-driven moves apply to every OPEN deal of the person that is
// still in a conversation stage — Won / Lost deals are read-only and never moved here.
async function moveDealStage(db: PrismaClient, dealId: string, from: LeadStage, to: LeadStage, userId: string | null) {
  // Conditional on the stage we read, so two hooks racing can't undo each other.
  await db.deal.updateMany({ where: { id: dealId, stage: from }, data: { stage: to, stageUpdatedAt: new Date(), stageUpdatedById: userId } })
}

const conversationDeals = (db: PrismaClient, leadId: string) => db.deal.findMany({
  where: { leadId, deletedAt: null, stage: { in: [...CONVERSATION_STAGES] } },
  select: { id: true, stage: true, tripType: true },
})

/**
 * Customer wrote to us (WA / IG / Messenger / email). An answer to our message puts the deal
 * in "In Active Communication"; a deal still at New Enquiry stays there until staff reply.
 */
export async function recordLeadInbound(db: PrismaClient, leadId: string, at = new Date()): Promise<void> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { lastInboundAt: true } })
  if (!lead) return
  if (!lead.lastInboundAt || lead.lastInboundAt < at) {
    await db.lead.update({ where: { id: leadId }, data: { lastInboundAt: at } })
  }
  for (const d of await conversationDeals(db, leadId)) {
    // Parity C3: no In Active Communication before the trip type is confirmed — the deal waits (its
    // card shows "Trip type?") and moves as soon as sales set it (updateDealFields in deal-stage.ts).
    if (!d.tripType) continue
    if (d.stage === 'INITIAL_MESSAGE_SENT' || d.stage === 'FOLLOW_UP_1' || d.stage === 'FOLLOW_UP_2') {
      await moveDealStage(db, d.id, d.stage, 'ACTIVE_COMMUNICATION', null)
    }
  }
}

/**
 * Staff wrote to the customer from the ERP (or from the Instagram app — Meta echoes those).
 * First message → Initial Message Sent. Writing again ≥ FOLLOW_UP_GAP_HOURS after our last
 * message with no answer in between → 1st Follow-Up, then 2nd Follow-Up.
 */
export async function recordLeadOutbound(db: PrismaClient, leadId: string, userId: string | null, at = new Date()): Promise<void> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { lastInboundAt: true, lastOutboundAt: true } })
  if (!lead) return
  const prevOut = lead.lastOutboundAt
  if (!prevOut || prevOut < at) {
    await db.lead.update({ where: { id: leadId }, data: { lastOutboundAt: at } })
  }
  const unanswered = !!prevOut && (!lead.lastInboundAt || lead.lastInboundAt < prevOut)
  const gapReached = !!prevOut && at.getTime() - prevOut.getTime() >= FOLLOW_UP_GAP_HOURS * HOUR
  for (const d of await conversationDeals(db, leadId)) {
    if (d.stage === 'NEW') { await moveDealStage(db, d.id, 'NEW', 'INITIAL_MESSAGE_SENT', userId); continue }
    if (!unanswered || !gapReached) continue
    if (d.stage === 'INITIAL_MESSAGE_SENT' || d.stage === 'ACTIVE_COMMUNICATION') await moveDealStage(db, d.id, d.stage, 'FOLLOW_UP_1', userId)
    else if (d.stage === 'FOLLOW_UP_1') await moveDealStage(db, d.id, 'FOLLOW_UP_1', 'FOLLOW_UP_2', userId)
  }
}

export type LeadChatEvent = { direction: 'IN' | 'OUT'; at: Date; userId?: string | null }

/**
 * Chat messages that reached the ERP without passing the hooks above — replies the team sent from
 * Freshchat, copied in by src/lib/freshchat-mirror.ts — replayed oldest first so the pipeline
 * moves as if they had been sent from the ERP. Several bubbles in a row (same direction, under an
 * hour apart) are one turn: only its first and last message are replayed.
 */
export async function replayLeadChatEvents(db: PrismaClient, leadId: string, events: LeadChatEvent[]): Promise<void> {
  const ev = [...events].sort((a, b) => +a.at - +b.at)
  const sameTurn = (a: LeadChatEvent | undefined, b: LeadChatEvent | undefined) =>
    !!a && !!b && a.direction === b.direction && +b.at - +a.at < HOUR
  for (let i = 0; i < ev.length; i++) {
    if (sameTurn(ev[i - 1], ev[i]) && sameTurn(ev[i], ev[i + 1])) continue
    const e = ev[i]
    if (e.direction === 'IN') await recordLeadInbound(db, leadId, e.at)
    else await recordLeadOutbound(db, leadId, e.userId ?? null, e.at)
  }
}

/** Open (not won/lost) lead for an email address — email threads have no leadId of their own. */
export async function findOpenLeadIdByEmail(db: PrismaClient, email: string | null | undefined): Promise<string | null> {
  const e = email?.trim()
  if (!e) return null
  const lead = await db.lead.findFirst({
    where: { deletedAt: null, email: { equals: e, mode: 'insensitive' }, stage: { in: [...CONVERSATION_STAGES] } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  return lead?.id ?? null
}

/**
 * Booking-driven stages for every deal linked to this booking: created → Send Booking
 * Confirmation, first invoice generated → Send Invoice 1, first payment confirmed → Won.
 * Only ever moves forward, and never touches a Won / Lost deal (read-only — a booking for a
 * person whose deal was Lost gets a new deal, see linkBookingDeals in src/lib/deal-booking.ts).
 * Call after creating a booking, generating an invoice or confirming a payment.
 */
export async function syncLeadStageFromBooking(db: PrismaClient, bookingId: string, userId: string | null): Promise<void> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      status: true, depositPaid: true,
      payments: { select: { status: true, invoiceGeneratedAt: true } },
      deals: { where: { deletedAt: null }, select: { id: true, stage: true, paymentStatus: true } },
    },
  })
  if (!booking || booking.deals.length === 0 || booking.status === 'cancelled' || booking.status === 'on_hold') return

  const paid = booking.depositPaid > 0 || booking.payments.some(p => p.status === 'confirmed')
    || ['partially_paid', 'fully_paid', 'completed'].includes(booking.status)
  const invoiced = booking.payments.some(p => p.invoiceGeneratedAt && !['cancelled', 'rejected'].includes(p.status))
  const target: LeadStage = paid ? 'CLOSED_WON' : invoiced ? 'INVOICE_SENT' : 'BOOKING_CONFIRMATION'
  const targetRank = BOOKING_STAGES.indexOf(target)

  // Payment status (parity C3): deposit received = Won with "Deposit paid"; paid in full → "Paid".
  const fullyPaid = ['fully_paid', 'completed'].includes(booking.status)
  const payment = fullyPaid ? 'PAID' : paid ? 'DEPOSIT_PAID' : null

  for (const deal of booking.deals) {
    if (payment && deal.stage !== 'CLOSED_LOST' && deal.paymentStatus !== payment && !(deal.paymentStatus === 'PAID' && payment === 'DEPOSIT_PAID')) {
      await db.deal.update({ where: { id: deal.id }, data: { paymentStatus: payment } })
    }
    if (deal.stage === 'CLOSED_WON' || deal.stage === 'CLOSED_LOST') continue
    const rank = BOOKING_STAGES.indexOf(deal.stage)
    if (rank >= targetRank) continue
    await moveDealStage(db, deal.id, deal.stage, target, userId)
  }
}

/**
 * "Follow-up due" reminder — run hourly from src/instrumentation-node.ts. A lead whose owner
 * wrote last and has heard nothing for FOLLOW_UP_DUE_DAYS gets one in-app + push reminder per
 * silent stretch (followUpRemindedAt resets when we write again). Never moves a stage.
 */
export async function runLeadFollowUpReminders(db: PrismaClient): Promise<number> {
  const cutoff = new Date(Date.now() - FOLLOW_UP_DUE_DAYS * 24 * HOUR)
  const candidates = await db.lead.findMany({
    where: {
      deletedAt: null, ownerId: { not: null },
      stage: { in: ['INITIAL_MESSAGE_SENT', 'ACTIVE_COMMUNICATION', 'FOLLOW_UP_1', 'FOLLOW_UP_2'] },
      lastOutboundAt: { lt: cutoff },
    },
    select: { id: true, name: true, stage: true, ownerId: true, lastInboundAt: true, lastOutboundAt: true, followUpRemindedAt: true },
    take: 500,
  })
  let sent = 0
  for (const l of candidates) {
    if (!l.ownerId || !l.lastOutboundAt) continue
    if (l.lastInboundAt && l.lastInboundAt >= l.lastOutboundAt) continue
    if (l.followUpRemindedAt && l.followUpRemindedAt >= l.lastOutboundAt) continue
    const { count } = await db.lead.updateMany({
      where: { id: l.id, OR: [{ followUpRemindedAt: null }, { followUpRemindedAt: { lt: l.lastOutboundAt } }] },
      data: { followUpRemindedAt: new Date() },
    })
    if (count === 0) continue
    const next = l.stage === 'FOLLOW_UP_2' ? 'another follow-up or mark it Lost' : l.stage === 'FOLLOW_UP_1' ? 'the 2nd follow-up' : 'the 1st follow-up'
    const title = `Follow-up due: ${l.name}`
    const body = `No reply for ${FOLLOW_UP_DUE_DAYS} days since your last message — time for ${next}.`
    await db.notification.create({ data: { userId: l.ownerId, type: 'LEAD_FOLLOW_UP', title, body } }).catch(() => {})
    sendPushToUser(db, l.ownerId, { title, body, url: '/' }).catch(() => {})
    sent++
  }
  return sent
}
