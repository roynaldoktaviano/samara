import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { withRetry } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { scheduleTripSheetSync } from '@/lib/google-sheets'
import { BookingStatus } from '@prisma/client'

function bookingStatus(depositPaid: number, totalPrice: number): BookingStatus {
  if (depositPaid <= 0)          return BookingStatus.pending
  if (depositPaid >= totalPrice) return BookingStatus.fully_paid
  return BookingStatus.partially_paid
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const payment = await withRetry(db, () => db.payment.findUnique({
      where: { id },
      include: {
        bank: true,
        booking: {
          include: {
            customer: { select: { name: true, email: true, phone: true, address: true, gender: true } },
            yacht:    { select: { name: true, model: true } },
            openTrip: { select: { title: true, destination: true, yacht: { select: { name: true } } } },
            agent:    { select: { name: true, address: true, commissionOpenTrip: true, commissionPrivateCharter: true } },
            agentContact: { select: { name: true } },
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
    }))
    if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Sibling payments on the same booking — confirmed ones (plus this one) form the
    // itemized "Deposit / Second / Balance Payment" history shown on the invoice.
    // Sorted in JS (not SQL) since older rows predate paymentDate and would otherwise
    // be shoved to one end by Postgres' NULLS LAST/FIRST default.
    const siblings = await withRetry(db, () => db.payment.findMany({
      where: {
        bookingId: payment.bookingId,
        OR: [{ status: 'confirmed' }, { id: payment.id }],
      },
      select: { id: true, amount: true, paymentDate: true, createdAt: true, status: true },
    }))
    const history = siblings.sort((a, b) =>
      (a.paymentDate ?? a.createdAt).getTime() - (b.paymentDate ?? b.createdAt).getTime())

    return NextResponse.json({ ...payment, history })
  } catch (error) {
    console.error('Error fetching payment:', error)
    return NextResponse.json({ error: 'Failed to fetch payment' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const body = await request.json()
    const { action } = body

    const actorId   = session.user!.id   ?? ''
    const actorName = session.user!.name ?? session.user!.email ?? 'Unknown'
    const actorRole = (session.user as { role?: string })?.role ?? ''

    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

    // ── Finance: generate invoice ──────────────────────────────────────────────
    if (action === 'generate_invoice') {
      if (!['FINANCE', 'ADMIN', 'SUPER_ADMIN'].includes(actorRole)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const { amount, paymentType, paymentMethod, notes, billToType, bankId, paymentLink } = body
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return NextResponse.json({ error: 'Amount is required' }, { status: 400 })
      }

      const existing = await withRetry(db, () => db.payment.findUnique({
        where: { id },
        include: { booking: { select: { id: true, bookingCode: true, depositPaid: true, totalPrice: true, salespersonId: true } } },
      }))
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const EDITABLE_STATUSES = ['requested', 'invoice_ready', 'pending_confirmation']
      if (!EDITABLE_STATUSES.includes(existing.status)) {
        return NextResponse.json({ error: 'Invoice can only be generated or edited while requested, invoice-ready, or pending confirmation' }, { status: 400 })
      }
      const isFirstGeneration = existing.status === 'requested'
      // Silent save: a quiet correction (e.g. recording the exact USD equivalent of a foreign-
      // currency payment already received) — doesn't touch status or the submitted proof, and
      // doesn't nag Sales to re-check/re-submit anything.
      const isSilent = !!body.silent && !isFirstGeneration

      let invoiceNumber = existing.invoiceNumber
      if (isFirstGeneration) {
        const { nextVal } = await import('@/lib/counter')
        const invNum = await nextVal(`payment_inv:${existing.booking.bookingCode}`, db)
        invoiceNumber = `INV-${existing.booking.bookingCode}-${String(invNum).padStart(2, '0')}`
      }

      await withRetry(db, () => db.payment.update({
        where: { id },
        data: {
          invoiceNumber,
          amount,
          ...(paymentType   !== undefined && { paymentType:   paymentType   || existing.paymentType }),
          ...(paymentMethod !== undefined && { paymentMethod: paymentMethod || null }),
          ...(notes         !== undefined && { notes:         notes         || null }),
          ...(billToType    !== undefined && { billToType:    billToType    || existing.billToType }),
          ...(body.showNetAmount !== undefined && { showNetAmount: !!body.showNetAmount }),
          ...(body.showCommissionNote !== undefined && { showCommissionNote: !!body.showCommissionNote }),
          ...(bankId        !== undefined && { bankId:        bankId        || null }),
          ...(paymentLink   !== undefined && { paymentLink:   paymentLink   || null }),
          invoiceGeneratedBy: actorName,
          invoiceGeneratedAt: new Date(),
          ...(isSilent ? {} : { status: 'invoice_ready' }),
          // Edited after a proof was already submitted — clear it so Sales re-submits against the corrected amount.
          // Skipped for silent saves, since those shouldn't disrupt an already-valid proof.
          ...(!isFirstGeneration && !isSilent && { proofOfTransfer: null }),
        },
      }))

      logActivity({
        userId: actorId, userName: actorName, userRole: actorRole,
        action: isFirstGeneration ? 'GENERATE' : 'UPDATE',
        entity: 'Payment', entityId: id,
        detail: `${isFirstGeneration ? 'Generate' : isSilent ? 'Silently edit' : 'Edit'} invoice ${invoiceNumber} (${existing.booking.bookingCode}) — ${amount}`,
      }, db).catch(() => {})

      if (!isSilent) {
        // Notify the relevant salesperson(s) that the invoice is ready / was updated (fire-and-forget)
        const invoiceReadyTargets = new Set<string>([
          existing.submittedByUserId,
          existing.booking.salespersonId,
        ].filter(Boolean) as string[])

        const notifTitle = isFirstGeneration ? 'Invoice ready to download' : 'Invoice updated — please review'
        const notifBody = isFirstGeneration
          ? `${invoiceNumber} (${existing.booking.bookingCode}) has been generated by Finance`
          : `${invoiceNumber} (${existing.booking.bookingCode}) was updated by Finance — please re-check the amount and re-submit proof of transfer if needed`

        for (const recipientId of invoiceReadyTargets) {
          db.notification.findFirst({ where: { userId: recipientId, type: 'INVOICE_READY', bookingId: existing.bookingId } })
            .then(existing_n => {
              if (existing_n) {
                return db.notification.update({ where: { id: existing_n.id }, data: { isRead: false, title: notifTitle, body: notifBody, createdAt: new Date() } })
              }
              return db.notification.create({ data: { userId: recipientId, type: 'INVOICE_READY', title: notifTitle, body: notifBody, paymentId: id, bookingId: existing.bookingId } })
            }).catch(() => {})
        }
      }

      // Notify all Finance + Admin that an invoice was generated (fire-and-forget)
      db.user.findMany({ where: { role: { in: ['FINANCE', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true } })
        .then(financeUsers => {
          const targets = financeUsers.filter(u => u.id !== actorId) // exclude self
          if (!targets.length) return
          return db.notification.createMany({
            data: targets.map(u => ({
              userId:    u.id,
              type:      'INVOICE_GENERATED',
              title:     'Invoice di-generate',
              body:      `${invoiceNumber} (${existing.booking.bookingCode}) di-generate oleh ${actorName}`,
              paymentId: id,
              bookingId: existing.bookingId,
            })),
            skipDuplicates: true,
          })
        })
        .catch(() => {})

      scheduleTripSheetSync(db)
      return NextResponse.json({ ok: true, invoiceNumber })
    }

    // ── Finance: set / clear the invoice's payout currency conversion ─────────
    if (action === 'set_currency') {
      if (!['FINANCE', 'ADMIN', 'SUPER_ADMIN'].includes(actorRole)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const { currency, exchangeRate } = body
      if (!currency || typeof currency !== 'string') {
        return NextResponse.json({ error: 'Currency is required' }, { status: 400 })
      }
      const currencyCode = currency.toUpperCase()
      const isUSD = currencyCode === 'USD'
      if (!isUSD && (typeof exchangeRate !== 'number' || exchangeRate <= 0)) {
        return NextResponse.json({ error: 'A valid exchange rate is required for non-USD currency' }, { status: 400 })
      }

      const existing = await withRetry(db, () => db.payment.findUnique({
        where: { id },
        include: { booking: { select: { bookingCode: true } } },
      }))
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      await withRetry(db, () => db.payment.update({
        where: { id },
        data: {
          currency: currencyCode,
          exchangeRate: isUSD ? null : exchangeRate,
        },
      }))

      logActivity({
        userId: actorId, userName: actorName, userRole: actorRole,
        action: 'UPDATE', entity: 'Payment', entityId: id,
        detail: isUSD
          ? `Reset invoice ${existing.invoiceNumber} (${existing.booking.bookingCode}) to USD`
          : `Set invoice ${existing.invoiceNumber} (${existing.booking.bookingCode}) currency to ${currencyCode} @ ${exchangeRate}`,
      }, db).catch(() => {})

      scheduleTripSheetSync(db)
      return NextResponse.json({ ok: true })
    }

    // ── Sales: submit proof of transfer ───────────────────────────────────────
    if (action === 'submit_proof') {
      const { proofOfTransfer, paymentMethod } = body
      if (!proofOfTransfer) {
        return NextResponse.json({ error: 'Payment proof must be attached' }, { status: 400 })
      }

      const existing = await withRetry(db, () => db.payment.findUnique({
        where: { id },
        include: { booking: { select: { id: true, bookingCode: true } } },
      }))
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (existing.status !== 'invoice_ready') {
        return NextResponse.json({ error: 'Proof can only be submitted when status is "invoice_ready"' }, { status: 400 })
      }

      await withRetry(db, () => db.payment.update({
        where: { id },
        data: {
          proofOfTransfer,
          ...(paymentMethod !== undefined && { paymentMethod: paymentMethod || null }),
          status: 'pending_confirmation',
        },
      }))

      logActivity({
        userId: actorId, userName: actorName, userRole: actorRole,
        action: 'SUBMIT_PROOF', entity: 'Payment', entityId: id,
        detail: `Submit bukti transfer ${existing.invoiceNumber} (${existing.booking.bookingCode})`,
      }, db).catch(() => {})

      // Notify Finance + Admin (fire-and-forget)
      db.user.findMany({ where: { role: { in: ['FINANCE', 'ADMIN'] } }, select: { id: true } })
        .then(financeUsers => {
          if (!financeUsers.length) return
          return db.notification.createMany({
            data: financeUsers.map(u => ({
              userId:    u.id,
              type:      'PROOF_SUBMITTED',
              title:     'Payment proof received',
              body:      `${existing.invoiceNumber} (${existing.booking.bookingCode}) is awaiting payment confirmation`,
              paymentId: id,
              bookingId: existing.bookingId,
            })),
            skipDuplicates: true,
          })
        })
        .catch(() => {})

      scheduleTripSheetSync(db)
      return NextResponse.json({ ok: true })
    }

    // ── Finance: confirm / reject payment ─────────────────────────────────────
    if (action === 'confirm' || action === 'reject') {
      if (!['FINANCE', 'ADMIN', 'SUPER_ADMIN'].includes(actorRole)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const payment = await withRetry(db, () => db.payment.findUnique({
        where: { id },
        include: {
          booking: {
            select: {
              id: true, bookingCode: true, totalPrice: true, discount: true, depositPaid: true,
              salespersonId: true, source: true, tripType: true,
              agent: { select: { commissionOpenTrip: true, commissionPrivateCharter: true } },
              services: { select: { price: true, quantity: true } },
            },
          },
        },
      }))
      if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
      if (payment.status !== 'pending_confirmation') {
        return NextResponse.json({ error: 'Can only confirm/reject from "pending_confirmation" status' }, { status: 400 })
      }

      // Resolve recipient: prefer submittedByUserId, fall back to booking salespersonId
      const recipientUserId = payment.submittedByUserId ?? payment.booking.salespersonId ?? null

      if (action === 'confirm') {
        const commPct = payment.booking.source === 'AGENT'
          ? (payment.booking.tripType === 'OPEN_TRIP'
              ? (payment.booking.agent?.commissionOpenTrip ?? 0)
              : (payment.booking.agent?.commissionPrivateCharter ?? 0))
          : 0
        const commPctSafe = Math.max(0, Math.min(commPct, 100))
        // Commission applies only to the TRIP portion (price excl. additional services), not the whole total.
        // totalPrice is already net of discount (see BookingWizard: total = max(0, base - discountAmt) + services)
        const svcTotal = payment.booking.services.reduce((s, x) => s + x.price * (x.quantity ?? 1), 0)
        const trip = Math.max(0, payment.booking.totalPrice - svcTotal)
        const effectiveTotal = (trip - trip * commPctSafe / 100) + svcTotal
        const paymentAmount  = payment.amount

        // Atomic: update payment only if still pending_confirmation (prevents double-confirm race)
        // If another request already confirmed it, Prisma throws P2025 and we return 409.
        await withRetry(db, () => db.$transaction([
          db.payment.update({
            where: { id, status: 'pending_confirmation' },
            data: { status: 'confirmed', confirmedBy: actorName, confirmedAt: new Date() },
          }),
          db.$executeRaw`
            UPDATE "Booking"
            SET
              "depositPaid" = "depositPaid" + ${paymentAmount},
              "status" = (CASE
                WHEN "depositPaid" + ${paymentAmount} >= ${effectiveTotal} THEN 'fully_paid'
                WHEN "depositPaid" + ${paymentAmount} > 0               THEN 'partially_paid'
                ELSE 'pending'
              END)::"BookingStatus"
            WHERE id = ${payment.bookingId}
          `,
        ]))

        logActivity({
          userId: actorId, userName: actorName, userRole: actorRole,
          action: 'CONFIRM', entity: 'Payment', entityId: id,
          detail: `Konfirmasi invoice ${payment.invoiceNumber} (${payment.booking.bookingCode})`,
        }, db).catch(() => {})

        if (recipientUserId) {
          const bid = payment.bookingId
          const ruid = recipientUserId
          db.notification.findFirst({ where: { userId: ruid, type: 'PAYMENT_CONFIRMED', bookingId: bid } })
            .then(n => n
              ? db.notification.update({ where: { id: n.id }, data: { isRead: false, title: 'Payment confirmed ✓', body: `${payment.invoiceNumber} (${payment.booking.bookingCode}) has been confirmed by ${actorName}`, createdAt: new Date() } })
              : db.notification.create({ data: { userId: ruid, type: 'PAYMENT_CONFIRMED', title: 'Payment confirmed ✓', body: `${payment.invoiceNumber} (${payment.booking.bookingCode}) has been confirmed by ${actorName}`, paymentId: id, bookingId: bid } })
            ).catch(() => {})
        }
      } else {
        await withRetry(db, () => db.payment.update({
          where: { id },
          data: { status: 'rejected', confirmedBy: actorName, confirmedAt: new Date() },
        }))

        logActivity({
          userId: actorId, userName: actorName, userRole: actorRole,
          action: 'REJECT', entity: 'Payment', entityId: id,
          detail: `Reject invoice ${payment.invoiceNumber} (${payment.booking.bookingCode})`,
        }, db).catch(() => {})

        if (recipientUserId) {
          const bid = payment.bookingId
          const ruid = recipientUserId
          db.notification.findFirst({ where: { userId: ruid, type: 'PAYMENT_REJECTED', bookingId: bid } })
            .then(n => n
              ? db.notification.update({ where: { id: n.id }, data: { isRead: false, title: 'Payment rejected', body: `${payment.invoiceNumber} (${payment.booking.bookingCode}) has been rejected by ${actorName}`, createdAt: new Date() } })
              : db.notification.create({ data: { userId: ruid, type: 'PAYMENT_REJECTED', title: 'Payment rejected', body: `${payment.invoiceNumber} (${payment.booking.bookingCode}) has been rejected by ${actorName}`, paymentId: id, bookingId: bid } })
            ).catch(() => {})
        }
      }

      scheduleTripSheetSync(db)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    // P2025 = record not found in WHERE clause — payment already confirmed/rejected by concurrent request
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Payment was already processed by another request' }, { status: 409 })
    }
    console.error('Error processing payment:', error)
    return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 })
  }
}
