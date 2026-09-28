import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

/**
 * Recomputes the combined trip-number sequence for one yacht + calendar year: Open Trips
 * and Private Charter bookings share one ordering (by startDate, createdAt as tiebreaker).
 *
 * Numbers are what Finance/Accounting track each trip's income and expenses against, so a
 * trip closing must not shift the trips after it:
 *  - An Open Trip closed for any reason keeps its slot and its number.
 *  - The one exception is an Open Trip closed because an active (non-cancelled) Private
 *    Charter took it over — it's absorbed into that charter. The charter consumes one number
 *    per absorbed trip (min 1) and shows the first: trips 1–5 with #2 and #3 taken by one
 *    charter number as 1, 2 (the charter), 4, 5. A trip is absorbed when its closedReason
 *    ends with the charter's bookingCode. If that charter is later cancelled, the trip is no
 *    longer absorbed and takes its own slot back.
 *
 * Year bucketing uses endDate (checkout), not startDate: a trip departing Dec 31 and
 * returning Jan 3 belongs to the new year's sequence, since that's where almost all of it
 * actually happens — it becomes next year's #1, not last year's final number. Ordering
 * within the bucket still runs by startDate, so it correctly sorts before that year's other
 * trips.
 *
 * Excluded (number reset to null): cancelled Open Trips, absorbed Open Trips, and cancelled
 * Private Charters.
 *
 * Call after any create / startDate or endDate change / yachtId change / status change /
 * delete on either an OpenTrip or a Private Charter Booking that could shift ordering within
 * that yacht+year. Safe to call redundantly — it's a no-op where numbers already match.
 */
export async function renumberTripYear(db: Db, yachtId: string, year: number) {
  const start = new Date(Date.UTC(year, 0, 1))
  const end   = new Date(Date.UTC(year + 1, 0, 1))

  const [trips, charters, staleCharters] = await Promise.all([
    db.openTrip.findMany({
      where: { yachtId, endDate: { gte: start, lt: end }, OR: [{ status: { not: 'cancelled' } }, { tripNumber: { not: null } }] },
      select: { id: true, startDate: true, createdAt: true, tripNumber: true, status: true, closedReason: true },
    }),
    db.booking.findMany({
      where: { yachtId, tripType: 'PRIVATE_CHARTER', endDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
      select: { id: true, startDate: true, createdAt: true, tripNumber: true, bookingCode: true },
    }),
    db.booking.findMany({
      where: { yachtId, tripType: 'PRIVATE_CHARTER', endDate: { gte: start, lt: end }, status: 'cancelled', tripNumber: { not: null } },
      select: { id: true },
    }),
  ])

  // endsWith, not includes — so PC-1 doesn't also claim trips closed for PC-10.
  const absorbingCharter = (t: (typeof trips)[number]) => {
    if (t.status !== 'closed' || !t.closedReason) return undefined
    const reason = t.closedReason.trimEnd()
    return charters.find(c => reason.endsWith(` ${c.bookingCode}`))
  }
  const absorbedCount = new Map<string, number>()
  const eligibleTrips: typeof trips = []
  const staleTripIds: string[] = []
  for (const t of trips) {
    const charter = t.status === 'cancelled' ? undefined : absorbingCharter(t)
    if (charter) absorbedCount.set(charter.id, (absorbedCount.get(charter.id) ?? 0) + 1)
    if (t.status === 'cancelled' || charter) { if (t.tripNumber != null) staleTripIds.push(t.id) }
    else eligibleTrips.push(t)
  }

  if (staleTripIds.length)  await db.openTrip.updateMany({ where: { id: { in: staleTripIds } }, data: { tripNumber: null } })
  if (staleCharters.length) await db.booking.updateMany({ where: { id: { in: staleCharters.map(c => c.id) } }, data: { tripNumber: null } })

  const combined = [
    ...eligibleTrips.map(t => ({ kind: 'openTrip' as const, slots: 1, id: t.id, startDate: t.startDate, createdAt: t.createdAt, tripNumber: t.tripNumber })),
    ...charters.map(c => ({ kind: 'booking' as const, slots: Math.max(1, absorbedCount.get(c.id) ?? 0), ...c })),
  ].sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime())

  let num = 0
  for (const item of combined) {
    const itemNum = num + 1
    num += item.slots
    if (item.tripNumber === itemNum) continue
    if (item.kind === 'openTrip') await db.openTrip.update({ where: { id: item.id }, data: { tripNumber: itemNum } })
    else                          await db.booking.update({ where: { id: item.id }, data: { tripNumber: itemNum } })
  }
}
