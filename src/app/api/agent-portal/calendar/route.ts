import { NextRequest, NextResponse } from 'next/server'
import { verifyAgentPortalAccess } from '@/lib/agent-portal-access'
import { resolveTenantById } from '@/lib/resolve-tenant'

// Same booking + openTrip query shape as src/app/api/public/calendar/route.ts, scoped to
// a single yachtId (the portal shows one yacht's calendar at a time) and resolved via the
// agent-portal-access cookie instead of cal-access.
export async function GET(request: NextRequest) {
  const payload = await verifyAgentPortalAccess(request)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await resolveTenantById(payload.tenantId)
  if (!db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const yachtId = searchParams.get('yachtId')
  if (!yachtId) return NextResponse.json({ error: 'yachtId is required' }, { status: 400 })

  try {
    const [bookings, openTrips] = await Promise.all([
      db.booking.findMany({
        where: { status: { not: 'cancelled' }, yachtId },
        select: { id: true, startDate: true, endDate: true, status: true, tripType: true },
        orderBy: { startDate: 'asc' },
        take: 1000,
      }),
      db.openTrip.findMany({
        where: { status: { not: 'cancelled' }, yachtId },
        include: {
          bookings: {
            where: { status: { not: 'cancelled' } },
            include: { guests: { include: { cabin: { select: { id: true, name: true } } } } },
          },
          yacht: { include: { cabins: { orderBy: { name: 'asc' } } } },
        },
        orderBy: { startDate: 'asc' },
      }),
    ])

    const trips = openTrips.map(t => {
      const cabinMap: Record<string, string | null> = {}
      t.bookings.forEach(b => {
        b.guests.forEach(g => {
          if (g.cabinId) cabinMap[g.cabinId] = b.status
        })
      })
      const spotsAvailable = t.yacht.cabins.filter(c => !cabinMap[c.id]).length
      return {
        id: t.id,
        title: t.title,
        destination: t.destination,
        startDate: t.startDate,
        endDate: t.endDate,
        status: t.status,
        spotsAvailable,
        maxCapacity: t.yacht.cabins.length,
        cabinStatuses: t.yacht.cabins.map(c => ({
          id: c.id,
          name: c.name,
          bookingStatus: cabinMap[c.id] ?? null,
        })),
      }
    })

    const safeBookings = bookings.map(b => ({
      id: b.id, startDate: b.startDate, endDate: b.endDate, status: b.status, tripType: b.tripType,
    }))

    return NextResponse.json({ bookings: safeBookings, openTrips: trips })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to load calendar' }, { status: 500 }) }
}
