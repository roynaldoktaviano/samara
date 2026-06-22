import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { promoteWaitingListForBooking } from '@/lib/waiting-list'

// Manually promote a specific waiting list entry to on_hold
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const entry = await db.waitingList.findUnique({
      where: { id },
      include: { booking: { select: { id: true, status: true } } },
    })
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (entry.status !== 'waiting') {
      return NextResponse.json({ error: 'This entry has already been promoted or cancelled' }, { status: 400 })
    }

    if (entry.bookingId) {
      await promoteWaitingListForBooking(entry.bookingId)
    } else {
      // No linked booking — promote directly using yacht/open trip + date info
      await promoteDirect(entry)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('promote error:', error)
    return NextResponse.json({ error: 'Failed to promote' }, { status: 500 })
  }
}

async function promoteDirect(entry: {
  id: string
  yachtId: string | null
  openTripId: string | null
  startDate: Date
  endDate: Date
  customerId: string | null
  contactName: string
  contactPhone: string | null
  contactEmail: string | null
  notes: string | null
  salespersonId: string | null
}) {
  let customerId: string
  if (entry.customerId) {
    customerId = entry.customerId
  } else {
    const existing = entry.contactPhone
      ? await db.customer.findFirst({ where: { phone: entry.contactPhone } })
      : null
    if (existing) {
      customerId = existing.id
    } else {
      const c = await db.customer.create({
        data: {
          name:  entry.contactName,
          phone: entry.contactPhone ?? null,
          email: entry.contactEmail ?? null,
        },
        select: { id: true },
      })
      customerId = c.id
    }
  }

  const tripType = entry.openTripId ? 'OPEN_TRIP' : 'PRIVATE_CHARTER'
  let yachtName: string | null = null
  if (entry.yachtId) {
    const y = await db.yacht.findUnique({ where: { id: entry.yachtId }, select: { name: true } })
    yachtName = y?.name ?? null
  } else if (entry.openTripId) {
    const t = await db.openTrip.findUnique({
      where: { id: entry.openTripId },
      include: { yacht: { select: { name: true } } },
    })
    yachtName = t?.yacht?.name ?? null
  }

  function yachtInitial(name: string | null | undefined): string {
    if (!name) return 'UNK'
    const n = name.trim()
    if (/samara\s*ii/i.test(n))  return 'SL2'
    if (/samara\s*i\b/i.test(n)) return 'SL1'
    if (/mischief/i.test(n))     return 'MC'
    if (/otium/i.test(n))        return 'OT'
    return n.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase()
  }

  const yInit  = yachtInitial(yachtName)
  const tInit  = tripType === 'OPEN_TRIP' ? 'ST' : 'PC'
  const prefix = `${yInit}-${tInit}-`
  const last   = await db.booking.findFirst({
    where: { bookingCode: { startsWith: prefix } },
    orderBy: { bookingCode: 'desc' },
    select: { bookingCode: true },
  })
  const lastNum     = last ? (parseInt(last.bookingCode.slice(prefix.length)) || 0) : 0
  const bookingCode = `${prefix}${String(lastNum + 1).padStart(4, '0')}`
  const holdUntil   = new Date(Date.now() + 24 * 60 * 60 * 1000)

  const newBooking = await db.booking.create({
    data: {
      bookingCode,
      customerId,
      yachtId:     entry.yachtId    ?? null,
      openTripId:  entry.openTripId ?? null,
      source:      'DIRECT',
      tripType:    tripType as 'PRIVATE_CHARTER' | 'OPEN_TRIP',
      startDate:   entry.startDate,
      endDate:     entry.endDate,
      totalPrice:  0,
      depositPaid: 0,
      discount:    0,
      status:      'on_hold',
      holdUntil,
      guestCount:  1,
      notes:       entry.notes ?? null,
      salespersonId: entry.salespersonId ?? null,
      guests: { create: [{ customerId, isLead: true }] },
    },
    select: { id: true, bookingCode: true },
  })

  await db.waitingList.update({
    where: { id: entry.id },
    data:  { status: 'promoted', promotedBookingId: newBooking.id },
  })

  if (entry.salespersonId) {
    await db.notification.create({
      data: {
        userId:    entry.salespersonId,
        type:      'WAITING_LIST_PROMOTED',
        title:     'Waiting List — Promoted!',
        body:      `${entry.contactName} has been moved to On Hold (${newBooking.bookingCode}).`,
        bookingId: newBooking.id,
      },
    }).catch(() => {})
  }
}
