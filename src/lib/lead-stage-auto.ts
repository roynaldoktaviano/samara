import type { PrismaClient, LeadStage } from '@prisma/client'
import { BOOKING_STAGES, CONVERSATION_STAGES, FOLLOW_UP_DUE_DAYS, FOLLOW_UP_GAP_HOURS } from '@/lib/lead-pipeline'
import { sendPushToUser } from '@/lib/push'

// Automatic Sales Pipeline moves (Roy, 2026-11-11) — see the stage list in lead-pipeline.ts.
// Every hook here is best-effort: callers .catch() it so a pipeline hiccup never fails a send,
// a webhook or a payment. Sales can always drag a card by hand on top of this.

const HOUR = 60 * 60 * 1000

async function moveStage(db: PrismaClient, leadId: string, from: LeadStage, to: LeadStage, userId: string | null) {
  // Conditional on the stage we read, so two hooks racing can't undo each other.
  await db.lead.updateMany({ where: { id: leadId, stage: from }, data: { stage: to, stageUpdatedAt: new Date(), stageUpdatedById: userId } })
}

/**
 * Customer wrote to us (WA / IG / Messenger / email). An answer to our message puts the lead
 * in "In Active Communication"; a lead still at New Enquiry stays there until staff reply.
 */
export async function recordLeadInbound(db: PrismaClient, leadId: string, at = new Date()): Promise<void> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { stage: true, lastInboundAt: true } })
  if (!lead) return
  if (!lead.lastInboundAt || lead.lastInboundAt < at) {
    await db.lead.update({ where: { id: leadId }, data: { lastInboundAt: at } })
  }
  if (lead.stage === 'INITIAL_MESSAGE_SENT' || lead.stage === 'FOLLOW_UP_1' || lead.stage === 'FOLLOW_UP_2') {
    await moveStage(db, leadId, lead.stage, 'ACTIVE_COMMUNICATION', null)
  }
}

/**
 * Staff wrote to the customer from the ERP (or from the Instagram app — Meta echoes those).
 * First message → Initial Message Sent. Writing again ≥ FOLLOW_UP_GAP_HOURS after our last
 * message with no answer in between → 1st Follow-Up, then 2nd Follow-Up.
 */
export async function recordLeadOutbound(db: PrismaClient, leadId: string, userId: string | null, at = new Date()): Promise<void> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { stage: true, lastInboundAt: true, lastOutboundAt: true } })
  if (!lead) return
  const prevOut = lead.lastOutboundAt
  if (!prevOut || prevOut < at) {
    await db.lead.update({ where: { id: leadId }, data: { lastOutboundAt: at } })
  }

  if (lead.stage === 'NEW') return moveStage(db, leadId, 'NEW', 'INITIAL_MESSAGE_SENT', userId)

  const unanswered = !!prevOut && (!lead.lastInboundAt || lead.lastInboundAt < prevOut)
  const gapReached = !!prevOut && at.getTime() - prevOut.getTime() >= FOLLOW_UP_GAP_HOURS * HOUR
  if (!unanswered || !gapReached) return
  if (lead.stage === 'INITIAL_MESSAGE_SENT' || lead.stage === 'ACTIVE_COMMUNICATION') return moveStage(db, leadId, lead.stage, 'FOLLOW_UP_1', userId)
  if (lead.stage === 'FOLLOW_UP_1') return moveStage(db, leadId, 'FOLLOW_UP_1', 'FOLLOW_UP_2', userId)
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
 * Booking-driven stages for every lead linked to this booking: created → Send Booking
 * Confirmation, first invoice generated → Send Invoice 1, first payment confirmed → Won.
 * Only ever moves forward (a lead at Won never drops back to Invoice), but does pull a lead out
 * of the conversation stages or Lost — a booking means it wasn't lost after all.
 * Call after creating a booking, generating an invoice or confirming a payment.
 */
export async function syncLeadStageFromBooking(db: PrismaClient, bookingId: string, userId: string | null): Promise<void> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      status: true, depositPaid: true,
      payments: { select: { status: true, invoiceGeneratedAt: true } },
      pipelineLeads: { select: { id: true, stage: true } },
    },
  })
  if (!booking || booking.pipelineLeads.length === 0 || booking.status === 'cancelled' || booking.status === 'on_hold') return

  const paid = booking.depositPaid > 0 || booking.payments.some(p => p.status === 'confirmed')
    || ['partially_paid', 'fully_paid', 'completed'].includes(booking.status)
  const invoiced = booking.payments.some(p => p.invoiceGeneratedAt && !['cancelled', 'rejected'].includes(p.status))
  const target: LeadStage = paid ? 'CLOSED_WON' : invoiced ? 'INVOICE_SENT' : 'BOOKING_CONFIRMATION'
  const targetRank = BOOKING_STAGES.indexOf(target)

  for (const lead of booking.pipelineLeads) {
    const rank = BOOKING_STAGES.indexOf(lead.stage)
    if (rank >= targetRank) continue
    await moveStage(db, lead.id, lead.stage, target, userId)
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
