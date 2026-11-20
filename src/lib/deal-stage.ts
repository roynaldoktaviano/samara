import type { LeadLostReason, LeadStage, Prisma, PrismaClient } from '@prisma/client'
import {
  DEAL_PAYMENT_STATUS_LABEL, TRIP_TYPE_REQUIRED_STAGES, WON_PAYMENT_STATUSES, isDealPaymentStatus, isLeadLostReason, isLeadStage, LEAD_STAGE_LABEL,
} from '@/lib/lead-pipeline'
import { roleMatches } from '@/lib/role-utils'
import { isClosedDealStage } from '@/lib/deal-maker'

// Manual deal edits from the Sales Pipeline board, the Leads page and the chat lead panel.
// Won / Lost deals are read-only (go-live parity B4): only ADMIN may move a closed deal (reopen /
// switch Won↔Lost), and every such move is written on the deal's timeline. The automatic hooks
// (lead-stage-auto.ts) never touch closed deals; the Freshsales sync is the one system writer that
// still may, because Freshsales is the source of truth until cutover.

export const CLOSED_READ_ONLY_MSG = 'This deal is Won / Lost and read-only. Ask an admin to reopen it.'
export const TRIP_TYPE_NEEDED_MSG = (stage: LeadStage) => `Set the trip type (Private Charter / Open Trip) before moving this deal to ${LEAD_STAGE_LABEL[stage]}.`
export const PAYMENT_NEEDED_MSG = 'Pick the payment status (deposit paid or paid in full) to mark this deal Won.'

// Stage history rows written in this transaction are labelled MANUAL (deal_stage_history trigger).
const asManual = (tx: Prisma.TransactionClient) => tx.$executeRaw`SELECT set_config('app.stage_source', 'MANUAL', true)`

/** Deals a user may see/edit: SALES their own (deal owner, or owner of the deal's lead); others all. */
export function dealAccessScope(role: string | null | undefined, userId: string): Prisma.DealWhereInput {
  return role === 'SALES' ? { OR: [{ ownerId: userId }, { lead: { ownerId: userId } }] } : {}
}

/** The lead's primary deal — newest open, else newest (same rule as the DB mirror trigger). */
export async function primaryDealOfLead(db: PrismaClient, leadId: string) {
  const deals = await db.deal.findMany({ where: { leadId, deletedAt: null }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, stage: true } })
  return deals.find(d => !isClosedDealStage(d.stage)) ?? deals[0] ?? null
}

export type StageChangeResult = { ok: true } | { ok: false; status: number; error: string }

export async function changeDealStage(db: PrismaClient, p: {
  dealId: string
  stage: unknown
  lostReason?: unknown
  lostNote?: unknown
  paymentStatus?: unknown
  user: { id: string; name?: string | null; role: string }
}): Promise<StageChangeResult> {
  if (!isLeadStage(p.stage)) return { ok: false, status: 400, error: 'Invalid stage' }
  const target = p.stage as LeadStage
  const deal = await db.deal.findFirst({ where: { id: p.dealId, deletedAt: null, ...dealAccessScope(p.user.role, p.user.id) }, select: { id: true, stage: true, tripType: true, paymentStatus: true } })
  if (!deal) return { ok: false, status: 404, error: 'Not found' }
  if (deal.stage === target) return { ok: false, status: 409, error: `Already in ${LEAD_STAGE_LABEL[target]}` }
  const isAdmin = roleMatches(p.user.role, ['ADMIN'])
  if (isClosedDealStage(deal.stage) && !isAdmin) return { ok: false, status: 409, error: CLOSED_READ_ONLY_MSG }
  if (target === 'CLOSED_LOST' && !isLeadLostReason(p.lostReason)) return { ok: false, status: 400, error: 'Pick a lost reason before marking this deal as Lost.' }
  // Parity C3: trip type confirmed before In Active Communication (and the booking stages after it)
  if (TRIP_TYPE_REQUIRED_STAGES.includes(target) && !deal.tripType) return { ok: false, status: 400, error: TRIP_TYPE_NEEDED_MSG(target) }
  // Parity C3: Won (= deposit received) needs the payment status
  const payment = isDealPaymentStatus(p.paymentStatus) ? p.paymentStatus : deal.paymentStatus
  if (target === 'CLOSED_WON' && !(isDealPaymentStatus(payment) && WON_PAYMENT_STATUSES.includes(payment))) return { ok: false, status: 400, error: PAYMENT_NEEDED_MSG }

  const note = typeof p.lostNote === 'string' && p.lostNote.trim() ? p.lostNote.trim() : null
  await db.$transaction(async tx => {
    await asManual(tx)
    await tx.deal.update({
      where: { id: deal.id },
      data: {
        stage: target, stageUpdatedAt: new Date(), stageUpdatedById: p.user.id,
        ...(target === 'CLOSED_LOST' ? { lostReason: p.lostReason as LeadLostReason, lostNote: note } : { lostReason: null, lostNote: null }),
        ...(target === 'CLOSED_WON' && isDealPaymentStatus(p.paymentStatus) ? { paymentStatus: p.paymentStatus } : {}),
      },
    })
  })
  if (target === 'CLOSED_WON' && isDealPaymentStatus(payment)) {
    await db.dealNote.create({ data: { dealId: deal.id, kind: 'SYSTEM', body: `Marked Won — ${DEAL_PAYMENT_STATUS_LABEL[payment]}`, createdById: p.user.id } })
  }
  if (isClosedDealStage(deal.stage)) {
    await db.dealNote.create({ data: { dealId: deal.id, kind: 'SYSTEM', body: `${LEAD_STAGE_LABEL[deal.stage]} deal moved to ${LEAD_STAGE_LABEL[target]} by ${p.user.name ?? 'an admin'}`, createdById: p.user.id } })
  }
  return { ok: true }
}

