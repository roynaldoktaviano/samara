import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db, withRetry } from '@/lib/db'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function netBooking(b: {
  totalPrice: number; discount: number; source: string
  agent: { commission: number } | null
  services: { price: number; quantity: number }[]
}) {
  const svc  = b.services.reduce((s, x) => s + x.price * (x.quantity ?? 1), 0)
  const base = b.totalPrice - svc
  const disc = Math.max(0, base - (b.discount ?? 0))
  const comm = b.source === 'AGENT' ? disc * (b.agent?.commission ?? 0) / 100 : 0
  return disc + svc - comm
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

    const startOfYear = new Date(year, 0, 1)
    const endOfYear   = new Date(year, 11, 31, 23, 59, 59)

    const [bookings, salesUsers] = await withRetry(() => Promise.all([
      db.booking.findMany({
        where: { status: { not: 'cancelled' }, startDate: { gte: startOfYear, lte: endOfYear } },
        select: {
          totalPrice: true, discount: true, source: true, startDate: true,
          salesperson: true, salespersonId: true,
          agent:    { select: { commission: true } },
          services: { select: { price: true, quantity: true } },
        },
      }),
      // Get all SALES + ADMIN users as reference
      db.user.findMany({
        where:  { role: 'SALES' },
        select: { id: true, name: true },
      }),
    ]))

    // Build salesperson name map from users
    const userNameMap = Object.fromEntries(salesUsers.map(u => [u.id, u.name ?? u.id]))

    // Determine salesperson label per booking
    function salesLabel(b: { salesperson: string | null; salespersonId: string | null }) {
      if (b.salespersonId && userNameMap[b.salespersonId]) return userNameMap[b.salespersonId]
      return b.salesperson?.trim() || 'Unassigned'
    }

    // Only include bookings handled by SALES users
    const salesUserIds = new Set(salesUsers.map(u => u.id))
    const salesBookings = bookings.filter(b =>
      (b.salespersonId && salesUserIds.has(b.salespersonId)) ||
      (!b.salespersonId && salesUsers.some(u => u.name?.toLowerCase() === b.salesperson?.toLowerCase().trim()))
    )

    // Collect unique salesperson names from SALES users only
    const salesSet = new Set<string>()
    for (const b of salesBookings) salesSet.add(salesLabel(b))
    const salespeople = [...salesSet]

    // Build monthly grid: [month][salesperson] = revenue
    const grid: Record<number, Record<string, number>> = {}
    for (let m = 0; m < 12; m++) grid[m] = {}

    for (const b of salesBookings) {
      const m    = new Date(b.startDate).getMonth()
      const name = salesLabel(b)
      const rev  = netBooking(b)
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
