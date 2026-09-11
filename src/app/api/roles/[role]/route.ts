import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { getDb } from '@/lib/get-db'
import { navigationItems, type View } from '@/lib/nav-items'
import { ALL_ROLES, effectiveModulesFromOverride } from '@/lib/role-permissions'
import type { Role } from '@prisma/client'

const VALID_MODULE_IDS = new Set(navigationItems.map(item => item.id))

export async function PUT(req: NextRequest, { params }: { params: Promise<{ role: string }> }) {
  const auth = await requireRole(['ADMIN', 'SUPER_ADMIN'])
  if (!auth.ok) return auth.response
  const { role } = await params
  if (!ALL_ROLES.includes(role as Role)) return NextResponse.json({ error: 'Unknown role' }, { status: 400 })

  const { modules } = await req.json()
  if (!Array.isArray(modules) || modules.some((m: unknown) => typeof m !== 'string')) {
    return NextResponse.json({ error: 'modules must be an array of strings' }, { status: 400 })
  }
  // The client round-trips the role's whole existing module list back on every save
  // (see RolesPermissions.tsx), so a stale id left over from a since-renamed/removed
  // nav item (e.g. a module id that no longer exists in navigationItems) would
  // otherwise hard-block every future save for that role, not just the one item that
  // actually changed. Silently drop anything no longer recognized instead of
  // rejecting the whole request — self-healing on the next save.
  const validModules = (modules as string[]).filter(m => VALID_MODULE_IDS.has(m as View))

  const db = await getDb(auth.session)
  const saved = await db.roleModuleAccess.upsert({
    where: { role: role as Role },
    create: { role: role as Role, modules: validModules },
    update: { modules: validModules },
  })

  return NextResponse.json({
    role: saved.role,
    modules: effectiveModulesFromOverride(saved.role, saved.modules),
    isCustomized: true,
  })
}

// Resets a role back to its hardcoded default by deleting the override row.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ role: string }> }) {
  const auth = await requireRole(['ADMIN', 'SUPER_ADMIN'])
  if (!auth.ok) return auth.response
  const { role } = await params
  if (!ALL_ROLES.includes(role as Role)) return NextResponse.json({ error: 'Unknown role' }, { status: 400 })

  const db = await getDb(auth.session)
  await db.roleModuleAccess.deleteMany({ where: { role: role as Role } })

  return NextResponse.json({
    role,
    modules: effectiveModulesFromOverride(role as Role, null),
    isCustomized: false,
  })
}
