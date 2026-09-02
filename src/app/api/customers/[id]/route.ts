import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { withRetry } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    // withRetry: a serverless Postgres compute (Neon) that's been idle can take a moment to
    // wake up on the next query, transiently failing the first attempt — retry once instead
    // of surfacing that as a false "customer not found"/500 to the person viewing this page.
    const customer = await withRetry(db, () => db.customer.findUnique({
      where: { id },
      include: {
        bookings: {
          include: {
            yacht: { select: { name: true } },
            openTrip: { select: { title: true } },
          },
          orderBy: { startDate: 'desc' },
        },
        guestOf: {
          include: {
            booking: {
              include: {
                yacht: { select: { name: true } },
                openTrip: { select: { title: true } },
              },
            },
            cabin: { select: { name: true } },
          },
          orderBy: { id: 'desc' },
        },
        waitingListItems: {
          include: {
            booking:  { select: { bookingCode: true, tripType: true, destination: true, yachtId: true } },
            yacht:    { select: { name: true } },
            openTrip: { select: { title: true, destination: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    }))

    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Merge bookings as lead + bookings as guest into unified trip history
    const asLead = customer.bookings.map(b => ({
      id: b.id,
      bookingCode: b.bookingCode,
      tripType: b.tripType,
      startDate: b.startDate,
      endDate: b.endDate,
      destination: b.destination ?? '',
      status: b.status,
      totalPrice: b.totalPrice,
      yachtName: b.yacht?.name ?? '',
      tripTitle: b.openTrip?.title ?? '',
      isLead: true,
      cabin: '',
    }))

    const asGuest = customer.guestOf.map(g => ({
      id: g.booking.id,
      bookingCode: g.booking.bookingCode,
      tripType: g.booking.tripType,
      startDate: g.booking.startDate,
      endDate: g.booking.endDate,
      destination: g.booking.destination ?? '',
      status: g.booking.status,
      totalPrice: g.booking.totalPrice,
      yachtName: g.booking.yacht?.name ?? '',
      tripTitle: g.booking.openTrip?.title ?? '',
      isLead: g.isLead,
      cabin: g.cabin?.name ?? '',
    }))

    const asWaitingList = customer.waitingListItems.map(w => ({
      id: `wl-${w.id}`,
      bookingCode: w.booking?.bookingCode ?? `WL-${w.id.slice(-6).toUpperCase()}`,
      tripType: w.openTripId ? 'OPEN_TRIP' : (w.booking?.tripType ?? 'PRIVATE_CHARTER'),
      startDate: w.startDate,
      endDate: w.endDate,
      destination: w.openTrip?.destination ?? w.booking?.destination ?? '',
      status: w.status,
      totalPrice: 0,
      yachtName: w.yacht?.name ?? '',
      tripTitle: w.openTrip?.title ?? '',
      isLead: false,
      cabin: '',
      isWaitingList: true,
      wlStatus: w.status,
    }))

    // Deduplicate (guest can appear in both as lead booking and guestOf)
    const seen = new Set<string>()
    const tripHistory = [...asLead, ...asGuest, ...asWaitingList]
      .filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true })
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())

    return NextResponse.json({ ...customer, tripHistory })
  } catch (error) {
    console.error('Error fetching customer:', error)
    return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if ((session?.user as { role?: string })?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const db = await getDb(session)
  try {
    const { id } = await params
    const bookingCount = await db.booking.count({ where: { customerId: id } })
    if (bookingCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${bookingCount} booking(s) reference this customer` },
        { status: 409 }
      )
    }
    const existing = await db.customer.findUnique({ where: { id }, select: { name: true } })
    await db.customer.update({ where: { id }, data: { deletedAt: new Date() } })

    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'DELETE', entity: 'Customer', entityId: id,
      detail: `Hapus guest: ${existing?.name ?? id}`,
    }, db).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting customer:', error)
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const body = await request.json()
    const {
      firstName, lastName, gender, email, phone,
      passport, dateOfBirth, address,
      dietaryRequirements, allergies, equipmentSizes, operationalNotes,
      nationality, passportExpiry, emergencyContact, drinkPreferences,
      medicalData, foodData, drinksData, divingData, surfingData,
      passportImage,
    } = body

    const name = [firstName, lastName].filter(Boolean).join(' ') || body.name
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const parsedDob = dateOfBirth ? new Date(dateOfBirth) : null
    const isChild = parsedDob
      ? Math.floor((Date.now() - parsedDob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) < 12
      : undefined

    const customer = await db.customer.update({
      where: { id },
      data: {
        name, firstName, lastName, gender, email, phone,
        passport, address, dietaryRequirements, allergies,
        equipmentSizes, operationalNotes,
        nationality, emergencyContact, drinkPreferences,
        dateOfBirth: parsedDob,
        passportExpiry: passportExpiry ? new Date(passportExpiry) : null,
        ...(isChild !== undefined && { isChild }),
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
      action: 'UPDATE', entity: 'Customer', entityId: id,
      detail: `Update guest: ${customer.name}`,
    }, db).catch(() => {})

    return NextResponse.json(customer)
  } catch (error) {
    console.error('Error updating customer:', error)
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 })
  }
}
