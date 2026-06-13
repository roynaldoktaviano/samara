import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

function summarise(rows: { tripType: string; source: string }[]) {
  return {
    total:          rows.length,
    privateCharter: rows.filter(b => b.tripType === 'PRIVATE_CHARTER').length,
    openTrip:       rows.filter(b => b.tripType === 'OPEN_TRIP').length,
    direct:         rows.filter(b => b.source   === 'DIRECT').length,
    viaAgent:       rows.filter(b => b.source   !== 'DIRECT').length,
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const yachtId              = searchParams.get('yachtId') || undefined
    const fromParam            = searchParams.get('from')
    const toParam              = searchParams.get('to')
    const filterSalespersonId  = searchParams.get('salespersonId') || undefined

    const userId   = session.user.id
    const userRole = (session.user as { role?: string }).role ?? ''
    const isAdmin  = userRole === 'ADMIN'

    const now = new Date()

    const periodStart = fromParam
      ? new Date(fromParam + 'T00:00:00')
      : new Date(now.getFullYear(), now.getMonth(), 1)
    const periodEnd = toParam
      ? new Date(toParam + 'T23:59:59')
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    const durationMs   = periodEnd.getTime() - periodStart.getTime()
    const compareEnd   = new Date(periodStart.getTime() - 1)
    const compareStart = new Date(compareEnd.getTime() - durationMs)

    // Admin can see all or filter by a specific salesperson.
    // SALES users always see only their own bookings.
    const salespersonFilter = isAdmin
      ? (filterSalespersonId ? { salespersonId: filterSalespersonId } : {})
      : { salespersonId: userId }

    const baseWhere = {
      status:  { not: 'cancelled' as const },
      ...(yachtId ? { yachtId } : {}),
      ...salespersonFilter,
    }

    const [currentBookings, compareBookings] = await Promise.all([
      db.booking.findMany({
        where: { ...baseWhere, createdAt: { gte: periodStart, lte: periodEnd } },
        select: { tripType: true, source: true },
      }),
      db.booking.findMany({
        where: { ...baseWhere, createdAt: { gte: compareStart, lte: compareEnd } },
        select: { tripType: true, source: true },
      }),
    ])

    const agentAgg = await db.booking.groupBy({
      by: ['agentId'],
      where: { ...baseWhere, agentId: { not: null }, createdAt: { gte: periodStart, lte: periodEnd } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    })

    const agentAllTime = await db.booking.groupBy({
      by: ['agentId'],
      where: { ...baseWhere, agentId: { not: null } },
      _count: { id: true },
    })
    const agentAllTimeMap = Object.fromEntries(agentAllTime.map(r => [r.agentId as string, r._count.id]))

    const agentIds = agentAgg.map(r => r.agentId).filter(Boolean) as string[]
    const agents   = await db.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } })
    const agentMap = Object.fromEntries(agents.map(a => [a.id, a.name]))

    const topAgents = agentAgg.filter(r => r.agentId).map(r => ({
      agentId:   r.agentId as string,
      name:      agentMap[r.agentId as string] ?? 'Unknown',
      period:    r._count.id,
      total:     agentAllTimeMap[r.agentId as string] ?? r._count.id,
    }))

    const bookingInPeriod = {
      ...baseWhere,
      createdAt: { gte: periodStart, lte: periodEnd },
    }
    const nationalityAgg = await db.customer.groupBy({
      by: ['nationality'],
      where: {
        nationality: { not: null },
        deletedAt:   null,
        OR: [
          { bookings: { some: bookingInPeriod } },
          { guestOf:  { some: { booking: bookingInPeriod } } },
        ],
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    })

    const topNationalities = nationalityAgg
      .filter(r => r.nationality)
      .map(r => ({ nationality: r.nationality as string, count: r._count.id }))

    const yachts = await db.yacht.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })

    // Return salespeople list only for admins (for the filter dropdown)
    const salespeople = isAdmin
      ? await db.user.findMany({
          where:   { role: 'SALES' },
          select:  { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : undefined

    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const periodLabel  = `${fmt(periodStart)} – ${fmt(periodEnd)}`
    const compareLabel = `${fmt(compareStart)} – ${fmt(compareEnd)}`

    return NextResponse.json({
      current:         summarise(currentBookings),
      compare:         summarise(compareBookings),
      topAgents,
      topNationalities,
      yachts,
      salespeople,
      periodLabel,
      compareLabel,
      updatedAt: now.toISOString(),
    })
  } catch (error) {
    console.error('Error fetching sales stats:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
