import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN']

// Trips (bookings) that have at least one Cashier sale, most recent activity first.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const yachtId = searchParams.get('yachtId')
  const search = searchParams.get('search')?.trim()

  const bookingIds = await db.cashierSale.findMany({
    where: {
      bookingId: { not: null },
      ...(yachtId && { yachtId }),
      ...(search && { booking: { OR: [{ bookingCode: { contains: search, mode: 'insensitive' } }, { customer: { name: { contains: search, mode: 'insensitive' } } }] } }),
    },
    distinct: ['bookingId'],
    select: { bookingId: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const ids = bookingIds.map(b => b.bookingId).filter((id): id is string => !!id)
  if (ids.length === 0) return NextResponse.json([])

  const [bookings, salesByBooking] = await Promise.all([
    db.booking.findMany({
      where: { id: { in: ids } },
      select: { id: true, bookingCode: true, startDate: true, endDate: true, status: true, customer: { select: { name: true } }, yacht: { select: { id: true, name: true } } },
    }),
    db.cashierSale.groupBy({ by: ['bookingId'], where: { bookingId: { in: ids } }, _count: true, _sum: { total: true, discountAmount: true } }),
  ])
  const salesMap = new Map(salesByBooking.map(s => [s.bookingId, s]))
  const bookingMap = new Map(bookings.map(b => [b.id, b]))

  const result = ids
    .map(id => {
      const booking = bookingMap.get(id)
      const sales = salesMap.get(id)
      if (!booking) return null
      const subtotal = sales?._sum.total ?? 0
      const discount = sales?._sum.discountAmount ?? 0
      return {
        booking,
        saleCount: sales?._count ?? 0,
        subtotal,
        discountAmount: discount,
        total: subtotal - discount,
      }
    })
    .filter((r): r is NonNullable<typeof r> => !!r)

  return NextResponse.json(result)
}
