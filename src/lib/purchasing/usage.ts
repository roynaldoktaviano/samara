import type { PrismaClient, StockConsumptionMode, StockLocationType } from '@prisma/client'
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

type ArrivalLocation = UsageLocation & { id: string }
const ARRIVAL_LOCATION_SELECT = { id: true, ...USAGE_LOCATION_SELECT } as const

/**
 * Which location an item really lands in when goods arrive on a yacht, by item type — so the
 * sender only has to pick the ship, not the right sub-location:
 * - BEVERAGE → the yacht's POS bar, held as stock (usage only on POS sale/complimentary/opname).
 * - anything else arriving at the POS bar → the vessel itself, so it's usage on arrival.
 * - otherwise (or off-yacht, or the yacht has no POS bar/vessel row) → the original location.
 * Only meant for a final destination — never a transit stop the goods are forwarded from.
 */
export async function shipArrivalRouter(
  db: Pick<PrismaClient, 'stockLocation'>,
  toLocationId: string,
): Promise<(itemType: string | null | undefined) => ArrivalLocation | null> {
  const toLoc = await db.stockLocation.findUnique({ where: { id: toLocationId }, select: ARRIVAL_LOCATION_SELECT })
  if (!toLoc?.yachtId) return () => toLoc
  const yachtLoc = toLoc
  const [bar, vessel] = await Promise.all([
    db.stockLocation.findFirst({ where: { yachtId: toLoc.yachtId, isPosBar: true, isActive: true }, select: ARRIVAL_LOCATION_SELECT }),
    db.stockLocation.findFirst({ where: { yachtId: toLoc.yachtId, parentId: null, type: 'VESSEL', isActive: true }, select: ARRIVAL_LOCATION_SELECT }),
  ])
  return itemType => {
    if (itemType === 'BEVERAGE') return bar ?? yachtLoc
    if (yachtLoc.isPosBar) return vessel ?? yachtLoc
    return yachtLoc
  }
}
