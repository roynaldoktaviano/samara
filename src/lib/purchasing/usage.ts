import type { StockConsumptionMode, StockLocationType } from '@prisma/client'
import { effectiveConsumptionMode } from '@/lib/purchasing/consumptionMode'

export interface UsageLocation {
  type: StockLocationType | string
  consumptionMode: StockConsumptionMode | null
  isPosBar: boolean
  yachtId: string | null
}

export const USAGE_LOCATION_SELECT = { type: true, consumptionMode: true, isPosBar: true, yachtId: true } as const

/**
 * Whether goods arriving at `to` (from `from`, or straight from a supplier when `from` is null)
 * count as ship usage (pemakaian):
 * - stock → usage location: +1, charged to the destination's yacht (the normal "sent to the ship").
 * - usage location → stock: -1, a reversal charged back to the source's yacht (returned unused).
 * - stock → stock, usage → usage: null — nothing new was used (already expensed, or still stock).
 */
export function shipUsageOnArrival(from: UsageLocation | null, to: UsageLocation): { sign: 1 | -1; yachtId: string | null } | null {
  const fromExpensed = from ? effectiveConsumptionMode(from) === 'EXPENSE_ON_RECEIVE' : false
  const toExpensed = effectiveConsumptionMode(to) === 'EXPENSE_ON_RECEIVE'
  if (toExpensed && !fromExpensed) return { sign: 1, yachtId: to.yachtId }
  if (fromExpensed && !toExpensed) return { sign: -1, yachtId: from!.yachtId }
  return null
}
