import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'
import { resolveOpnameScope } from '@/lib/inventory/opnameScope'

const OPNAME_ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR']

// Tells the Stock Opname page which ship the user is limited to (null yachtId + scoped = none assigned).
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, OPNAME_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  return NextResponse.json(await resolveOpnameScope(db, role, session.user.id))
}
