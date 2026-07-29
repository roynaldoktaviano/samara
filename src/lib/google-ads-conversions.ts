import type { PrismaClient } from '@prisma/client'

export const GOOGLE_ADS_CONVERSION_HEADER = ['Google Click ID', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency']

export interface GoogleAdsConversionRow {
  gclid: string
  conversionName: string
  conversionTime: Date
  value: number
  currency: string
}

// Google Ads' offline conversion import (both the manual CSV and the Google Sheets source)
// wants "Conversion Time" as "yyyy-mm-dd hh:mm:ss+|-hh:mm" in the account's reporting
// timezone — this business operates out of Indonesia (WIB, UTC+7, no DST), so the stored
// UTC timestamp is shifted by a fixed 7 hours rather than relying on wherever this runs.
export function toGoogleAdsTime(date: Date): string {
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())} ${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())}:${pad(wib.getUTCSeconds())}+07:00`
}

/**
 * Bookings whose deposit was confirmed on/after `since`, one row per booking — for Google
 * Ads offline conversion import (CSV download or the Google Sheets auto-sync). Only a
 * booking's FIRST confirmed payment counts (a later final-payment confirmation isn't a new
 * conversion), and only bookings whose customer has a captured `gclid` can be attributed to
 * a Google Ads click — anything else is silently skipped rather than exported with a blank
 * click ID. Re-running this with an overlapping `since` window is safe: Google Ads dedupes
 * conversion rows by (Google Click ID + Conversion Name + Conversion Time), so the same
 * booking showing up again in a later sync just gets ignored on their end, not double-counted.
 */
export async function getGoogleAdsConversions(db: PrismaClient, since: Date, conversionName: string): Promise<GoogleAdsConversionRow[]> {
  const firstConfirmedByBooking = await db.payment.groupBy({
    by: ['bookingId'],
    where: { status: 'confirmed', confirmedAt: { not: null } },
    _min: { confirmedAt: true },
  })

  const eligibleBookingIds = firstConfirmedByBooking
    .filter(p => p._min.confirmedAt && p._min.confirmedAt >= since)
    .map(p => p.bookingId)
  if (eligibleBookingIds.length === 0) return []

  const payments = await db.payment.findMany({
    where: { bookingId: { in: eligibleBookingIds }, status: 'confirmed' },
    orderBy: { confirmedAt: 'asc' },
    select: { bookingId: true, amount: true, currency: true, confirmedAt: true, booking: { select: { customerId: true } } },
  })
  // Ascending order means the first row seen per bookingId is that booking's true first
  // confirmed payment — matches the groupBy _min computed above.
  const firstPaymentByBooking = new Map<string, (typeof payments)[number]>()
  for (const p of payments) {
    if (!firstPaymentByBooking.has(p.bookingId)) firstPaymentByBooking.set(p.bookingId, p)
  }

  const customerIds = [...new Set([...firstPaymentByBooking.values()].map(p => p.booking.customerId))]
  const customers = await db.customer.findMany({
    where: { id: { in: customerIds } },
    select: {
      id: true,
      inquiries: { where: { gclid: { not: null } }, orderBy: { createdAt: 'desc' }, take: 1, select: { gclid: true } },
    },
  })
  const gclidByCustomer = new Map(customers.map(c => [c.id, c.inquiries[0]?.gclid ?? null]))

  const rows: GoogleAdsConversionRow[] = []
  for (const payment of firstPaymentByBooking.values()) {
    const gclid = gclidByCustomer.get(payment.booking.customerId)
    if (!gclid || !payment.confirmedAt) continue
    rows.push({ gclid, conversionName, conversionTime: payment.confirmedAt, value: payment.amount, currency: payment.currency })
  }
  return rows
}
