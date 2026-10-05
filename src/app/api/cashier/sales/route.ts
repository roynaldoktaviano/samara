import { NextRequest, NextResponse } from 'next/server'
import { resolveCashierSession } from '@/lib/cashier-access'
import { withRetry } from '@/lib/db'
import { applyItemsToSale, clientTime, isClientId, resolveSaleDiscount, type CashierCartItem } from '@/lib/cashier'

const SALE_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
  booking: { select: { bookingCode: true } },
  guest: { select: { customer: { select: { email: true } } } },
}

export async function GET(request: NextRequest) {
  const session = await resolveCashierSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db } = session

  const { searchParams } = new URL(request.url)
  // The terminal is locked to the yacht its PIN unlocked.
  const yachtId = session.yachtId
  const status  = searchParams.get('status')
  if (searchParams.get('yachtId') && searchParams.get('yachtId') !== yachtId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sales = await withRetry(db, () => db.cashierSale.findMany({
    where: { yachtId, ...(status ? { status } : {}) },
    include: SALE_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: 100,
  }))

  return NextResponse.json(sales)
}

export async function POST(request: NextRequest) {
  const session = await resolveCashierSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db } = session

  const body = await request.json()
  const { id, at, yachtId, locationId, bookingId, guestId, guestName, employeeId, employeeName, complimentaryReason, items, payMethod, closeImmediately, openedBy, discountId, discount } = body
  if (!yachtId || !locationId) return NextResponse.json({ error: 'yachtId and locationId are required' }, { status: 400 })
  if (yachtId !== session.yachtId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // The terminal generates the sale id itself so a queued (offline) create can be retried safely:
  // if it already landed, hand back the stored sale instead of creating a duplicate.
  const saleId = isClientId(id) ? id : crypto.randomUUID()
  const existing = await withRetry(db, () => db.cashierSale.findUnique({ where: { id: saleId }, include: SALE_INCLUDE }))
  if (existing) {
    if (existing.yachtId !== yachtId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return NextResponse.json(existing)
  }
  const happenedAt = clientTime(at)
  const location = await db.stockLocation.findFirst({ where: { id: locationId, yachtId }, select: { id: true } })
  if (!location) return NextResponse.json({ error: 'Invalid stock location' }, { status: 400 })
  if (closeImmediately && payMethod === 'Complimentary' && (!employeeId || !String(complimentaryReason || '').trim())) {
    return NextResponse.json({ error: 'Complimentary requires a staff member and a reason' }, { status: 400 })
  }

  // Resolved before the transaction so an invalid discount comes back as a 400, not a
  // generic 500 from an aborted transaction — the item subtotal it needs is knowable
  // upfront from the incoming cart, same trust boundary the existing item prices already sit on.
  let discountFields: Extract<Awaited<ReturnType<typeof resolveSaleDiscount>>, { ok: true }>['fields'] = { discountId: null, discountName: null, discountAmount: 0 }
  if (closeImmediately && discountId) {
    const subtotal = Array.isArray(items) ? (items as CashierCartItem[]).reduce((s, it) => s + Number(it.qty) * Number(it.price), 0) : 0
    const resolved = await resolveSaleDiscount(db, discountId, discount, yachtId, subtotal)
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 })
    discountFields = resolved.fields
  }

  try {
    const result = await withRetry(db, () => db.$transaction(async (tx) => {
      const sale = await tx.cashierSale.create({
        data: {
          id: saleId, yachtId, locationId,
          bookingId: bookingId || null, guestId: guestId || null, guestName: guestName || null,
          employeeId: employeeId || null, employeeName: employeeName || null,
          complimentaryReason: complimentaryReason || null,
          openedBy: openedBy || null,
          status: closeImmediately ? 'closed' : 'open',
          payMethod: closeImmediately ? (payMethod || null) : null,
          closedAt: closeImmediately ? happenedAt : null,
          createdAt: happenedAt,
          updatedAt: new Date(),
          ...discountFields,
        },
      })

      let total = 0
      if (Array.isArray(items) && items.length > 0) {
        total = await applyItemsToSale(tx, sale.id, locationId, items as CashierCartItem[], 1, session.userId)
      }

      return tx.cashierSale.update({
        where: { id: sale.id },
        data: { total: { increment: total } },
        include: SALE_INCLUDE,
      })
    }))

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    // Two retries of the same queued create raced each other — the other one won, return it.
    if ((error as { code?: string })?.code === 'P2002') {
      const won = await db.cashierSale.findUnique({ where: { id: saleId }, include: SALE_INCLUDE })
      if (won) return NextResponse.json(won)
    }
    console.error('Error creating cashier sale:', error)
    return NextResponse.json({ error: 'Failed to create sale' }, { status: 500 })
  }
}
