import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

    // This month bookings (not cancelled)
    const thisMonthBookings = await db.booking.findMany({
      where: { status: { not: 'cancelled' }, createdAt: { gte: startOfMonth } },
      select: { tripType: true, source: true },
    })

    // Last month bookings for comparison
    const lastMonthBookings = await db.booking.findMany({
      where: {
        status: { not: 'cancelled' },
        createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
      },
      select: { tripType: true, source: true },
    })

    const summarise = (rows: { tripType: string; source: string }[]) => ({
      total:          rows.length,
      privateCharter: rows.filter(b => b.tripType === 'PRIVATE_CHARTER').length,
      openTrip:       rows.filter(b => b.tripType === 'OPEN_TRIP').length,
      direct:         rows.filter(b => b.source   === 'DIRECT').length,
      viaAgent:       rows.filter(b => b.source   !== 'DIRECT').length,
    })

    // Top agents (all-time, by booking count)
    const agentAgg = await db.booking.groupBy({
      by: ['agentId'],
      where: { status: { not: 'cancelled' }, agentId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    })

    const agentIds = agentAgg.map(r => r.agentId).filter(Boolean) as string[]
    const agents   = await db.agent.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true },
    })
    const agentMap = Object.fromEntries(agents.map(a => [a.id, a.name]))

    // This-month count per agent (for "this month" badge)
    const agentThisMonth = await db.booking.groupBy({
      by: ['agentId'],
      where: {
        status: { not: 'cancelled' },
        agentId: { not: null },
        createdAt: { gte: startOfMonth },
      },
      _count: { id: true },
    })
    const agentThisMonthMap = Object.fromEntries(
      agentThisMonth.map(r => [r.agentId as string, r._count.id])
    )

    const topAgents = agentAgg
      .filter(r => r.agentId)
      .map(r => ({
        agentId:    r.agentId as string,
        name:       agentMap[r.agentId as string] ?? 'Unknown',
        total:      r._count.id,
        thisMonth:  agentThisMonthMap[r.agentId as string] ?? 0,
      }))

    // Top nationalities from customers who have bookings
    const nationalityAgg = await db.customer.groupBy({
      by: ['nationality'],
      where: {
        nationality: { not: null },
        deletedAt: null,
        OR: [
          { bookings: { some: { status: { not: 'cancelled' } } } },
          { guestOf:  { some: { booking: { status: { not: 'cancelled' } } } } },
        ],
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    })

    const topNationalities = nationalityAgg
      .filter(r => r.nationality)
      .map(r => ({ nationality: r.nationality as string, count: r._count.id }))

    return NextResponse.json({
      thisMonth:        summarise(thisMonthBookings),
      lastMonth:        summarise(lastMonthBookings),
      topAgents,
      topNationalities,
      monthLabel: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    })
  } catch (error) {
    console.error('Error fetching sales stats:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
