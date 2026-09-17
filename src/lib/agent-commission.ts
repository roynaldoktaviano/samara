/**
 * Single source of truth for resolving an agent's commission rate on a booking.
 * Normally the rate is derived from the booking's tripType (Open Trip vs Private
 * Charter); `useB2BCommission` lets sales override that and use the agent's flat
 * B2B rate instead, regardless of tripType.
 */

export type CommissionAgent = {
  commissionOpenTrip?: number | null
  commissionPrivateCharter?: number | null
  commissionB2B?: number | null
} | null | undefined

export function getAgentCommissionPct(
  agent: CommissionAgent,
  tripType: string | null | undefined,
  useB2BCommission?: boolean | null
): number {
  if (!agent) return 0
  if (useB2BCommission) return agent.commissionB2B ?? 0
  return tripType === 'OPEN_TRIP' ? (agent.commissionOpenTrip ?? 0) : (agent.commissionPrivateCharter ?? 0)
}
