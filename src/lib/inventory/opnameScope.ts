import type { PrismaClient } from '@prisma/client'
import { roleMatches } from '@/lib/role-utils'
import { resolveAssignedYachtId } from '@/lib/purchasing/yachtScope'

/**
 * Which ship a user may run Inventory Stock Opname on. Boat Captain / Cruise Director are
 * limited to their assigned yacht (User.assignedYachtId) — or nothing, if none is assigned
 * yet. Every other opname role (Purchasing, Warehouse, Admin) sees all locations.
 */
export type OpnameScope = { scoped: false } | { scoped: true; yachtId: string | null }

export async function resolveOpnameScope(db: PrismaClient, role: string, userId: string): Promise<OpnameScope> {
  if (!roleMatches(role, ['BOAT_CAPTAIN', 'CRUISE_DIRECTOR'])) return { scoped: false }
  return { scoped: true, yachtId: await resolveAssignedYachtId(db, userId) }
}

export function opnameLocationAllowed(scope: OpnameScope, location: { yachtId: string | null } | null): boolean {
  if (!scope.scoped) return true
  return !!scope.yachtId && location?.yachtId === scope.yachtId
}
