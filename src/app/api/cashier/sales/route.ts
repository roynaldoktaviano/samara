import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { withRetry } from '@/lib/db'
import { applyItemsToSale, resolveDiscount, type CashierCartItem } from '@/lib/cashier'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(request.url)
  const yachtId = searchParams.get('yachtId')
  const status  = searchParams.get('status')
  if (!yachtId) return NextResponse.json({ error: 'yachtId is required' }, { status: 400 })

  const sales = await withRetry(db, () => db.cashierSale.findMany({
    where: { yachtId, ...(status ? { status } : {}) },
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      booking: { select: { bookingCode: true } },
      guest: { select: { customer: { select: { email: true } } } },
    },
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
  const { yachtId, locationId, bookingId, guestId, guestName, employeeId, employeeName, complimentaryReason, items, payMethod, closeImmediately, openedBy, discountId } = body
  if (!yachtId || !locationId) return NextResponse.json({ error: 'yachtId and locationId are required' }, { status: 400 })
  if (closeImmediately && payMethod === 'Complimentary' && (!employeeId || !String(complimentaryReason || '').trim())) {
    return NextResponse.json({ error: 'Complimentary requires a staff member and a reason' }, { status: 400 })
  }

  // Resolved before the transaction so an invalid discount comes back as a 400, not a
  // generic 500 from an aborted transaction — the item subtotal it needs is knowable
  // upfront from the incoming cart, same trust boundary the existing item prices already sit on.
  let discountFields = { discountId: null as string | null, discountName: null as string | null, discountAmount: 0 }
  if (closeImmediately && discountId) {
    const subtotal = Array.isArray(items) ? (items as CashierCartItem[]).reduce((s, it) => s + Number(it.qty) * Number(it.price), 0) : 0
    const resolved = await resolveDiscount(db, discountId, yachtId, subtotal)
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 })
    discountFields = { discountId: resolved.discountId, discountName: resolved.discountName, discountAmount: resolved.discountAmount }
  }

  try {
    const result = await withRetry(db, () => db.$transaction(async (tx) => {
      const sale = await tx.cashierSale.create({
        data: {
          id: crypto.randomUUID(), yachtId, locationId,
          bookingId: bookingId || null, guestId: guestId || null, guestName: guestName || null,
          employeeId: employeeId || null, employeeName: employeeName || null,
          complimentaryReason: complimentaryReason || null,
          openedBy: openedBy || null,
          status: closeImmediately ? 'closed' : 'open',
          payMethod: closeImmediately ? (payMethod || null) : null,
          closedAt: closeImmediately ? new Date() : null,
          updatedAt: new Date(),
          ...discountFields,
        },
      })

      let total = 0
      if (Array.isArray(items) && items.length > 0) {
        total = await applyItemsToSale(tx, sale.id, locationId, items as CashierCartItem[], 1, session.user.id)
      }

      return tx.cashierSale.update({
        where: { id: sale.id },
        data: { total: { increment: total } },
        include: {
          items: true,
          booking: { select: { bookingCode: true } },
          guest: { select: { customer: { select: { email: true } } } },
        },
      })
    }))

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error creating cashier sale:', error)
    return NextResponse.json({ error: 'Failed to create sale' }, { status: 500 })
  }
}
