import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

// Slim trip list for the PO "For Trip" picker — search/filter (by yacht, by guest
// name for private charters) all happens client-side over this list, same
// convention as the Bookings page and the PO list's own item search.
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

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
