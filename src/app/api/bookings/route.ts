import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

/* ── helpers ─────────────────────────────────────────────────────────── */

/** Compute payment status from amounts (never overrides 'completed' or 'cancelled'). */
function paymentStatus(depositPaid: number, totalPrice: number): string {
  if (depositPaid <= 0)           return 'pending'
  if (depositPaid >= totalPrice)  return 'fully_paid'
  return 'partially_paid'
}

/* ── GET ─────────────────────────────────────────────────────────────── */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status      = searchParams.get('status')
    const yachtId     = searchParams.get('yachtId')
    const customerId  = searchParams.get('customerId')
    const source      = searchParams.get('source')
    const tripType    = searchParams.get('tripType')
    const openTripId  = searchParams.get('openTripId')

    // Auto-cancel pending bookings whose deposit deadline has passed
    await db.booking.updateMany({
      where: {
        status: 'pending',
        depositDueDate: { lt: new Date() },
      },
      data: { status: 'cancelled' },
    })

    const where: Record<string, unknown> = {}
    if (status)     where.status     = status
    if (yachtId)    where.yachtId    = yachtId
    if (customerId) where.customerId = customerId
    if (source)     where.source     = source
    if (tripType)   where.tripType   = tripType
    if (openTripId) where.openTripId = openTripId

    const bookings = await db.booking.findMany({
      where,
      select: {
        id: true, bookingCode: true, source: true, tripType: true,
        startDate: true, endDate: true, status: true,
        totalPrice: true, depositPaid: true, discount: true,
        depositDueDate: true, finalDueDate: true,
        guestCount: true, destination: true, notes: true, salesperson: true,
        yacht:     { select: { id: true, name: true, model: true } },
        customer:  { select: { id: true, name: true, email: true, phone: true } },
        agent:     { select: { id: true, name: true, company: true } },
        openTrip:  { select: { id: true, title: true, destination: true } },
        guests: {
          select: {
            id: true, isLead: true, customerId: true,
            customer: { select: { name: true } },
            cabin:    { select: { id: true, name: true } },
          },
        },
        services: { select: { id: true, name: true, price: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(bookings)
  } catch (error) {
    console.error('Error fetching bookings:', error)
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
  }
}

/* ── POST ────────────────────────────────────────────────────────────── */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const body = await request.json()
    const {
      tripType, source, agentId, yachtId, openTripId,
      startDate, endDate, destination,
      totalPrice, depositPaid, discount,
      depositDueDate, finalDueDate,
      crewRequired, notes,
      guests,   // Array<{ customerId, cabinId?, isLead }>
      services, // Array<{ name, price }>
    } = body

    if (!startDate || !endDate || !guests?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const lead = guests.find((g: { isLead?: boolean }) => g.isLead) ?? guests[0]
    const paid  = parseFloat(depositPaid) || 0
    const total = parseFloat(totalPrice)  || 0

    const last = await db.booking.findFirst({
      orderBy: { bookingCode: 'desc' },
      select: { bookingCode: true },
    })
    const lastNum = last ? parseInt(last.bookingCode.replace(/\D/g, ''), 10) : 0
    const bookingCode = `BK${String(lastNum + 1).padStart(3, '0')}`

    const booking = await db.booking.create({
      data: {
        bookingCode,
        customerId:    lead.customerId,
        agentId:       agentId || null,
        openTripId:    openTripId || null,
        source:        source || 'DIRECT',
        tripType:      tripType || 'PRIVATE_CHARTER',
        yachtId:       yachtId || null,
        startDate:     new Date(startDate),
        endDate:       new Date(endDate),
        destination:   destination || null,
        totalPrice:    total,
        depositPaid:   paid,
        discount:      parseFloat(discount) || 0,
        depositDueDate: depositDueDate ? new Date(depositDueDate) : null,
        finalDueDate:   finalDueDate   ? new Date(finalDueDate)   : null,
        status:         paymentStatus(paid, total),
        guestCount:     guests.length,
        crewRequired:   crewRequired ?? false,
        notes:          notes || null,
        salesperson:    session?.user?.name || null,
        guests: {
          create: guests.map((g: { customerId: string; cabinId?: string; isLead?: boolean }) => ({
            customerId: g.customerId,
            cabinId:    g.cabinId || null,
            isLead:     g.isLead ?? false,
          })),
        },
        services: (services ?? []).filter((s: { name?: string }) => s.name?.trim()).length > 0
          ? {
              create: (services as { name: string; price: number | string }[])
                .filter(s => s.name?.trim())
                .map(s => ({ name: s.name, price: parseFloat(String(s.price)) || 0 })),
            }
          : undefined,
      },
      select: { id: true, bookingCode: true, status: true },
    })

    return NextResponse.json(booking, { status: 201 })
  } catch (error) {
    console.error('Error creating booking:', error)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }
}