/** Trip fields of a deal edited by hand; refused on a Won / Lost deal unless ADMIN (or nothing changes). */
export async function updateDealFields(db: PrismaClient, p: {
  dealId: string
  data: { tripType?: 'PRIVATE_CHARTER' | 'OPEN_TRIP' | null; productInterest?: string | null; amount?: number | null; currency?: string | null; travelStartDate?: Date | null; travelEndDate?: Date | null; guestCount?: number | null }
  role: string
}): Promise<StageChangeResult> {
  const deal = await db.deal.findUnique({ where: { id: p.dealId }, select: { stage: true, stageUpdatedAt: true, leadId: true, tripType: true, productInterest: true, amount: true, currency: true, travelStartDate: true, travelEndDate: true, guestCount: true } })
  if (!deal) return { ok: false, status: 404, error: 'Not found' }
  if (p.data.tripType === null && deal.tripType && TRIP_TYPE_REQUIRED_STAGES.includes(deal.stage)) {
    return { ok: false, status: 400, error: `A deal in ${LEAD_STAGE_LABEL[deal.stage]} needs its trip type — it can be changed, not cleared.` }
  }
  const changed: Prisma.DealUpdateInput = {}
  for (const [k, v] of Object.entries(p.data) as [keyof typeof deal, unknown][]) {
    if (v === undefined) continue
    const cur = deal[k] as unknown
    const same = v instanceof Date || cur instanceof Date ? (cur ? +(cur as Date) : null) === (v ? +(v as Date) : null) : (cur ?? null) === (v ?? null)
    if (!same) (changed as Record<string, unknown>)[k] = v
  }
  if (!Object.keys(changed).length) return { ok: true }
  if (isClosedDealStage(deal.stage) && !roleMatches(p.role, ['ADMIN'])) return { ok: false, status: 409, error: CLOSED_READ_ONLY_MSG }
  await db.deal.update({ where: { id: p.dealId }, data: changed })
  // Trip type just confirmed on a deal the guest already answered → it can now enter In Active
  // Communication (the automatic move waits for the trip type, see lead-stage-auto.ts).
  if (!deal.tripType && changed.tripType && deal.leadId && (deal.stage === 'INITIAL_MESSAGE_SENT' || deal.stage === 'FOLLOW_UP_1' || deal.stage === 'FOLLOW_UP_2')) {
    const lead = await db.lead.findUnique({ where: { id: deal.leadId }, select: { lastInboundAt: true } })
    if (lead?.lastInboundAt && (!deal.stageUpdatedAt || lead.lastInboundAt > deal.stageUpdatedAt)) {
      await db.deal.updateMany({ where: { id: p.dealId, stage: deal.stage }, data: { stage: 'ACTIVE_COMMUNICATION', stageUpdatedAt: new Date(), stageUpdatedById: null } })
    }
  }
  return { ok: true }
}
