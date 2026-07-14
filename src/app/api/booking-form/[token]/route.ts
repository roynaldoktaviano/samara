import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantByLookup } from '@/lib/resolve-tenant'
import type { PrismaClient } from '@prisma/client'

const ALLOWED_SECTIONS = ['medical', 'food', 'drinks', 'diving', 'surfing', 'profile', 'travel'] as const
type Section = typeof ALLOWED_SECTIONS[number]

/** Max guests this booking can self-register — the whole vessel for a private charter,
 *  or the combined capacity of whichever cabin(s) this booking has already reserved for an open trip. */
async function computeCapacity(db: PrismaClient, bookingId: string, tripType: string): Promise<number | null> {
  if (tripType === 'PRIVATE_CHARTER') {
    const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { yacht: { select: { capacity: true } } } })
    return booking?.yacht?.capacity ?? null
  }
  if (tripType === 'OPEN_TRIP') {
    const guests = await db.bookingGuest.findMany({
      where: { bookingId },
      select: { cabinId: true, cabin: { select: { capacity: true } } },
    })
    const seen = new Set<string>()
    let sum = 0
    for (const g of guests) {
      if (g.cabinId && g.cabin && !seen.has(g.cabinId)) {
        seen.add(g.cabinId)
        sum += g.cabin.capacity
      }
    }
    return sum > 0 ? sum : null
  }
  return null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const found = await resolveTenantByLookup(client => client.booking.findUnique({
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
      yacht:    { select: { name: true, canDiving: true, canSurfing: true, capacity: true } },
      openTrip: { select: { title: true, destination: true, startDate: true, endDate: true, yacht: { select: { name: true } } } },
      guests: {
        select: {
          id: true,
          isLead: true,
          cabinId: true,
          cabin: { select: { capacity: true } },
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
  }))

  if (!found) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  const { record: booking } = found
  if (booking.masterFormExpiresAt && new Date(booking.masterFormExpiresAt) < new Date()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }

  const isOpenTrip = booking.tripType === 'OPEN_TRIP'
  const hasDiving  = (booking.hasDiving ?? false) && (booking.yacht?.canDiving ?? false) && !isOpenTrip
  const hasSurfing = (booking.hasSurfing ?? false) && (booking.yacht?.canSurfing ?? false) && !isOpenTrip

  let capacity: number | null = null
  if (booking.tripType === 'PRIVATE_CHARTER') {
    capacity = booking.yacht?.capacity ?? null
  } else if (booking.tripType === 'OPEN_TRIP') {
    const seen = new Set<string>()
    let sum = 0
    for (const g of booking.guests) {
      if (g.cabinId && g.cabin && !seen.has(g.cabinId)) {
        seen.add(g.cabinId)
        sum += g.cabin.capacity
      }
    }
    capacity = sum > 0 ? sum : null
  }

  const tripInfo = {
    bookingCode: booking.bookingCode,
    startDate:   isOpenTrip ? booking.openTrip?.startDate : booking.startDate,
    endDate:     isOpenTrip ? booking.openTrip?.endDate   : booking.endDate,
    destination: isOpenTrip ? booking.openTrip?.destination : booking.destination,
    yachtName:   isOpenTrip ? booking.openTrip?.yacht?.name : booking.yacht?.name,
    tripTitle:   isOpenTrip ? booking.openTrip?.title : null,
    tripType:    booking.tripType,
    // Private charters have the whole vessel; open trips are capped by whichever cabin(s) this booking reserved.
    capacity,
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

  // Medical/food/drinks are answered once for the whole booking (mirrors travel) — sourced from
  // the lead guest's record, which is where shared PUTs below write the answers to every guest.
  const medical = leadGuest?.customer.medicalData ?? {}
  const food    = leadGuest?.customer.foodData    ?? {}
  const drinks  = leadGuest?.customer.drinksData  ?? {}

  return NextResponse.json({ tripInfo, hasDiving, hasSurfing, guests, travel, medical, food, drinks, expiresAt: booking.masterFormExpiresAt })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const found = await resolveTenantByLookup(client => client.booking.findUnique({
    where: { masterFormToken: token },
    select: {
      id: true,
      masterFormExpiresAt: true,
      guests: { select: { customerId: true } },
    },
  }))

  if (!found) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  const { db, record: booking } = found
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

  // Medical/food/drinks are answered once for the whole booking (mirrors travel) — the same
  // answer is written to every guest's record rather than tracked per person.
  if (section === 'medical' || section === 'food' || section === 'drinks') {
    const fieldMap: Record<string, string> = { medical: 'medicalData', food: 'foodData', drinks: 'drinksData' }
    await db.customer.updateMany({
      where: { id: { in: booking.guests.map((g: any) => g.customerId) } },
      data: { [fieldMap[section]]: data },
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

/** Self-service guest add — private charters (whole vessel already theirs) and open trips
 *  (capped to whichever cabin(s) this booking has reserved). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const found = await resolveTenantByLookup(client => client.booking.findUnique({
    where: { masterFormToken: token },
    select: {
      id: true,
      tripType: true,
      masterFormExpiresAt: true,
      guests: { select: { id: true } },
    },
  }))

  if (!found) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  const { db, record: booking } = found
  if (booking.masterFormExpiresAt && new Date(booking.masterFormExpiresAt) < new Date()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }
  if (booking.tripType !== 'PRIVATE_CHARTER' && booking.tripType !== 'OPEN_TRIP') {
    return NextResponse.json({ error: 'Adding guests is not available for this booking' }, { status: 400 })
  }

  const capacity = await computeCapacity(db, booking.id, booking.tripType)
  if (capacity != null && booking.guests.length >= capacity) {
    return NextResponse.json({ error: 'This booking is already at full capacity' }, { status: 400 })
  }

  const body = await req.json()
  const name = (body?.name as string | undefined)?.trim()
  if (!name) return NextResponse.json({ error: 'Guest name is required' }, { status: 400 })

  // A draft guest submits their full Personal Details in this same call — that's the moment
  // they become a real, official guest on the booking (see the group form's "Add Guest" flow).
  const { firstName, lastName, gender, email, phone, passport,
    dateOfBirth, address, nationality, passportExpiry, passportImage } = body as Record<string, string | null | undefined>

  const customer = await db.customer.create({
    data: {
      name,
      firstName: firstName || null,
      lastName:  lastName  || null,
      gender:    gender    || null,
      email:     email     || null,
      phone:     phone     || null,
      passport:  passport  || null,
      dateOfBirth:    dateOfBirth    ? new Date(dateOfBirth)    : null,
      address:        address        || null,
      nationality:    nationality    || null,
      passportExpiry: passportExpiry ? new Date(passportExpiry) : null,
      passportImage:  passportImage  || null,
    },
  })
  const guest = await db.bookingGuest.create({
    data: { bookingId: booking.id, customerId: customer.id, isLead: false },
  })
  await db.booking.update({ where: { id: booking.id }, data: { guestCount: { increment: 1 } } })

  return NextResponse.json({
    bookingGuestId: guest.id,
    isLead: false,
    id: customer.id,
    name: customer.name,
    firstName: customer.firstName ?? '', lastName: customer.lastName ?? '', gender: customer.gender ?? '',
    email: customer.email ?? '', phone: customer.phone ?? '', passport: customer.passport ?? '',
    dateOfBirth: customer.dateOfBirth ? customer.dateOfBirth.toISOString() : '',
    address: customer.address ?? '', nationality: customer.nationality ?? '',
    passportExpiry: customer.passportExpiry ? customer.passportExpiry.toISOString() : '',
    passportImage: customer.passportImage ?? '',
    medicalData: null, foodData: null, drinksData: null, divingData: null, surfingData: null,
  })
}

/** Self-service guest removal — the Group Leader can't be removed. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const found = await resolveTenantByLookup(client => client.booking.findUnique({
    where: { masterFormToken: token },
    select: { id: true, masterFormExpiresAt: true },
  }))
  if (!found) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  const { db, record: booking } = found
  if (booking.masterFormExpiresAt && new Date(booking.masterFormExpiresAt) < new Date()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }

  const body = await req.json()
  const bookingGuestId = body?.bookingGuestId as string | undefined
  if (!bookingGuestId) return NextResponse.json({ error: 'bookingGuestId is required' }, { status: 400 })

  const guest = await db.bookingGuest.findUnique({ where: { id: bookingGuestId }, select: { bookingId: true, isLead: true } })
  if (!guest || guest.bookingId !== booking.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (guest.isLead) return NextResponse.json({ error: 'The Group Leader can’t be removed' }, { status: 400 })

  await db.bookingGuest.delete({ where: { id: bookingGuestId } })
  await db.booking.update({ where: { id: booking.id }, data: { guestCount: { decrement: 1 } } })

  return NextResponse.json({ ok: true })
}
