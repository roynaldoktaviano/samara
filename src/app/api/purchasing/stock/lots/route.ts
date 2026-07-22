import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')
  const itemName = searchParams.get('itemName')
  const locationId = searchParams.get('locationId')
  if ((!itemId && !itemName) || !locationId) return NextResponse.json({ error: 'itemId or itemName, and locationId, are required' }, { status: 400 })

  const lots = await db.stockLot.findMany({
    where: itemId ? { itemId, locationId, quantity: { gt: 0 } } : { itemId: null, itemName, locationId, quantity: { gt: 0 } },
    orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json(lots)
}
