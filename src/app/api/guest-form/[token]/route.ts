import { NextRequest, NextResponse } from 'next/server'
import { db as prisma } from '@/lib/db'

const ALLOWED_SECTIONS = ['medical', 'food', 'drinks', 'housekeeping', 'service', 'diving', 'surfing', 'profile'] as const
type Section = typeof ALLOWED_SECTIONS[number]

async function getGuest(token: string) {
  const customer = await (prisma.customer as any).findUnique({
    where: { guestFormToken: token },
    select: {
      id: true, name: true, firstName: true, lastName: true, gender: true,
      email: true, phone: true, passport: true, dateOfBirth: true,
      address: true, nationality: true, passportExpiry: true,
      emergencyContact: true, dietaryRequirements: true, allergies: true,
      drinkPreferences: true, equipmentSizes: true,
      guestFormExpiresAt: true,
      medicalData: true, foodData: true, drinksData: true,
      housekeepingData: true, serviceData: true, divingData: true, surfingData: true,
    },
  })
  return customer
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const customer = await getGuest(token)
  if (!customer) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (customer.guestFormExpiresAt && new Date(customer.guestFormExpiresAt) < new Date()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }
  return NextResponse.json(customer)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const customer = await getGuest(token)
  if (!customer) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
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
      dateOfBirth, address, nationality, passportExpiry } = data as any
    await prisma.customer.update({
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
      },
    })
  } else {
    const fieldMap: Record<string, string> = {
      medical:     'medicalData',
      food:        'foodData',
      drinks:      'drinksData',
      housekeeping:'housekeepingData',
      service:     'serviceData',
      diving:      'divingData',
      surfing:     'surfingData',
    }
    await (prisma.customer as any).update({
      where: { id: customer.id },
      data: { [fieldMap[section]]: data },
    })
  }

  return NextResponse.json({ ok: true })
}
