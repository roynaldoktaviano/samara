import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { withRetry } from '@/lib/db'
import { applyItemsToSale, type CashierCartItem } from '@/lib/cashier'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params

  try {
    const body = await request.json()
    const { action } = body

    const sale = await withRetry(db, () => db.cashierSale.findUnique({ where: { id } }))
    if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    if (sale.status !== 'open') return NextResponse.json({ error: 'Sale is already closed' }, { status: 400 })

    if (action === 'add_items') {
      const { items } = body
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: 'items is required' }, { status: 400 })
      }

      const result = await withRetry(db, () => db.$transaction(async (tx) => {
        const maxRound = await tx.cashierSaleItem.aggregate({ where: { saleId: id }, _max: { round: true } })
        const round = (maxRound._max.round ?? 0) + 1
        const total = await applyItemsToSale(tx, id, sale.locationId, items as CashierCartItem[], round, session.user.id)
        return tx.cashierSale.update({
          where: { id },
          data: { total: { increment: total } },
          include: {
            items: { orderBy: { createdAt: 'asc' } },
            booking: { select: { bookingCode: true } },
            guest: { select: { customer: { select: { email: true } } } },
          },
        })
      }))

      return NextResponse.json(result)
    }

    if (action === 'close') {
      const { payMethod } = body
      if (!payMethod) return NextResponse.json({ error: 'payMethod is required' }, { status: 400 })

      const result = await withRetry(db, () => db.cashierSale.update({
        where: { id },
        data: { status: 'closed', payMethod, closedAt: new Date() },
        include: {
          items: { orderBy: { createdAt: 'asc' } },
          booking: { select: { bookingCode: true } },
          guest: { select: { customer: { select: { email: true } } } },
        },
      }))

      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error updating cashier sale:', error)
    return NextResponse.json({ error: 'Failed to update sale' }, { status: 500 })
  }
}
