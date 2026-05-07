import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(_: NextRequest) {
  try {
    const session  = await getServerSession(authOptions)
    const userRole = (session?.user as { role?: string })?.role ?? ''
    const userName = session?.user?.name ?? ''

    // SALES: only their own payments (matched via booking.salesperson)
    const where = userRole === 'SALES' && userName
      ? { booking: { salesperson: { equals: userName, mode: 'insensitive' as const } } }
      : {}

    const payments = await db.payment.findMany({
      where,
      select: {
        id: true,
        bookingId: true,
        invoiceNumber: true,
        paymentType: true,
        previouslyPaid: true,
        amount: true,
        currency: true,
        status: true,
        notes: true,
        proofOfTransfer: true,
        submittedByUserId: true,
        submittedByName: true,
        confirmedBy: true,
        confirmedAt: true,
        createdAt: true,
        booking: {
          select: {
            bookingCode: true,
            totalPrice: true,
            depositPaid: true,
            startDate: true,
            endDate: true,
            destination: true,
            tripType: true,
            salesperson: true,
            customer: { select: { name: true, email: true, phone: true } },
            yacht: { select: { name: true, model: true } },
            openTrip: { select: { title: true, destination: true } },
            agent: { select: { name: true, company: true } },
            services: { select: { name: true, price: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(payments)
  } catch (error) {
    console.error('Error fetching payments:', error)
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const body = await request.json()
    const { bookingId, amount, currency, notes } = body

    if (!bookingId || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      select: { bookingCode: true, depositPaid: true },
    })
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    const previouslyPaid = booking.depositPaid
    const paymentType = previouslyPaid > 0 ? 'PELUNASAN' : 'DP'
    const allCount = await db.payment.count({ where: { bookingId } })
    const invoiceNumber = `INV-${booking.bookingCode}-${String(allCount + 1).padStart(2, '0')}`

    const submittedByUserId = session?.user?.id ?? null
    const submittedByName   = session?.user?.name ?? session?.user?.email ?? null

    const payment = await db.payment.create({
      data: {
        bookingId,
        invoiceNumber,
        paymentType,
        previouslyPaid,
        amount: parseFloat(amount),
        currency: currency || 'USD',
        notes: notes || null,
        status: 'pending_confirmation',
        submittedByUserId,
        submittedByName,
      },
    })

    // Notify all Finance + Admin users
    const financeUsers = await db.user.findMany({
      where: { role: { in: ['FINANCE', 'ADMIN'] } },
      select: { id: true },
    })
    if (financeUsers.length > 0) {
      await db.notification.createMany({
        data: financeUsers.map(u => ({
          userId: u.id,
          type: 'PAYMENT_SUBMITTED',
          title: 'Invoice menunggu konfirmasi',
          body: `${invoiceNumber} — $${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} dikirim oleh ${submittedByName ?? 'Sales'}`,
          paymentId: payment.id,
          bookingId,
        })),
      })
    }

    return NextResponse.json(payment, { status: 201 })
  } catch (error) {
    console.error('Error creating payment:', error)
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 })
  }
}
