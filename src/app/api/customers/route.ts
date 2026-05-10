import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')

    const customers = await db.customer.findMany({
      where: { deletedAt: null },
      include: {
        _count: { select: { bookings: true, guestOf: true } },
        bookings: { select: { totalPrice: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    let result = customers.map(c => ({
      ...c,
      totalBookings: c._count.bookings + c._count.guestOf,
      totalSpent: c.bookings.reduce((s, b) => s + b.totalPrice, 0),
    }))

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.passport?.toLowerCase().includes(q)
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching customers:', error)
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const body = await request.json()
    const {
      firstName, lastName, gender, email, phone,
      passport, dateOfBirth, address,
      dietaryRequirements, allergies, equipmentSizes, operationalNotes,
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
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      },
    })

    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'CREATE', entity: 'Customer', entityId: customer.id,
      detail: `Tambah guest: ${customer.name}`,
    }).catch(() => {})

    return NextResponse.json(customer, { status: 201 })
  } catch (error) {
    console.error('Error creating customer:', error)
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 })
  }
}
