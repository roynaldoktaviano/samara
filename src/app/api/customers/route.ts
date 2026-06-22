import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const limit  = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 500

    const where: Record<string, unknown> = { deletedAt: null }
    if (search) {
      where.OR = [
        { name:     { contains: search, mode: 'insensitive' } },
        { email:    { contains: search, mode: 'insensitive' } },
        { phone:    { contains: search, mode: 'insensitive' } },
        { passport: { contains: search, mode: 'insensitive' } },
      ]
    }

    const customers = await db.customer.findMany({
      where,
      select: {
        id: true, name: true, firstName: true, lastName: true,
        gender: true, email: true, phone: true, passport: true,
        dateOfBirth: true, address: true, nationality: true,
        passportExpiry: true, emergencyContact: true,
        dietaryRequirements: true, allergies: true,
        drinkPreferences: true, equipmentSizes: true, operationalNotes: true,
        isChild: true, deletedAt: true, createdAt: true, updatedAt: true,
        _count: { select: { bookings: true, guestOf: true } },
        bookings: { select: { totalPrice: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const result = customers.map(c => ({
      ...c,
      totalBookings: c._count.bookings + c._count.guestOf,
      totalSpent: c.bookings.reduce((s, b) => s + b.totalPrice, 0),
    }))

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
      nationality, passportExpiry, emergencyContact, drinkPreferences,
      isChild,
      medicalData, foodData, drinksData, divingData, passportImage,
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
        ...(passportImage !== undefined && { passportImage: passportImage || null }),
      },
    })

    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'CREATE', entity: 'Customer', entityId: customer.id,
      detail: `Add customer: ${customer.name}`,
    }).catch(() => {})

    return NextResponse.json(customer, { status: 201 })
  } catch (error) {
    console.error('Error creating customer:', error)
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 })
  }
}
