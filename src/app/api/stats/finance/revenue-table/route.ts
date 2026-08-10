import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { withRetry } from '@/lib/db'

const MONTH_LABELS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const VESSEL_ORDER = ['samara i','samara 1','samara ii','samara 2','otium','mischief']

function vesselSort(name: string) {
  const n = name.toLowerCase()
  const i = VESSEL_ORDER.findIndex(v => n === v || n.replace(/\s+/g,'') === v.replace(/\s+/g,''))
  return i === -1 ? 99 : i
}

function netBooking(b: {
  source: string; tripType: string;
  agent: { commissionOpenTrip: number; commissionPrivateCharter: number } | null;
  confirmedAmount: number; // sum of confirmed payments
  totalPrice: number; discount: number;
  services: { price: number; quantity: number }[];
}) {
  const commPct = b.source === 'AGENT'
    ? (b.tripType === 'OPEN_TRIP' ? (b.agent?.commissionOpenTrip ?? 0) : (b.agent?.commissionPrivateCharter ?? 0))
    : 0
  if (commPct <= 0) return b.confirmedAmount

  // Commission only applies to the TRIP portion (price excl. additional services), not the whole amount paid.
  // totalPrice is already net of discount (see BookingWizard: total = max(0, base - discountAmt) + services)
  const svc   = b.services.reduce((s, x) => s + x.price * (x.quantity ?? 1), 0)
  const trip  = Math.max(0, b.totalPrice - svc)
  const total = trip + svc
  if (total <= 0) return b.confirmedAmount

  const tripShareOfConfirmed = b.confirmedAmount * (trip / total)
  const commission = tripShareOfConfirmed * commPct / 100
  return b.confirmedAmount - commission
}

// If a booking has no confirmed/refunded Payment records yet, fall back to depositPaid
// (same field the Finance Overview tab uses) so revenue isn't shown as $0 for bookings
// that were paid but never had their payment explicitly marked "confirmed".
function confirmedAmountOf(b: { payments: { amount: number }[]; depositPaid: number }) {
  const paymentsSum = b.payments.reduce((s, p) => s + p.amount, 0)
  return paymentsSum > 0 ? paymentsSum : b.depositPaid
}

