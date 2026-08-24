import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Public, unauthenticated, single-yacht calendar feed — deliberately returns nothing
// beyond a list of booked dates. No customer, status, price, or trip info leaks here,
// since this route is meant to be shared as a plain link for one boat.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ yachtId: string }> }) {
  const { yachtId } = await params

  try {
    const yacht = await db.yacht.findUnique({
      where: { id: yachtId },
      select: { id: true, name: true, deletedAt: true },
    })
    if (!yacht || yacht.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const [bookings, openTrips] = await Promise.all([
      db.booking.findMany({
        where: { yachtId, status: { not: 'cancelled' } },
        select: { startDate: true, endDate: true },
      }),
      db.openTrip.findMany({
        where: { yachtId, status: { not: 'cancelled' } },
        select: { startDate: true, endDate: true },
      }),
    ])

    const booked = new Set<string>()
    const markRange = (start: Date, end: Date) => {
      const d = new Date(start)
      d.setHours(0, 0, 0, 0)
      const last = new Date(end)
      last.setHours(0, 0, 0, 0)
      while (d <= last) {
        booked.add(d.toISOString().split('T')[0])
        d.setDate(d.getDate() + 1)
      }
    }
    bookings.forEach(b => markRange(b.startDate, b.endDate))
    openTrips.forEach(t => markRange(t.startDate, t.endDate))

    return NextResponse.json({ yachtName: yacht.name, bookedDates: [...booked].sort() })
  } catch (err) {
    console.error('kapal calendar error:', err)
    return NextResponse.json({ error: 'Failed to load calendar' }, { status: 500 })
  }
}
