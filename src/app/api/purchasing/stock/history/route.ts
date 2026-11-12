import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'
import { computeStockHistory } from '@/lib/purchasing/stockHistory'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

// Item by Location → row detail: the table's columns per PR / PO on its date (stockHistory.ts).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')
  const locationId = searchParams.get('locationId')
  if (!itemId || !locationId) return NextResponse.json({ error: 'itemId and locationId are required' }, { status: 400 })

  const result = await computeStockHistory(db, itemId, locationId)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(result)
}
