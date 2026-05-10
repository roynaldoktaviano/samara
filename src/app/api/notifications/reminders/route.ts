import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const in2Days = new Date(today)
    in2Days.setDate(today.getDate() + 2)
    in2Days.setHours(23, 59, 59, 999)

    // Find pending bookings with deposit due in the next 0–2 days
    const bookings = await db.booking.findMany({
      where: {
        status: 'pending',
        depositDueDate: { gte: today, lte: in2Days },
      },
      select: {
        id: true,
        bookingCode: true,
        depositDueDate: true,
        salesperson: true,
        customer: { select: { name: true } },
      },
    })

    if (bookings.length === 0) return NextResponse.json({ ok: true, generated: 0 })

    // Resolve all ADMIN user IDs once
    const admins = await db.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    })
    const adminIds = admins.map(a => a.id)

    let generated = 0

    for (const booking of bookings) {
      const dueDate = new Date(booking.depositDueDate!)
      dueDate.setHours(0, 0, 0, 0)
      const daysUntil = Math.round((dueDate.getTime() - today.getTime()) / 86400000)

      const type =
        daysUntil === 0 ? 'DEPOSIT_DUE_H0' :
        daysUntil === 1 ? 'DEPOSIT_DUE_H1' : 'DEPOSIT_DUE_H2'

      const dayLabel =
        daysUntil === 0 ? 'hari ini!' :
        daysUntil === 1 ? 'besok' : '2 hari lagi'

      const title = `Deposit jatuh tempo ${dayLabel}`
      const body  = `${booking.bookingCode} — ${booking.customer.name}. Segera follow up ke customer untuk pembayaran deposit.`

      // Target: the booking's salesperson + all admins
      const targetIds = new Set<string>(adminIds)
      if (booking.salesperson) {
        const salesUser = await db.user.findFirst({
          where: { name: { equals: booking.salesperson, mode: 'insensitive' } },
          select: { id: true },
        })
        if (salesUser) targetIds.add(salesUser.id)
      }

      for (const userId of targetIds) {
        try {
          await db.notification.upsert({
            where: { userId_type_bookingId: { userId, type, bookingId: booking.id } },
            create: { userId, type, title, body, bookingId: booking.id },
            update: {},
          })
          generated++
        } catch { /* unique constraint already satisfied — skip */ }
      }
    }

    return NextResponse.json({ ok: true, generated })
  } catch (error) {
    console.error('Reminder generation failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
