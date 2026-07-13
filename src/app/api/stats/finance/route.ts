import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {

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

    // Pre-compute net per booking once (avoids recomputing commission/discount 4× per booking)
    // totalPrice is already net of discount (see BookingWizard: total = max(0, base - discountAmt) + services)
    function calcNet(b: typeof bookings[0]) {
      const svcTotal  = b.services.reduce((s, x) => s + x.price * (x.quantity ?? 1), 0)
      const afterDisc = Math.max(0, b.totalPrice - svcTotal)
      const commPct   = b.source === 'AGENT'
        ? (b.tripType === 'OPEN_TRIP' ? (b.agent?.commissionOpenTrip ?? 0) : (b.agent?.commissionPrivateCharter ?? 0))
        : 0
      return afterDisc + svcTotal - (afterDisc * commPct / 100)
    }

    type BookingRow = typeof bookings[0]
    const enriched = bookings.map((b: BookingRow) => ({ b, net: calcNet(b) }))

    const contracted  = enriched.reduce((s, { net }) => s + net, 0)
    const collected   = enriched.reduce((s, { b }) => s + b.depositPaid, 0)
    const outstanding = Math.max(0, contracted - collected)

    // ── Revenue per vessel ───────────────────────────────────────────────
    const [allYachts] = await Promise.all([
      db.yacht.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ])
    const yachtMap = Object.fromEntries(allYachts.map(y => [y.id, y.name]))

    const perVessel: Record<string, { contracted: number; collected: number; bookings: number }> = {}
    const monthMap:  Record<string, { contracted: number; collected: number; bookings: number }> = {}
    const agentMap2: Record<string, { name: string; contracted: number; collected: number; bookings: number }> = {}
    const salesMap:  Record<string, { contracted: number; collected: number; bookings: number }> = {}

    // Single pass over enriched data for all aggregations
    for (const { b, net } of enriched) {
      // Per vessel
      if (b.yachtId) {
        if (!perVessel[b.yachtId]) perVessel[b.yachtId] = { contracted: 0, collected: 0, bookings: 0 }
        perVessel[b.yachtId].contracted += net
        perVessel[b.yachtId].collected  += b.depositPaid
        perVessel[b.yachtId].bookings++
      }

      // Monthly
      const d   = new Date(b.startDate)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!monthMap[key]) monthMap[key] = { contracted: 0, collected: 0, bookings: 0 }
      monthMap[key].contracted += net
      monthMap[key].collected  += b.depositPaid
      monthMap[key].bookings++

      // Agents
      if (b.agent) {
        if (!agentMap2[b.agent.id]) agentMap2[b.agent.id] = { name: b.agent.name, contracted: 0, collected: 0, bookings: 0 }
        agentMap2[b.agent.id].contracted += net
        agentMap2[b.agent.id].collected  += b.depositPaid
        agentMap2[b.agent.id].bookings++
      }

      // Sales
      const salesName = b.salesperson ?? 'Unassigned'
      if (!salesMap[salesName]) salesMap[salesName] = { contracted: 0, collected: 0, bookings: 0 }
      salesMap[salesName].contracted += net
      salesMap[salesName].collected  += b.depositPaid
      salesMap[salesName].bookings++
    }

    const revenuePerVessel = Object.entries(perVessel)
      .map(([yId, v]) => ({ yachtId: yId, name: yachtMap[yId] ?? 'Unknown', ...v }))
      .sort((a, b) => b.contracted - a.contracted)

    const monthlyRevenue = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }))

    const topAgents = Object.entries(agentMap2)
      .map(([agentId, v]) => ({ agentId, ...v }))
      .sort((a, b) => b.contracted - a.contracted)
      .slice(0, 10)

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
