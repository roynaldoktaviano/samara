import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export async function GET() {
  const db = await getDb()
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const bookings = await db.booking.findMany({
      where: {
        refundStatus: { in: ['no_refund', 'refund_pending', 'refund_uploaded', 'refund_confirmed'] },
      },
      select: {
        id: true, bookingCode: true, status: true, cancelReason: true, updatedAt: true,
        refundStatus: true, refundDecision: true, refundReason: true, refundProof: true,
        refundConfirmedAt: true, refundConfirmedBy: true,
        customer: { select: { name: true } },
        salespersonUser: { select: { name: true } },
        payments: {
          where: { status: { in: ['confirmed', 'refunded'] } },
          select: { id: true, invoiceNumber: true, amount: true, paymentType: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json(bookings)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch refund history' }, { status: 500 })
  }
}
