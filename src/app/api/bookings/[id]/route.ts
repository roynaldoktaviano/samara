import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function paymentStatus(depositPaid: number, totalPrice: number): string {
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
        yacht:    { select: { id: true, name: true, model: true } },
        customer: { select: { id: true, name: true, email: true, phone: true } },
        agent:    { select: { id: true, name: true, company: true } },
        openTrip: { select: { id: true, title: true, destination: true } },
        guests: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            cabin:    { select: { id: true, name: true } },
          },
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
    const { id } = await params
    const body   = await request.json()
    const { status, totalPrice, depositPaid, discount, notes, destination, depositDueDate, finalDueDate } = body

    const existing = await db.booking.findUnique({
      where:  { id },
      select: { totalPrice: true, depositPaid: true, status: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const newDeposit = depositPaid !== undefined ? parseFloat(depositPaid) : existing.depositPaid
    const newTotal   = totalPrice  !== undefined ? parseFloat(totalPrice)  : existing.totalPrice

    // 'completed' and 'cancelled' are manual overrides
    const manualOverride = status === 'completed' || status === 'cancelled'
    const computedStatus = manualOverride ? status : paymentStatus(newDeposit, newTotal)

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
        status: computedStatus,
      },
      select: { id: true, bookingCode: true, status: true },
    })

    return NextResponse.json(booking)
  } catch (error) {
    console.error('Error updating booking:', error)
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.booking.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting booking:', error)
    return NextResponse.json({ error: 'Failed to delete booking' }, { status: 500 })
  }
}
