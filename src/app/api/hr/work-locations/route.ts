import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { getVesselLocationIds } from '@/lib/hr/vessel-locations'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const [locations, vesselIds] = await Promise.all([
    db.employeeWorkLocation.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    getVesselLocationIds(db),
  ])
  return NextResponse.json(locations.map(l => ({ ...l, isVessel: vesselIds.has(l.id) })))
}
