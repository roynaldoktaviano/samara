import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const in2Days = new Date(today)
    in2Days.setDate(today.getDate() + 2)
    in2Days.setHours(23, 59, 59, 999)

    const bookings = await db.booking.findMany({
      where: { status: 'pending', depositDueDate: { gte: today, lte: in2Days } },
      select: {
        id: true,
        bookingCode: true,
        depositDueDate: true,
        salespersonId: true,
        customer: { select: { name: true } },
      },
    })

    if (bookings.length === 0) return NextResponse.json({ ok: true, generated: 0 })

    // Build all notification records — only for the booking's salesperson
    const records: { userId: string; type: string; title: string; body: string; bookingId: string }[] = []

    for (const booking of bookings) {
      if (!booking.salespersonId) continue

      const dueDate = new Date(booking.depositDueDate!)
      dueDate.setHours(0, 0, 0, 0)
      const daysUntil = Math.round((dueDate.getTime() - today.getTime()) / 86400000)

      const type =
        daysUntil === 0 ? 'DEPOSIT_DUE_H0' :
        daysUntil === 1 ? 'DEPOSIT_DUE_H1' : 'DEPOSIT_DUE_H2'
      const dayLabel =
        daysUntil === 0 ? 'today!' :
        daysUntil === 1 ? 'tomorrow' : 'in 2 days'

      const title = `Deposit due ${dayLabel}`
      const body  = `${booking.bookingCode} — ${booking.customer.name}. Please follow up with the customer for deposit payment.`

      records.push({ userId: booking.salespersonId, type, title, body, bookingId: booking.id })
    }

    // Query 3: batch upsert — skip already-existing ones
    await db.notification.createMany({ data: records, skipDuplicates: true })

    return NextResponse.json({ ok: true, generated: records.length })
  } catch (error) {
    console.error('Reminder generation failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
