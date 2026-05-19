import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'

function paymentStatus(depositPaid: number, totalPrice: number): 'pending' | 'partially_paid' | 'fully_paid' {
  if (depositPaid <= 0)          return 'pending'
  if (depositPaid >= totalPrice) return 'fully_paid'
  return 'partially_paid'
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const booking = await db.booking.findUnique({
      where: { id },
      include: {
        yacht:    { select: { id: true, name: true, model: true, cabins: { select: { id: true, name: true, deck: true }, orderBy: { name: 'asc' } } } },
        customer: { select: { id: true, name: true, email: true, phone: true } },
        agent:    { select: { id: true, name: true, company: true } },
        openTrip: { select: { id: true, title: true, destination: true } },
        guests: {
          include: {
            customer: { select: { id: true, name: true, phone: true, email: true, passport: true, nationality: true } },
            cabin:    { select: { id: true, name: true } },
          },
          orderBy: [{ isLead: 'desc' }, { id: 'asc' }],
        },
        services: true,
      },
    })
    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(booking)
  } catch (error) {
    console.error('Error fetching booking:', error)
    return NextResponse.json({ error: 'Failed to fetch booking' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    const { id } = await params
    const body   = await request.json()
    const { status, totalPrice, depositPaid, discount, notes, destination, depositDueDate, finalDueDate, salesperson, startDate, endDate, guestCount } = body

    const existing = await db.booking.findUnique({
      where:  { id },
      select: { totalPrice: true, depositPaid: true, status: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const newDeposit = depositPaid !== undefined ? parseFloat(depositPaid) : existing.depositPaid
    const newTotal   = totalPrice  !== undefined ? parseFloat(totalPrice)  : existing.totalPrice

    // 'completed' and 'cancelled' are manual overrides
    const manualOverride = status === 'completed' || status === 'cancelled'
    const computedStatus = manualOverride
      ? (status as 'completed' | 'cancelled')
      : paymentStatus(newDeposit, newTotal)

    const booking = await db.booking.update({
      where: { id },
      data: {
        ...(totalPrice     !== undefined && { totalPrice:     newTotal }),
        ...(depositPaid    !== undefined && { depositPaid:    newDeposit }),
        ...(discount       !== undefined && { discount:       parseFloat(discount) }),
        ...(notes          !== undefined && { notes:          notes || null }),
        ...(destination    !== undefined && { destination:    destination || null }),
        ...(depositDueDate !== undefined && { depositDueDate: depositDueDate ? new Date(depositDueDate) : null }),
        ...(finalDueDate   !== undefined && { finalDueDate:   finalDueDate   ? new Date(finalDueDate)   : null }),
        ...(salesperson !== undefined && { salesperson: salesperson || null }),
        ...(startDate   !== undefined && { startDate:   new Date(startDate) }),
        ...(endDate     !== undefined && { endDate:     new Date(endDate) }),
        ...(guestCount  !== undefined && { guestCount:  parseInt(guestCount) }),
        status: computedStatus,
      },
      select: { id: true, bookingCode: true, status: true },
    })

    const userId   = session?.user?.id   ?? ''
    const userName = session?.user?.name ?? session?.user?.email ?? 'Unknown'
    const userRole = (session?.user as { role?: string })?.role ?? ''
    logActivity({
      userId, userName, userRole,
      action: 'UPDATE', entity: 'Booking', entityId: id,
      detail: `Update booking ${booking.bookingCode} → status: ${booking.status}`,
    }).catch(() => {})

    return NextResponse.json(booking)
  } catch (error) {
    console.error('Error updating booking:', error)
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    const { id }  = await params
    const body    = await request.json()
    const { status, cancelReason } = body

    const existing = await db.booking.findUnique({
      where:  { id },
      select: { totalPrice: true, depositPaid: true, status: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const manualOverride = status === 'completed' || status === 'cancelled'
    const computedStatus = manualOverride
      ? (status as 'completed' | 'cancelled')
      : paymentStatus(existing.depositPaid, existing.totalPrice)

    const booking = await db.booking.update({
      where: { id },
      data: {
        status: computedStatus,
        ...(cancelReason !== undefined && { cancelReason: cancelReason || null }),
      },
      select: { id: true, bookingCode: true, status: true },
    })

    const userId   = session?.user?.id   ?? ''
    const userName = session?.user?.name ?? session?.user?.email ?? 'Unknown'
    const userRole = (session?.user as { role?: string })?.role ?? ''
    logActivity({
      userId, userName, userRole,
      action: 'UPDATE', entity: 'Booking', entityId: id,
      detail: `Update booking ${booking.bookingCode} → status: ${booking.status}${cancelReason ? ` (alasan: ${cancelReason})` : ''}`,
    }).catch(() => {})

    return NextResponse.json(booking)
  } catch (error) {
    console.error('Error patching booking:', error)
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session  = await getServerSession(authOptions)
    const { id }   = await params
    const existing = await db.booking.findUnique({ where: { id }, select: { bookingCode: true } })
    await db.booking.delete({ where: { id } })

    const userId   = session?.user?.id   ?? ''
    const userName = session?.user?.name ?? session?.user?.email ?? 'Unknown'
    const userRole = (session?.user as { role?: string })?.role ?? ''
    logActivity({
      userId, userName, userRole,
      action: 'DELETE', entity: 'Booking', entityId: id,
      detail: `Hapus booking ${existing?.bookingCode ?? id}`,
    }).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting booking:', error)
    return NextResponse.json({ error: 'Failed to delete booking' }, { status: 500 })
  }
}
