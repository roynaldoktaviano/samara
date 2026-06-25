import { db } from '@/lib/db'

/**
 * Promotes the first waiting list entry for a cancelled/expired booking.
 * Reuses the same booking (same code) — only swaps the customer/guest.
 * Re-numbers remaining waiting entries so priority stays contiguous.
 * Notification is fire-and-forget so the cancel response isn't held up.
 */
export async function promoteWaitingListForBooking(cancelledBookingId: string) {
  const original = await db.booking.findUnique({
    where: { id: cancelledBookingId },
    select: {
      bookingCode: true,
      yachtId: true, openTripId: true, startDate: true, endDate: true,
      tripType: true, destination: true, salespersonId: true,
    },
  })
  if (!original) return

  // Primary: entries tied directly to this booking
  // Fallback: entries tied to the same open trip (added from trip panel without a specific booking)
  const whereOr: object[] = [{ bookingId: cancelledBookingId }]
  if (original.openTripId) whereOr.push({ openTripId: original.openTripId, bookingId: null })

  const entry = await db.waitingList.findFirst({
    where: { status: 'waiting', OR: whereOr },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })
  if (!entry) return

  // Resolve customer (always set since POST auto-creates, but guard for old entries)
  let customerId: string
  if (entry.customerId) {
    customerId = entry.customerId
  } else {
    const existing = entry.contactPhone
      ? await db.customer.findFirst({ where: { phone: entry.contactPhone } })
      : null
    if (existing) {
      customerId = existing.id
    } else {
      const newCust = await db.customer.create({
        data: { name: entry.contactName, phone: entry.contactPhone ?? null, email: entry.contactEmail ?? null },
        select: { id: true },
      })
      customerId = newCust.id
    }
  }

  const holdUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  // Record the current holder in slot history before swapping them out
  const currentHolder = await db.booking.findUnique({
    where: { id: cancelledBookingId },
    select: { customerId: true, cancelReason: true, updatedAt: true, customer: { select: { name: true } } },
  })
  if (currentHolder) {
    await db.waitingListHistory.create({
      data: {
        bookingId:    cancelledBookingId,
        holderName:   currentHolder.customer?.name ?? 'Unknown',
        customerId:   currentHolder.customerId,
        cancelledAt:  new Date(),
        cancelReason: currentHolder.cancelReason ?? null,
      },
    })
  }

  // Reuse the same booking (keep bookingCode) — just swap customer + reset to on_hold
  await db.$transaction([
    db.booking.update({
      where: { id: cancelledBookingId },
      data: {
        customerId,
        status:       'on_hold',
        holdUntil,
        cancelReason: null,
        salespersonId: entry.salespersonId ?? original.salespersonId ?? null,
      },
    }),
    db.bookingGuest.deleteMany({ where: { bookingId: cancelledBookingId } }),
    db.bookingGuest.create({ data: { bookingId: cancelledBookingId, customerId, isLead: true } }),
  ])

  // Mark as promoted + re-number remaining in a single transaction to prevent race conditions
  const remaining = await db.waitingList.findMany({
    where: { status: 'waiting', OR: whereOr },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  })

  // status: 'waiting' guard prevents double-promotion under concurrent cancellations
  await db.$transaction([
    db.waitingList.update({
      where: { id: entry.id, status: 'waiting' },
      data: { status: 'promoted', promotedBookingId: cancelledBookingId },
    }),
    ...remaining.map((r, i) =>
      db.waitingList.update({ where: { id: r.id }, data: { priority: i } })
    ),
  ])

  // Notify salesperson — fire-and-forget so cancel response isn't delayed
  const notifyUserId = entry.salespersonId ?? original.salespersonId
  if (notifyUserId) {
    db.notification.create({
      data: {
        userId:    notifyUserId,
        type:      'WAITING_LIST_PROMOTED',
        title:     'Waiting List — Slot Available!',
        body:      `${entry.contactName} from the waiting list has been moved to On Hold (${original.bookingCode}). Contact them to confirm.`,
        bookingId: cancelledBookingId,
      },
    }).catch(e => console.error('[waiting-list] notification failed for user', notifyUserId, e))
  } else {
    console.warn('[waiting-list] no salesperson to notify for promoted entry', entry.id)
  }
}

/**
 * Finds all expired on_hold bookings, cancels them, and triggers waiting list promotions.
 * Fire-and-forget — call without await.
 */
export async function processExpiredHoldsAndPromote() {
  const now = new Date()
  const expired = await db.booking.findMany({
    where: { status: 'on_hold', holdUntil: { lt: now } },
    select: { id: true },
  })
  if (!expired.length) return

  await db.booking.updateMany({
    where: { id: { in: expired.map(b => b.id) }, status: 'on_hold', holdUntil: { lt: now } },
    data:  { status: 'cancelled', cancelReason: 'Hold expired' },
  })

  for (const b of expired) {
    await promoteWaitingListForBooking(b.id).catch(e => console.error('promote failed:', e))
  }
}
