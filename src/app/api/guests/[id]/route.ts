import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const { arrivalPickupTime, arrivalHotel, arrivalFlight, departurePickupTime, departureHotel, departureFlight, cabinId } = body

    const data: Record<string, unknown> = {
      arrivalPickupTime, arrivalHotel, arrivalFlight,
      departurePickupTime, departureHotel, departureFlight,
    }
    if (cabinId !== undefined) data.cabinId = cabinId || null

    const guest = await db.bookingGuest.update({ where: { id }, data })
    return NextResponse.json(guest)
  } catch (error) {
    console.error('Error updating booking guest:', error)
    return NextResponse.json({ error: 'Failed to update guest' }, { status: 500 })
  }
}
