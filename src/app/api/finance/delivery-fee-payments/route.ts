import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['FINANCE', 'ADMIN', 'SUPER_ADMIN']

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  // Optional ?orderId= — the notification only carries the underlying PO's id (or the
  // DeliveryFee's own id, when it has no linked PO), not this request's own id.
  const orderId = new URL(request.url).searchParams.get('orderId')

  const requests = await db.deliveryFeePaymentRequest.findMany({
    where: orderId ? { OR: [{ deliveryFeeId: orderId }, { deliveryFee: { purchaseOrderId: orderId } }] } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      deliveryFee: { select: { feeNumber: true, notes: true, purchaseOrder: { select: { poNumber: true, supplierName: true, createdAt: true, deliveryLocation: { select: { name: true } } } } } },
      requestedBy: { select: { name: true } },
      paidBy: { select: { name: true } },
    },
  })

  return NextResponse.json(requests)
}
