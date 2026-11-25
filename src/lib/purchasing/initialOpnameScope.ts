import type { PrismaClient, Prisma } from '@prisma/client'
import { roleMatches } from '@/lib/role-utils'
import { resolveWorkYachtId } from '@/lib/purchasing/yachtScope'

/**
 * Stock Opname Awal: a WAREHOUSE user may only set up warehouse (gudang) locations, never a
 * ship. Admin / Finance Director keep every location.
 */
export const isWarehouseOnly = (role: string) =>
  roleMatches(role, ['WAREHOUSE']) && !roleMatches(role, ['ADMIN', 'SUPER_ADMIN', 'FINANCE_DIRECTOR'])

/** CREW may only set up the yacht they work on (its vessel location + sub-locations). */
export const isCrewOnly = (role: string) =>
  roleMatches(role, ['CREW']) && !roleMatches(role, ['ADMIN', 'SUPER_ADMIN', 'FINANCE_DIRECTOR'])

export type InitialOpnameScope =
  | { kind: 'all' }
  | { kind: 'warehouse' }
  | { kind: 'yacht'; yachtId: string | null }

export async function resolveInitialOpnameScope(db: PrismaClient, role: string, userId: string): Promise<InitialOpnameScope> {
  if (isCrewOnly(role)) return { kind: 'yacht', yachtId: await resolveWorkYachtId(db, userId) }
  if (isWarehouseOnly(role)) return { kind: 'warehouse' }
  return { kind: 'all' }
}

/** Prisma filter on StockLocation for the scope. */
export function initialOpnameLocationWhere(scope: InitialOpnameScope): Prisma.StockLocationWhereInput {
  if (scope.kind === 'warehouse') return { type: 'WAREHOUSE' }
  if (scope.kind === 'yacht') return { yachtId: scope.yachtId ?? '__none__' }
  return {}
}

export function initialOpnameLocationAllowed(scope: InitialOpnameScope, location: { type: string; yachtId: string | null } | null): boolean {
  if (scope.kind === 'all') return true
  if (!location) return false
  if (scope.kind === 'warehouse') return location.type === 'WAREHOUSE'
  return !!scope.yachtId && location.yachtId === scope.yachtId
}

/** True when this initial opname (StockCount) is on a location the user may touch. */
export async function canUseInitialOpname(db: PrismaClient, role: string, stockCountId: string, userId: string): Promise<boolean> {
  const scope = await resolveInitialOpnameScope(db, role, userId)
  if (scope.kind === 'all') return true
  const count = await db.stockCount.findUnique({ where: { id: stockCountId }, select: { location: { select: { type: true, yachtId: true } } } })
  return initialOpnameLocationAllowed(scope, count?.location ?? null)
}
