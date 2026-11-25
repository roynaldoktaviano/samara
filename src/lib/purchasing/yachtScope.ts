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

// PRs a Boat Captain/Cruise Director sees beyond their own submissions — every PR whose
// delivery location is their yacht (the vessel or one of its sub-locations), so they can
// follow crew requests through approval, Gudang and Purchasing, not just once a PO exists.
export function yachtRequestWhere(yachtId: string | null): Prisma.PurchaseRequestWhereInput {
  if (!yachtId) return { id: '__none__' } // not assigned a yacht yet — show nothing
  return { deliveryLocation: { yachtId } }
}

// Transfers a Cruise Director sees — only those to or from their own yacht (the vessel itself
// or one of its sub-locations like Bar/Galley, which carry the same yachtId).
export function yachtTransferWhere(yachtId: string | null): Prisma.StockTransferWhereInput {
  if (!yachtId) return { id: '__none__' } // not assigned a yacht yet — show nothing
  return { OR: [{ toLocation: { yachtId } }, { fromLocation: { yachtId } }] }
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

// The yacht a user actually works on, for ship crew (CREW role): their explicitly assigned yacht
// (User.assignedYachtId) if set, otherwise the yacht whose name matches the work location of the
// HR employee record linked to this login — the same crew↔yacht link payroll uses. Null if
// neither resolves, in which case callers show nothing rather than every ship.
export async function resolveWorkYachtId(db: PrismaClient, userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { assignedYachtId: true, employeeProfile: { select: { location: { select: { name: true } } } } },
  })
  if (user?.assignedYachtId) return user.assignedYachtId
  const locName = user?.employeeProfile?.location?.name?.trim()
  if (!locName) return null
  const yacht = await db.yacht.findFirst({ where: { deletedAt: null, name: { equals: locName, mode: 'insensitive' } }, select: { id: true } })
  return yacht?.id ?? null
}

// For routes shared with office roles: the yacht a CREW-only user is limited to ('__none__' if
// it can't be resolved, so Prisma filters match nothing), or null when the user isn't crew
// and keeps the route's normal access.
export async function crewScopeYachtId(db: PrismaClient, role: string, userId: string): Promise<string | null> {
  if (role !== 'CREW') return null
  return (await resolveWorkYachtId(db, userId)) ?? '__none__'
}
