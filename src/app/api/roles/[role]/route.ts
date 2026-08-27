import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { getDb } from '@/lib/get-db'
import { navigationItems } from '@/lib/nav-items'
import { ALL_ROLES, effectiveModulesFromOverride } from '@/lib/role-permissions'
import type { Role } from '@prisma/client'

const VALID_MODULE_IDS = new Set(navigationItems.map(item => item.id))

export async function PUT(req: NextRequest, { params }: { params: Promise<{ role: string }> }) {
  const auth = await requireRole(['ADMIN', 'SUPER_ADMIN'])
  if (!auth.ok) return auth.response
  const { role } = await params
  if (!ALL_ROLES.includes(role as Role)) return NextResponse.json({ error: 'Unknown role' }, { status: 400 })

  const { modules } = await req.json()
  if (!Array.isArray(modules) || modules.some((m: unknown) => typeof m !== 'string' || !VALID_MODULE_IDS.has(m as never))) {
    return NextResponse.json({ error: 'modules must be an array of valid module ids' }, { status: 400 })
  }

  const db = await getDb(auth.session)
  const saved = await db.roleModuleAccess.upsert({
    where: { role: role as Role },
    create: { role: role as Role, modules },
    update: { modules },
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
