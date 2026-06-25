import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { customerId, cabinId } = await request.json()

    if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

    const booking = await db.booking.findUnique({
      where: { id },
      include: {
        yacht:    { select: { id: true, capacity: true } },
        guests:   { select: { id: true, customerId: true, cabinId: true } },
        openTrip: { select: { id: true } },
      },
    })
    if (!booking)                     return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    if (booking.status === 'cancelled') return NextResponse.json({ error: 'Cannot add guest to cancelled booking' }, { status: 400 })

    // ── Capacity check ──
    if (booking.tripType === 'PRIVATE_CHARTER' && booking.yacht) {
      if (booking.guests.length >= booking.yacht.capacity) {
        return NextResponse.json({ error: `Vessel is full (capacity: ${booking.yacht.capacity} pax)` }, { status: 400 })
      }
    }

    if (booking.tripType === 'OPEN_TRIP' && cabinId) {
      const cabin = await db.cabin.findUnique({ where: { id: cabinId }, select: { capacity: true } })
      if (cabin) {
        // Count guests already in this cabin on bookings for the same open trip
        const cabinOccupancy = await db.bookingGuest.count({
          where: {
            cabinId,
            booking: { openTripId: booking.openTripId, status: { not: 'cancelled' } },
          },
        })
        if (cabinOccupancy >= cabin.capacity) {
          return NextResponse.json({ error: `Cabin is full (capacity: ${cabin.capacity} pax)` }, { status: 400 })
        }
      }
    }

    // ── Duplicate check ──
    const already = booking.guests.find(g => g.customerId === customerId)
    if (already) return NextResponse.json({ error: 'Guest is already in this booking' }, { status: 400 })

    // ── Create guest ──
    await db.bookingGuest.create({
      data: { bookingId: id, customerId, cabinId: cabinId || null, isLead: false },
    })

    await db.booking.update({
      where: { id },
      data: { guestCount: { increment: 1 } },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error adding guest:', error)
    return NextResponse.json({ error: 'Failed to add guest' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { bookingGuestId } = await request.json()
    if (!bookingGuestId) return NextResponse.json({ error: 'bookingGuestId required' }, { status: 400 })

    const guest = await db.bookingGuest.findUnique({ where: { id: bookingGuestId }, select: { bookingId: true, isLead: true } })
    if (!guest || guest.bookingId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (guest.isLead) return NextResponse.json({ error: 'Cannot remove the Group Leader' }, { status: 400 })

    await db.bookingGuest.delete({ where: { id: bookingGuestId } })
    await db.booking.update({ where: { id }, data: { guestCount: { decrement: 1 } } })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error removing guest:', error)
    return NextResponse.json({ error: 'Failed to remove guest' }, { status: 500 })
  }
}
