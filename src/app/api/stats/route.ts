import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // ── Basic counts ──────────────────────────────────────────────────
    const [
      totalYachts, availableYachts, bookedYachts, maintenanceYachts,
      totalBookings, confirmedBookings, pendingBookings, completedBookings,
      totalCustomers,
    ] = await Promise.all([
      db.yacht.count(),
      db.yacht.count({ where: { status: 'available' } }),
      db.yacht.count({ where: { status: 'booked' } }),
      db.yacht.count({ where: { status: 'maintenance' } }),
      db.booking.count(),
      db.booking.count({ where: { status: 'confirmed' } }),
      db.booking.count({ where: { status: 'pending' } }),
      db.booking.count({ where: { status: 'completed' } }),
      db.customer.count(),
    ])

    // ── Revenue & expense totals (DB-level aggregation) ──────────────
    const [revTotal, revMonthly, expTotal, expMonthly] = await Promise.all([
      db.booking.aggregate({ _sum: { totalPrice: true }, where: { status: { not: 'cancelled' } } }),
      db.booking.aggregate({ _sum: { totalPrice: true }, where: { status: { not: 'cancelled' }, createdAt: { gte: startOfMonth } } }),
      db.expense.aggregate({ _sum: { amount: true } }),
      db.expense.aggregate({ _sum: { amount: true }, where: { date: { gte: startOfMonth } } }),
    ])
    const totalRevenue    = revTotal._sum.totalPrice   ?? 0
    const monthlyRevenue  = revMonthly._sum.totalPrice ?? 0
    const totalExpenses   = expTotal._sum.amount       ?? 0
    const monthlyExpenses = expMonthly._sum.amount     ?? 0

    // ── Recent bookings ───────────────────────────────────────────────
    const recentBookings = await db.booking.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        yacht:    { select: { name: true } },
        customer: { select: { name: true } },
      },
    })

    // ── Upcoming maintenance ──────────────────────────────────────────
    const upcomingMaintenance = await db.maintenance.findMany({
      where: { status: { in: ['scheduled', 'in_progress'] } },
      orderBy: { scheduledDate: 'asc' },
      take: 5,
    })

    // ── Top salesperson (by booking count, exclude cancelled) ─────────
    const salesAgg = await db.booking.groupBy({
      by: ['salesperson'],
      where: {
        status: { not: 'cancelled' },
        salesperson: { not: null },
      },
      _count: { id: true },
      _sum:   { totalPrice: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    })
    const topSales = salesAgg
      .filter(r => r.salesperson)
      .map(r => ({
        name:    r.salesperson as string,
        count:   r._count.id,
        revenue: r._sum.totalPrice ?? 0,
      }))

    // ── Top yachts (by booking count, exclude cancelled) ──────────────
    const yachtAgg = await db.booking.groupBy({
      by: ['yachtId'],
      where: {
        status:  { not: 'cancelled' },
        yachtId: { not: null },
      },
      _count: { id: true },
      _sum:   { totalPrice: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    })
    const yachtIds = yachtAgg.map(r => r.yachtId).filter(Boolean) as string[]
    const yachts   = await db.yacht.findMany({
      where: { id: { in: yachtIds } },
      select: { id: true, name: true },
    })
    const yachtMap = Object.fromEntries(yachts.map(y => [y.id, y.name]))
    const topYachts = yachtAgg
      .filter(r => r.yachtId)
      .map(r => ({
        yachtId: r.yachtId as string,
        name:    yachtMap[r.yachtId as string] ?? 'Unknown',
        count:   r._count.id,
        revenue: r._sum.totalPrice ?? 0,
      }))

    // ── Monthly bookings (per year, private vs open) ───────────────────
    const twoYearsAgo = new Date(now.getFullYear() - 2, 0, 1)
    const bookingsForMonthly = await db.booking.findMany({
      where: { status: { not: 'cancelled' }, startDate: { gte: twoYearsAgo } },
      select: { startDate: true, tripType: true, totalPrice: true },
      take: 2000,
    })

    type MonthBucket = { private: number; open: number; revenue: number }
    const monthMap: Record<string, MonthBucket> = {}

    for (const b of bookingsForMonthly) {
      const d   = new Date(b.startDate)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!monthMap[key]) monthMap[key] = { private: 0, open: 0, revenue: 0 }
      if (b.tripType === 'OPEN_TRIP') monthMap[key].open++
      else                            monthMap[key].private++
      monthMap[key].revenue += b.totalPrice
    }

    const monthlyStats = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v, total: v.private + v.open }))

    return NextResponse.json({
      yachts:    { total: totalYachts, available: availableYachts, booked: bookedYachts, maintenance: maintenanceYachts },
      bookings:  { total: totalBookings, confirmed: confirmedBookings, pending: pendingBookings, completed: completedBookings },
      customers: { total: totalCustomers },
      revenue:   { total: totalRevenue, monthly: monthlyRevenue },
      expenses:  { total: totalExpenses, monthly: monthlyExpenses },
      recentBookings,
      upcomingMaintenance,
      topSales,
      topYachts,
      monthlyStats,
    })
  } catch (error) {
    console.error('Error fetching statistics:', error)
    return NextResponse.json({ error: 'Failed to fetch statistics' }, { status: 500 })
  }
}
