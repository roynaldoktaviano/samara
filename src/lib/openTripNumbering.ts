import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

/**
 * Recomputes OpenTrip.tripNumber for every trip whose startDate falls in `year`,
 * ordered by startDate (createdAt as tiebreaker) — trip #1 is the earliest start
 * date in that year. Call after any create/startDate-change/delete that could
 * shift ordering within the year.
 */
export async function renumberOpenTripYear(db: Db, year: number) {
  const start = new Date(Date.UTC(year, 0, 1))
  const end   = new Date(Date.UTC(year + 1, 0, 1))

  const trips = await db.openTrip.findMany({
    where: { startDate: { gte: start, lt: end } },
    orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, tripNumber: true },
  })

  for (let i = 0; i < trips.length; i++) {
    const num = i + 1
    if (trips[i].tripNumber !== num) {
      await db.openTrip.update({ where: { id: trips[i].id }, data: { tripNumber: num } })
    }
  }
}
