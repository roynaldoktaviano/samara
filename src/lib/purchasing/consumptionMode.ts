import type { StockConsumptionMode, StockLocationType } from '@prisma/client'

export const CONSUMPTION_MODES: StockConsumptionMode[] = ['HOLD_AS_STOCK', 'EXPENSE_ON_RECEIVE']

/**
 * When goods at a location count as used (pemakaian):
 * - HOLD_AS_STOCK: stays inventory; only becomes usage on POS sale, opname shrinkage,
 *   complimentary, or transfer out to an EXPENSE_ON_RECEIVE location.
 * - EXPENSE_ON_RECEIVE: becomes usage the moment a transfer is received here.
 * A POS bar always holds stock; an unset mode falls back to the location type.
 */
export function effectiveConsumptionMode(loc: {
  type: StockLocationType | string
  consumptionMode: StockConsumptionMode | null
  isPosBar: boolean
}): StockConsumptionMode {
  if (loc.isPosBar) return 'HOLD_AS_STOCK'
  if (loc.consumptionMode) return loc.consumptionMode
  return loc.type === 'VESSEL' ? 'EXPENSE_ON_RECEIVE' : 'HOLD_AS_STOCK'
}
