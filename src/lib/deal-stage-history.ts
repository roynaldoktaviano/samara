import type { LeadStage, PrismaClient } from '@prisma/client'

// Stage history of deals (parity C2): every stage a deal entered, with when, kept in DealStageChange
// by DB trigger deal_stage_history (any writer: sales, ERP automation, Freshsales sync) plus the
// Freshsales timeline for deals that came from Freshsales (importFreshsalesStageHistory).
// The conversion time of an offline upload is when a deal FIRST reached a stage group:
//   AC       In Active Communication — the follow-ups count as past AC (handover: "1st / 2nd
//            Follow-Up counts as past AC"), and so does every booking stage after them
//   BOOKING  Send Booking Confirmation (Google "CRM Booking won" starts here) or later
//   INVOICE  Send Invoice 1 or Won
//   WON      Won (= deposit received)

export const CONVERSION_STAGE_GROUPS = {
  AC: ['ACTIVE_COMMUNICATION', 'FOLLOW_UP_1', 'FOLLOW_UP_2', 'BOOKING_CONFIRMATION', 'INVOICE_SENT', 'CLOSED_WON'],
  BOOKING: ['BOOKING_CONFIRMATION', 'INVOICE_SENT', 'CLOSED_WON'],
  INVOICE: ['INVOICE_SENT', 'CLOSED_WON'],
  WON: ['CLOSED_WON'],
} as const satisfies Record<string, readonly LeadStage[]>
export type ConversionGroup = keyof typeof CONVERSION_STAGE_GROUPS

/** First time each deal reached any stage of `group` (deals that never did are absent). */
export async function firstReachedAt(db: PrismaClient, dealIds: string[], group: ConversionGroup): Promise<Map<string, Date>> {
  if (!dealIds.length) return new Map()
  const rows = await db.dealStageChange.groupBy({
    by: ['dealId'],
    where: { dealId: { in: dealIds }, toStage: { in: [...CONVERSION_STAGE_GROUPS[group]] } },
    _min: { changedAt: true },
  })
  return new Map(rows.filter(r => r._min.changedAt).map(r => [r.dealId, r._min.changedAt!]))
}

/** All conversion times of the given deals at once — { AC, BOOKING, INVOICE, WON } per deal. */
export async function dealConversionTimes(db: PrismaClient, dealIds: string[]): Promise<Map<string, Partial<Record<ConversionGroup, Date>>>> {
  const out = new Map<string, Partial<Record<ConversionGroup, Date>>>()
  for (const g of Object.keys(CONVERSION_STAGE_GROUPS) as ConversionGroup[]) {
    for (const [id, at] of await firstReachedAt(db, dealIds, g)) out.set(id, { ...(out.get(id) ?? {}), [g]: at })
  }
  return out
}