export async function GET(request: NextRequest) {
  const db = await getDb()
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const year = Math.max(2000, Math.min(2100, parseInt(searchParams.get('year') ?? String(new Date().getFullYear())) || new Date().getFullYear()))

    const startOfYear = new Date(year, 0, 1)
    const endOfYear   = new Date(year, 11, 31, 23, 59, 59)

    const [allBookings, allYachts, allCabins, refundedPayments] = await withRetry(db, () => Promise.all([
      db.booking.findMany({
        where: {
          startDate: { gte: startOfYear, lte: endOfYear },
          OR: [
            { status: { not: 'cancelled' } },
            { status: 'cancelled', refundStatus: 'refund_confirmed' }, // include refunded — shown separately
          ],
        },
        select: {
          id: true, tripType: true, source: true, startDate: true, yachtId: true,
          totalPrice: true, discount: true, depositPaid: true,
          services: { select: { price: true, quantity: true } },
          agent:    { select: { commissionOpenTrip: true, commissionPrivateCharter: true } },
          payments: { where: { status: { in: ['confirmed', 'refunded'] } }, select: { amount: true } },
          guests: {
            where:  { cabinId: { not: null } },
            select: { cabinId: true, cabin: { select: { name: true } } },
          },
        },
      }),
      db.yacht.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.cabin.findMany({ select: { id: true, name: true, yachtId: true }, orderBy: { name: 'asc' } }),
      // Refunded payments: bookings that were cancelled with refund confirmed
      db.booking.findMany({
        where: {
          refundStatus: 'refund_confirmed',
          startDate: { gte: startOfYear, lte: endOfYear },
        },
        select: {
          id: true, yachtId: true, startDate: true, tripType: true,
          payments: { where: { status: 'refunded' }, select: { amount: true } },
          guests: {
            where:  { cabinId: { not: null } },
            select: { cabinId: true, cabin: { select: { name: true } } },
          },
        },
      }),
    ]))

    const vessels = [...allYachts].sort((a, b) => vesselSort(a.name) - vesselSort(b.name))

    // ── TABLE 1: Cabin breakdown (open trips only, per vessel) ────────────
    // For each vessel: monthly revenue split by cabin name
    type MonthCabin = { byCabin: Record<string, number>; total: number }

    const cabinTables: {
      vesselId: string; vesselName: string; cabins: string[]
      months: (MonthCabin & { month: string })[]
      yearByCabin: Record<string, number>; grandTotal: number
    }[] = []

    const openTripBookings = allBookings.filter(b => b.tripType === 'OPEN_TRIP')

    // Group open trip bookings by vessel
    const byVessel: Record<string, typeof openTripBookings> = {}
    for (const b of openTripBookings) {
      if (!b.yachtId) continue
      if (!byVessel[b.yachtId]) byVessel[b.yachtId] = []
      byVessel[b.yachtId].push(b)
    }

    // Build cabin name list per vessel from the Cabin model (not bookings)
    const cabinsByVessel: Record<string, string[]> = {}
    for (const c of allCabins) {
      if (!cabinsByVessel[c.yachtId]) cabinsByVessel[c.yachtId] = []
      cabinsByVessel[c.yachtId].push(c.name)
    }

    for (const vessel of vessels) {
      const vBookings = byVessel[vessel.id] ?? []
      const vn = vessel.name.toLowerCase().replace(/\s+/g, '')
      const isSamaraI = vn === 'samarai' || vn === 'samara1'

      // For Samara I: use all DB-defined cabins so all columns always appear.
      // For other vessels: only show if there are actual booking/cabin assignments.
      let cabins: string[]
      if (isSamaraI) {
        cabins = (cabinsByVessel[vessel.id] ?? []).sort()
        if (cabins.length === 0) continue
      } else {
        if (vBookings.length === 0) continue
        const cabinSet = new Set<string>()
        for (const b of vBookings) {
          for (const g of b.guests) {
            if (g.cabin?.name) cabinSet.add(g.cabin.name)
          }
        }
        if (cabinSet.size === 0) continue
        cabins = [...cabinSet].sort()
      }

      // Build monthly cabin grid
      const monthGrid: Record<number, Record<string, number>> = {}
      for (let m = 0; m < 12; m++) monthGrid[m] = {}

      for (const b of vBookings) {
        const month = new Date(b.startDate).getMonth()
        const confirmedAmount = confirmedAmountOf(b)
        const rev   = netBooking({ ...b, confirmedAmount })

        // Get unique cabins for this booking
        const uniqueCabins = [...new Map(
          b.guests.filter(g => g.cabin).map(g => [g.cabinId, g.cabin!.name])
        ).values()]

        if (uniqueCabins.length === 0) continue
        const revPerCabin = rev / uniqueCabins.length

        for (const cabinName of uniqueCabins) {
          monthGrid[month][cabinName] = (monthGrid[month][cabinName] ?? 0) + revPerCabin
        }
      }

      const months = MONTH_LABELS.map((label, m) => {
        const byCabin = monthGrid[m] ?? {}
        const total   = Object.values(byCabin).reduce((s, v) => s + v, 0)
        return { month: label, byCabin, total }
      })

      const yearByCabin: Record<string, number> = {}
      for (const row of months) {
        for (const [cabin, val] of Object.entries(row.byCabin)) {
          yearByCabin[cabin] = (yearByCabin[cabin] ?? 0) + val
        }
      }
      const grandTotal = Object.values(yearByCabin).reduce((s, v) => s + v, 0)

      cabinTables.push({ vesselId: vessel.id, vesselName: vessel.name, cabins, months, yearByCabin, grandTotal })
    }

    // ── TABLE 2: Revenue per vessel per month (all trip types) ────────────
    const vesselMonthGrid: Record<number, Record<string, number>> = {}
    for (let m = 0; m < 12; m++) vesselMonthGrid[m] = {}

    for (const b of allBookings) {
      if (!b.yachtId) continue
      const m   = new Date(b.startDate).getMonth()
      const confirmedAmount = confirmedAmountOf(b)
      const rev = netBooking({ ...b, confirmedAmount })
      vesselMonthGrid[m][b.yachtId] = (vesselMonthGrid[m][b.yachtId] ?? 0) + rev
    }

    const vesselMonths = MONTH_LABELS.map((label, m) => {
      const perVessel: Record<string, number> = {}
      let total = 0
      for (const v of vessels) {
        perVessel[v.id] = vesselMonthGrid[m][v.id] ?? 0
        total += perVessel[v.id]
      }
      return { month: label, perVessel, total }
    })

    const vesselYearTotals: Record<string, number> = {}
    for (const v of vessels) {
      vesselYearTotals[v.id] = vesselMonths.reduce((s, m) => s + (m.perVessel[v.id] ?? 0), 0)
    }
    const grandTotal = Object.values(vesselYearTotals).reduce((s, v) => s + v, 0)

    // ── Refund aggregation ────────────────────────────────────────────────
    // Per-vessel per-month refund totals
    const refundVesselMonthGrid: Record<number, Record<string, number>> = {}
    for (let m = 0; m < 12; m++) refundVesselMonthGrid[m] = {}

    // Per-vessel per-month per-cabin refund totals (open trips)
    const refundCabinMonthGrid: Record<string, Record<number, Record<string, number>>> = {}

    for (const b of refundedPayments) {
      if (!b.yachtId) continue
      const m = new Date(b.startDate).getMonth()
      const total = b.payments.reduce((s, p) => s + p.amount, 0)
      refundVesselMonthGrid[m][b.yachtId] = (refundVesselMonthGrid[m][b.yachtId] ?? 0) + total

      if (b.tripType === 'OPEN_TRIP') {
        if (!refundCabinMonthGrid[b.yachtId]) refundCabinMonthGrid[b.yachtId] = {}
        const uniqueCabins = [...new Map(
          b.guests.filter(g => g.cabin).map(g => [g.cabinId, g.cabin!.name])
        ).values()]
        const perCabin = uniqueCabins.length > 0 ? total / uniqueCabins.length : 0
        for (const cabinName of uniqueCabins) {
          if (!refundCabinMonthGrid[b.yachtId][m]) refundCabinMonthGrid[b.yachtId][m] = {}
          refundCabinMonthGrid[b.yachtId][m][cabinName] = (refundCabinMonthGrid[b.yachtId][m][cabinName] ?? 0) + perCabin
        }
      }
    }

    // Attach refund data to cabinTables
    const cabinTablesWithRefund = cabinTables.map(ct => {
      const refundMonths = MONTH_LABELS.map((_, m) => {
        const byCabin = refundCabinMonthGrid[ct.vesselId]?.[m] ?? {}
        const total = Object.values(byCabin).reduce((s, v) => s + v, 0)
        return { byCabin, total }
      })
      const refundByCabin: Record<string, number> = {}
      for (const row of refundMonths) {
        for (const [c, v] of Object.entries(row.byCabin)) {
          refundByCabin[c] = (refundByCabin[c] ?? 0) + v
        }
      }
      const refundTotal = Object.values(refundByCabin).reduce((s, v) => s + v, 0)
      return { ...ct, refundMonths, refundByCabin, refundTotal }
    })

    // Vessel table refund rows
    const refundVesselMonths = MONTH_LABELS.map((_, m) => {
      const perVessel: Record<string, number> = {}
      let total = 0
      for (const v of vessels) {
        perVessel[v.id] = refundVesselMonthGrid[m][v.id] ?? 0
        total += perVessel[v.id]
      }
      return { perVessel, total }
    })
    const refundVesselYearTotals: Record<string, number> = {}
    for (const v of vessels) {
      refundVesselYearTotals[v.id] = refundVesselMonths.reduce((s, m) => s + (m.perVessel[v.id] ?? 0), 0)
    }
    const refundGrandTotal = Object.values(refundVesselYearTotals).reduce((s, v) => s + v, 0)

    // Chart data — use NET (published minus refunds)
    const allRevenueByMonth = vesselMonths.map((m, i) => ({
      month: m.month.slice(0, 3),
      total: m.total - (refundVesselMonths[i]?.total ?? 0),
    }))
    const vesselByMonth = vesselMonths.map((m, i) => {
      const obj: Record<string, any> = { month: m.month.slice(0, 3) }
      for (const v of vessels) {
        obj[v.name] = (m.perVessel[v.id] ?? 0) - (refundVesselMonths[i]?.perVessel[v.id] ?? 0)
      }
      return obj
    })

    return NextResponse.json({
      year, vessels,
      cabinTables: cabinTablesWithRefund,
      vesselTable: {
        months: vesselMonths, yearTotals: vesselYearTotals, grandTotal,
        refundMonths: refundVesselMonths, refundYearTotals: refundVesselYearTotals, refundGrandTotal,
      },
      charts: { allRevenue: allRevenueByMonth, perVessel: vesselByMonth },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
