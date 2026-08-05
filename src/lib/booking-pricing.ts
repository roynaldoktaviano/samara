import { getDb } from '@/lib/get-db'

type Db = Awaited<ReturnType<typeof getDb>>

function calcPaymentStatus(depositPaid: number, totalPrice: number): 'pending' | 'partially_paid' | 'fully_paid' {
  if (depositPaid <= 0)          return 'pending'
  if (depositPaid >= totalPrice) return 'fully_paid'
  return 'partially_paid'
}

/**
 * Recalculate an Open Trip booking's total from its current cabins, services and discount,
 * and persist it. This is the single source of truth for Open Trip pricing — callers (guest
 * add/remove, booking edit) must not trust a client-submitted totalPrice for Open Trip bookings,
 * since cabin/guest changes make that number stale.
 */
export async function recalcOpenTripPrice(db: Db, bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      tripType: true, status: true, depositPaid: true, discount: true,
      openTrip: { select: { startDate: true, endDate: true, pricePerCabin: true, destinationId: true } },
      guests:   { select: { cabinId: true } },
      services: { select: { price: true, quantity: true } },
    },
  })
  if (!booking || booking.tripType !== 'OPEN_TRIP' || !booking.openTrip) return
  if (['cancelled', 'completed', 'on_hold'].includes(booking.status)) return

  const nights = Math.max(1, Math.round(
    (new Date(booking.openTrip.endDate).getTime() - new Date(booking.openTrip.startDate).getTime()) / 86400000
  ))

  const uniqueCabinIds = [...new Set(booking.guests.map(g => g.cabinId).filter(Boolean) as string[])]

  let cabinTotal = 0
  if (uniqueCabinIds.length > 0) {
    const cabins = await db.cabin.findMany({
      where: { id: { in: uniqueCabinIds } },
      select: { id: true, price: true, pricingTiers: { select: { nights: true, price: true, destinationId: true } } },
    })
    const tierTotal = cabins.reduce((sum, c) => {
      // Destination-scoped rate card entry wins if this cabin has one for the trip's
      // destination + this many nights, otherwise fall back to the plain tier.
      const tier = c.pricingTiers.find(t => t.nights === nights && t.destinationId === booking.openTrip!.destinationId)
        ?? c.pricingTiers.find(t => t.nights === nights && !t.destinationId)
      return sum + (tier ? tier.price : c.price * nights)
    }, 0)
    cabinTotal = tierTotal > 0
      ? tierTotal
      : uniqueCabinIds.length * (booking.openTrip.pricePerCabin ?? 0)
  }
  if (cabinTotal <= 0) return

  const servicesTotal = booking.services.reduce((sum, s) => sum + s.price * s.quantity, 0)
  const newTotal = Math.max(0, cabinTotal - (booking.discount ?? 0)) + servicesTotal
  if (newTotal <= 0) return

  const newStatus = calcPaymentStatus(booking.depositPaid, newTotal)
  await db.booking.update({
    where: { id: bookingId },
    data: { totalPrice: newTotal, status: newStatus },
  })
}
