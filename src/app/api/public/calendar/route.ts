import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const [bookings, openTrips] = await Promise.all([
      db.booking.findMany({
        where: { status: { not: 'cancelled' } },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          tripType: true,
          status: true,
          yacht: { select: { id: true, name: true } },
        },
        orderBy: { startDate: 'asc' },
      }),
      db.openTrip.findMany({
        select: {
          id: true,
          title: true,
          startDate: true,
          endDate: true,
          status: true,
          closedReason: true,
          destination: true,
          maxCapacity: true,
          yacht: {
            select: {
              id: true, name: true,
              cabins: { select: { id: true, name: true, capacity: true }, orderBy: { name: 'asc' } },
            },
          },
          bookings: {
            where: { status: { not: 'cancelled' } },
            select: {
              status: true,
              guests: { select: { cabinId: true } },
            },
          },
        },
        orderBy: { startDate: 'asc' },
      }),
    ])

    const sanitizedBookings = bookings.map(b => ({
      id: b.id,
      yachtId: b.yacht?.id ?? '',
      yachtName: b.yacht?.name ?? '',
      startDate: b.startDate.toISOString().split('T')[0],
      endDate: b.endDate.toISOString().split('T')[0],
      tripType: b.tripType,
      status: b.status,
    }))

    const sanitizedOpenTrips = openTrips
    .filter(t => !(t.status === 'closed' && t.closedReason?.includes('Private Charter')))
    .map(t => {
      // Build per-cabin occupancy
      const cabinBookingStatus: Record<string, string> = {}
      t.bookings.forEach(b => {
        b.guests.forEach(g => {
          if (g.cabinId) cabinBookingStatus[g.cabinId] = b.status
        })
      })

      const cabins = (t.yacht?.cabins ?? []).map(c => ({
        id: c.id,
        name: c.name,
        bookingStatus: cabinBookingStatus[c.id] ?? null,
      }))

      const occupiedCabins = cabins.filter(c => c.bookingStatus !== null).length
      const spotsAvailable = Math.max(0, t.maxCapacity - occupiedCabins)

      let effectiveStatus = t.status
      if (t.status !== 'cancelled' && t.status !== 'closed') {
        if (new Date() >= new Date(t.startDate)) effectiveStatus = 'closed'
        else if (spotsAvailable === 0)            effectiveStatus = 'full'
        else                                      effectiveStatus = 'open'
      }

      return {
        id: t.id,
        title: t.title,
        yachtId: t.yacht?.id ?? '',
        yachtName: t.yacht?.name ?? '',
        startDate: t.startDate.toISOString().split('T')[0],
        endDate: t.endDate.toISOString().split('T')[0],
        status: effectiveStatus,
        destination: t.destination,
        maxCapacity: t.maxCapacity,
        spotsAvailable,
        cabins,
      }
    })

    return NextResponse.json(
      { bookings: sanitizedBookings, openTrips: sanitizedOpenTrips },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } },
    )
  } catch (error) {
    console.error('Public calendar error:', error)
    return NextResponse.json({ error: 'Failed to load calendar' }, { status: 500 })
  }
}
