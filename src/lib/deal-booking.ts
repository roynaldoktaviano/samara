import type { PrismaClient, WhatsappBrand } from '@prisma/client'
import { OPEN_STAGES, nextDealOrderId } from '@/lib/deal-maker'
import { syncLeadStageFromBooking } from '@/lib/lead-stage-auto'

/**
 * A new booking takes over its person's open deal on the Sales Pipeline: for every lead converted
 * into this booking's guest (and the lead guest's own open deals), the newest OPEN deal of a
 * compatible trip type gets bookingId + the guest → it then moves Booking Confirmation → Invoice →
 * Won with the payments. A person with no open deal (never had one, or it is Won / Lost, which is
 * read-only) gets a new deal straight at Send Booking Confirmation, so every booked enquiry has a card.
 */
export async function linkBookingDeals(db: PrismaClient, bookingId: string, people: { leadId: string | null; customerId: string }[], userId: string | null): Promise<void> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, tripType: true, startDate: true, endDate: true, guestCount: true, totalPrice: true, currency: true, yacht: { select: { name: true } }, deals: { select: { id: true } } },
  })
  if (!booking) return
  const brand: WhatsappBrand = /otium/i.test(booking.yacht?.name ?? '') ? 'OTIUM' : /mischief/i.test(booking.yacht?.name ?? '') ? 'MISCHIEF' : 'SAMARA'
  const linked = new Set(booking.deals.map(d => d.id))

  for (const p of people) {
    const open = await db.deal.findMany({
      where: {
        deletedAt: null, bookingId: null, stage: { in: OPEN_STAGES },
        OR: [...(p.leadId ? [{ leadId: p.leadId }] : []), { customerId: p.customerId }],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, tripType: true },
    })
    const pick = open.find(d => d.tripType === booking.tripType) ?? open.find(d => !d.tripType)
    if (pick && !linked.has(pick.id)) {
      await db.deal.update({ where: { id: pick.id }, data: { bookingId: booking.id, customerId: p.customerId, tripType: booking.tripType, ...(booking.yacht?.name && { productInterest: booking.yacht.name }) } })
      linked.add(pick.id)
      continue
    }
    if (pick || !p.leadId) continue
    // Only a converted lead earns a fresh card; a guest booked straight from the Guests list has
    // no enquiry on the board.
    const lead = await db.lead.findUnique({ where: { id: p.leadId }, select: { ownerId: true } })
    const d = await db.deal.create({
      data: {
        orderId: await nextDealOrderId(db), leadId: p.leadId, customerId: p.customerId, bookingId: booking.id, brand,
        tripType: booking.tripType, stage: 'BOOKING_CONFIRMATION', stageUpdatedAt: new Date(), stageUpdatedById: userId,
        ownerId: lead?.ownerId ?? null, ownerAssignedAt: lead?.ownerId ? new Date() : null,
        travelStartDate: booking.startDate, travelEndDate: booking.endDate, guestCount: booking.guestCount,
        amount: booking.totalPrice, currency: booking.currency, channel: 'BOOKING', productInterest: booking.yacht?.name ?? null,
      },
      select: { id: true },
    })
    linked.add(d.id)
  }
  await syncLeadStageFromBooking(db, booking.id, userId)
}
