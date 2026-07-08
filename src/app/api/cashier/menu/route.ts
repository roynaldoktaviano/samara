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

  const location = await withRetry(() => db.stockLocation.findFirst({
    where: { yachtId, type: 'VESSEL', isActive: true },
    select: { id: true },
  }))
  if (!location) return NextResponse.json({ error: 'No vessel stock location for this yacht' }, { status: 404 })

  const [items, lots] = await Promise.all([
    withRetry(() => db.purchaseItem.findMany({
      where: { isActive: true, isSoldInPos: true, type: { in: ['FOOD', 'BEVERAGE'] } },
      select: { id: true, name: true, type: true, category: true, baseUnit: true, sellingPrice: true, imageKey: true },
      orderBy: [{ type: 'asc' }, { category: 'asc' }, { name: 'asc' }],
    })),
    withRetry(() => db.stockLot.findMany({
      where: { locationId: location.id },
      select: { itemId: true, quantity: true },
    })),
  ])

  const stockMap = new Map<string, number>()
  for (const lot of lots) stockMap.set(lot.itemId, (stockMap.get(lot.itemId) ?? 0) + lot.quantity)

  return NextResponse.json({
    locationId: location.id,
    items: items.map(i => ({ ...i, stock: stockMap.get(i.id) ?? 0 })),
  })
}
