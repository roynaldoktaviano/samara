import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { crewScopeYachtId } from '@/lib/purchasing/yachtScope'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE', 'CREW']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')
  const itemName = searchParams.get('itemName')
  const locationId = searchParams.get('locationId')
  if ((!itemId && !itemName) || !locationId) return NextResponse.json({ error: 'itemId or itemName, and locationId, are required' }, { status: 400 })

  // Crew: only locations on the yacht they work on.
  const crewYachtId = await crewScopeYachtId(db, role, session.user.id)
  if (crewYachtId) {
    const loc = await db.stockLocation.findUnique({ where: { id: locationId }, select: { yachtId: true } })
    if (loc?.yachtId !== crewYachtId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const lots = await db.stockLot.findMany({
    where: itemId ? { itemId, locationId, quantity: { gt: 0 } } : { itemId: null, itemName, locationId, quantity: { gt: 0 } },
    orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json(lots)
}
