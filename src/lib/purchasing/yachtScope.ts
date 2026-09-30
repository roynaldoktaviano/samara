import type { Prisma, PrismaClient } from '@prisma/client'

// The yacht a BOAT_CAPTAIN/CRUISE_DIRECTOR user is captain/director of (User.assignedYachtId) —
// nothing in the session/JWT carries this (see src/lib/auth.ts), so it's resolved fresh per
// request. Null if nobody's assigned them a yacht yet, in which case the where/check below
// show nothing rather than the full company-wide queue. Mirrors resolveWarehouseLocationId
// in warehouseScope.ts.
export async function resolveAssignedYachtId(db: PrismaClient, userId: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { assignedYachtId: true } })
  return user?.assignedYachtId ?? null
}

// Scopes what a Boat Captain/Cruise Director can see to exactly the PO's whose final
// destination is their own yacht — never the full company-wide PO queue, and never a PO
// headed to a different yacht. Mirrors warehouseOrderWhere in warehouseScope.ts.
export function yachtOrderWhere(yachtId: string | null): Prisma.PurchaseOrderWhereInput {
  if (!yachtId) return { id: '__none__' } // not assigned a yacht yet — show nothing
  return { deliveryLocation: { yachtId } }
}

// Same rule as yachtOrderWhere, applied in JS to a single already-fetched PO (the detail
// route can't reuse a Prisma where clause after findUnique). Mirrors warehouseCanViewOrder.
export function yachtCanViewOrder(
  order: { deliveryLocation: { yachtId: string | null } | null },
  yachtId: string | null,
): boolean {
  return !!yachtId && order.deliveryLocation?.yachtId === yachtId
}

// The crew of a Boat Captain/Cruise Director's assigned yacht: employees whose work location
// name matches the yacht's name (the same crew↔yacht link payroll uses, see
// matchEmployeesToYachts in src/lib/payroll.ts). Matches nobody if no yacht is assigned.
export async function yachtCrewWhere(db: PrismaClient, userId: string): Promise<Prisma.EmployeeWhereInput> {
  const yachtId = await resolveAssignedYachtId(db, userId)
  const yacht = yachtId ? await db.yacht.findUnique({ where: { id: yachtId }, select: { name: true } }) : null
  if (!yacht) return { id: '__none__' }
  return { location: { name: { equals: yacht.name.trim(), mode: 'insensitive' } } }
}
