import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const customer = await db.customer.findUnique({
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
      },
    })

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

    // Deduplicate (guest can appear in both as lead booking and guestOf)
    const seen = new Set<string>()
    const tripHistory = [...asLead, ...asGuest]
      .filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true })
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())

    return NextResponse.json({ ...customer, tripHistory })
  } catch (error) {
    console.error('Error fetching customer:', error)
    return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
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
    }).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting customer:', error)
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    const { id } = await params
    const body = await request.json()
    const {
      firstName, lastName, gender, email, phone,
      passport, dateOfBirth, address,
      dietaryRequirements, allergies, equipmentSizes, operationalNotes,
    } = body

    const name = [firstName, lastName].filter(Boolean).join(' ') || body.name
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const customer = await db.customer.update({
      where: { id },
      data: {
        name, firstName, lastName, gender, email, phone,
        passport, address, dietaryRequirements, allergies,
        equipmentSizes, operationalNotes,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      },
    })

    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'UPDATE', entity: 'Customer', entityId: id,
      detail: `Update guest: ${customer.name}`,
    }).catch(() => {})

    return NextResponse.json(customer)
  } catch (error) {
    console.error('Error updating customer:', error)
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 })
  }
}
