import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const bookingId  = searchParams.get('bookingId')
    const yachtId    = searchParams.get('yachtId')
    const openTripId = searchParams.get('openTripId')

    const where: Record<string, unknown> = {}
    if (bookingId)  where.bookingId  = bookingId
    if (yachtId)    where.yachtId    = yachtId
    if (openTripId) where.openTripId = openTripId

    const [items, history] = await Promise.all([
      db.waitingList.findMany({
        where,
        include: {
          customer:    { select: { id: true, name: true, email: true, phone: true } },
          salesperson: { select: { id: true, name: true } },
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      }),
      bookingId
        ? db.waitingListHistory.findMany({
            where: { bookingId },
            orderBy: { cancelledAt: 'asc' },
          })
        : [],
    ])
    return NextResponse.json({ items, history })
  } catch (error) {
    console.error('waiting-list GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch waiting list' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const {
      bookingId, yachtId, openTripId,
      startDate, endDate,
      customerId, contactName, contactPhone, contactEmail,
      notes, priority,
    } = body

    if (!contactName?.trim()) {
      return NextResponse.json({ error: 'Contact name is required' }, { status: 400 })
    }
    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Trip dates are required' }, { status: 400 })
    }
    if (!bookingId && !yachtId && !openTripId) {
      return NextResponse.json({ error: 'bookingId, yachtId, or openTripId is required' }, { status: 400 })
    }

    // Resolve or create a Customer record so waitingList always has a customerId
    let resolvedCustomerId: string | null = customerId || null
    if (!resolvedCustomerId) {
      const searchConditions: { phone?: { contains: string; mode: 'insensitive' }; email?: { contains: string; mode: 'insensitive' } }[] = []
      if (contactPhone?.trim()) searchConditions.push({ phone: { contains: contactPhone.trim(), mode: 'insensitive' } })
      if (contactEmail?.trim()) searchConditions.push({ email: { contains: contactEmail.trim(), mode: 'insensitive' } })

      const existing = searchConditions.length > 0
        ? await db.customer.findFirst({ where: { deletedAt: null, OR: searchConditions }, select: { id: true } })
        : null

      if (existing) {
        resolvedCustomerId = existing.id
      } else {
        const newGuest = await db.customer.create({
          data: {
            name:  contactName.trim(),
            phone: contactPhone?.trim() || null,
            email: contactEmail?.trim() || null,
          },
          select: { id: true },
        })
        resolvedCustomerId = newGuest.id
      }
    }

    // Reject duplicate: same customer already active (waiting/promoted) on the same booking/trip
    const slotWhere = [
      bookingId  ? { bookingId }  : null,
      yachtId    ? { yachtId }    : null,
      openTripId ? { openTripId } : null,
    ].filter(Boolean)

    const duplicate = await db.waitingList.findFirst({
      where: {
        status: { in: ['waiting', 'promoted'] },
        OR: slotWhere as object[],
        customerId: resolvedCustomerId,
      },
    })
    if (duplicate) {
      return NextResponse.json({ error: 'This person is already on the waiting list for this booking.' }, { status: 409 })
    }

    const item = await db.waitingList.create({
      data: {
        bookingId:    bookingId    || null,
        yachtId:      yachtId      || null,
        openTripId:   openTripId   || null,
        startDate:    new Date(startDate),
        endDate:      new Date(endDate),
        customerId:   resolvedCustomerId,
        contactName:  contactName.trim(),
        contactPhone: contactPhone?.trim() || null,
        contactEmail: contactEmail?.trim() || null,
        notes:        notes?.trim() || null,
        priority:     priority ?? 0,
        status:       'waiting',
        salespersonId: session.user.id,
      },
      include: {
        customer:    { select: { id: true, name: true } },
        salesperson: { select: { id: true, name: true } },
      },
    })
    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('waiting-list POST error:', error)
    return NextResponse.json({ error: 'Failed to add to waiting list' }, { status: 500 })
  }
}
