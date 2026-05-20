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

    // Query 1: bookings + admins in parallel
    const [bookings, admins] = await Promise.all([
      db.booking.findMany({
        where: { status: 'pending', depositDueDate: { gte: today, lte: in2Days } },
        select: {
          id: true,
          bookingCode: true,
          depositDueDate: true,
          salesperson: true,
          customer: { select: { name: true } },
        },
      }),
      db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } }),
    ])

    if (bookings.length === 0) return NextResponse.json({ ok: true, generated: 0 })

    // Query 2: resolve all salesperson names at once
    const salespersonNames = [...new Set(
      bookings.map(b => b.salesperson).filter(Boolean) as string[]
    )]
    const salespersonUsers = salespersonNames.length > 0
      ? await db.user.findMany({
          where: { name: { in: salespersonNames, mode: 'insensitive' } },
          select: { id: true, name: true },
        })
      : []
    const salesMap = new Map(salespersonUsers.filter(u => u.name).map(u => [u.name!.toLowerCase(), u.id]))

    const adminIds = admins.map(a => a.id)

    // Build all notification records to upsert
    const records: { userId: string; type: string; title: string; body: string; bookingId: string }[] = []

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

      const targetIds = new Set<string>(adminIds)
      if (booking.salesperson) {
        const sid = salesMap.get(booking.salesperson.toLowerCase())
        if (sid) targetIds.add(sid)
      }

      for (const userId of targetIds) {
        records.push({ userId, type, title, body, bookingId: booking.id })
      }
    }

    // Query 3: batch upsert — skip already-existing ones
    await db.notification.createMany({ data: records, skipDuplicates: true })

    return NextResponse.json({ ok: true, generated: records.length })
  } catch (error) {
    console.error('Reminder generation failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
