/**
 * Deal name, the way sales label a deal: "PC/Samara II/Private Charter 3D2N Komodo/Christopher Boykin"
 *   = trip-type code / yacht / trip (type + days·nights + destination) / lead guest.
 * One formatter for the Sales Pipeline card, the lead detail and every booking-history row on a
 * Guest or a Lead, so the same deal reads the same everywhere. Missing parts are just left out;
 * with nothing but a name it's the name alone. Safe to import client- and server-side.
 */
export type DealTripType = 'PRIVATE_CHARTER' | 'OPEN_TRIP'

export const TRIP_TYPE_CODE: Record<DealTripType, string> = { PRIVATE_CHARTER: 'PC', OPEN_TRIP: 'OT' }
export const TRIP_TYPE_NAME: Record<DealTripType, string> = { PRIVATE_CHARTER: 'Private Charter', OPEN_TRIP: 'Open Trip' }

const DAY = 86400000

// "3D2N" from check-in/check-out; null when the dates are missing or nonsensical.
export function tripDuration(start: string | Date | null | undefined, end: string | Date | null | undefined): string | null {
  if (!start || !end) return null
  const nights = Math.round((new Date(end).getTime() - new Date(start).getTime()) / DAY)
  return nights > 0 ? `${nights + 1}D${nights}N` : null
}

export function formatDealName(p: {
  tripType?: DealTripType | null
  yacht?: string | null
  startDate?: string | Date | null
  endDate?: string | Date | null
  destination?: string | null
  guestName?: string | null
}): string {
  const clean = (s: string | null | undefined) => s?.replace(/\//g, '-').replace(/\s+/g, ' ').trim() || null
  // "Komodo National Park" → "Komodo", as sales write it.
  const place = (s: string | null | undefined) => clean(s)?.replace(/\s+National Park$/i, '') || null
  const trip = [
    p.tripType ? TRIP_TYPE_NAME[p.tripType] : null,
    tripDuration(p.startDate, p.endDate),
    place(p.destination),
  ].filter(Boolean).join(' ')
  return [p.tripType ? TRIP_TYPE_CODE[p.tripType] : null, clean(p.yacht), trip || null, clean(p.guestName)]
    .filter(Boolean).join('/') || '—'
}

export interface DealBooking {
  tripType: DealTripType
  startDate: string | Date
  endDate: string | Date
  destination?: string | null
  yacht?: { name: string } | null
  destinationRef?: { name: string } | null
  openTrip?: { destination?: string | null } | null
  customer?: { name: string } | null
}

export function bookingDealName(b: DealBooking, guestName?: string | null): string {
  return formatDealName({
    tripType: b.tripType,
    yacht: b.yacht?.name,
    startDate: b.startDate,
    endDate: b.endDate,
    destination: b.destinationRef?.name ?? b.destination ?? b.openTrip?.destination,
    guestName: guestName ?? b.customer?.name,
  })
}

export interface DealLead {
  name: string
  tripType?: DealTripType | null
  productInterest?: string | null
  travelStartDate?: string | Date | null
  travelEndDate?: string | Date | null
  destination?: { name: string } | null
  booking?: DealBooking | null
}

// A booked lead takes its name from the booking (real yacht/dates); before that, from what
// sales filled in on the lead (trip type, yacht interest, planned dates, destination).
export function leadDealName(l: DealLead): string {
  if (l.booking) return bookingDealName(l.booking, l.booking.customer?.name ?? l.name)
  return formatDealName({
    tripType: l.tripType,
    yacht: l.productInterest,
    startDate: l.travelStartDate,
    endDate: l.travelEndDate,
    destination: l.destination?.name,
    guestName: l.name,
  })
}
