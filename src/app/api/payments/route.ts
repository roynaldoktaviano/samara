import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { withRetry } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { roleMatches } from '@/lib/role-utils'

export async function GET(_: NextRequest) {
  const session  = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userRole = (session?.user as { role?: string })?.role ?? ''
  const userId   = session?.user?.id ?? ''
  const db = await getDb(session)
  try {

    // SALES: only their own payments (matched via booking.salespersonId)
    const where = roleMatches(userRole, ['SALES']) && userId
      ? { booking: { salespersonId: userId } }
      : {}

    const payments = await withRetry(db, () => db.payment.findMany({
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
        exchangeRate: true,
        status: true,
        notes: true,
        proofOfTransfer: true,
        billToType: true,
        showNetAmount: true,
        showCommissionNote: true,
        submittedByUserId: true,
        submittedByName: true,
        confirmedBy: true,
        confirmedAt: true,
        createdAt: true,
        hasDocument: true,
        parentPaymentId: true,
        parentPayment: { select: { invoiceNumber: true } },
        booking: {
          select: {
            bookingCode: true,
            totalPrice: true,
            discount: true,
            depositPaid: true,
            services: { select: { price: true, quantity: true } },
            startDate: true,
            endDate: true,
            destination: true,
            tripType: true,
            source: true,
            currency: true,
            exchangeRate: true,
            salesperson: true,
            depositDueDate: true,
            finalDueDate: true,
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
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const body = await request.json()
    const { bookingId, notes, amount: requestedAmount, billToType, paymentMethod, showNetAmount, showCommissionNote, linkedPaymentId, proofOfTransfer, paymentDate, currency, exchangeRate } = body
    const parsedPaymentDate = paymentDate ? new Date(paymentDate) : new Date()
    // Currency the payment was actually received in — amount is always stored in USD;
    // currency/exchangeRate are display metadata (see print/invoice page's toLocal()).
    const paymentCurrency = (typeof currency === 'string' && currency) ? currency.toUpperCase() : 'USD'
    const paymentExchangeRate = paymentCurrency === 'USD' ? null : (typeof exchangeRate === 'number' && exchangeRate > 0 ? exchangeRate : null)
    if (paymentCurrency !== 'USD' && !paymentExchangeRate) {
      return NextResponse.json({ error: 'A valid exchange rate is required for non-USD currency' }, { status: 400 })
    }

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
    const actorRole         = (session?.user as { role?: string })?.role ?? ''

    // ── Additional DP tacked onto an already-issued invoice — no new invoice document.
    // Sales supplies the amount + proof of transfer directly (there's no customer-facing link
    // to collect it through), and it goes straight to Finance for confirmation. ──
    if (linkedPaymentId) {
      if (!proofOfTransfer) {
        return NextResponse.json({ error: 'Payment proof must be attached' }, { status: 400 })
      }
      const amount = (typeof requestedAmount === 'number' && requestedAmount > 0) ? requestedAmount : 0
      if (amount <= 0) {
        return NextResponse.json({ error: 'Amount is required' }, { status: 400 })
      }
      const parent = await db.payment.findFirst({ where: { id: linkedPaymentId, bookingId, hasDocument: true } })
      if (!parent) return NextResponse.json({ error: 'Original invoice not found for this booking' }, { status: 404 })

      const siblingCount  = await db.payment.count({ where: { parentPaymentId: parent.id } })
      const invoiceNumber = `${parent.invoiceNumber}-${siblingCount + 2}` // parent is implicitly "-1"

      const payment = await db.payment.create({
        data: {
          bookingId,
          invoiceNumber,
          paymentType: 'DP',
          previouslyPaid,
          amount,
          paymentDate: parsedPaymentDate,
          currency: paymentCurrency,
          exchangeRate: paymentExchangeRate,
          notes: notes || null,
          status: 'pending_confirmation',
          proofOfTransfer,
          hasDocument: false,
          parentPaymentId: parent.id,
          submittedByUserId,
          submittedByName,
          ...(paymentMethod && { paymentMethod }),
        },
      })

      db.user.findMany({ where: { role: { in: ['FINANCE', 'ADMIN'] } }, select: { id: true } })
        .then(financeUsers => {
          if (!financeUsers.length) return
          return db.notification.createMany({
            data: financeUsers.map(u => ({
              userId: u.id,
              type: 'PROOF_SUBMITTED',
              title: 'Payment proof received',
              body: `${invoiceNumber} (${booking.bookingCode}) is awaiting payment confirmation`,
              paymentId: payment.id,
              bookingId,
            })),
            skipDuplicates: true,
          })
        })
        .catch(() => {})

      logActivity({
        userId: submittedByUserId ?? '', userName: submittedByName ?? 'Unknown', userRole: actorRole,
        action: 'CREATE', entity: 'Payment', entityId: payment.id,
        detail: `Additional DP ${invoiceNumber} (${booking.bookingCode}) — ${amount}, linked to ${parent.invoiceNumber}, no new invoice`,
      }, db).catch(() => {})

      return NextResponse.json(payment, { status: 201 })
    }

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
        paymentDate: parsedPaymentDate,
        currency: paymentCurrency,
        exchangeRate: paymentExchangeRate,
        notes: notes || null,
        status: 'requested',
        submittedByUserId,
        submittedByName,
        ...(billToType && { billToType }),
        ...(paymentMethod && { paymentMethod }),
        showNetAmount: !!showNetAmount,
        showCommissionNote: !!showCommissionNote,
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
    }, db).catch(() => {})

    return NextResponse.json(payment, { status: 201 })
  } catch (error) {
    console.error('Error creating payment request:', error)
    return NextResponse.json({ error: 'Failed to create payment request' }, { status: 500 })
  }
}
