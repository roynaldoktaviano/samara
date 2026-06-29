import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { promoteWaitingListForBooking } from '@/lib/waiting-list'

async function requireFinanceOrAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!['FINANCE', 'ADMIN', 'SUPER_ADMIN'].includes(role)) return null
  return session
}

// GET — fetch refund info for a booking
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const booking = await db.booking.findUnique({
      where: { id },
      select: {
        id: true, bookingCode: true, status: true,
        cancelReason: true,
        refundStatus: true, refundDecision: true, refundReason: true,
        refundProof: true, refundConfirmedAt: true, refundConfirmedBy: true,
        payments: {
          where: { status: 'confirmed' },
          select: { id: true, invoiceNumber: true, amount: true, confirmedAt: true, paymentType: true },
        },
      },
    })
    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(booking)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch refund info' }, { status: 500 })
  }
}

// PATCH — Finance decides no_refund or refund; Finance uploads proof; Sales confirms
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const body = await request.json()
    const { action, reason, proofFile } = body

    // ── Finance: decide no_refund ─────────────────────────────────────────────
    if (action === 'no_refund') {
      const session = await requireFinanceOrAdmin()
      if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (!reason?.trim()) return NextResponse.json({ error: 'Reason is required' }, { status: 400 })

      const booking = await db.booking.update({
        where: { id },
        data: {
          status: 'cancelled',
          refundStatus: 'no_refund',
          refundDecision: 'no_refund',
          refundReason: reason.trim(),
        },
        select: { id: true, bookingCode: true, salespersonId: true },
      })

      await promoteWaitingListForBooking(id, db).catch(e => console.error('[refund] waiting list promotion failed for booking', id, e))

      // Notify salesperson
      if (booking.salespersonId) {
        db.notification.create({
          data: {
            userId:    booking.salespersonId,
            type:      'REFUND_NO_REFUND',
            title:     'No Refund Decision',
            body:      `Finance decided no refund for booking ${booking.bookingCode}. Reason: ${reason.trim()}`,
            bookingId: id,
          },
        }).catch(e => console.error('[refund] notification failed:', e))
      }

      const actorName = session.user?.name ?? session.user?.email ?? 'Unknown'
      const actorRole = (session.user as { role?: string })?.role ?? ''
      logActivity({ userId: session.user.id, userName: actorName, userRole: actorRole,
        action: 'UPDATE', entity: 'Booking', entityId: id,
        detail: `No refund decision for ${booking.bookingCode}: ${reason}`,
      }, db).catch(() => {})

      return NextResponse.json(booking)
    }

    // ── Finance: decide refund ────────────────────────────────────────────────
    if (action === 'refund') {
      const session = await requireFinanceOrAdmin()
      if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (!reason?.trim()) return NextResponse.json({ error: 'Reason is required' }, { status: 400 })

      const booking = await db.booking.update({
        where: { id },
        data: {
          refundStatus: 'refund_pending',
          refundDecision: 'refund',
          refundReason: reason.trim(),
        },
        select: { id: true, bookingCode: true, salespersonId: true },
      })

      // Notify salesperson that refund is approved, proof pending
      if (booking.salespersonId) {
        db.notification.create({
          data: {
            userId:    booking.salespersonId,
            type:      'REFUND_APPROVED',
            title:     'Refund Approved',
            body:      `Finance approved refund for booking ${booking.bookingCode}. Waiting for proof of transfer.`,
            bookingId: id,
          },
        }).catch(e => console.error('[refund] notification failed:', e))
      }

      const actorName = session.user?.name ?? session.user?.email ?? 'Unknown'
      const actorRole = (session.user as { role?: string })?.role ?? ''
      logActivity({ userId: session.user.id, userName: actorName, userRole: actorRole,
        action: 'UPDATE', entity: 'Booking', entityId: id,
        detail: `Refund approved for ${booking.bookingCode}: ${reason}`,
      }, db).catch(() => {})

      return NextResponse.json(booking)
    }

    // ── Finance: upload refund proof ──────────────────────────────────────────
    if (action === 'upload_proof') {
      const session = await requireFinanceOrAdmin()
      if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (!proofFile) return NextResponse.json({ error: 'Proof file is required' }, { status: 400 })

      const booking = await db.booking.update({
        where: { id },
        data: {
          refundStatus: 'refund_uploaded',
          refundProof: proofFile,
        },
        select: { id: true, bookingCode: true, salespersonId: true },
      })

      // Notify salesperson to confirm with guest
      if (booking.salespersonId) {
        db.notification.create({
          data: {
            userId:    booking.salespersonId,
            type:      'REFUND_CONFIRM_NEEDED',
            title:     'Please confirm refund with guest',
            body:      `Finance uploaded refund proof for booking ${booking.bookingCode}. Please confirm with guest and mark as confirmed.`,
            bookingId: id,
          },
        }).catch(e => console.error('[refund] notification failed:', e))
      }

      const actorName = session.user?.name ?? session.user?.email ?? 'Unknown'
      const actorRole = (session.user as { role?: string })?.role ?? ''
      logActivity({ userId: session.user.id, userName: actorName, userRole: actorRole,
        action: 'UPDATE', entity: 'Booking', entityId: id,
        detail: `Refund proof uploaded for ${booking.bookingCode}`,
      }, db).catch(() => {})

      return NextResponse.json(booking)
    }

    // ── Sales: confirm refund received by guest ───────────────────────────────
    if (action === 'confirm_refund') {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      const booking = await db.booking.update({
        where: { id },
        data: {
          status: 'cancelled',
          refundStatus: 'refund_confirmed',
          refundConfirmedAt: new Date(),
          refundConfirmedBy: session.user?.name ?? session.user?.email ?? 'Unknown',
        },
        select: { id: true, bookingCode: true },
      })

      // Mark confirmed payments as refunded
      await db.payment.updateMany({
        where: { bookingId: id, status: 'confirmed' },
        data: { status: 'refunded' },
      }).catch(e => console.error('[refund] payment status update failed for booking', id, e))

      await promoteWaitingListForBooking(id, db).catch(e => console.error('[refund] waiting list promotion failed for booking', id, e))

      const actorName = session.user?.name ?? session.user?.email ?? 'Unknown'
      const actorRole = (session.user as { role?: string })?.role ?? ''
      logActivity({ userId: session.user.id, userName: actorName, userRole: actorRole,
        action: 'UPDATE', entity: 'Booking', entityId: id,
        detail: `Refund confirmed by sales for ${booking.bookingCode}`,
      }, db).catch(() => {})

      return NextResponse.json(booking)
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to process refund action' }, { status: 500 })
  }
}
