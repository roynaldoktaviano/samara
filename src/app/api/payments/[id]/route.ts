import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

function paymentStatus(depositPaid: number, totalPrice: number): string {
  if (depositPaid <= 0)          return 'pending'
  if (depositPaid >= totalPrice) return 'fully_paid'
  return 'partially_paid'
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const payment = await db.payment.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            customer: { select: { name: true, email: true, phone: true, address: true } },
            yacht:    { select: { name: true, model: true } },
            openTrip: { select: { title: true, destination: true } },
            agent:    { select: { name: true, company: true, email: true, phone: true, commission: true } },
            services: true,
            guests: {
              select: {
                isLead: true,
                customer: { select: { name: true } },
                cabin:    { select: { name: true } },
              },
            },
          },
        },
      },
    })
    if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(payment)
  } catch (error) {
    console.error('Error fetching payment:', error)
    return NextResponse.json({ error: 'Failed to fetch payment' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    const { id } = await params
    const body = await request.json()
    const { action, proofOfTransfer } = body

    // Upload proof of transfer
    if (proofOfTransfer !== undefined) {
      await db.payment.update({
        where: { id },
        data: { proofOfTransfer: proofOfTransfer || null },
      })
      return NextResponse.json({ ok: true })
    }

    // Finance confirm / reject
    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

    const payment = await db.payment.findUnique({
      where: { id },
      include: {
        booking: { select: { id: true, bookingCode: true, totalPrice: true, depositPaid: true, salesperson: true } },
      },
    })
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    if (payment.status !== 'pending_confirmation') {
      return NextResponse.json({ error: 'Payment already processed' }, { status: 400 })
    }

    const confirmedByName = session?.user?.name || 'Finance'

    // Resolve recipient: prefer explicit submittedByUserId, fallback to salesperson name lookup
    let recipientUserId = payment.submittedByUserId
    if (!recipientUserId && payment.booking.salesperson) {
      const salespersonUser = await db.user.findFirst({
        where: { name: { equals: payment.booking.salesperson, mode: 'insensitive' } },
        select: { id: true },
      })
      if (salespersonUser) recipientUserId = salespersonUser.id
    }

    if (action === 'confirm') {
      const newDepositPaid = payment.booking.depositPaid + payment.amount
      const newStatus = paymentStatus(newDepositPaid, payment.booking.totalPrice)

      await db.$transaction([
        db.payment.update({
          where: { id },
          data: { status: 'confirmed', confirmedBy: confirmedByName, confirmedAt: new Date() },
        }),
        db.booking.update({
          where: { id: payment.bookingId },
          data: { depositPaid: newDepositPaid, status: newStatus },
        }),
      ])

      // Notify the submitter
      if (recipientUserId) {
        await db.notification.create({
          data: {
            userId: recipientUserId,
            type: 'PAYMENT_CONFIRMED',
            title: 'Invoice dikonfirmasi ✓',
            body: `${payment.invoiceNumber} (${payment.booking.bookingCode}) telah dikonfirmasi oleh ${confirmedByName}`,
            paymentId: payment.id,
            bookingId: payment.bookingId,
          },
        })
      }
    } else if (action === 'reject') {
      await db.payment.update({
        where: { id },
        data: { status: 'rejected', confirmedBy: confirmedByName, confirmedAt: new Date() },
      })

      // Notify the submitter
      if (recipientUserId) {
        await db.notification.create({
          data: {
            userId: recipientUserId,
            type: 'PAYMENT_REJECTED',
            title: 'Invoice ditolak',
            body: `${payment.invoiceNumber} (${payment.booking.bookingCode}) ditolak oleh ${confirmedByName}`,
            paymentId: payment.id,
            bookingId: payment.bookingId,
          },
        })
      }
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error processing payment:', error)
    return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 })
  }
}
