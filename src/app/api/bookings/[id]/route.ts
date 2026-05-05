import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const booking = await db.booking.findUnique({
      where: { id },
      include: {
        yacht: { select: { id: true, name: true, model: true } },
        customer: { select: { id: true, name: true, email: true, phone: true } },
        agent: { select: { id: true, name: true, company: true } },
        openTrip: { select: { id: true, title: true, destination: true } },
        guests: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            cabin: { select: { id: true, name: true } },
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
    const body = await request.json()
    const { status, totalPrice, depositPaid, discount, notes, destination } = body

    const booking = await db.booking.update({
      where: { id },
      data: {
        ...(status      !== undefined && { status }),
        ...(totalPrice  !== undefined && { totalPrice: parseFloat(totalPrice) }),
        ...(depositPaid !== undefined && { depositPaid: parseFloat(depositPaid) }),
        ...(discount    !== undefined && { discount: parseFloat(discount) }),
        ...(notes       !== undefined && { notes: notes || null }),
        ...(destination !== undefined && { destination: destination || null }),
      },
      include: {
        yacht: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
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
