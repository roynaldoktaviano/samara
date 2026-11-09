import type { getDb } from '@/lib/get-db'

type Db = Awaited<ReturnType<typeof getDb>>

// A Warehouse-approved Reserve takes stock the moment the line is Approved — not only once
// "Process Purchase Request" turns it into a PENDING transfer. Until then it's a hold: a line that
// is Approved (Reserve > 0, source warehouse set) but not yet decided, on a PR still in Warehouse
// review. Every "free stock" calculation subtracts these alongside PENDING transfers out, so no
// other PR / backorder / transfer can promise the same units. Unapprove (or the PR leaving
// Warehouse review — cancelled, rejected, processed) releases the hold by itself: nothing is
// written anywhere, it's derived from the line. Quantities are base units, like StockLot.
export async function approvedHolds(
  db: Pick<Db, 'purchaseRequestItem'>,
  opts: { itemIds?: string[]; locationId?: string; excludeRequestId?: string; excludeRequestItemId?: string } = {},
) {
  const rows = await db.purchaseRequestItem.findMany({
    where: {
      ...(opts.itemIds ? { itemId: { in: opts.itemIds } } : { itemId: { not: null } }),
      ...(opts.locationId ? { warehouseFromLocationId: opts.locationId } : { warehouseFromLocationId: { not: null } }),
      ...(opts.excludeRequestItemId ? { id: { not: opts.excludeRequestItemId } } : {}),
      viaWarehouse: true,
      warehouseApprovedAt: { not: null },
      warehouseReserveQty: { gt: 0 },
      warehouseDecision: null,
      convertedAt: null,
      verifyRejectedAt: null,
      request: {
        status: { in: ['DRAFT', 'ON_PROCESS'] },
        warehouseDoneAt: null,
        ...(opts.excludeRequestId ? { id: { not: opts.excludeRequestId } } : {}),
      },
    },
    select: { itemId: true, warehouseFromLocationId: true, warehouseReserveQty: true, requestId: true },
  })
  const holds = new Map<string, number>() // key `${itemId}:${locationId}`
  const byRequest: { requestId: string; key: string; qty: number }[] = []
  for (const r of rows) {
    const key = `${r.itemId}:${r.warehouseFromLocationId}`
    holds.set(key, (holds.get(key) ?? 0) + (r.warehouseReserveQty ?? 0))
    byRequest.push({ requestId: r.requestId, key, qty: r.warehouseReserveQty ?? 0 })
  }
  return { holds, byRequest }
}
