import { NextRequest, NextResponse } from 'next/server'
import { resolveCashierSession } from '@/lib/cashier-access'
import { withRetry } from '@/lib/db'
import { applyItemsToSale, clientTime, isClientId, markSaleComplimentary, resolveSaleDiscount, type CashierCartItem } from '@/lib/cashier'

const SALE_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
  booking: { select: { bookingCode: true } },
  guest: { select: { customer: { select: { email: true } } } },
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveCashierSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db } = session
  const { id } = await params

  try {
    const body = await request.json()
    const { action } = body

    const sale = await withRetry(db, () => db.cashierSale.findUnique({ where: { id } }))
    if (!sale || sale.yachtId !== session.yachtId) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    const current = () => db.cashierSale.findUnique({ where: { id }, include: SALE_INCLUDE })

    if (action === 'add_items') {
      const { items } = body
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: 'items is required' }, { status: 400 })
      }
      // Offline terminals send client-generated line ids — a retried add whose lines already
      // landed is answered with the current sale rather than deducting stock twice.
      const lineIds = (items as CashierCartItem[]).map(it => it.id).filter(isClientId)
      if (lineIds.length && await db.cashierSaleItem.findFirst({ where: { id: { in: lineIds } }, select: { id: true } })) {
        return NextResponse.json(await current())
      }
      if (sale.status !== 'open') return NextResponse.json({ error: 'Sale is already closed' }, { status: 400 })

      const result = await withRetry(db, () => db.$transaction(async (tx) => {
        const maxRound = await tx.cashierSaleItem.aggregate({ where: { saleId: id }, _max: { round: true } })
        const round = (maxRound._max.round ?? 0) + 1
        const total = await applyItemsToSale(tx, id, sale.locationId, items as CashierCartItem[], round, session.userId)
        return tx.cashierSale.update({
          where: { id },
          data: { total: { increment: total } },
          include: SALE_INCLUDE,
        })
      }))

      return NextResponse.json(result)
    }

    if (action === 'close') {
      const { payMethod, employeeId, employeeName, complimentaryReason, discountId, discount, at } = body
      if (!payMethod) return NextResponse.json({ error: 'payMethod is required' }, { status: 400 })
      // A retried close (offline sync) that already went through — idempotent, not an error.
      if (sale.status !== 'open') {
        if (sale.payMethod === payMethod) return NextResponse.json(await current())
        return NextResponse.json({ error: 'Sale is already closed' }, { status: 400 })
      }
      if (payMethod === 'Complimentary' && (!employeeId || !complimentaryReason?.trim())) {
        return NextResponse.json({ error: 'Complimentary requires a staff member and a reason' }, { status: 400 })
      }

      const resolved = await resolveSaleDiscount(db, discountId, discount, sale.yachtId, sale.total)
      if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 })
      const discountFields = resolved.fields

      const result = await withRetry(db, () => db.$transaction(async (tx) => {
        if (payMethod === 'Complimentary') await markSaleComplimentary(tx, id)
        return tx.cashierSale.update({
          where: { id },
          data: {
            status: 'closed', payMethod, closedAt: clientTime(at),
            ...discountFields,
            ...(employeeId ? { employeeId, employeeName: employeeName || null } : {}),
            ...(payMethod === 'Complimentary' ? { complimentaryReason: complimentaryReason || null } : {}),
          },
          include: SALE_INCLUDE,
        })
      }))

      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error updating cashier sale:', error)
    return NextResponse.json({ error: 'Failed to update sale' }, { status: 500 })
  }
}
