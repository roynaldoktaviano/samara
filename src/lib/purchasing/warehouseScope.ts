import type { Prisma, PrismaClient } from '@prisma/client'
import { warehouseHomeLocationId } from '@/lib/purchasing/warehouseHome'

// The StockLocation a WAREHOUSE-role user works from = the home gudang (Gudang Labuan Bajo,
// see warehouseHome.ts) — the same warehouse their PR stock check always takes from.
// (This used to read Employee.locationId, but that points at an HR EmployeeWorkLocation,
// never a StockLocation, so the delivery/transit match below could never hit.) Null when
// the tenant has no such gudang, in which case warehouseOrderWhere falls back to
// "own PR's POs only".
export async function resolveWarehouseLocationId(db: PrismaClient, _userId: string): Promise<string | null> {
  return warehouseHomeLocationId(db)
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
