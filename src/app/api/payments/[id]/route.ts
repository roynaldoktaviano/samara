import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
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
    const payment = await db.payment.findUnique({
      where: { id },
      include: {
        bank: true,
        booking: {
          include: {
            customer: { select: { name: true, email: true, phone: true, address: true, gender: true } },
            yacht:    { select: { name: true, model: true } },
            openTrip: { select: { title: true, destination: true } },
            agent:    { select: { name: true, commissionOpenTrip: true, commissionPrivateCharter: true } },
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

      const existing = await db.payment.findUnique({
        where: { id },
        include: { booking: { select: { id: true, bookingCode: true, depositPaid: true, totalPrice: true, salespersonId: true } } },
      })
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (existing.status !== 'requested') {
        return NextResponse.json({ error: 'Invoice can only be generated from "requested" status' }, { status: 400 })
      }

      const { nextVal } = await import('@/lib/counter')
      const invNum      = await nextVal(`payment_inv:${existing.booking.bookingCode}`, db)
      const invoiceNumber = `INV-${existing.booking.bookingCode}-${String(invNum).padStart(2, '0')}`

      await db.payment.update({
        where: { id },
        data: {
          invoiceNumber,
          amount,
          ...(paymentType   !== undefined && { paymentType:   paymentType   || existing.paymentType }),
          ...(paymentMethod !== undefined && { paymentMethod: paymentMethod || null }),
          ...(notes         !== undefined && { notes:         notes         || null }),
          ...(billToType    !== undefined && { billToType:    billToType    || existing.billToType }),
          ...(body.showNetAmount !== undefined && { showNetAmount: !!body.showNetAmount }),
          ...(bankId        !== undefined && { bankId:        bankId        || null }),
          ...(paymentLink   !== undefined && { paymentLink:   paymentLink   || null }),
          invoiceGeneratedBy: actorName,
          invoiceGeneratedAt: new Date(),
          status: 'invoice_ready',
        },
      })

      logActivity({
        userId: actorId, userName: actorName, userRole: actorRole,
        action: 'GENERATE', entity: 'Payment', entityId: id,
        detail: `Generate invoice ${invoiceNumber} (${existing.booking.bookingCode}) — ${amount}`,
      }, db).catch(() => {})

      // Notify the relevant salesperson(s) that invoice is ready (fire-and-forget)
      const invoiceReadyTargets = new Set<string>([
        existing.submittedByUserId,
        existing.booking.salespersonId,
      ].filter(Boolean) as string[])

      for (const recipientId of invoiceReadyTargets) {
        db.notification.findFirst({ where: { userId: recipientId, type: 'INVOICE_READY', bookingId: existing.bookingId } })
          .then(existing_n => {
            if (existing_n) {
              return db.notification.update({ where: { id: existing_n.id }, data: { isRead: false, title: 'Invoice ready to download', body: `${invoiceNumber} (${existing.booking.bookingCode}) has been generated by Finance`, createdAt: new Date() } })
            }
            return db.notification.create({ data: { userId: recipientId, type: 'INVOICE_READY', title: 'Invoice ready to download', body: `${invoiceNumber} (${existing.booking.bookingCode}) has been generated by Finance`, paymentId: id, bookingId: existing.bookingId } })
          }).catch(() => {})
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

      return NextResponse.json({ ok: true, invoiceNumber })
    }

    // ── Sales: submit proof of transfer ───────────────────────────────────────
    if (action === 'submit_proof') {
      const { proofOfTransfer, paymentMethod } = body
      if (!proofOfTransfer) {
        return NextResponse.json({ error: 'Payment proof must be attached' }, { status: 400 })
      }

      const existing = await db.payment.findUnique({
        where: { id },
        include: { booking: { select: { id: true, bookingCode: true } } },
      })
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (existing.status !== 'invoice_ready') {
        return NextResponse.json({ error: 'Proof can only be submitted when status is "invoice_ready"' }, { status: 400 })
      }

      await db.payment.update({
        where: { id },
        data: {
          proofOfTransfer,
          ...(paymentMethod !== undefined && { paymentMethod: paymentMethod || null }),
          status: 'pending_confirmation',
        },
      })

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

      return NextResponse.json({ ok: true })
    }

    // ── Finance: confirm / reject payment ─────────────────────────────────────
    if (action === 'confirm' || action === 'reject') {
      if (!['FINANCE', 'ADMIN', 'SUPER_ADMIN'].includes(actorRole)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const payment = await db.payment.findUnique({
        where: { id },
        include: {
          booking: {
            select: {
              id: true, bookingCode: true, totalPrice: true, depositPaid: true,
              salespersonId: true, source: true, tripType: true,
              agent: { select: { commissionOpenTrip: true, commissionPrivateCharter: true } },
            },
          },
        },
      })
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
        const effectiveTotal = payment.booking.totalPrice * (1 - commPctSafe / 100)
        const paymentAmount  = payment.amount

        // Atomic: update payment only if still pending_confirmation (prevents double-confirm race)
        // If another request already confirmed it, Prisma throws P2025 and we return 409.
        await db.$transaction([
          db.payment.update({
            where: { id, status: 'pending_confirmation' },
            data: { status: 'confirmed', confirmedBy: actorName, confirmedAt: new Date() },
          }),
          db.$executeRaw`
            UPDATE "Booking"
            SET
              "depositPaid" = "depositPaid" + ${paymentAmount},
              "status" = CASE
                WHEN "depositPaid" + ${paymentAmount} >= ${effectiveTotal} THEN 'fully_paid'
                WHEN "depositPaid" + ${paymentAmount} > 0               THEN 'partially_paid'
                ELSE 'pending'
              END
            WHERE id = ${payment.bookingId}
          `,
        ])

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
        await db.payment.update({
          where: { id },
          data: { status: 'rejected', confirmedBy: actorName, confirmedAt: new Date() },
        })

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
