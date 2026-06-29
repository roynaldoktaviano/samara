import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const guest = await db.bookingGuest.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!guest) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(guest)
  } catch (error) {
    console.error('Error fetching booking guest:', error)
    return NextResponse.json({ error: 'Failed to fetch guest' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const { arrivalPickupTime, arrivalHotel, arrivalFlight, departurePickupTime, departureHotel, departureFlight, cabinId, isLead } = body

    const data: Record<string, unknown> = {
      arrivalPickupTime, arrivalHotel, arrivalFlight,
      departurePickupTime, departureHotel, departureFlight,
    }
    if (cabinId !== undefined) data.cabinId = cabinId || null

    // When setting as lead, clear isLead on all other guests in the same booking first
    if (isLead === true) {
      const current = await db.bookingGuest.findUnique({ where: { id }, select: { bookingId: true } })
      if (current) {
        await db.bookingGuest.updateMany({
          where: { bookingId: current.bookingId, id: { not: id } },
          data:  { isLead: false },
        })
      }
      data.isLead = true
    } else if (isLead === false) {
      data.isLead = false
    }

    const guest = await db.bookingGuest.update({ where: { id }, data })

    // Recalculate Open Trip price when cabin assignment changes
    if (cabinId !== undefined) {
      const booking = await db.booking.findUnique({
        where: { id: guest.bookingId },
        select: {
          tripType: true, status: true, depositPaid: true,
          openTrip: { select: { startDate: true, endDate: true, pricePerCabin: true } },
          guests:   { select: { cabinId: true } },
        },
      })
      if (booking && booking.tripType === 'OPEN_TRIP' && booking.openTrip && !['cancelled','completed','on_hold'].includes(booking.status)) {
        const nights = Math.max(1, Math.round(
          (new Date(booking.openTrip.endDate).getTime() - new Date(booking.openTrip.startDate).getTime()) / 86400000
        ))
        const uniqueCabinIds = [...new Set(booking.guests.map(g => g.cabinId).filter(Boolean) as string[])]
        if (uniqueCabinIds.length > 0) {
          const cabins = await db.cabin.findMany({
            where: { id: { in: uniqueCabinIds } },
            select: { id: true, price: true, pricingTiers: { select: { nights: true, price: true } } },
          })
          const cabinTotal = cabins.reduce((sum, c) => {
            const tier = c.pricingTiers.find(t => t.nights === nights)
            return sum + (tier ? tier.price : c.price * nights)
          }, 0)
          const newTotal = cabinTotal > 0 ? cabinTotal : uniqueCabinIds.length * (booking.openTrip.pricePerCabin ?? 0)
          if (newTotal > 0) {
            const dep = booking.depositPaid
            const newStatus = dep <= 0 ? 'pending' : dep >= newTotal ? 'fully_paid' : 'partially_paid'
            await db.booking.update({ where: { id: guest.bookingId }, data: { totalPrice: newTotal, status: newStatus } })
          }
        }
      }
    }

    return NextResponse.json(guest)
  } catch (error) {
    console.error('Error updating booking guest:', error)
    return NextResponse.json({ error: 'Failed to update guest' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { customerId } = await request.json()
    if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

    const guest = await db.bookingGuest.findUnique({ where: { id }, select: { bookingId: true } })
    if (!guest) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const dup = await db.bookingGuest.findFirst({
      where: { bookingId: guest.bookingId, customerId, id: { not: id } },
    })
    if (dup) return NextResponse.json({ error: 'Guest is already in this booking' }, { status: 400 })

    await db.bookingGuest.update({ where: { id }, data: { customerId } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error replacing booking guest:', error)
    return NextResponse.json({ error: 'Failed to replace guest' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    await db.bookingGuest.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting booking guest:', error)
    return NextResponse.json({ error: 'Failed to delete guest' }, { status: 500 })
  }
}
