import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantByRequestOrderToken } from '@/lib/resolve-tenant'

// Public, unauthenticated: trip picker for the Request Order page's "Purpose: Trip"
// option. Same slim shape as /api/purchasing/trips (the internal PR trip picker) so
// both forms render identically per the "PR and request-order must always match" rule.
export async function GET(request: NextRequest) {
  const resolved = await resolveTenantByRequestOrderToken(request.nextUrl.searchParams.get('token'))
  if (!resolved) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  const { db } = resolved

  const bookings = await db.booking.findMany({
    orderBy: { startDate: 'desc' },
    take: 500,
    select: {
      id: true, bookingCode: true, tripType: true, startDate: true, endDate: true, destination: true, status: true,
      yacht: { select: { id: true, name: true } },
      customer: { select: { name: true } },
      guests: { select: { isLead: true, customer: { select: { name: true } } } },
    },
  })

  return NextResponse.json(bookings.map(b => {
    const lead = b.guests.find(g => g.isLead)
    const leadGuestName = lead?.customer?.name ?? b.customer.name
    const guestNames = b.guests.map(g => g.customer?.name).filter((n): n is string => !!n && n !== leadGuestName)
    return {
      id: b.id,
      bookingCode: b.bookingCode,
      tripType: b.tripType,
      startDate: b.startDate,
      endDate: b.endDate,
      destination: b.destination,
      status: b.status,
      yacht: b.yacht,
      leadGuestName,
      guestNames,
    }
  }))
}
