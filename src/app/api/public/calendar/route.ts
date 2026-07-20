import { NextRequest, NextResponse } from 'next/server'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { db as defaultDb } from '@/lib/db'
import { verifyCalAccess } from '@/lib/cal-access'
import type { PrismaClient } from '@prisma/client'

// Two access paths, deliberately different:
//  - No cal-access cookie: this is /kalender, the public marketing-site calendar
//    embed — genuinely unauthenticated by design, but it only ever shows the
//    DEFAULT tenant's own calendar. No `?tenant=` param is honored here, which is
//    what closes the original hole (any tenant's calendar was guessable via slug).
//  - Valid cal-access cookie: an agent viewing /agent/calendar, whose own tenant
//    (possibly not the default one) is read from the verified JWT, never from
//    client input.
export async function GET(req: NextRequest) {
  const payload = await verifyCalAccess(req)

  let db: PrismaClient
  if (payload?.tenantId) {
    const tenant = await centralDb.tenant.findUnique({ where: { id: payload.tenantId }, select: { databaseUrl: true } })
    if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    db = tenant.databaseUrl === process.env.DATABASE_URL ? defaultDb : getTenantDb(tenant.databaseUrl)
  } else {
    db = defaultDb
  }

  try {
    const [bookings, openTrips, yachts] = await Promise.all([
      db.booking.findMany({
        where: { status: { not: 'cancelled' } },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          status: true,
          tripType: true,
          yacht: { select: { id: true, name: true } },
          openTrip: { select: { id: true } },
        },
        orderBy: { startDate: 'asc' },
        take: 1000,
      }),
      db.openTrip.findMany({
        where: { status: { not: 'cancelled' } },
        include: {
          bookings: {
            where: { status: { not: 'cancelled' } },
            include: {
              guests: {
                include: { cabin: { select: { id: true, name: true } } },
              },
            },
          },
          yacht: {
            include: { cabins: { orderBy: { name: 'asc' } } },
          },
        },
        orderBy: { startDate: 'asc' },
      }),
      db.yacht.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
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
        startDate: t.startDate,
        endDate: t.endDate,
        status: t.status,
        closedReason: (t as Record<string, unknown>).closedReason ?? null,
        spotsAvailable,
        maxCapacity: t.yacht.cabins.length,
        yacht: { id: t.yacht.id, name: t.yacht.name },
        cabinStatuses: t.yacht.cabins.map(c => ({
          id: c.id,
          name: c.name,
          bookingStatus: cabinMap[c.id] ?? null,
        })),
      }
    })

    const safeBookings = bookings.map(b => ({
      id: b.id,
      startDate: b.startDate,
      endDate: b.endDate,
      status: b.status,
      tripType: b.tripType,
      yachtName: b.yacht?.name ?? '',
      yachtId: b.yacht?.id ?? '',
      openTripId: b.openTrip?.id ?? null,
    }))

    return NextResponse.json({ bookings: safeBookings, openTrips: trips, yachts })
  } catch (err) {
    console.error('public calendar error:', err)
    return NextResponse.json({ error: 'Failed to load calendar' }, { status: 500 })
  }
}
