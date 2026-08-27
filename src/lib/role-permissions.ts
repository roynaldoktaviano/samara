import { navigationItems } from '@/lib/nav-items'
import { roleMatches } from '@/lib/role-utils'
import type { Role } from '@prisma/client'

// Every assignable value of the Role enum (prisma/schema.prisma). Kept as a plain literal
// list (not read off the enum at runtime) so this file has no dependency on Prisma Client
// generation order.
export const ALL_ROLES: Role[] = [
  'SUPER_ADMIN', 'ADMIN', 'SALES', 'FINANCE', 'MARKETING', 'PURCHASING', 'WAREHOUSE', 'HR',
  'SALES_MARKETING', 'FINANCE_DIRECTOR', 'CREW', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR',
]

// ADMIN/SUPER_ADMIN can never lose access to these two modules, no matter what an override
// row says — otherwise an admin could accidentally lock every admin out of Roles &
// Permissions itself with no UI left to undo it.
const ALWAYS_ON: Partial<Record<Role, string[]>> = {
  ADMIN: ['users', 'roles'],
  SUPER_ADMIN: ['users', 'roles'],
}

/** Modules a role can never have unchecked (used to grey out those checkboxes client-side too). */
export function getForcedModules(role: Role): string[] {
  return ALWAYS_ON[role] ?? []
}

/** The hardcoded fallback access list for a role — what it had before any admin override. */
export function defaultModulesForRole(role: string): string[] {
  return navigationItems.filter(item => roleMatches(role, item.roles)).map(item => item.id)
}

/** DB override (if any) merged with the always-on set, else the hardcoded default. */
export function effectiveModulesFromOverride(role: Role, overrideModules: string[] | null): string[] {
  const modules = overrideModules ?? defaultModulesForRole(role)
  const forced = ALWAYS_ON[role] ?? []
  return Array.from(new Set([...modules, ...forced]))
}

type ModuleAccessDb = {
  roleModuleAccess: {
    findUnique: (args: { where: { role: Role } }) => Promise<{ modules: string[] } | null>
  }
}

export async function getEffectiveModules(db: ModuleAccessDb, role: Role): Promise<string[]> {
  const row = await db.roleModuleAccess.findUnique({ where: { role } })
  return effectiveModulesFromOverride(role, row?.modules ?? null)
}
