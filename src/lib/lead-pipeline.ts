// Sales Pipeline stages — same columns as the team's Freshsales Deals board (Roy, 2026-11-11).
// Most moves happen on their own (src/lib/lead-stage-auto.ts):
//   NEW (New Enquiry)          lead created from a form / WA / IG / Messenger / email
//   INITIAL_MESSAGE_SENT       first staff reply sent from the ERP
//   ACTIVE_COMMUNICATION       customer answered
//   FOLLOW_UP_1 / FOLLOW_UP_2  staff wrote again ≥ FOLLOW_UP_GAP_HOURS later with no answer
//   BOOKING_CONFIRMATION       a booking was created for this lead
//   INVOICE_SENT               the booking's first invoice was generated
//   CLOSED_WON                 first payment confirmed
//   CLOSED_LOST                manual only, with a reason
// Sales can still drag a card to any column — replies sent outside the ERP aren't seen.
export const LEAD_STAGES = [
  'NEW', 'INITIAL_MESSAGE_SENT', 'ACTIVE_COMMUNICATION', 'FOLLOW_UP_1', 'FOLLOW_UP_2',
  'BOOKING_CONFIRMATION', 'INVOICE_SENT', 'CLOSED_WON', 'CLOSED_LOST',
] as const
export type LeadStage = typeof LEAD_STAGES[number]

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  NEW: 'New Enquiry',
  INITIAL_MESSAGE_SENT: 'Initial Message Sent',
  ACTIVE_COMMUNICATION: 'In Active Communication',
  FOLLOW_UP_1: '1st Follow-Up',
  FOLLOW_UP_2: '2nd Follow-Up',
  BOOKING_CONFIRMATION: 'Send Booking Confirmation',
  INVOICE_SENT: 'Send Invoice 1',
  CLOSED_WON: 'Won',
  CLOSED_LOST: 'Lost',
}

export const LEAD_STAGE_COLOR: Record<LeadStage, string> = {
  NEW: 'bg-gray-100 text-gray-700',
  INITIAL_MESSAGE_SENT: 'bg-blue-100 text-blue-700',
  ACTIVE_COMMUNICATION: 'bg-sky-100 text-sky-700',
  FOLLOW_UP_1: 'bg-violet-100 text-violet-700',
  FOLLOW_UP_2: 'bg-purple-100 text-purple-700',
  BOOKING_CONFIRMATION: 'bg-amber-100 text-amber-700',
  INVOICE_SENT: 'bg-orange-100 text-orange-700',
  CLOSED_WON: 'bg-green-100 text-green-700',
  CLOSED_LOST: 'bg-red-100 text-red-700',
}

// Stages where the conversation is still running — message-driven auto moves and the
// follow-up reminder only touch these. From BOOKING_CONFIRMATION on, the booking drives it.
export const CONVERSATION_STAGES: readonly LeadStage[] = ['NEW', 'INITIAL_MESSAGE_SENT', 'ACTIVE_COMMUNICATION', 'FOLLOW_UP_1', 'FOLLOW_UP_2']
// Booking-driven stages, in order — the auto move only ever goes forward along these.
export const BOOKING_STAGES: readonly LeadStage[] = ['BOOKING_CONFIRMATION', 'INVOICE_SENT', 'CLOSED_WON']

export function isClosedStage(stage: LeadStage): boolean {
  return stage === 'CLOSED_WON' || stage === 'CLOSED_LOST'
}

export const LEAD_LOST_REASONS = ['PRICE', 'DATES', 'COMPETITOR', 'NO_RESPONSE', 'OTHER'] as const
export type LeadLostReason = typeof LEAD_LOST_REASONS[number]

export const LEAD_LOST_REASON_LABEL: Record<LeadLostReason, string> = {
  PRICE: 'Price too high',
  DATES: 'Dates not available',
  COMPETITOR: 'Chose a competitor',
  NO_RESPONSE: 'No response',
  OTHER: 'Other',
}

export function isLeadLostReason(value: unknown): value is LeadLostReason {
  return typeof value === 'string' && (LEAD_LOST_REASONS as readonly string[]).includes(value)
}

// Manual moves are free (as on the Freshsales board) — drag to any other column.
export function canTransition(from: LeadStage, to: LeadStage): boolean {
  return from !== to
}

export function isLeadStage(value: unknown): value is LeadStage {
  return typeof value === 'string' && (LEAD_STAGES as readonly string[]).includes(value)
}

// A staff message only counts as a follow-up when it comes this long after the previous one
// with no customer answer in between — a reply split over a few bubbles isn't a follow-up.
export const FOLLOW_UP_GAP_HOURS = 24
// Customer silent this long after our last message → card turns red and the owner is reminded.
export const FOLLOW_UP_DUE_DAYS = 3

// True when we wrote last and the customer has been silent FOLLOW_UP_DUE_DAYS since.
export function isFollowUpDue(lead: { stage: LeadStage; lastInboundAt: Date | string | null; lastOutboundAt: Date | string | null }, now = Date.now()): boolean {
  if (lead.stage === 'NEW' || !CONVERSATION_STAGES.includes(lead.stage) || !lead.lastOutboundAt) return false
  const out = new Date(lead.lastOutboundAt).getTime()
  if (lead.lastInboundAt && new Date(lead.lastInboundAt).getTime() >= out) return false
  return now - out >= FOLLOW_UP_DUE_DAYS * 24 * 60 * 60 * 1000
}
