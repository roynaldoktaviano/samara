import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const guests = await db.bookingGuest.findMany({
      include: { customer: { select: { id: true, name: true, phone: true, email: true } } },
    })
    return NextResponse.json(guests)
  } catch (error) {
    console.error('Error fetching guests:', error)
    return NextResponse.json({ error: 'Failed to fetch guests' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { bookingId, customerId, cabinId, isLead } = body

    if (!bookingId || !customerId) {
      return NextResponse.json({ error: 'bookingId and customerId are required' }, { status: 400 })
    }

    const guest = await db.bookingGuest.create({
      data: {
        bookingId,
        customerId,
        cabinId: cabinId || null,
        isLead: isLead ?? false,
      },
    })

    return NextResponse.json(guest, { status: 201 })
  } catch (error) {
    console.error('Error creating guest:', error)
    return NextResponse.json({ error: 'Failed to create guest' }, { status: 500 })
  }
}
