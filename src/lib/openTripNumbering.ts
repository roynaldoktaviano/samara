import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

/**
 * Recomputes the combined trip-number sequence for one yacht + calendar year: Open Trips
 * and Private Charter bookings share one ordering (by startDate, createdAt as tiebreaker),
 * so when an Open Trip is closed/cancelled — typically because a Private Charter took its
 * slot — it drops out and the charter takes the number instead, rather than each keeping a
 * separate count.
 *
 * Year bucketing uses endDate (checkout), not startDate: a trip departing Dec 31 and
 * returning Jan 3 belongs to the new year's sequence, since that's where almost all of it
 * actually happens — it becomes next year's #1, not last year's final number. Ordering
 * within the bucket still runs by startDate, so it correctly sorts before that year's other
 * trips.
 *
 * Eligible: OpenTrip with status not in ('closed','cancelled'); Booking with
 * tripType='PRIVATE_CHARTER' and status != 'cancelled'. Anything excluded that still holds a
 * stale tripNumber (e.g. just got closed/cancelled) is reset to null.
 *
 * Call after any create / startDate or endDate change / yachtId change / status change /
 * delete on either an OpenTrip or a Private Charter Booking that could shift ordering within
 * that yacht+year. Safe to call redundantly — it's a no-op where numbers already match.
 */
export async function renumberTripYear(db: Db, yachtId: string, year: number) {
  const start = new Date(Date.UTC(year, 0, 1))
  const end   = new Date(Date.UTC(year + 1, 0, 1))

  const [eligibleTrips, staleTrips, eligibleCharters, staleCharters] = await Promise.all([
    db.openTrip.findMany({
      where: { yachtId, endDate: { gte: start, lt: end }, status: { notIn: ['closed', 'cancelled'] } },
      select: { id: true, startDate: true, createdAt: true, tripNumber: true },
    }),
    db.openTrip.findMany({
      where: { yachtId, endDate: { gte: start, lt: end }, status: { in: ['closed', 'cancelled'] }, tripNumber: { not: null } },
      select: { id: true },
    }),
    db.booking.findMany({
      where: { yachtId, tripType: 'PRIVATE_CHARTER', endDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
      select: { id: true, startDate: true, createdAt: true, tripNumber: true },
    }),
    db.booking.findMany({
      where: { yachtId, tripType: 'PRIVATE_CHARTER', endDate: { gte: start, lt: end }, status: 'cancelled', tripNumber: { not: null } },
      select: { id: true },
    }),
  ])

  if (staleTrips.length)    await db.openTrip.updateMany({ where: { id: { in: staleTrips.map(t => t.id) } }, data: { tripNumber: null } })
  if (staleCharters.length) await db.booking.updateMany({ where: { id: { in: staleCharters.map(c => c.id) } }, data: { tripNumber: null } })

  const combined = [
    ...eligibleTrips.map(t => ({ kind: 'openTrip' as const, ...t })),
    ...eligibleCharters.map(c => ({ kind: 'booking' as const, ...c })),
  ].sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime())

  for (let i = 0; i < combined.length; i++) {
    const item = combined[i]
    const num  = i + 1
    if (item.tripNumber === num) continue
    if (item.kind === 'openTrip') await db.openTrip.update({ where: { id: item.id }, data: { tripNumber: num } })
    else                          await db.booking.update({ where: { id: item.id }, data: { tripNumber: num } })
  }
}
