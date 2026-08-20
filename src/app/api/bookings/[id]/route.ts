import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { promoteWaitingListForBooking } from '@/lib/waiting-list'
import { scheduleTripSheetSync } from '@/lib/google-sheets'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { recalcOpenTripPrice } from '@/lib/booking-pricing'

function paymentStatus(depositPaid: number, totalPrice: number): 'pending' | 'partially_paid' | 'fully_paid' {
  if (depositPaid <= 0)          return 'pending'
  if (depositPaid >= totalPrice) return 'fully_paid'
  return 'partially_paid'
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const booking = await db.booking.findUnique({
      where: { id },
      include: {
        yacht:    { select: { id: true, name: true, model: true, cabins: { select: { id: true, name: true, deck: true }, orderBy: { name: 'asc' } } } },
        customer: { select: { id: true, name: true, email: true, phone: true } },
        agent:        { select: { id: true, name: true } },
        agentContact: { select: { id: true, name: true, email: true, whatsapp: true } },
        openTrip:        { select: { id: true, title: true, destination: true } },
        salespersonUser: { select: { name: true } },
        guests: {
          include: {
            customer: { select: { id: true, name: true, phone: true, email: true, passport: true, nationality: true } },
            cabin:    { select: { id: true, name: true } },
          },
          orderBy: [{ isLead: 'desc' }, { id: 'asc' }],
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
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const tripSheetId = await getTenantSecret((session.user as { tenantId?: string }).tenantId ?? '', 'tripSheetGoogleSheetId')
  try {
    const { id } = await params
    const body   = await request.json()
    const { status, totalPrice, depositPaid, discount, notes, destination, destinationId, depositDueDate, finalDueDate, syncDepositDueToInvoice, syncFinalDueToInvoice, holdUntil, salesperson, startDate, endDate, guestCount, hasDiving, hasSurfing, hasPhotoPackage, rescheduleReason, openTripId, newCabinId, yachtId, agentContactId, services, currency, exchangeRate } = body

    const existing = await db.booking.findUnique({
      where:  { id },
      select: {
        totalPrice: true, depositPaid: true, status: true, tripType: true,
        depositDueDate: true, finalDueDate: true,
        depositDueDateInvoiceOverride: true, finalDueDateInvoiceOverride: true,
      },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Due dates can't be moved into the past. Unchanged values (e.g. resaving an older booking
    // whose due date already lapsed) are exempt — only an actual change to a past date is rejected.
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const rejectsPastDate = (newVal: unknown, existingVal: Date | null) => {
      if (typeof newVal !== 'string' || !newVal) return false
      const newDate = new Date(newVal)
      if (isNaN(newDate.getTime())) return false
      if (existingVal && existingVal.getTime() === newDate.getTime()) return false
      return newDate.getTime() < todayStart.getTime()
    }
    if (depositDueDate !== undefined && rejectsPastDate(depositDueDate, existing.depositDueDate)) {
      return NextResponse.json({ error: 'Deposit due date cannot be in the past' }, { status: 400 })
    }
    if (finalDueDate !== undefined && rejectsPastDate(finalDueDate, existing.finalDueDate)) {
      return NextResponse.json({ error: 'Final due date cannot be in the past' }, { status: 400 })
    }

    const newDeposit = depositPaid !== undefined ? parseFloat(depositPaid) : existing.depositPaid
    const newTotal   = totalPrice  !== undefined ? parseFloat(totalPrice)  : existing.totalPrice

    // 'completed' and 'cancelled' are manual overrides
    const manualOverride = status === 'completed' || status === 'cancelled'
    const computedStatus = manualOverride
      ? (status as 'completed' | 'cancelled')
      : paymentStatus(newDeposit, newTotal)

    // Extending a due date can optionally leave the invoice showing the original date.
    // syncXToInvoice is only present when the change comes from the dedicated "Extend Due Date"
    // action — the full Edit Booking form never sends it, so its behavior is unchanged.
    let depositDueDateInvoiceOverride: Date | null | undefined
    if (depositDueDate !== undefined && syncDepositDueToInvoice !== undefined) {
      depositDueDateInvoiceOverride = syncDepositDueToInvoice
        ? null
        : (existing.depositDueDateInvoiceOverride ?? existing.depositDueDate)
    }
    let finalDueDateInvoiceOverride: Date | null | undefined
    if (finalDueDate !== undefined && syncFinalDueToInvoice !== undefined) {
      finalDueDateInvoiceOverride = syncFinalDueToInvoice
        ? null
        : (existing.finalDueDateInvoiceOverride ?? existing.finalDueDate)
    }

    const booking = await db.booking.update({
      where: { id },
      data: {
        ...(totalPrice     !== undefined && { totalPrice:     newTotal }),
        ...(depositPaid    !== undefined && { depositPaid:    newDeposit }),
        ...(discount       !== undefined && { discount:       parseFloat(discount) }),
        ...(notes          !== undefined && { notes:          notes || null }),
        ...(destination    !== undefined && { destination:    destination || null }),
        ...(destinationId  !== undefined && { destinationId:  destinationId || null }),
        ...(depositDueDate !== undefined && { depositDueDate: depositDueDate ? new Date(depositDueDate) : null }),
        ...(finalDueDate   !== undefined && { finalDueDate:   finalDueDate   ? new Date(finalDueDate)   : null }),
        ...(depositDueDateInvoiceOverride !== undefined && { depositDueDateInvoiceOverride }),
        ...(finalDueDateInvoiceOverride   !== undefined && { finalDueDateInvoiceOverride }),
        ...(salesperson !== undefined && { salesperson: salesperson || null }),
        ...(startDate   !== undefined && { startDate:   new Date(startDate) }),
        ...(endDate     !== undefined && { endDate:     new Date(endDate) }),
        ...(openTripId  !== undefined && { openTripId:  openTripId || null }),
        ...(yachtId     !== undefined && { yachtId:     yachtId || null }),
        ...(guestCount  !== undefined && { guestCount:  parseInt(guestCount) }),
        ...(hasDiving       !== undefined && { hasDiving:       Boolean(hasDiving) }),
        ...(hasSurfing       !== undefined && { hasSurfing:       Boolean(hasSurfing) }),
        ...(hasPhotoPackage  !== undefined && { hasPhotoPackage:  Boolean(hasPhotoPackage) }),
        ...(agentContactId  !== undefined && { agentContactId:  agentContactId || null }),
        ...(holdUntil       !== undefined && { holdUntil:       holdUntil ? new Date(holdUntil) : null }),
        ...(currency        !== undefined && {
          currency:     currency || 'USD',
          exchangeRate: (currency && currency !== 'USD' && exchangeRate) ? parseFloat(String(exchangeRate)) : null,
        }),
        status: computedStatus,
      },
      select: { id: true, bookingCode: true, status: true },
    })

    if (newCabinId) {
      await db.bookingGuest.updateMany({
        where: { bookingId: id },
        data:  { cabinId: newCabinId },
      })
    }

    // Replace services if provided (delete all then recreate)
    if (Array.isArray(services)) {
      await db.bookingService.deleteMany({ where: { bookingId: id } })
      const validSvc = (services as { name?: string; price?: string | number; quantity?: number }[])
        .filter(s => s.name?.trim())
      if (validSvc.length) {
        await db.bookingService.createMany({
          data: validSvc.map(s => ({
            bookingId: id,
            name:      s.name!.trim(),
            price:     parseFloat(String(s.price)) || 0,
            quantity:  s.quantity ?? 1,
          })),
        })
      }
    }

    // Open Trip pricing is derived from cabins/services/discount, not whatever the client
    // last had on screen — recompute it server-side so stale wizard state can't persist
    // a wrong total (e.g. after a guest/cabin is removed mid-edit).
    let finalBooking = booking
    if (existing.tripType === 'OPEN_TRIP') {
      await recalcOpenTripPrice(db, id)
      finalBooking = await db.booking.findUniqueOrThrow({
        where: { id },
        select: { id: true, bookingCode: true, status: true },
      })
    }

    const userId   = session?.user?.id   ?? ''
    const userName = session?.user?.name ?? session?.user?.email ?? 'Unknown'
    const userRole = (session?.user as { role?: string })?.role ?? ''
    logActivity({
      userId, userName, userRole,
      action: 'UPDATE', entity: 'Booking', entityId: id,
      detail: `Update booking ${finalBooking.bookingCode} → status: ${finalBooking.status}${rescheduleReason ? ` | Reschedule: ${rescheduleReason}` : ''}`,
    }, db).catch(() => {})

    scheduleTripSheetSync(db, tripSheetId)
    return NextResponse.json(finalBooking)
  } catch (error) {
    console.error('Error updating booking:', error)
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const tripSheetId = await getTenantSecret((session.user as { tenantId?: string }).tenantId ?? '', 'tripSheetGoogleSheetId')
  try {
    const { id }  = await params
    const body    = await request.json()
    const { status, cancelReason, completeBooking, guests, totalPrice, depositPaid,
            discount, depositDueDate, finalDueDate, currency, exchangeRate, services,
            hasDiving, hasSurfing, hasPhotoPackage, notes, crewRequired } = body

    const existing = await db.booking.findUnique({
      where:  { id },
      select: { totalPrice: true, depositPaid: true, status: true, bookingCode: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // ── Complete booking: replace placeholder guest, fill in pricing ──
    if (completeBooking) {
      if (existing.status !== 'on_hold') {
        return NextResponse.json({ error: 'Only on_hold bookings can be completed this way' }, { status: 400 })
      }
      if (!guests?.length) {
        return NextResponse.json({ error: 'At least one guest is required' }, { status: 400 })
      }

      const paid  = parseFloat(depositPaid) || 0
      const total = parseFloat(totalPrice)  || 0
      // Never let a placeholder (no customerId — cabin reserved, name TBD) become the lead.
      const lead  = guests.find((g: { isLead?: boolean; customerId?: string }) => g.isLead && g.customerId)
        ?? guests.find((g: { customerId?: string }) => g.customerId)
      if (!lead) return NextResponse.json({ error: 'At least one named guest is required' }, { status: 400 })

      await db.$transaction([
        // Remove the placeholder hold guest
        db.bookingGuest.deleteMany({ where: { bookingId: id } }),
        // Create real guests
        db.bookingGuest.createMany({
          data: guests.map((g: { customerId?: string; cabinId?: string; isLead?: boolean; isPlaceholder?: boolean }) => ({
            bookingId:  id,
            customerId: g.customerId || null,
            cabinId:    g.cabinId || null,
            isLead:     g.isPlaceholder ? false : (g.isLead ?? false),
          })),
        }),
        // Update booking — WHERE includes status: on_hold to prevent double-completion race
        db.booking.update({
          where: { id, status: 'on_hold' },
          data: {
            customerId:    lead.customerId,
            totalPrice:    total,
            depositPaid:   paid,
            discount:      parseFloat(discount) || 0,
            depositDueDate: depositDueDate ? new Date(depositDueDate) : null,
            finalDueDate:   finalDueDate   ? new Date(finalDueDate)   : null,
            currency:      currency || 'USD',
            exchangeRate:  (currency && currency !== 'USD' && exchangeRate) ? parseFloat(exchangeRate) : null,
            hasDiving:     Boolean(hasDiving),
            hasSurfing:       Boolean(hasSurfing),
            hasPhotoPackage:  Boolean(hasPhotoPackage),
            crewRequired:  Boolean(crewRequired),
            notes:         notes || null,
            guestCount:    guests.length,
            status:        paymentStatus(paid, total),
          },
        }),
      ])

      // Add services if provided
      if (services?.length) {
        const validSvc = (services as { name?: string; price?: string | number; qty?: number }[]).filter(s => s.name?.trim())
        if (validSvc.length) {
          await db.bookingService.createMany({
            data: validSvc.map(s => ({
              bookingId: id,
              name:      s.name!.trim(),
              price:     parseFloat(String(s.price)) || 0,
              quantity:  s.qty ?? 1,
            })),
          })
        }
      }

      const userId   = session?.user?.id   ?? ''
      const userName = session?.user?.name ?? session?.user?.email ?? 'Unknown'
      const userRole = (session?.user as { role?: string })?.role ?? ''
      logActivity({
        userId, userName, userRole,
        action: 'UPDATE', entity: 'Booking', entityId: id,
        detail: `Complete booking ${existing.bookingCode} — ${guests.length} guest(s), total: ${total}`,
      }, db).catch(() => {})

      scheduleTripSheetSync(db, tripSheetId)
      return NextResponse.json({ id, bookingCode: existing.bookingCode, status: paymentStatus(paid, total) })
    }

    // ── Standard status-only patch ──
    // 'pending' allowed only to release an on_hold booking
    const manualOverride = status === 'completed' || status === 'cancelled'
      || (status === 'pending' && existing.status === 'on_hold')
    const computedStatus = manualOverride
      ? (status as 'completed' | 'cancelled' | 'pending')
      : paymentStatus(existing.depositPaid, existing.totalPrice)

    const userId   = session?.user?.id   ?? ''
    const userName = session?.user?.name ?? session?.user?.email ?? 'Unknown'
    const userRole = (session?.user as { role?: string })?.role ?? ''

    // ── If cancelling, check for confirmed payments → route to refund flow ──
    if (computedStatus === 'cancelled') {
      const confirmedPayments = await db.payment.findMany({
        where: { bookingId: id, status: 'confirmed' },
        select: { id: true },
      })

      if (confirmedPayments.length > 0) {
        // Has confirmed payments → set pending_refund, notify Finance
        const booking = await db.booking.update({
          where: { id },
          data: {
            status: 'pending_refund',
            cancelReason: cancelReason || null,
            refundStatus: 'pending_decision',
          },
          select: { id: true, bookingCode: true, status: true },
        })

        // Cancel non-confirmed payments
        await db.payment.updateMany({
          where: { bookingId: id, status: { in: ['requested', 'invoice_ready', 'pending_confirmation'] } },
          data: { status: 'cancelled' },
        }).catch(() => {})

        // Notify Finance + Admin
        db.user.findMany({ where: { role: { in: ['FINANCE', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true } })
          .then(financeUsers => db.notification.createMany({
            data: financeUsers.map(u => ({
              userId:    u.id,
              type:      'REFUND_DECISION_NEEDED',
              title:     'Refund decision needed',
              body:      `Booking ${booking.bookingCode} was cancelled with confirmed payment. Please decide: refund or no refund.`,
              bookingId: id,
            })),
            skipDuplicates: true,
          })).catch(() => {})

        logActivity({ userId, userName, userRole, action: 'UPDATE', entity: 'Booking', entityId: id,
          detail: `Cancel booking ${booking.bookingCode} with confirmed payment → pending refund decision`,
        }, db).catch(() => {})

        scheduleTripSheetSync(db, tripSheetId)
        return NextResponse.json({ ...booking, requiresRefundDecision: true })
      }
    }

    const booking = await db.booking.update({
      where: { id },
      data: {
        status: computedStatus,
        ...(cancelReason !== undefined && { cancelReason: cancelReason || null }),
      },
      select: { id: true, bookingCode: true, status: true },
    })

    // When booking is cancelled (no confirmed payments), cancel pending payments and promote waiting list
    if (computedStatus === 'cancelled') {
      await db.payment.updateMany({
        where: { bookingId: id, status: { in: ['requested', 'invoice_ready', 'pending_confirmation'] } },
        data: { status: 'cancelled' },
      }).catch(e => console.error('cancel payments failed:', e))
      await promoteWaitingListForBooking(id, db).catch(e => console.error('promote waiting list failed:', e))
    }

    logActivity({
      userId, userName, userRole,
      action: 'UPDATE', entity: 'Booking', entityId: id,
      detail: `Update booking ${booking.bookingCode} → status: ${booking.status}${cancelReason ? ` (alasan: ${cancelReason})` : ''}`,
    }, db).catch(() => {})

    scheduleTripSheetSync(db, tripSheetId)
    return NextResponse.json(booking)
  } catch (error) {
    console.error('Error patching booking:', error)
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if ((session?.user as { role?: string })?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const db = await getDb(session)
  try {
    const { id }   = await params
    const existing = await db.booking.findUnique({ where: { id }, select: { bookingCode: true, status: true, tripType: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (existing.status !== 'cancelled') {
      return NextResponse.json({ error: 'Only cancelled bookings can be deleted' }, { status: 400 })
    }
    await db.booking.delete({ where: { id } })

    // If it was a Private Charter, reopen any future open trips that were closed because of it
    if (existing.tripType === 'PRIVATE_CHARTER') {
      db.openTrip.updateMany({
        where: {
          closedReason: { contains: existing.bookingCode },
          startDate: { gt: new Date() },
        },
        data: { status: 'open', closedReason: null },
      }).catch(() => {})
    }

    const userId   = session?.user?.id   ?? ''
    const userName = session?.user?.name ?? session?.user?.email ?? 'Unknown'
    const userRole = (session?.user as { role?: string })?.role ?? ''
    logActivity({
      userId, userName, userRole,
      action: 'DELETE', entity: 'Booking', entityId: id,
      detail: `Hapus booking ${existing?.bookingCode ?? id}`,
    }, db).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting booking:', error)
    return NextResponse.json({ error: 'Failed to delete booking' }, { status: 500 })
  }
}
