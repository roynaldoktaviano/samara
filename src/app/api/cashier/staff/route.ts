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

  const location = await withRetry(db, () => db.stockLocation.findFirst({
    where: { yachtId, type: 'VESSEL', isActive: true },
    select: { id: true },
  }))
  if (!location) return NextResponse.json({ error: 'No vessel stock location for this yacht' }, { status: 404 })

  const employees = await withRetry(db, () => db.employee.findMany({
    where: { isActive: true, locationId: location.id },
    select: { id: true, fullName: true, department: true },
    orderBy: { fullName: 'asc' },
  }))

  return NextResponse.json(employees)
}
