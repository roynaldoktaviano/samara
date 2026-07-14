import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantByLookup } from '@/lib/resolve-tenant'
import type { PrismaClient } from '@prisma/client'

const ALLOWED_SECTIONS = ['medical', 'food', 'drinks', 'diving', 'surfing', 'profile'] as const
type Section = typeof ALLOWED_SECTIONS[number]

async function getGuest(db: PrismaClient, token: string) {
  const customer = await db.customer.findUnique({
    where: { guestFormToken: token },
    select: {
      id: true, name: true, firstName: true, lastName: true, gender: true,
      email: true, phone: true, passport: true, dateOfBirth: true,
      address: true, nationality: true, passportExpiry: true,
      emergencyContact: true, dietaryRequirements: true, allergies: true,
      drinkPreferences: true, equipmentSizes: true,
      passportImage: true,
      guestFormExpiresAt: true,
      medicalData: true, foodData: true, drinksData: true, divingData: true, surfingData: true,
    },
  })
  return customer
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = await resolveTenantByLookup(client => getGuest(client, token))
  if (!found) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  const { db, record: customer } = found
  if (customer.guestFormExpiresAt && new Date(customer.guestFormExpiresAt) < new Date()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }

  const bgId = req.nextUrl.searchParams.get('bg')
  let hasDiving = false
  let hasSurfing = false
  let isOpenTrip = false
  let tripInfo: Record<string, unknown> | null = null

  if (bgId) {
    const bg = await db.bookingGuest.findUnique({
      where: { id: bgId },
      select: {
        booking: {
          select: {
            hasDiving: true, hasSurfing: true, tripType: true, bookingCode: true,
            startDate: true, endDate: true, destination: true,
            yacht: { select: { name: true, canDiving: true, canSurfing: true } },
            openTrip: { select: { title: true, destination: true, startDate: true, endDate: true, yacht: { select: { name: true } } } },
          },
        },
      },
    })
    if (bg?.booking) {
      const b = bg.booking
      hasDiving  = (b.hasDiving ?? false) && (b.yacht?.canDiving ?? false)
      hasSurfing = (b.hasSurfing ?? false) && (b.yacht?.canSurfing ?? false)
      isOpenTrip = b.tripType === 'OPEN_TRIP'
      tripInfo = {
        bookingCode: b.bookingCode,
        startDate:   isOpenTrip ? b.openTrip?.startDate : b.startDate,
        endDate:     isOpenTrip ? b.openTrip?.endDate   : b.endDate,
        destination: isOpenTrip ? b.openTrip?.destination : b.destination,
        yachtName:   isOpenTrip ? b.openTrip?.yacht?.name : b.yacht?.name,
        tripTitle:   isOpenTrip ? b.openTrip?.title : null,
        tripType:    b.tripType,
      }
    }
  }

  return NextResponse.json({ ...customer, hasDiving, hasSurfing, isOpenTrip, tripInfo })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = await resolveTenantByLookup(client => getGuest(client, token))
  if (!found) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  const { db, record: customer } = found
  if (customer.guestFormExpiresAt && new Date(customer.guestFormExpiresAt) < new Date()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }

  const body = await req.json()
  const { section, data } = body as { section: Section; data: Record<string, unknown> }

  if (!ALLOWED_SECTIONS.includes(section)) {
    return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
  }

  if (section === 'profile') {
    const { firstName, lastName, gender, email, phone, passport,
      dateOfBirth, address, nationality, passportExpiry, passportImage } = data as Record<string, string | null | undefined>
    await db.customer.update({
      where: { id: customer.id },
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
      where: { id: customer.id },
      data: { [fieldMap[section]]: data },
    })
  }

  return NextResponse.json({ ok: true })
}
