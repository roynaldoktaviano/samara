import type { Prisma, PrismaClient } from '@prisma/client'

// The specific StockLocation a WAREHOUSE-role user is tied to, via their Employee record —
// nothing in the session/JWT carries this (see src/lib/auth.ts), so it's resolved fresh
// per request. Null if they have no Employee record or no home location set, in which
// case warehouseOrderWhere below falls back to "own PR's POs only".
export async function resolveWarehouseLocationId(db: PrismaClient, userId: string): Promise<string | null> {
  const employee = await db.employee.findUnique({ where: { userId }, select: { locationId: true } })
  return employee?.locationId ?? null
}

// Scopes what a WAREHOUSE user can see to exactly two things — never the full
// company-wide PO queue: POs from their own PR (mirrors the requestedById check on the PR
// list, src/app/api/purchasing/requests/route.ts), and POs delivering to or transiting
// through their home gudang, whether or not they requested it themselves.
export function warehouseOrderWhere(userId: string, locationId: string | null): Prisma.PurchaseOrderWhereInput {
  return {
    OR: [
      { request: { requestedById: userId } },
      ...(locationId ? [
        { deliveryLocationId: locationId },
        { transitStops: { some: { locationId } } },
      ] : []),
    ],
  }
}

// Same rule as warehouseOrderWhere, applied in JS to a single already-fetched PO (the
// detail route can't reuse a Prisma where clause after findUnique).
export function warehouseCanViewOrder(
  order: { deliveryLocationId: string | null; transitStops: { locationId: string }[]; request: { requestedById: string } | null },
  userId: string,
  locationId: string | null,
): boolean {
  return order.request?.requestedById === userId
    || (!!locationId && order.deliveryLocationId === locationId)
    || (!!locationId && order.transitStops.some(s => s.locationId === locationId))
}
