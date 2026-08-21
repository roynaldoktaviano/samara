import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { withRetry } from '@/lib/db'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(request.url)
  const yachtId = searchParams.get('yachtId')
  if (!yachtId) return NextResponse.json({ error: 'yachtId is required' }, { status: 400 })

  // A yacht can have several VESSEL-type locations (the general crew location, plus
  // POS-stock sub-locations like "Bar"/"Galley") — crew are assigned to the general
  // one, so staff lookup has to span every VESSEL location for this yacht, not just
  // whichever one a bare findFirst happens to return (that's fine for stock lookups,
  // which only care about one specific bar/galley, but wrong here).
  const locations = await withRetry(db, () => db.stockLocation.findMany({
    where: { yachtId, type: 'VESSEL', isActive: true },
    select: { id: true },
  }))
  if (locations.length === 0) return NextResponse.json({ error: 'No vessel stock location for this yacht' }, { status: 404 })

  const employees = await withRetry(db, () => db.employee.findMany({
    where: { isActive: true, locationId: { in: locations.map(l => l.id) } },
    select: { id: true, fullName: true, department: true },
    orderBy: { fullName: 'asc' },
  }))

  return NextResponse.json(employees)
}
