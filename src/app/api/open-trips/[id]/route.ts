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
            agent: { select: { name: true } },
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
    const occupancyMap: Record<string, { guests: { id: string; bgId: string; name: string }[]; bookingStatus: string | null; salesperson: string; bookingId: string }> = {}
    trip.bookings.forEach(b => {
      const sales = b.salesperson || b.agent?.name || 'Direct'
      b.guests.forEach(g => {
        if (g.cabinId) {
          if (!occupancyMap[g.cabinId]) occupancyMap[g.cabinId] = { guests: [], bookingStatus: b.status, salesperson: sales, bookingId: b.id }
          occupancyMap[g.cabinId].guests.push({ id: g.customer.id, bgId: g.id, name: g.customer.name })
        }
      })
    })

    const cabins = trip.yacht.cabins.map(c => {
      const occ      = occupancyMap[c.id] ?? { guests: [], bookingStatus: null, salesperson: '' }
      const cap      = c.capacity ?? 2
      const occupied = occ.guests.length
      const spotsLeft = Math.max(0, cap - occupied)
      const isFull   = occupied >= cap
      return {
        id: c.id,
        name: c.name,
        deck: c.deck,
        bedType: c.bedType,
        capacity: cap,
        occupied,
        spotsLeft,
        isFull,
        guests: occ.guests,
        bookingStatus: occ.bookingStatus,
        salesperson: occ.salesperson,
        bookingId: occ.bookingId ?? null,
      }
    })

    const bookedCabins    = cabins.filter(c => c.isFull).length
    const totalCabins     = cabins.length
    const spotsAvailable  = Math.max(0, totalCabins - bookedCabins)

    // Auto-compute effective status (same logic as list route)
    let effectiveStatus = trip.status
    if (trip.status !== 'cancelled') {
      if (new Date() >= new Date(trip.startDate)) effectiveStatus = 'closed'
      else if (spotsAvailable === 0)              effectiveStatus = 'full'
      else                                        effectiveStatus = 'open'
    }

    return NextResponse.json({
      ...trip,
      status: effectiveStatus,
      cabins,
      spotsBooked: bookedCabins,
      spotsAvailable,
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
