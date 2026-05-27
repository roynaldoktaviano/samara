import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { BookingStatus } from '@prisma/client'

function bookingStatus(depositPaid: number, totalPrice: number): BookingStatus {
  if (depositPaid <= 0)          return BookingStatus.pending
  if (depositPaid >= totalPrice) return BookingStatus.fully_paid
  return BookingStatus.partially_paid
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const payment = await db.payment.findUnique({
      where: { id },
      include: {
        bank: true,
        booking: {
          include: {
            customer: { select: { name: true, email: true, phone: true, address: true } },
            yacht:    { select: { name: true, model: true } },
            openTrip: { select: { title: true, destination: true } },
            agent:    { select: { name: true, commission: true } },
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
    const { action } = body

    const actorId   = session?.user?.id   ?? ''
    const actorName = session?.user?.name ?? session?.user?.email ?? 'Unknown'
    const actorRole = (session?.user as { role?: string })?.role ?? ''

    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

    // ── Finance: generate invoice ──────────────────────────────────────────────
    if (action === 'generate_invoice') {
      if (!['FINANCE', 'ADMIN', 'SUPER_ADMIN'].includes(actorRole)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const { amount, paymentType, paymentMethod, notes, billToType, bankId, paymentLink } = body
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return NextResponse.json({ error: 'Amount harus diisi' }, { status: 400 })
      }

      const existing = await db.payment.findUnique({
        where: { id },
        include: { booking: { select: { id: true, bookingCode: true, depositPaid: true, totalPrice: true, salesperson: true } } },
      })
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (existing.status !== 'requested') {
        return NextResponse.json({ error: 'Hanya bisa generate invoice dari status "requested"' }, { status: 400 })
      }

      // Generate sequential invoice number INV-{bookingCode}-{nn}
      const confirmedCount = await db.payment.count({
        where: { bookingId: existing.bookingId, status: { in: ['invoice_ready', 'pending_confirmation', 'confirmed'] } },
      })
      const invoiceNumber = `INV-${existing.booking.bookingCode}-${String(confirmedCount + 1).padStart(2, '0')}`

      await db.payment.update({
        where: { id },
        data: {
          invoiceNumber,
          amount,
          ...(paymentType   !== undefined && { paymentType:   paymentType   || existing.paymentType }),
          ...(paymentMethod !== undefined && { paymentMethod: paymentMethod || null }),
          ...(notes         !== undefined && { notes:         notes         || null }),
          ...(billToType    !== undefined && { billToType:    billToType    || existing.billToType }),
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
      }).catch(() => {})

      // Notify Sales submitter
      if (existing.submittedByUserId) {
        await db.notification.upsert({
          where: { userId_type_bookingId: { userId: existing.submittedByUserId, type: 'INVOICE_READY', bookingId: existing.bookingId } },
          create: {
            userId: existing.submittedByUserId,
            type: 'INVOICE_READY',
            title: 'Invoice siap didownload',
            body: `${invoiceNumber} (${existing.booking.bookingCode}) sudah di-generate oleh Finance`,
            paymentId: id,
            bookingId: existing.bookingId,
          },
          update: { isRead: false, title: 'Invoice siap didownload', body: `${invoiceNumber} (${existing.booking.bookingCode}) sudah di-generate oleh Finance`, createdAt: new Date() },
        })
      }

      return NextResponse.json({ ok: true, invoiceNumber })
    }

    // ── Sales: submit proof of transfer ───────────────────────────────────────
    if (action === 'submit_proof') {
      const { proofOfTransfer, paymentMethod } = body
      if (!proofOfTransfer) {
        return NextResponse.json({ error: 'Bukti transfer harus dilampirkan' }, { status: 400 })
      }

      const existing = await db.payment.findUnique({
        where: { id },
        include: { booking: { select: { id: true, bookingCode: true } } },
      })
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (existing.status !== 'invoice_ready') {
        return NextResponse.json({ error: 'Hanya bisa submit bukti pada status "invoice_ready"' }, { status: 400 })
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
      }).catch(() => {})

      // Notify Finance + Admin
      const financeUsers = await db.user.findMany({
        where: { role: { in: ['FINANCE', 'ADMIN'] } },
        select: { id: true },
      })
      if (financeUsers.length > 0) {
        await db.notification.createMany({
          data: financeUsers.map(u => ({
            userId: u.id,
            type: 'PROOF_SUBMITTED',
            title: 'Bukti transfer diterima',
            body: `${existing.invoiceNumber} (${existing.booking.bookingCode}) menunggu konfirmasi pembayaran`,
            paymentId: id,
          })),
          skipDuplicates: true,
        })
      }

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
              id: true, bookingCode: true, totalPrice: true, depositPaid: true, salesperson: true,
              source: true,
              agent: { select: { commission: true } },
            },
          },
        },
      })
      if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
      if (payment.status !== 'pending_confirmation') {
        return NextResponse.json({ error: 'Hanya bisa konfirmasi/tolak dari status "pending_confirmation"' }, { status: 400 })
      }

      // Resolve recipient
      let recipientUserId = payment.submittedByUserId
      if (!recipientUserId && payment.booking.salesperson) {
        const sp = await db.user.findFirst({
          where: { name: { equals: payment.booking.salesperson, mode: 'insensitive' } },
          select: { id: true },
        })
        if (sp) recipientUserId = sp.id
      }

      if (action === 'confirm') {
        const newDepositPaid = payment.booking.depositPaid + payment.amount
        const effectiveTotal = payment.booking.source === 'AGENT' && payment.booking.agent?.commission
          ? payment.booking.totalPrice * (1 - payment.booking.agent.commission / 100)
          : payment.booking.totalPrice
        const newStatus = bookingStatus(newDepositPaid, effectiveTotal)

        await db.$transaction([
          db.payment.update({
            where: { id },
            data: { status: 'confirmed', confirmedBy: actorName, confirmedAt: new Date() },
          }),
          db.booking.update({
            where: { id: payment.bookingId },
            data: { depositPaid: newDepositPaid, status: newStatus },
          }),
        ])

        logActivity({
          userId: actorId, userName: actorName, userRole: actorRole,
          action: 'CONFIRM', entity: 'Payment', entityId: id,
          detail: `Konfirmasi invoice ${payment.invoiceNumber} (${payment.booking.bookingCode})`,
        }).catch(() => {})

        if (recipientUserId) {
          await db.notification.create({
            data: {
              userId: recipientUserId,
              type: 'PAYMENT_CONFIRMED',
              title: 'Pembayaran dikonfirmasi ✓',
              body: `${payment.invoiceNumber} (${payment.booking.bookingCode}) telah dikonfirmasi oleh ${actorName}`,
              paymentId: id,
            },
          })
        }
      } else {
        await db.payment.update({
          where: { id },
          data: { status: 'rejected', confirmedBy: actorName, confirmedAt: new Date() },
        })

        logActivity({
          userId: actorId, userName: actorName, userRole: actorRole,
          action: 'REJECT', entity: 'Payment', entityId: id,
          detail: `Tolak invoice ${payment.invoiceNumber} (${payment.booking.bookingCode})`,
        }).catch(() => {})

        if (recipientUserId) {
          await db.notification.create({
            data: {
              userId: recipientUserId,
              type: 'PAYMENT_REJECTED',
              title: 'Pembayaran ditolak',
              body: `${payment.invoiceNumber} (${payment.booking.bookingCode}) ditolak oleh ${actorName}`,
              paymentId: id,
            },
          })
        }
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error processing payment:', error)
    return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 })
  }
}
