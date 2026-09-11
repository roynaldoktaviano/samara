import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const limit  = Math.min(parseInt(searchParams.get('limit') ?? '500') || 500, 2000)
    const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)

    const where: Record<string, unknown> = { deletedAt: null }
    if (search) {
      where.OR = [
        { name:     { contains: search, mode: 'insensitive' } },
        { email:    { contains: search, mode: 'insensitive' } },
        { phone:    { contains: search, mode: 'insensitive' } },
        { passport: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [customers, total] = await Promise.all([
      db.customer.findMany({
        where,
        select: {
          id: true, name: true, firstName: true, lastName: true,
          gender: true, email: true, phone: true, passport: true,
          dateOfBirth: true, address: true, nationality: true,
          passportExpiry: true, emergencyContact: true,
          dietaryRequirements: true, allergies: true,
          drinkPreferences: true, equipmentSizes: true, operationalNotes: true,
          isChild: true, deletedAt: true, createdAt: true, updatedAt: true,
          // A booking's own account holder also gets their own BookingGuest row (isLead:
          // true, same bookingId) — so counting bookings + guestOf separately would double-
          // count that one trip. Union the two sets of bookingIds instead (see below).
          bookings: { select: { id: true, totalPrice: true } },
          guestOf: { select: { isLead: true, bookingId: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.customer.count({ where }),
    ])

    const unsubscribed = await db.emailUnsubscribe.findMany({ select: { email: true } })
    const unsubscribedSet = new Set(unsubscribed.map(u => u.email.toLowerCase()))

    const result = customers.map(c => {
      // "Subscribed" mirrors who the Marketing module's "Guest" audience actually
      // includes (see resolveAudience() in src/lib/marketing.ts) — only the lead/
      // primary booker on a booking, never a companion someone else typed into the
      // multi-guest form (BookingGuest.isLead: false), so this badge doesn't claim
      // someone opted in when they never had the chance to.
      const isEligible = !!c.email && c.email.includes('@') && c.guestOf.some(g => g.isLead)
      const { guestOf, bookings, ...rest } = c
      const bookingIds = new Set([...bookings.map(b => b.id), ...guestOf.map(g => g.bookingId)])
      return {
        ...rest,
        totalBookings: bookingIds.size,
        totalSpent: bookings.reduce((s, b) => s + b.totalPrice, 0),
        isSubscribed: isEligible ? !unsubscribedSet.has(c.email!.toLowerCase()) : null,
      }
    })

    // Body stays a plain array for existing callers (BookingWizard, calendar
    // search, etc.) that expect that shape; the true count (which can exceed
    // the capped `take`) rides along as a header for callers that display it.
    return NextResponse.json(result, { headers: { 'X-Total-Count': String(total) } })
  } catch (error) {
    console.error('Error fetching customers:', error)
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const body = await request.json()
    const {
      firstName, lastName, gender, email, phone,
      passport, dateOfBirth, address,
      dietaryRequirements, allergies, equipmentSizes, operationalNotes,
      nationality, passportExpiry, emergencyContact, drinkPreferences,
      isChild,
      medicalData, foodData, drinksData, divingData, surfingData, passportImage,
    } = body

    const name = [firstName, lastName].filter(Boolean).join(' ') || body.name
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const customer = await db.customer.create({
      data: {
        name, firstName, lastName, gender, email, phone,
        passport, address, operationalNotes, equipmentSizes,
        dietaryRequirements, allergies,
        nationality, emergencyContact, drinkPreferences,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        passportExpiry: passportExpiry ? new Date(passportExpiry) : null,
        isChild: isChild ?? false,
        ...(medicalData   !== undefined && { medicalData }),
        ...(foodData      !== undefined && { foodData }),
        ...(drinksData    !== undefined && { drinksData }),
        ...(divingData    !== undefined && { divingData }),
        ...(surfingData   !== undefined && { surfingData }),
        ...(passportImage !== undefined && { passportImage: passportImage || null }),
      },
    })

    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'CREATE', entity: 'Customer', entityId: customer.id,
      detail: `Add customer: ${customer.name}`,
    }, db).catch(() => {})

    return NextResponse.json(customer, { status: 201 })
  } catch (error) {
    console.error('Error creating customer:', error)
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 })
  }
}
