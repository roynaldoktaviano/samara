import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (status) where.status = status

    const trips = await db.openTrip.findMany({
      where,
      include: {
        yacht: {
          select: {
            id: true, name: true, model: true, cabinCount: true,
            cabins: { select: { id: true } },
          },
        },
        _count: {
          select: { bookings: { where: { status: { not: 'cancelled' } } } },
        },
      },
      orderBy: { startDate: 'asc' },
    })

    const tripsWithAvailability = trips.map((t) => {
      // 1 booking = 1 cabin; available = total cabins − active bookings
      const totalCabins = t.yacht.cabins.length || t.yacht.cabinCount
      const activeBookings = t._count.bookings
      return {
        ...t,
        spotsBooked: activeBookings,
        spotsAvailable: Math.max(0, totalCabins - activeBookings),
      }
    })

    return NextResponse.json(tripsWithAvailability)
  } catch (error) {
    console.error('Error fetching open trips:', error)
    return NextResponse.json({ error: 'Failed to fetch open trips' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, description, yachtId, startDate, endDate, destination, region, departurePort, arrivalPort } = body

    if (!title || !yachtId || !startDate || !endDate || !destination) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Auto-derive maxCapacity from number of cabins (1 booking = 1 cabin)
    const yacht = await db.yacht.findUnique({
      where: { id: yachtId },
      select: { cabinCount: true, cabins: { select: { id: true } } },
    })

    const totalCabins = yacht?.cabins.length || yacht?.cabinCount || 0

    const trip = await db.openTrip.create({
      data: {
        title,
        description: description || null,
        yachtId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        destination,
        region: region || null,
        departurePort: departurePort || null,
        arrivalPort: arrivalPort || null,
        pricePerCabin: 0,
        maxCapacity: totalCabins,
        status: 'open',
      },
      include: {
        yacht: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(trip, { status: 201 })
  } catch (error) {
    console.error('Error creating open trip:', error)
    return NextResponse.json({ error: 'Failed to create open trip' }, { status: 500 })
  }
}
