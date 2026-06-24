import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const role = (session.user as { role?: string })?.role ?? ''
    const view = new URL(request.url).searchParams.get('view') // 'finance' | 'sales'

    const isFinance = ['FINANCE', 'ADMIN', 'SUPER_ADMIN'].includes(role)
    const isSales   = ['SALES', 'ADMIN', 'SUPER_ADMIN'].includes(role)

    // Explicit view param overrides role-based default
    const wantSalesView   = view === 'sales'  || (!view && isSales && !isFinance)
    const wantFinanceView = view === 'finance' || (!view && isFinance)

    const refundStatuses = wantFinanceView && !wantSalesView
      ? ['pending_decision', 'refund_pending']   // Finance: needs decision or proof
      : wantSalesView && !wantFinanceView
      ? ['refund_uploaded']                        // Sales: proof ready, needs confirmation
      : ['pending_decision', 'refund_pending', 'refund_uploaded'] // Admin: all

    const bookings = await db.booking.findMany({
      where: {
        status: 'pending_refund',
        refundStatus: { in: refundStatuses },
      },
      select: {
        id: true, bookingCode: true, status: true,
        cancelReason: true,
        refundStatus: true, refundDecision: true, refundReason: true,
        refundProof: true, refundConfirmedAt: true, refundConfirmedBy: true,
        payments: {
          where: { status: { in: ['confirmed', 'refunded'] } },
          select: { id: true, invoiceNumber: true, amount: true, paymentType: true },
        },
      },
      orderBy: { updatedAt: 'asc' },
    })

    return NextResponse.json(bookings)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch pending refunds' }, { status: 500 })
  }
}
