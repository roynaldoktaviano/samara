import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { withRetry } from '@/lib/db'
import { applyItemsToSale, type CashierCartItem } from '@/lib/cashier'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(request.url)
  const yachtId = searchParams.get('yachtId')
  const status  = searchParams.get('status')
  if (!yachtId) return NextResponse.json({ error: 'yachtId is required' }, { status: 400 })

  const sales = await withRetry(() => db.cashierSale.findMany({
    where: { yachtId, ...(status ? { status } : {}) },
    include: { items: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  }))

  return NextResponse.json(sales)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await request.json()
  const { yachtId, locationId, bookingId, guestId, guestName, items, payMethod, closeImmediately, openedBy } = body
  if (!yachtId || !locationId) return NextResponse.json({ error: 'yachtId and locationId are required' }, { status: 400 })

  try {
    const result = await withRetry(() => db.$transaction(async (tx) => {
      const sale = await tx.cashierSale.create({
        data: {
          id: crypto.randomUUID(), yachtId, locationId,
          bookingId: bookingId || null, guestId: guestId || null, guestName: guestName || null,
          openedBy: openedBy || null,
          status: closeImmediately ? 'closed' : 'open',
          payMethod: closeImmediately ? (payMethod || null) : null,
          closedAt: closeImmediately ? new Date() : null,
          updatedAt: new Date(),
        },
      })

      let total = 0
      if (Array.isArray(items) && items.length > 0) {
        total = await applyItemsToSale(tx, sale.id, locationId, items as CashierCartItem[], 1, session.user.id)
      }

      return tx.cashierSale.update({
        where: { id: sale.id },
        data: { total: { increment: total } },
        include: { items: true },
      })
    }))

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error creating cashier sale:', error)
    return NextResponse.json({ error: 'Failed to create sale' }, { status: 500 })
  }
}
