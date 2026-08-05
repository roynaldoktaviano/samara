import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { roleMatches } from '@/lib/role-utils'
import type { Session } from 'next-auth'

export type AppRole = 'SUPER_ADMIN' | 'ADMIN' | 'SALES' | 'FINANCE' | 'MARKETING' | 'PURCHASING' | 'WAREHOUSE' | 'HR' | 'SALES_MARKETING' | 'FINANCE_DIRECTOR'

type RoleCheckResult =
  | { ok: true; session: Session }
  | { ok: false; response: NextResponse }

/**
 * Centralized session + role check for API routes. Returns 401 if not logged in,
 * 403 if logged in but the role isn't in `allowed`. Designed to chain straight
 * into the existing getDb(session) call every route already makes:
 *
 *   const auth = await requireRole(['ADMIN', 'SUPER_ADMIN'])
 *   if (!auth.ok) return auth.response
 *   const db = await getDb(auth.session)
 */
export async function requireRole(allowed: AppRole[]): Promise<RoleCheckResult> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const role = (session.user as { role?: string }).role ?? ''
  if (!roleMatches(role, allowed)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, session }
}
