import type { PrismaClient } from '@prisma/client'
import { withRetry } from '@/lib/db'

const guestInclude = {
  guests: {
    include: {
      customer: { select: { name: true } },
      cabin: { select: { name: true } },
    },
    orderBy: [{ isLead: 'desc' as const }, { id: 'asc' as const }],
  },
  services: { select: { price: true, quantity: true } },
  payments: { orderBy: { createdAt: 'asc' as const } },
  customer: { select: { name: true } },
  agent: { select: { name: true, commissionOpenTrip: true, commissionPrivateCharter: true } },
  salespersonUser: { select: { name: true } },
}

function isTbd(name: string | null | undefined) {
  return !name || /^tbd$/i.test(name.trim())
}

function bookingFinancials(booking: {
  totalPrice: number
  discount: number
  source: string
  tripType: string
  currency: string
  exchangeRate: number | null
  agent: { commissionOpenTrip: number; commissionPrivateCharter: number } | null
  services: { price: number; quantity: number }[]
  payments: { paymentType: string; status: string; amount: number; invoiceNumber: string; id: string; paymentMethod: string | null; createdAt: Date }[]
}) {
  // totalPrice is already net of discount + TNK (services), quoted in USD baseline
  // (see BookingWizard: total = max(0, base - discountAmt) + services)
  const tnk = booking.services.reduce((s, sv) => s + sv.price * sv.quantity, 0)
  const baseAfterDiscount = booking.totalPrice - tnk
  const discount = booking.discount
  const publish = baseAfterDiscount + discount // reconstructed pre-discount price, for display only
  const discountPct = publish > 0 ? (discount / publish) * 100 : 0

  const commPct = booking.source === 'AGENT'
    ? (booking.tripType === 'OPEN_TRIP' ? (booking.agent?.commissionOpenTrip ?? 0) : (booking.agent?.commissionPrivateCharter ?? 0))
    : 0
  const agentCommission = baseAfterDiscount * (Math.max(0, Math.min(commPct, 100)) / 100)

  // TRIP = published price net of discount AND agent commission
  const trip = baseAfterDiscount - agentCommission
  const totalUSD = trip + tnk
  const totalIDR = (booking.currency === 'IDR' && booking.exchangeRate) ? totalUSD * booking.exchangeRate : null

  const dpPayment = booking.payments.find(p => p.paymentType === 'DP' && p.status === 'confirmed')
  const pelunasanPayment = booking.payments.find(p => p.paymentType === 'PELUNASAN' && p.status === 'confirmed')
  const dp = dpPayment?.amount ?? 0
  const pelunasan = pelunasanPayment?.amount ?? 0
  const balance = Math.max(0, totalUSD - dp - pelunasan)

  const latestPayment = booking.payments[booking.payments.length - 1] ?? null
  const referencePayment = pelunasanPayment ?? dpPayment ?? latestPayment

  const paymentStatusLabel = balance <= 0 && (dpPayment || pelunasanPayment)
    ? 'PAID'
    : (referencePayment?.status ?? 'unpaid')

  return {
    publish, discount, discountPct, trip, tnk, totalUSD, totalIDR, agentCommission, dp, pelunasan, balance,
    invoiceNumber: referencePayment?.invoiceNumber ?? null,
    paymentId: referencePayment?.id ?? null,
    paymentMethod: referencePayment?.paymentMethod ?? null,
    paymentStatusLabel,
  }
}

function bookingRows(booking: {
  id: string
  bookingCode: string
  guestCount: number
  source: string
  tripType: string
  currency: string
  exchangeRate: number | null
  agent: { name: string; commissionOpenTrip: number; commissionPrivateCharter: number } | null
  salesperson: string | null
  salespersonUser: { name: string | null } | null
  customer: { name: string }
  guests: { customer: { name: string }; cabin: { name: string } | null; isLead: boolean }[]
  totalPrice: number
  discount: number
  services: { price: number; quantity: number }[]
  payments: { paymentType: string; status: string; amount: number; invoiceNumber: string; id: string; paymentMethod: string | null; createdAt: Date }[]
}) {
  const agentName = booking.source === 'AGENT' && booking.agent?.name ? booking.agent.name : 'Direct'
  const salespersonName = booking.salespersonUser?.name ?? booking.salesperson ?? '—'
  const leadName = booking.guests.find(g => g.isLead)?.customer.name ?? booking.customer.name

  const guestRows = booking.guests.length > 0
    ? booking.guests.map(g => ({
        guestName: isTbd(g.customer.name) ? leadName : g.customer.name,
        cabin: g.cabin?.name ?? '—',
      }))
    : [{ guestName: booking.customer.name, cabin: '—' }]

  const fin = bookingFinancials(booking)

  return guestRows.map((g, i) => ({
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    guestRowIndex: i,
    guestRowCount: guestRows.length,
    guestName: g.guestName,
    agentName,
    salesperson: salespersonName,
    cabin: g.cabin,
    pax: booking.guestCount,
    ...fin,
  }))
}

export interface TripSheetOptions {
  from?: string | null
  to?: string | null
  salespersonId?: string | null
}

/** Shared trip-sheet data builder — used by the Trip Sheet UI/API and the Google Sheets sync. */
export async function getTripSheetGroups(db: PrismaClient, opts: TripSheetOptions = {}) {
  const { from, to, salespersonId } = opts
  const dateFilter = (from || to) ? {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  } : undefined

  const salespersonGuard = salespersonId ? { salespersonId } : {}

  const [openTrips, charterBookings] = await Promise.all([
    withRetry(db, () => db.openTrip.findMany({
      where: { ...(dateFilter && { startDate: dateFilter }) },
      include: {
        yacht: { select: { name: true } },
        bookings: {
          where: { status: { not: 'cancelled' }, ...salespersonGuard },
          include: guestInclude,
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { startDate: 'asc' },
    })),
    withRetry(db, () => db.booking.findMany({
      where: {
        tripType: 'PRIVATE_CHARTER',
        status: { not: 'cancelled' },
        ...salespersonGuard,
        ...(dateFilter && { startDate: dateFilter }),
      },
      include: { ...guestInclude, yacht: { select: { name: true } } },
      orderBy: { startDate: 'asc' },
    })),
  ])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const openTripGroups = openTrips
    .filter(t => t.bookings.length > 0)
    .map(t => {
      const nights = Math.max(0, Math.round((t.endDate.getTime() - t.startDate.getTime()) / 86400000))
      return {
        id: t.id,
        yachtName: t.yacht.name,
        tripLabel: t.title,
        tripType: 'Sharing' as const,
        startDate: t.startDate,
        endDate: t.endDate,
        duration: `${nights + 1}D${nights}N`,
        status: t.endDate < today ? 'Done' as const : 'On Schedule' as const,
        rows: t.bookings.flatMap(bookingRows),
      }
    })

  const charterGroups = charterBookings.map(b => {
    const nights = Math.max(0, Math.round((b.endDate.getTime() - b.startDate.getTime()) / 86400000))
    return {
      id: b.id,
      yachtName: b.yacht?.name ?? '—',
      tripLabel: b.destination ?? b.bookingCode,
      tripType: 'Private' as const,
      startDate: b.startDate,
      endDate: b.endDate,
      duration: `${nights + 1}D${nights}N`,
      status: b.endDate < today ? 'Done' as const : 'On Schedule' as const,
      rows: bookingRows(b),
    }
  })

  return [...openTripGroups, ...charterGroups].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime()
  )
}

export type TripSheetGroup = Awaited<ReturnType<typeof getTripSheetGroups>>[number]
