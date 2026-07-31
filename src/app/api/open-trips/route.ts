import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    // Admin-only: let past-dated trips stay bookable (for backfilling historical bookings)
    const role = (session.user as { role?: string }).role ?? ''
    const includePast = searchParams.get('includePast') === '1' && roleMatches(role, ['ADMIN', 'SUPER_ADMIN'])

    const trips = await db.openTrip.findMany({
      include: {
        yacht: {
          select: {
            id: true, name: true, model: true, cabinCount: true,
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

    const sharingCabin = !!(session?.user as { tenantFeatures?: Record<string, boolean> })?.tenantFeatures?.sharingCabin

    const tripsWithAvailability = trips.map((t) => {
      const totalCabins = t.yacht.cabins.length || t.yacht.cabinCount

      const cabinStatuses = t.yacht.cabins.map(c => {
        const guestsInCabin = t.bookings.flatMap(b => b.guests.filter(g => g.cabinId === c.id)).length
        const booking = t.bookings.find(b => b.guests.some(g => g.cabinId === c.id))
        // Sharing: cabin is full only when guest count >= capacity; otherwise: any guest blocks the cabin
        const isCabinFull = sharingCabin
          ? guestsInCabin >= (c.capacity ?? 2)
          : guestsInCabin > 0
        return { id: c.id, name: c.name, bookingStatus: isCabinFull ? (booking?.status ?? 'booked') : null }
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
      let closedReason    = (t as { closedReason?: string | null }).closedReason ?? null
      if (blockingPC && t.status !== 'cancelled') {
        effectiveStatus = 'closed'
        closedReason    = `Closed — Private Charter ${blockingPC.bookingCode}`
        // Sync DB silently if not yet closed
        if (t.status !== 'closed') {
          db.openTrip.update({
            where: { id: t.id },
            data:  { status: 'closed', closedReason },
          }).catch(e => console.error('[open-trips] status sync failed:', e))
        }
      } else if (t.status === 'closed' && !blockingPC && now < new Date(t.startDate)) {
        // Orphaned close: trip is closed in DB but no PC blocks it and date hasn't passed → recover
        effectiveStatus = 'open'
        closedReason    = null
        db.openTrip.update({
          where: { id: t.id },
          data:  { status: 'open', closedReason: null },
        }).catch(e => console.error('[open-trips] status sync failed:', e))
      } else if (t.status !== 'cancelled' && t.status !== 'closed') {
        if (now >= new Date(t.startDate) && !includePast) effectiveStatus = 'closed'
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
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const isSuperAdmin = (session?.user as { isSuperAdmin?: boolean })?.isSuperAdmin === true
  if (!isSuperAdmin && !['ADMIN'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const body = await request.json()
    const { title, description, yachtId, startDate, endDate, destination, destinationId, region, departurePort, arrivalPort, pricePerCabin } = body

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
        destinationId: destinationId || null,
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
