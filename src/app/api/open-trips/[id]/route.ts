import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const isSuperAdmin = (session?.user as { isSuperAdmin?: boolean })?.isSuperAdmin === true
  if (!isSuperAdmin && role !== 'ADMIN') return null
  return session
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const { searchParams } = new URL(req.url)
    // Admin-only: let past-dated trips stay bookable (for backfilling historical bookings)
    const role = (session.user as { role?: string }).role ?? ''
    const includePast = searchParams.get('includePast') === '1' && roleMatches(role, ['ADMIN', 'SUPER_ADMIN'])

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
            customer:        { select: { id: true, name: true } },
            agent:           { select: { name: true } },
            salespersonUser: { select: { name: true } },
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
    const occupancyMap: Record<string, { guests: { id: string; bgId: string; name: string }[]; bookingStatus: string | null; salesperson: string; salespersonId: string | null; bookingId: string; bookingCode: string }> = {}
    trip.bookings.forEach(b => {
      const sales = b.salespersonUser?.name ?? b.salesperson ?? b.agent?.name ?? 'Direct'
      b.guests.forEach(g => {
        if (g.cabinId) {
          if (!occupancyMap[g.cabinId]) occupancyMap[g.cabinId] = { guests: [], bookingStatus: b.status, salesperson: sales, salespersonId: b.salespersonId ?? null, bookingId: b.id, bookingCode: b.bookingCode }
          occupancyMap[g.cabinId].guests.push({ id: g.customer.id, bgId: g.id, name: g.customer.name })
        }
      })
    })

    const cabins = trip.yacht.cabins.map(c => {
      const occ      = occupancyMap[c.id] ?? { guests: [], bookingStatus: null, salesperson: '', salespersonId: null }
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
        salesperson:   occ.salesperson,
        salespersonId: occ.salespersonId,
        bookingId:     occ.bookingId   ?? null,
        bookingCode:   occ.bookingCode ?? null,
      }
    })

    const bookedCabins    = cabins.filter(c => c.isFull).length
    const totalCabins     = cabins.length
    const spotsAvailable  = Math.max(0, totalCabins - bookedCabins)

    // Check for overlapping private charter (handles legacy data before auto-close)
    const blockingPC = trip.status !== 'cancelled' ? await db.booking.findFirst({
      where: {
        yachtId:  trip.yachtId,
        tripType: 'PRIVATE_CHARTER',
        status:   { not: 'cancelled' },
        startDate: { lt: trip.endDate },
        endDate:   { gt: trip.startDate },
      },
      select: { bookingCode: true },
    }) : null

    let effectiveStatus = trip.status
    let closedReason    = (trip as { closedReason?: string | null }).closedReason ?? null
    if (blockingPC) {
      effectiveStatus = 'closed'
      closedReason    = closedReason ?? `Dialihkan ke Private Charter ${blockingPC.bookingCode}`
      if (trip.status !== 'closed') {
        db.openTrip.update({ where: { id }, data: { status: 'closed' } }).catch(() => {})
      }
    } else if (trip.status !== 'cancelled' && trip.status !== 'closed') {
      if (new Date() >= new Date(trip.startDate) && !includePast) effectiveStatus = 'closed'
      else if (spotsAvailable === 0)              effectiveStatus = 'full'
      else                                        effectiveStatus = 'open'
    }

    return NextResponse.json({
      ...trip,
      status: effectiveStatus,
      closedReason,
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
  const adminSession = await requireAdmin()
  if (!adminSession) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(adminSession)
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
  const adminSession = await requireAdmin()
  if (!adminSession) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(adminSession)
  try {
    const { id } = await params
    const body = await request.json()
    const { title, description, destination, destinationId, region, departurePort, arrivalPort, status, pricePerCabin, startDate, endDate, yachtId } = body

    const trip = await db.openTrip.update({
      where: { id },
      data: {
        ...(title         !== undefined && { title }),
        ...(description   !== undefined && { description: description || null }),
        ...(destination   !== undefined && { destination }),
        ...(destinationId !== undefined && { destinationId: destinationId || null }),
        ...(region        !== undefined && { region: region || null }),
        ...(departurePort !== undefined && { departurePort: departurePort || null }),
        ...(arrivalPort   !== undefined && { arrivalPort: arrivalPort || null }),
        ...(status        !== undefined && { status }),
        ...(pricePerCabin !== undefined && { pricePerCabin: parseFloat(pricePerCabin) }),
        ...(startDate     !== undefined && { startDate: new Date(startDate) }),
        ...(endDate       !== undefined && { endDate:   new Date(endDate) }),
        ...(yachtId       !== undefined && { yachtId }),
      },
      include: { yacht: { select: { id: true, name: true } } },
    })

    return NextResponse.json(trip)
  } catch (error) {
    console.error('Error updating open trip:', error)
    return NextResponse.json({ error: 'Failed to update trip' }, { status: 500 })
  }
}
