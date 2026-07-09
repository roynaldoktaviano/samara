import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/get-db'

const ALLOWED_SECTIONS = ['medical', 'food', 'drinks', 'diving', 'surfing', 'profile', 'travel'] as const
type Section = typeof ALLOWED_SECTIONS[number]

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const db = await getDb()
  const { token } = await params

  const booking = await db.booking.findUnique({
    where: { masterFormToken: token },
    select: {
      id: true,
      bookingCode: true,
      startDate: true,
      endDate: true,
      destination: true,
      hasDiving: true,
      hasSurfing: true,
      tripType: true,
      masterFormExpiresAt: true,
      yacht:    { select: { name: true, canDiving: true, canSurfing: true } },
      openTrip: { select: { title: true, destination: true, startDate: true, endDate: true, yacht: { select: { name: true } } } },
      guests: {
        select: {
          id: true,
          isLead: true,
          arrivalPickupTime: true, arrivalHotel: true, arrivalFlight: true,
          departurePickupTime: true, departureHotel: true, departureFlight: true,
          customer: {
            select: {
              id: true, name: true, firstName: true, lastName: true,
              gender: true, email: true, phone: true, passport: true,
              dateOfBirth: true, address: true, nationality: true, passportExpiry: true,
              passportImage: true,
              emergencyContact: true,
              medicalData: true, foodData: true, drinksData: true, divingData: true, surfingData: true,
            },
          },
        },
        orderBy: [{ isLead: 'desc' }, { id: 'asc' }],
      },
    },
  })

  if (!booking) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (booking.masterFormExpiresAt && new Date(booking.masterFormExpiresAt) < new Date()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }

  const isOpenTrip = booking.tripType === 'OPEN_TRIP'
  const hasDiving  = (booking.hasDiving ?? false) && (booking.yacht?.canDiving ?? false) && !isOpenTrip
  const hasSurfing = (booking.hasSurfing ?? false) && (booking.yacht?.canSurfing ?? false) && !isOpenTrip

  const tripInfo = {
    bookingCode: booking.bookingCode,
    startDate:   isOpenTrip ? booking.openTrip?.startDate : booking.startDate,
    endDate:     isOpenTrip ? booking.openTrip?.endDate   : booking.endDate,
    destination: isOpenTrip ? booking.openTrip?.destination : booking.destination,
    yachtName:   isOpenTrip ? booking.openTrip?.yacht?.name : booking.yacht?.name,
    tripTitle:   isOpenTrip ? booking.openTrip?.title : null,
    tripType:    booking.tripType,
  }

  const guests = booking.guests.map((g: any) => ({
    bookingGuestId: g.id,
    isLead: g.isLead,
    ...g.customer,
  }))

  const leadGuest = booking.guests.find((g: any) => g.isLead) ?? booking.guests[0]
  const travel = leadGuest ? {
    arrivalPickupTime:   leadGuest.arrivalPickupTime   ?? '',
    arrivalHotel:        leadGuest.arrivalHotel         ?? '',
    arrivalFlight:       leadGuest.arrivalFlight        ?? '',
    departurePickupTime: leadGuest.departurePickupTime ?? '',
    departureHotel:      leadGuest.departureHotel       ?? '',
    departureFlight:     leadGuest.departureFlight      ?? '',
  } : null

  return NextResponse.json({ tripInfo, hasDiving, hasSurfing, guests, travel, expiresAt: booking.masterFormExpiresAt })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const db = await getDb()
  const { token } = await params

  const booking = await db.booking.findUnique({
    where: { masterFormToken: token },
    select: {
      id: true,
      masterFormExpiresAt: true,
      guests: { select: { customerId: true } },
    },
  })

  if (!booking) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (booking.masterFormExpiresAt && new Date(booking.masterFormExpiresAt) < new Date()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }

  const body = await req.json()
  const { customerId, section, data } = body as { customerId: string; section: Section; data: Record<string, unknown> }

  if (!ALLOWED_SECTIONS.includes(section)) {
    return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
  }

  // Travel details are shared across the whole booking, not tied to one customer
  if (section === 'travel') {
    const { arrivalPickupTime, arrivalHotel, arrivalFlight, departurePickupTime, departureHotel, departureFlight } =
      data as Record<string, string | null | undefined>
    await db.bookingGuest.updateMany({
      where: { bookingId: booking.id },
      data: {
        arrivalPickupTime:   arrivalPickupTime   || null,
        arrivalHotel:        arrivalHotel         || null,
        arrivalFlight:       arrivalFlight        || null,
        departurePickupTime: departurePickupTime || null,
        departureHotel:      departureHotel       || null,
        departureFlight:     departureFlight      || null,
      },
    })
    return NextResponse.json({ ok: true })
  }

  const isGuestOfBooking = booking.guests.some((g: any) => g.customerId === customerId)
  if (!isGuestOfBooking) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (section === 'profile') {
    const { firstName, lastName, gender, email, phone, passport,
      dateOfBirth, address, nationality, passportExpiry, passportImage } = data as Record<string, string | null | undefined>
    await db.customer.update({
      where: { id: customerId },
      data: {
        firstName: firstName || undefined,
        lastName:  lastName  || undefined,
        name: [firstName, lastName].filter(Boolean).join(' ') || undefined,
        gender: gender || undefined,
        email:  email  || undefined,
        phone:  phone  || undefined,
        passport: passport || undefined,
        dateOfBirth:    dateOfBirth    ? new Date(dateOfBirth)    : undefined,
        address: address || undefined,
        nationality: nationality || undefined,
        passportExpiry: passportExpiry ? new Date(passportExpiry) : undefined,
        ...(passportImage !== undefined && { passportImage: passportImage || null }),
      },
    })
  } else {
    const fieldMap: Record<string, string> = {
      medical: 'medicalData',
      food:    'foodData',
      drinks:  'drinksData',
      diving:   'divingData',
      surfing:  'surfingData',
    }
    await db.customer.update({
      where: { id: customerId },
      data: { [fieldMap[section]]: data },
    })
  }

  return NextResponse.json({ ok: true })
}
