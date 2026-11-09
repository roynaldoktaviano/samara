// API-side gate that honors Roles & Permissions: a route lets a user in if their role is in
// the route's hardcoded fallback list OR an admin granted their role one of the route's
// modules via RoleModuleAccess. Without this, ticking a module for a role only makes the
// sidebar item appear while every API call behind it still 401s.
import { NextResponse } from 'next/server'
import { getServerSession, type Session } from 'next-auth'
import type { Role } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { getEffectiveModules } from '@/lib/role-permissions'
import { roleMatches } from '@/lib/role-utils'

type Db = Awaited<ReturnType<typeof getDb>>

export async function requireModuleAccess(
  moduleIds: string[],
  fallbackRoles: string[],
): Promise<{ session: Session; db: Db; role: string } | { error: NextResponse }> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role ?? ''
  if (!session?.user?.id || !role) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const db = await getDb(session)
  if (!roleMatches(role, fallbackRoles)) {
    const modules = await getEffectiveModules(db as unknown as Parameters<typeof getEffectiveModules>[0], role as Role)
    if (!moduleIds.some(m => modules.includes(m))) {
      return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
  }
  return { session, db, role }
}
