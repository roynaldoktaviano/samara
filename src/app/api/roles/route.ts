import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { getDb } from '@/lib/get-db'
import { navigationItems, NAV_GROUPS } from '@/lib/nav-items'
import { ALL_ROLES, effectiveModulesFromOverride } from '@/lib/role-permissions'

// Admin screen data: for each of the 10 roles, its effective module list (an admin
// override if one's been saved, else the hardcoded default) — plus the module catalog
// to render the checklist against.
export async function GET() {
  const auth = await requireRole(['ADMIN', 'SUPER_ADMIN'])
  if (!auth.ok) return auth.response
  const db = await getDb(auth.session)

  const overrides = await db.roleModuleAccess.findMany()
  const overrideMap = new Map(overrides.map(o => [o.role, o.modules]))

  const roles = ALL_ROLES.map(role => ({
    role,
    modules: effectiveModulesFromOverride(role, overrideMap.get(role) ?? null),
    isCustomized: overrideMap.has(role),
  }))

  const modules = navigationItems.map(item => ({
    id: item.id, label: item.label, group: item.group, subGroup: item.subGroup, feature: item.feature,
  }))

  return NextResponse.json({ roles, modules, groups: NAV_GROUPS.map(g => ({ key: g.key, label: g.label })) })
}
