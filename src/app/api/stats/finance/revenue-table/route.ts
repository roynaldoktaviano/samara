import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db, withRetry } from '@/lib/db'

const MONTH_LABELS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const VESSEL_ORDER = ['samara i','samara 1','samara ii','samara 2','otium','mischief']

function vesselSort(name: string) {
  const n = name.toLowerCase()
  const i = VESSEL_ORDER.findIndex(v => n === v || n.replace(/\s+/g,'') === v.replace(/\s+/g,''))
  return i === -1 ? 99 : i
}

function netBooking(b: {
  totalPrice: number; discount: number; source: string; tripType: string;
  agent: { commissionOpenTrip: number; commissionPrivateCharter: number } | null;
  services: { price: number; quantity: number }[]
}) {
  const svc     = b.services.reduce((s, x) => s + x.price * (x.quantity ?? 1), 0)
  const base    = b.totalPrice - svc
  const disc    = Math.max(0, base - (b.discount ?? 0))
  const commPct = b.source === 'AGENT'
    ? (b.tripType === 'OPEN_TRIP' ? (b.agent?.commissionOpenTrip ?? 0) : (b.agent?.commissionPrivateCharter ?? 0))
    : 0
  return disc + svc - disc * commPct / 100
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

    const startOfYear = new Date(year, 0, 1)
    const endOfYear   = new Date(year, 11, 31, 23, 59, 59)

    const [allBookings, allYachts, allCabins] = await withRetry(() => Promise.all([
      db.booking.findMany({
        where: { status: { not: 'cancelled' }, startDate: { gte: startOfYear, lte: endOfYear } },
        select: {
          id: true, tripType: true, totalPrice: true, depositPaid: true,
          discount: true, source: true, startDate: true, yachtId: true,
          agent:    { select: { commissionOpenTrip: true, commissionPrivateCharter: true } },
          services: { select: { price: true, quantity: true } },
          guests: {
            where:  { cabinId: { not: null } },
            select: { cabinId: true, cabin: { select: { name: true } } },
          },
        },
      }),
      db.yacht.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.cabin.findMany({ select: { id: true, name: true, yachtId: true }, orderBy: { name: 'asc' } }),
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
        const rev   = netBooking(b)

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
      const rev = netBooking(b)
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

    // Chart data
    const allRevenueByMonth = vesselMonths.map(m => ({ month: m.month.slice(0, 3), total: m.total }))
    const vesselByMonth = vesselMonths.map(m => {
      const obj: Record<string, any> = { month: m.month.slice(0, 3) }
      for (const v of vessels) obj[v.name] = m.perVessel[v.id] ?? 0
      return obj
    })

    return NextResponse.json({
      year, vessels,
      cabinTables,
      vesselTable: { months: vesselMonths, yearTotals: vesselYearTotals, grandTotal },
      charts: { allRevenue: allRevenueByMonth, perVessel: vesselByMonth },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
