import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db, withRetry } from '@/lib/db'
import { logActivity } from '@/lib/activity'

export async function GET(_: NextRequest) {
  try {
    const session  = await getServerSession(authOptions)
    const userRole = (session?.user as { role?: string })?.role ?? ''
    const userId   = session?.user?.id ?? ''

    // SALES: only their own payments (matched via booking.salespersonId)
    const where = userRole === 'SALES' && userId
      ? { booking: { salespersonId: userId } }
      : {}

    const payments = await withRetry(() => db.payment.findMany({
      where,
      select: {
        id: true,
        bookingId: true,
        invoiceNumber: true,
        paymentType: true,
        paymentMethod: true,
        previouslyPaid: true,
        amount: true,
        currency: true,
        status: true,
        notes: true,
        proofOfTransfer: true,
        billToType: true,
        submittedByUserId: true,
        submittedByName: true,
        confirmedBy: true,
        confirmedAt: true,
        createdAt: true,
        booking: {
          select: {
            bookingCode: true,
            totalPrice: true,
            discount: true,
            depositPaid: true,
            startDate: true,
            endDate: true,
            destination: true,
            tripType: true,
            source: true,
            currency: true,
            exchangeRate: true,
            salesperson: true,
            salespersonUser: { select: { name: true } },
            customer: { select: { name: true, email: true, phone: true } },
            yacht: { select: { name: true, model: true } },
            openTrip: { select: { title: true, destination: true } },
            agent: { select: { name: true, commissionOpenTrip: true, commissionPrivateCharter: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }))
    // Strip base64 proof from list; return a boolean flag instead
    const result = payments.map(({ proofOfTransfer, ...p }) => ({
      ...p,
      hasProof: !!proofOfTransfer,
    }))
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching payments:', error)
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const body = await request.json()
    const { bookingId, notes, amount: requestedAmount, billToType, paymentMethod } = body

    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })
    }

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      select: { bookingCode: true, depositPaid: true },
    })
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    // Prevent duplicate open requests
    const existing = await db.payment.findFirst({
      where: { bookingId, status: { in: ['requested', 'invoice_ready', 'pending_confirmation'] } },
    })
    if (existing) {
      return NextResponse.json({ error: 'There is already an active payment request for this booking' }, { status: 409 })
    }

    const submittedByUserId = session?.user?.id ?? null
    const submittedByName   = session?.user?.name ?? session?.user?.email ?? null
    const previouslyPaid    = booking.depositPaid
    const paymentType       = previouslyPaid > 0 ? 'PELUNASAN' : 'DP'
    const { nextVal } = await import('@/lib/counter')
    const reqNum      = await nextVal(`payment_req:${booking.bookingCode}`)
    const invoiceNumber = `REQ-${booking.bookingCode}-${String(reqNum).padStart(2, '0')}`

    const amount = (typeof requestedAmount === 'number' && requestedAmount > 0) ? requestedAmount : 0

    const payment = await db.payment.create({
      data: {
        bookingId,
        invoiceNumber,
        paymentType,
        previouslyPaid,
        amount,
        currency: 'USD',
        notes: notes || null,
        status: 'requested',
        submittedByUserId,
        submittedByName,
        ...(billToType && { billToType }),
        ...(paymentMethod && { paymentMethod }),
      },
    })

    // Notify Finance + Admin (fire-and-forget — never fails the main request)
    db.user.findMany({ where: { role: { in: ['FINANCE', 'ADMIN'] } }, select: { id: true } })
      .then(financeUsers => {
        if (!financeUsers.length) return
        return db.notification.createMany({
          data: financeUsers.map(u => ({
            userId: u.id,
            type: 'INVOICE_REQUESTED',
            title: 'Invoice diminta oleh Sales',
            body: `${booking.bookingCode} — ${paymentType} diminta oleh ${submittedByName ?? 'Sales'}`,
            paymentId: payment.id,
            bookingId: bookingId,
          })),
          skipDuplicates: true,
        })
      })
      .catch(() => {})

    const userRole = (session?.user as { role?: string })?.role ?? ''
    logActivity({
      userId: submittedByUserId ?? '', userName: submittedByName ?? 'Unknown', userRole,
      action: 'CREATE', entity: 'Payment', entityId: payment.id,
      detail: `Request invoice ${invoiceNumber} (${paymentType}) — ${booking.bookingCode}`,
    }).catch(() => {})

    return NextResponse.json(payment, { status: 201 })
  } catch (error) {
    console.error('Error creating payment request:', error)
    return NextResponse.json({ error: 'Failed to create payment request' }, { status: 500 })
  }
}
