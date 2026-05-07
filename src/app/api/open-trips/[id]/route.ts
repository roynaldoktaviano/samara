import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const trip = await db.openTrip.findUnique({
      where: { id },
      include: {
        yacht: {
          include: {
            cabins: { orderBy: { name: 'asc' } },
          },
        },
        bookings: {
          where: { status: { not: 'cancelled' } },
          include: {
            customer: { select: { id: true, name: true } },
            guests: {
              include: {
                customer: { select: { id: true, name: true } },
                cabin: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    })

    if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Build cabin availability map
    const occupancyMap: Record<string, { guests: { id: string; name: string }[]; bookingStatus: string | null }> = {}
    trip.bookings.forEach(b => {
      b.guests.forEach(g => {
        if (g.cabinId) {
          if (!occupancyMap[g.cabinId]) occupancyMap[g.cabinId] = { guests: [], bookingStatus: b.status }
          occupancyMap[g.cabinId].guests.push({ id: g.customer.id, name: g.customer.name })
        }
      })
    })

    const cabins = trip.yacht.cabins.map(c => {
      const occ = occupancyMap[c.id] ?? { guests: [], bookingStatus: null }
      // 1 booking = 1 cabin: any guest in this cabin means it's fully reserved
      const isBooked = occ.guests.length > 0
      return {
        id: c.id,
        name: c.name,
        deck: c.deck,
        bedType: c.bedType,
        capacity: c.capacity,
        occupied: occ.guests.length,
        spotsLeft: isBooked ? 0 : 1,
        isFull: isBooked,
        guests: occ.guests,
        bookingStatus: occ.bookingStatus,
      }
    })

    const bookedCabins = cabins.filter(c => c.isFull).length
    const totalCabins  = cabins.length

    return NextResponse.json({
      ...trip,
      cabins,
      spotsBooked: bookedCabins,
      spotsAvailable: Math.max(0, totalCabins - bookedCabins),
    })
  } catch (error) {
    console.error('Error fetching open trip detail:', error)
    return NextResponse.json({ error: 'Failed to fetch trip detail' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.openTrip.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting open trip:', error)
    return NextResponse.json({ error: 'Failed to delete open trip' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const { title, description, destination, region, departurePort, arrivalPort, status, pricePerCabin } = body

    const trip = await db.openTrip.update({
      where: { id },
      data: {
        ...(title         !== undefined && { title }),
        ...(description   !== undefined && { description: description || null }),
        ...(destination   !== undefined && { destination }),
        ...(region        !== undefined && { region: region || null }),
        ...(departurePort !== undefined && { departurePort: departurePort || null }),
        ...(arrivalPort   !== undefined && { arrivalPort: arrivalPort || null }),
        ...(status        !== undefined && { status }),
        ...(pricePerCabin !== undefined && { pricePerCabin: parseFloat(pricePerCabin) }),
      },
      include: { yacht: { select: { id: true, name: true } } },
    })

    return NextResponse.json(trip)
  } catch (error) {
    console.error('Error updating open trip:', error)
    return NextResponse.json({ error: 'Failed to update trip' }, { status: 500 })
  }
}
