import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { arrivalPickupTime, arrivalHotel, arrivalFlight, departurePickupTime, departureHotel, departureFlight } = await request.json()

    const guest = await db.bookingGuest.update({
      where: { id },
      data: { arrivalPickupTime, arrivalHotel, arrivalFlight, departurePickupTime, departureHotel, departureFlight },
    })

    return NextResponse.json(guest)
  } catch (error) {
    console.error('Error updating booking guest:', error)
    return NextResponse.json({ error: 'Failed to update guest' }, { status: 500 })
  }
}
