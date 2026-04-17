import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    // Get total yacht count
    const totalYachts = await db.yacht.count()

    // Get yacht status counts
    const availableYachts = await db.yacht.count({ where: { status: 'available' } })
    const bookedYachts = await db.yacht.count({ where: { status: 'booked' } })
    const maintenanceYachts = await db.yacht.count({ where: { status: 'maintenance' } })

    // Get booking statistics
    const totalBookings = await db.booking.count()
    const confirmedBookings = await db.booking.count({ where: { status: 'confirmed' } })
    const pendingBookings = await db.booking.count({ where: { status: 'pending' } })
    const completedBookings = await db.booking.count({ where: { status: 'completed' } })

    // Get customer count
    const totalCustomers = await db.customer.count()

    // Get revenue statistics
    const allBookings = await db.booking.findMany({
      select: { totalPrice: true, createdAt: true }
    })
    
    const totalRevenue = allBookings.reduce((sum, b) => sum + b.totalPrice, 0)
    
    // Calculate this month's revenue
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthlyRevenue = allBookings
      .filter(b => b.createdAt >= startOfMonth)
      .reduce((sum, b) => sum + b.totalPrice, 0)

    // Get total expenses
    const allExpenses = await db.expense.findMany({
      select: { amount: true, date: true }
    })
    
    const totalExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0)
    const monthlyExpenses = allExpenses
      .filter(e => e.date >= startOfMonth)
      .reduce((sum, e) => sum + e.amount, 0)

    // Get recent bookings
    const recentBookings = await db.booking.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        yacht: {
          select: { name: true }
        },
        customer: {
          select: { name: true }
        }
      }
    })

    // Get upcoming maintenance
    const upcomingMaintenance = await db.maintenance.findMany({
      where: {
        status: { in: ['scheduled', 'in-progress'] }
      },
      orderBy: { scheduledDate: 'asc' },
      take: 5,
      include: {
        yacht: {
          select: { name: true }
        }
      }
    })

    return NextResponse.json({
      yachts: {
        total: totalYachts,
        available: availableYachts,
        booked: bookedYachts,
        maintenance: maintenanceYachts
      },
      bookings: {
        total: totalBookings,
        confirmed: confirmedBookings,
        pending: pendingBookings,
        completed: completedBookings
      },
      customers: {
        total: totalCustomers
      },
      revenue: {
        total: totalRevenue,
        monthly: monthlyRevenue
      },
      expenses: {
        total: totalExpenses,
        monthly: monthlyExpenses
      },
      recentBookings,
      upcomingMaintenance
    })
  } catch (error) {
    console.error('Error fetching statistics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    )
  }
}
