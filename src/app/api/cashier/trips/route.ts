import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { withRetry } from '@/lib/db'

function isTbd(name: string | null | undefined) {
  return !name || /^tbd$/i.test(name.trim())
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(request.url)
  const yachtId = searchParams.get('yachtId')
  if (!yachtId) return NextResponse.json({ error: 'yachtId is required' }, { status: 400 })

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)

  const guestInclude = {
    guests: {
      include: { customer: { select: { name: true } } },
      orderBy: [{ isLead: 'desc' as const }, { id: 'asc' as const }],
    },
    customer: { select: { name: true } },
  }

  const [openTrips, charterBookings] = await Promise.all([
    withRetry(db, () => db.openTrip.findMany({
      where: { yachtId, startDate: { lte: todayEnd }, endDate: { gte: today } },
      include: {
        bookings: { where: { status: { not: 'cancelled' } }, include: guestInclude },
      },
      orderBy: { startDate: 'asc' },
    })),
    withRetry(db, () => db.booking.findMany({
      where: { yachtId, tripType: 'PRIVATE_CHARTER', status: { not: 'cancelled' }, startDate: { lte: todayEnd }, endDate: { gte: today } },
      include: guestInclude,
      orderBy: { startDate: 'asc' },
    })),
  ])

  const trips = [
    ...openTrips.map(t => {
      const guests: { id: string | null; name: string; bookingId: string }[] = t.bookings.flatMap(b => {
        const leadName = b.guests.find(g => g.isLead)?.customer?.name ?? b.customer.name
        return b.guests.length > 0
          ? b.guests.map(g => ({ id: g.id as string | null, name: isTbd(g.customer?.name) ? leadName : (g.customer?.name ?? leadName), bookingId: b.id }))
          : [{ id: null as string | null, name: b.customer.name, bookingId: b.id }]
      })
      return {
        id: t.id, tripType: 'OPEN_TRIP' as const, label: t.title,
        startDate: t.startDate, endDate: t.endDate, guests,
      }
    }),
    ...charterBookings.map(b => {
      const leadName = b.guests.find(g => g.isLead)?.customer?.name ?? b.customer.name
      const guests: { id: string | null; name: string; bookingId: string }[] = b.guests.length > 0
        ? b.guests.map(g => ({ id: g.id as string | null, name: isTbd(g.customer?.name) ? leadName : (g.customer?.name ?? leadName), bookingId: b.id }))
        : [{ id: null as string | null, name: b.customer.name, bookingId: b.id }]
      return {
        id: b.id, tripType: 'PRIVATE_CHARTER' as const, label: b.destination ?? b.bookingCode,
        startDate: b.startDate, endDate: b.endDate, guests,
      }
    }),
  ]

  return NextResponse.json(trips)
}
