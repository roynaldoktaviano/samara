import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const yachtId   = searchParams.get('yachtId') || undefined
    const fromParam = searchParams.get('from')
    const toParam   = searchParams.get('to')

    const now = new Date()
    const periodStart = fromParam
      ? new Date(fromParam + 'T00:00:00')
      : new Date(now.getFullYear(), 0, 1)                              // default: this year
    const periodEnd = toParam
      ? new Date(toParam + 'T23:59:59')
      : new Date(now.getFullYear(), 11, 31, 23, 59, 59)

    const baseWhere = {
      status:    { not: 'cancelled' as const },
      startDate: { gte: periodStart },
      endDate:   { lte: periodEnd },
      ...(yachtId ? { yachtId } : {}),
    }

    // ── Overview totals ──────────────────────────────────────────────────
    const bookings = await db.booking.findMany({
      where: baseWhere,
      select: {
        id: true, totalPrice: true, depositPaid: true, discount: true,
        tripType: true, startDate: true,
        source: true, salesperson: true, salespersonId: true,
        yachtId: true,
        agent:   { select: { id: true, name: true, commissionOpenTrip: true, commissionPrivateCharter: true } },
        services: { select: { price: true, quantity: true } },
      },
    })

    // Net total per booking (after discount + commission)
    function netBooking(b: typeof bookings[0]) {
      const svcTotal  = b.services.reduce((s, x) => s + x.price * (x.quantity ?? 1), 0)
      const basePrice = b.totalPrice - svcTotal
      const afterDisc = Math.max(0, basePrice - (b.discount ?? 0))
      const commPct   = b.source === 'AGENT'
        ? (b.tripType === 'OPEN_TRIP' ? (b.agent?.commissionOpenTrip ?? 0) : (b.agent?.commissionPrivateCharter ?? 0))
        : 0
      const commAmt   = afterDisc * commPct / 100
      return afterDisc + svcTotal - commAmt
    }

    const contracted = bookings.reduce((s, b) => s + netBooking(b), 0)
    const collected  = bookings.reduce((s, b) => s + b.depositPaid, 0)
    const outstanding = Math.max(0, contracted - collected)

    // ── Revenue per vessel ───────────────────────────────────────────────
    const allYachts = await db.yacht.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
    const yachtMap  = Object.fromEntries(allYachts.map(y => [y.id, y.name]))

    const perVessel: Record<string, { contracted: number; collected: number; bookings: number }> = {}
    for (const b of bookings) {
      if (!b.yachtId) continue
      if (!perVessel[b.yachtId]) perVessel[b.yachtId] = { contracted: 0, collected: 0, bookings: 0 }
      perVessel[b.yachtId].contracted += netBooking(b)
      perVessel[b.yachtId].collected  += b.depositPaid
      perVessel[b.yachtId].bookings++
    }
    const revenuePerVessel = Object.entries(perVessel)
      .map(([yachtId, v]) => ({ yachtId, name: yachtMap[yachtId] ?? 'Unknown', ...v }))
      .sort((a, b) => b.contracted - a.contracted)

    // ── Monthly revenue (by startDate month) ─────────────────────────────
    const monthMap: Record<string, { contracted: number; collected: number; bookings: number }> = {}
    for (const b of bookings) {
      const d   = new Date(b.startDate)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!monthMap[key]) monthMap[key] = { contracted: 0, collected: 0, bookings: 0 }
      monthMap[key].contracted += netBooking(b)
      monthMap[key].collected  += b.depositPaid
      monthMap[key].bookings++
    }
    const monthlyRevenue = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }))

    // ── Top agents ───────────────────────────────────────────────────────
    const agentMap2: Record<string, { name: string; contracted: number; collected: number; bookings: number }> = {}
    for (const b of bookings) {
      if (!b.agent) continue
      const key = b.agent.id
      if (!agentMap2[key]) agentMap2[key] = { name: b.agent.name, contracted: 0, collected: 0, bookings: 0 }
      agentMap2[key].contracted += netBooking(b)
      agentMap2[key].collected  += b.depositPaid
      agentMap2[key].bookings++
    }
    const topAgents = Object.entries(agentMap2)
      .map(([agentId, v]) => ({ agentId, ...v }))
      .sort((a, b) => b.contracted - a.contracted)
      .slice(0, 10)

    // ── Sales performance ────────────────────────────────────────────────
    const salesMap: Record<string, { contracted: number; collected: number; bookings: number }> = {}
    for (const b of bookings) {
      const name = b.salesperson ?? 'Unassigned'
      if (!salesMap[name]) salesMap[name] = { contracted: 0, collected: 0, bookings: 0 }
      salesMap[name].contracted += netBooking(b)
      salesMap[name].collected  += b.depositPaid
      salesMap[name].bookings++
    }
    const salesPerformance = Object.entries(salesMap)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.contracted - a.contracted)

    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

    return NextResponse.json({
      overview: { contracted, collected, outstanding, bookings: bookings.length },
      revenuePerVessel,
      monthlyRevenue,
      topAgents,
      salesPerformance,
      yachts:      allYachts,
      periodLabel: `${fmt(periodStart)} – ${fmt(periodEnd)}`,
      updatedAt:   now.toISOString(),
    })
  } catch (error) {
    console.error('Finance stats error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
