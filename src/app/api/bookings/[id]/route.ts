import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'

function paymentStatus(depositPaid: number, totalPrice: number): 'pending' | 'partially_paid' | 'fully_paid' {
  if (depositPaid <= 0)          return 'pending'
  if (depositPaid >= totalPrice) return 'fully_paid'
  return 'partially_paid'
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  try {
    const session = await getServerSession(authOptions)
    const { id } = await params
    const body   = await request.json()
    const { status, totalPrice, depositPaid, discount, notes, destination, depositDueDate, finalDueDate, salesperson, startDate, endDate, guestCount, hasDiving, rescheduleReason, openTripId, newCabinId, yachtId, agentContactId } = body

    const existing = await db.booking.findUnique({
      where:  { id },
      select: { totalPrice: true, depositPaid: true, status: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const newDeposit = depositPaid !== undefined ? parseFloat(depositPaid) : existing.depositPaid
    const newTotal   = totalPrice  !== undefined ? parseFloat(totalPrice)  : existing.totalPrice

    // 'completed' and 'cancelled' are manual overrides
    const manualOverride = status === 'completed' || status === 'cancelled'
    const computedStatus = manualOverride
      ? (status as 'completed' | 'cancelled')
      : paymentStatus(newDeposit, newTotal)

    const booking = await db.booking.update({
      where: { id },
      data: {
        ...(totalPrice     !== undefined && { totalPrice:     newTotal }),
        ...(depositPaid    !== undefined && { depositPaid:    newDeposit }),
        ...(discount       !== undefined && { discount:       parseFloat(discount) }),
        ...(notes          !== undefined && { notes:          notes || null }),
        ...(destination    !== undefined && { destination:    destination || null }),
        ...(depositDueDate !== undefined && { depositDueDate: depositDueDate ? new Date(depositDueDate) : null }),
        ...(finalDueDate   !== undefined && { finalDueDate:   finalDueDate   ? new Date(finalDueDate)   : null }),
        ...(salesperson !== undefined && { salesperson: salesperson || null }),
        ...(startDate   !== undefined && { startDate:   new Date(startDate) }),
        ...(endDate     !== undefined && { endDate:     new Date(endDate) }),
        ...(openTripId  !== undefined && { openTripId:  openTripId || null }),
        ...(yachtId     !== undefined && { yachtId:     yachtId || null }),
        ...(guestCount  !== undefined && { guestCount:  parseInt(guestCount) }),
        ...(hasDiving       !== undefined && { hasDiving:       Boolean(hasDiving) }),
        ...(agentContactId  !== undefined && { agentContactId:  agentContactId || null }),
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

    const userId   = session?.user?.id   ?? ''
    const userName = session?.user?.name ?? session?.user?.email ?? 'Unknown'
    const userRole = (session?.user as { role?: string })?.role ?? ''
    logActivity({
      userId, userName, userRole,
      action: 'UPDATE', entity: 'Booking', entityId: id,
      detail: `Update booking ${booking.bookingCode} → status: ${booking.status}${rescheduleReason ? ` | Reschedule: ${rescheduleReason}` : ''}`,
    }).catch(() => {})

    return NextResponse.json(booking)
  } catch (error) {
    console.error('Error updating booking:', error)
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    const { id }  = await params
    const body    = await request.json()
    const { status, cancelReason, completeBooking, guests, totalPrice, depositPaid,
            discount, depositDueDate, finalDueDate, currency, exchangeRate, services,
            hasDiving, notes, crewRequired } = body

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
      const lead  = guests.find((g: { isLead?: boolean }) => g.isLead) ?? guests[0]

      await db.$transaction([
        // Remove the placeholder hold guest
        db.bookingGuest.deleteMany({ where: { bookingId: id } }),
        // Create real guests
        db.bookingGuest.createMany({
          data: guests.map((g: { customerId: string; cabinId?: string; isLead?: boolean }) => ({
            bookingId:  id,
            customerId: g.customerId,
            cabinId:    g.cabinId || null,
            isLead:     g.isLead ?? false,
          })),
        }),
        // Update booking
        db.booking.update({
          where: { id },
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
      }).catch(() => {})

      return NextResponse.json({ id, bookingCode: existing.bookingCode, status: paymentStatus(paid, total) })
    }

    // ── Standard status-only patch ──
    // 'pending' allowed only to release an on_hold booking
    const manualOverride = status === 'completed' || status === 'cancelled'
      || (status === 'pending' && existing.status === 'on_hold')
    const computedStatus = manualOverride
      ? (status as 'completed' | 'cancelled' | 'pending')
      : paymentStatus(existing.depositPaid, existing.totalPrice)

    const booking = await db.booking.update({
      where: { id },
      data: {
        status: computedStatus,
        ...(cancelReason !== undefined && { cancelReason: cancelReason || null }),
      },
      select: { id: true, bookingCode: true, status: true },
    })

    const userId   = session?.user?.id   ?? ''
    const userName = session?.user?.name ?? session?.user?.email ?? 'Unknown'
    const userRole = (session?.user as { role?: string })?.role ?? ''
    logActivity({
      userId, userName, userRole,
      action: 'UPDATE', entity: 'Booking', entityId: id,
      detail: `Update booking ${booking.bookingCode} → status: ${booking.status}${cancelReason ? ` (alasan: ${cancelReason})` : ''}`,
    }).catch(() => {})

    return NextResponse.json(booking)
  } catch (error) {
    console.error('Error patching booking:', error)
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session  = await getServerSession(authOptions)
    if ((session?.user as { role?: string })?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id }   = await params
    const existing = await db.booking.findUnique({ where: { id }, select: { bookingCode: true, status: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (existing.status !== 'cancelled') {
      return NextResponse.json({ error: 'Only cancelled bookings can be deleted' }, { status: 400 })
    }
    await db.booking.delete({ where: { id } })

    const userId   = session?.user?.id   ?? ''
    const userName = session?.user?.name ?? session?.user?.email ?? 'Unknown'
    const userRole = (session?.user as { role?: string })?.role ?? ''
    logActivity({
      userId, userName, userRole,
      action: 'DELETE', entity: 'Booking', entityId: id,
      detail: `Hapus booking ${existing?.bookingCode ?? id}`,
    }).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting booking:', error)
    return NextResponse.json({ error: 'Failed to delete booking' }, { status: 500 })
  }
}
