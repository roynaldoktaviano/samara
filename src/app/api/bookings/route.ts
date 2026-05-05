import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const yachtId = searchParams.get('yachtId')
    const customerId = searchParams.get('customerId')

    const where: any = {}
    if (status) where.status = status
    if (yachtId) where.yachtId = yachtId
    if (customerId) where.customerId = customerId

    const bookings = await db.booking.findMany({
      where,
      include: {
        yacht: {
          select: {
            id: true,
            name: true,
            model: true
          }
        },
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json(bookings)
  } catch (error) {
    console.error('Error fetching bookings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch bookings' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      yachtId,
      customerId,
      startDate,
      endDate,
      totalPrice,
      depositPaid,
      notes
    } = body

    if (!yachtId || !customerId || !startDate || !endDate || !totalPrice) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Generate unique booking code
    const bookingCount = await db.booking.count()
    const paddedCount = String(bookingCount + 1).padStart(3, '0')
    const finalBookingCode = `BK${paddedCount}`

    const booking = await db.booking.create({
      data: {
        bookingCode: finalBookingCode,
        yachtId,
        customerId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: parseFloat(totalPrice),
        depositPaid: depositPaid ? parseFloat(depositPaid) : 0,
        notes,
        status: body.status ?? 'confirmed'
      },
      include: {
        yacht: true,
        customer: true
      }
    })

    return NextResponse.json(booking, { status: 201 })
  } catch (error) {
    console.error('Error creating booking:', error)
    return NextResponse.json(
      { error: 'Failed to create booking' },
      { status: 500 }
    )
  }
}
