import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

// Shared "which trip is this for" shape for Purchase Requests, Purchase Orders (incl. service
// orders) and Stock Transfers — each links either a Private Charter booking (tripBookingId /
// PO.bookingId) or an Open Trip departure (openTripId). Legacy rows may link an OPEN_TRIP
// booking via the booking field; that resolves to its Open Trip's number.

export interface TripSummary {
  kind: 'charter' | 'openTrip'
  id: string
  tripNumber: number | null
  startDate: Date
  endDate: Date
  yacht: { id: string; name: string } | null
  label: string // guest name for charters, title/destination for open trips
}

export const tripBookingSelect = {
  id: true, bookingCode: true, tripNumber: true, startDate: true, endDate: true,
  yacht: { select: { id: true, name: true } },
  customer: { select: { name: true } },
  openTrip: { select: { id: true, title: true, tripNumber: true, startDate: true, endDate: true, yacht: { select: { id: true, name: true } } } },
} as const

export const openTripSelect = {
  id: true, title: true, destination: true, tripNumber: true, startDate: true, endDate: true,
  yacht: { select: { id: true, name: true } },
} as const

type BookingRow = {
  id: string; bookingCode: string; tripNumber: number | null; startDate: Date; endDate: Date
  yacht: { id: string; name: string } | null
  customer: { name: string } | null
  openTrip: { id: string; title: string; tripNumber: number | null; startDate: Date; endDate: Date; yacht: { id: string; name: string } } | null
}
type OpenTripRow = {
  id: string; title: string; destination: string; tripNumber: number | null; startDate: Date; endDate: Date
  yacht: { id: string; name: string }
}

export function tripFromBooking(b: BookingRow): TripSummary {
  if (b.openTrip) {
    return { kind: 'openTrip', id: b.openTrip.id, tripNumber: b.openTrip.tripNumber, startDate: b.openTrip.startDate, endDate: b.openTrip.endDate, yacht: b.openTrip.yacht, label: b.openTrip.title }
  }
  return { kind: 'charter', id: b.id, tripNumber: b.tripNumber, startDate: b.startDate, endDate: b.endDate, yacht: b.yacht, label: b.customer?.name ?? b.bookingCode }
}

export function tripFromOpenTrip(t: OpenTripRow): TripSummary {
  return { kind: 'openTrip', id: t.id, tripNumber: t.tripNumber, startDate: t.startDate, endDate: t.endDate, yacht: t.yacht, label: t.title || t.destination }
}

// Open Trip wins over the booking link, same precedence the writers use.
export function tripOf(row: { openTrip?: OpenTripRow | null; tripBooking?: BookingRow | null; booking?: BookingRow | null }): TripSummary | null {
  if (row.openTrip) return tripFromOpenTrip(row.openTrip)
  const b = row.tripBooking ?? row.booking
  return b ? tripFromBooking(b) : null
}

// Picker list — one row per departure (Private Charter booking or Open Trip, not per Open
// Trip booking), ongoing/upcoming only (past trips have nothing left to buy/ship for), soonest
// first. Start of today so a trip ending today still shows.
export async function listUpcomingTrips(db: Db): Promise<TripSummary[]> {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const [charters, openTrips] = await Promise.all([
    db.booking.findMany({
      where: { tripType: 'PRIVATE_CHARTER', status: { not: 'cancelled' }, yachtId: { not: null }, endDate: { gte: today } },
      orderBy: { startDate: 'asc' }, take: 500, select: tripBookingSelect,
    }),
    db.openTrip.findMany({
      // closed + unnumbered = absorbed into a Private Charter, which is listed instead
      where: { status: { not: 'cancelled' }, NOT: { status: 'closed', tripNumber: null }, endDate: { gte: today } },
      orderBy: { startDate: 'asc' }, take: 500, select: openTripSelect,
    }),
  ])
  return [...charters.map(tripFromBooking), ...openTrips.map(tripFromOpenTrip)]
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
}

// Validates a picked trip from a request body and returns the two link columns (at most one
// set). `undefined` both ways means "no trip". Returns an error string if the id is unknown.
export async function resolveTripLink(db: Db, input: { tripBookingId?: string | null; openTripId?: string | null }):
  Promise<{ tripBookingId: string | null; openTripId: string | null } | { error: string }> {
  if (input.openTripId) {
    const t = await db.openTrip.findUnique({ where: { id: input.openTripId }, select: { id: true } })
    return t ? { tripBookingId: null, openTripId: t.id } : { error: 'Trip not found' }
  }
  if (input.tripBookingId) {
    const b = await db.booking.findUnique({ where: { id: input.tripBookingId }, select: { id: true } })
    return b ? { tripBookingId: b.id, openTripId: null } : { error: 'Trip not found' }
  }
  return { tripBookingId: null, openTripId: null }
}
