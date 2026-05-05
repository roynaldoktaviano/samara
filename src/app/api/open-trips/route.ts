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
        yacht: { select: { id: true, name: true, model: true, cabinCount: true } },
        _count: { select: { bookings: true } },
      },
      orderBy: { startDate: 'asc' },
    })

    const tripsWithAvailability = trips.map((t) => {
      const totalBooked = t._count.bookings
      return {
        ...t,
        spotsBooked: totalBooked,
        spotsAvailable: Math.max(0, t.maxCapacity - totalBooked),
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
    const { title, description, yachtId, startDate, endDate, destination, pricePerCabin, maxCapacity } = body

    if (!title || !yachtId || !startDate || !endDate || !destination || !pricePerCabin || !maxCapacity) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const trip = await db.openTrip.create({
      data: {
        title,
        description: description || null,
        yachtId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        destination,
        pricePerCabin: parseFloat(pricePerCabin),
        maxCapacity: parseInt(maxCapacity),
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
