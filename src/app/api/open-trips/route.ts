import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const trips = await db.openTrip.findMany({
      include: {
        yacht: {
          select: {
            id: true, name: true, model: true, cabinCount: true,
            cabins: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
          },
        },
        bookings: {
          where: { status: { not: 'cancelled' } },
          select: {
            status: true,
            guests: { select: { cabinId: true } },
          },
        },
        _count: {
          select: { bookings: { where: { status: { not: 'cancelled' } } } },
        },
      },
      orderBy: { startDate: 'asc' },
    })

    const now = new Date()

    // Fetch all private charter bookings for these yachts (one query, not N)
    const yachtIds = [...new Set(trips.map(t => t.yachtId))]
    const privateCharters = await db.booking.findMany({
      where: {
        yachtId:  { in: yachtIds },
        tripType: 'PRIVATE_CHARTER',
        status:   { not: 'cancelled' },
      },
      select: { yachtId: true, startDate: true, endDate: true, bookingCode: true },
    })

    const tripsWithAvailability = trips.map((t) => {
      const totalCabins = t.yacht.cabins.length || t.yacht.cabinCount

      const cabinStatuses = t.yacht.cabins.map(c => {
        const booking = t.bookings.find(b => b.guests.some(g => g.cabinId === c.id))
        return { id: c.id, name: c.name, bookingStatus: booking?.status ?? null }
      })

      const occupiedCabins = cabinStatuses.filter(c => c.bookingStatus !== null).length
      const spotsAvailable = Math.max(0, totalCabins - occupiedCabins)

      // Check if a private charter overlaps this open trip's dates
      const blockingPC = privateCharters.find(pc =>
        pc.yachtId === t.yachtId &&
        new Date(pc.startDate) < new Date(t.endDate) &&
        new Date(pc.endDate)   > new Date(t.startDate)
      )

      let effectiveStatus = t.status
      let closedReason    = (t as any).closedReason ?? null
      if (blockingPC && t.status !== 'cancelled') {
        effectiveStatus = 'closed'
        closedReason    = `Dialihkan ke Private Charter ${blockingPC.bookingCode}`
        // Sync DB silently if not yet closed
        if (t.status !== 'closed') {
          db.openTrip.update({
            where: { id: t.id },
            data:  { status: 'closed' },
          }).catch(() => {})
        }
      } else if (t.status !== 'cancelled' && t.status !== 'closed') {
        if (now >= new Date(t.startDate)) effectiveStatus = 'closed'
        else if (spotsAvailable === 0)   effectiveStatus = 'full'
        else                             effectiveStatus = 'open'
      }

      return {
        ...t,
        status: effectiveStatus,
        closedReason,
        spotsBooked: occupiedCabins,
        spotsAvailable,
        cabinStatuses,
      }
    })

    // Filter by computed status, not the raw DB value
    const result = status
      ? tripsWithAvailability.filter(t => t.status === status)
      : tripsWithAvailability

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching open trips:', error)
    return NextResponse.json({ error: 'Failed to fetch open trips' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, description, yachtId, startDate, endDate, destination, region, departurePort, arrivalPort, pricePerCabin } = body

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
        pricePerCabin: parseFloat(pricePerCabin) || 0,
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
