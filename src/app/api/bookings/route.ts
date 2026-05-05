import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const yachtId = searchParams.get('yachtId')
    const customerId = searchParams.get('customerId')
    const source = searchParams.get('source')
    const tripType = searchParams.get('tripType')
    const openTripId = searchParams.get('openTripId')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (yachtId) where.yachtId = yachtId
    if (customerId) where.customerId = customerId
    if (source) where.source = source
    if (tripType) where.tripType = tripType
    if (openTripId) where.openTripId = openTripId

    const bookings = await db.booking.findMany({
      where,
      include: {
        yacht: { select: { id: true, name: true, model: true } },
        customer: { select: { id: true, name: true, email: true, phone: true } },
        agent: { select: { id: true, name: true, company: true } },
        openTrip: { select: { id: true, title: true, destination: true } },
        guests: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            cabin: { select: { id: true, name: true } },
          },
        },
        services: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(bookings)
  } catch (error) {
    console.error('Error fetching bookings:', error)
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      tripType,
      source,
      agentId,
      yachtId,
      openTripId,
      startDate,
      endDate,
      destination,
      totalPrice,
      depositPaid,
      discount,
      crewRequired,
      notes,
      guests,   // Array<{ customerId, cabinId?, isLead }>
      services, // Array<{ name, price }>
      status,
    } = body

    if (!startDate || !endDate || !totalPrice || !guests?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Lead guest becomes the booking's primary customer
    const lead = guests.find((g: { isLead?: boolean }) => g.isLead) ?? guests[0]
    const primaryCustomerId = lead.customerId

    const bookingCount = await db.booking.count()
    const bookingCode = `BK${String(bookingCount + 1).padStart(3, '0')}`

    const booking = await db.booking.create({
      data: {
        bookingCode,
        customerId: primaryCustomerId,
        agentId: agentId || null,
        openTripId: openTripId || null,
        source: source || 'DIRECT',
        tripType: tripType || 'PRIVATE_CHARTER',
        yachtId: yachtId || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        destination: destination || null,
        totalPrice: parseFloat(totalPrice),
        depositPaid: depositPaid ? parseFloat(depositPaid) : 0,
        discount: discount ? parseFloat(discount) : 0,
        guestCount: guests.length,
        crewRequired: crewRequired ?? false,
        notes: notes || null,
        status: status ?? 'confirmed',
        guests: {
          create: guests.map((g: { customerId: string; cabinId?: string; isLead?: boolean }) => ({
            customerId: g.customerId,
            cabinId: g.cabinId || null,
            isLead: g.isLead ?? false,
          })),
        },
        services: (services ?? []).filter((s: { name?: string }) => s.name?.trim()).length > 0
          ? {
              create: (services as { name: string; price: number | string }[])
                .filter((s) => s.name?.trim())
                .map((s) => ({ name: s.name, price: parseFloat(String(s.price)) || 0 })),
            }
          : undefined,
      },
      include: {
        yacht: true,
        customer: true,
        agent: true,
        openTrip: true,
        guests: { include: { customer: true, cabin: true } },
        services: true,
      },
    })

    return NextResponse.json(booking, { status: 201 })
  } catch (error) {
    console.error('Error creating booking:', error)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }
}
