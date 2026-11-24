import type { PrismaClient, WhatsappBrand } from '@prisma/client'
import { OPEN_STAGES, nextDealOrderId } from '@/lib/deal-maker'
import { syncLeadStageFromBooking } from '@/lib/lead-stage-auto'
import { amountUsdFields, detectBookingType, enquiryChannelOf } from '@/lib/deal-classify'
import { refreshDealAttribution } from '@/lib/deal-attribution'

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
    select: { id: true, tripType: true, startDate: true, endDate: true, guestCount: true, totalPrice: true, currency: true, source: true, createdAt: true, yacht: { select: { name: true } }, deals: { select: { id: true } } },
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
      select: { id: true, tripType: true, bookingType: true },
    })
    const pick = open.find(d => d.tripType === booking.tripType) ?? open.find(d => !d.tripType)
    if (pick && !linked.has(pick.id)) {
      // An agent booking makes the deal an agent deal (agent revenue stays out of ad ROAS)
      const agent = booking.source === 'AGENT' && pick.bookingType !== 'AGENT' ? { bookingType: 'AGENT' as const } : {}
      await db.deal.update({ where: { id: pick.id }, data: { bookingId: booking.id, customerId: p.customerId, tripType: booking.tripType, ...agent, ...(booking.yacht?.name && { productInterest: booking.yacht.name }) } })
      linked.add(pick.id)
      continue
    }
    if (pick || !p.leadId) continue
    // Only a converted lead earns a fresh card; a guest booked straight from the Guests list has
    // no enquiry on the board.
    const lead = await db.lead.findUnique({ where: { id: p.leadId }, select: { ownerId: true, entrySource: true } })
    const enquiryChannel = booking.source === 'AGENT' ? 'AGENT' as const : enquiryChannelOf('BOOKING', lead?.entrySource)
    const bookingType = booking.source === 'AGENT' ? 'AGENT' as const : await detectBookingType(db, { leadId: p.leadId, customerId: p.customerId, enquiryChannel, at: booking.createdAt })
    const d = await db.deal.create({
      data: {
        orderId: await nextDealOrderId(db), leadId: p.leadId, customerId: p.customerId, bookingId: booking.id, brand,
        tripType: booking.tripType, stage: 'BOOKING_CONFIRMATION', stageUpdatedAt: new Date(), stageUpdatedById: userId,
        ownerId: lead?.ownerId ?? null, ownerAssignedAt: lead?.ownerId ? new Date() : null,
        travelStartDate: booking.startDate, travelEndDate: booking.endDate, guestCount: booking.guestCount,
        // Booking.totalPrice is always USD (booking.currency is only how the guest is invoiced)
        amount: booking.totalPrice, currency: 'USD', channel: 'BOOKING', productInterest: booking.yacht?.name ?? null,
        enquiryChannel, bookingType, ...(await amountUsdFields(db, booking.totalPrice, 'USD')),
      },
      select: { id: true },
    })
    linked.add(d.id)
  }
  await refreshDealAttribution(db, [...linked]).catch(e => console.error('[deal-booking] attribution', e))
  await syncLeadStageFromBooking(db, booking.id, userId)
}
