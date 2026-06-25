import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { withRetry } from '@/lib/db'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

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
  const db = await getDb()
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

    const startOfYear = new Date(year, 0, 1)
    const endOfYear   = new Date(year, 11, 31, 23, 59, 59)

    const [dpPayments, salesUsers] = await withRetry(() => Promise.all([
      // Revenue attributed to when the DP invoice was confirmed/paid
      db.payment.findMany({
        where: {
          status: 'confirmed',
          paymentType: 'DP',
          confirmedAt: { gte: startOfYear, lte: endOfYear },
          booking: { status: { not: 'cancelled' } },
        },
        select: {
          bookingId: true,
          confirmedAt: true,
          booking: {
            select: {
              totalPrice: true, discount: true, source: true, tripType: true,
              salesperson: true, salespersonId: true,
              agent:    { select: { commissionOpenTrip: true, commissionPrivateCharter: true } },
              services: { select: { price: true, quantity: true } },
            },
          },
        },
        orderBy: { confirmedAt: 'asc' },
      }),
      db.user.findMany({
        where:  { role: 'SALES' },
        select: { id: true, name: true },
      }),
    ]))

    // Deduplicate: if a booking somehow has multiple DP payments, count only the first
    const seenBookings = new Set<string>()
    const uniqueDpPayments = dpPayments.filter(p => {
      if (seenBookings.has(p.bookingId)) return false
      seenBookings.add(p.bookingId)
      return true
    })

    // Build salesperson name map
    const userNameMap = Object.fromEntries(salesUsers.map(u => [u.id, u.name ?? u.id]))
    const salesUserIds = new Set(salesUsers.map(u => u.id))

    function salesLabel(b: { salesperson: string | null; salespersonId: string | null }) {
      if (b.salespersonId && userNameMap[b.salespersonId]) return userNameMap[b.salespersonId]
      return b.salesperson?.trim() || 'Unassigned'
    }

    // Only include payments from SALES users
    const salesPayments = uniqueDpPayments.filter(p =>
      (p.booking.salespersonId && salesUserIds.has(p.booking.salespersonId)) ||
      (!p.booking.salespersonId && salesUsers.some(u => u.name?.toLowerCase() === p.booking.salesperson?.toLowerCase().trim()))
    )

    // All SALES users always shown, even with zero revenue
    const salespeople = salesUsers.map(u => u.name ?? u.id)

    // Build monthly grid: [month][salesperson] = revenue, keyed by confirmedAt month
    const grid: Record<number, Record<string, number>> = {}
    for (let m = 0; m < 12; m++) grid[m] = {}

    for (const p of salesPayments) {
      const m    = new Date(p.confirmedAt!).getMonth()
      const name = salesLabel(p.booking)
      const rev  = netBooking(p.booking)
      grid[m][name] = (grid[m][name] ?? 0) + rev
    }

    // Monthly rows
    const months = MONTHS.map((label, m) => {
      const bySales: Record<string, number> = {}
      let total = 0
      for (const name of salespeople) {
        bySales[name] = grid[m][name] ?? 0
        total += bySales[name]
      }
      return { month: label, bySales, total }
    })

    // Yearly totals
    const yearTotals: Record<string, number> = {}
    for (const name of salespeople) {
      yearTotals[name] = months.reduce((s, m) => s + (m.bySales[name] ?? 0), 0)
    }
    const grandTotal = Object.values(yearTotals).reduce((s, v) => s + v, 0)

    // Per-salesperson monthly chart data
    const monthlyChart = MONTHS.map((label, m) => {
      const obj: Record<string, any> = { month: label.slice(0, 3) }
      for (const name of salespeople) obj[name] = grid[m][name] ?? 0
      return obj
    })

    return NextResponse.json({ year, salespeople, months, yearTotals, grandTotal, monthlyChart })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
