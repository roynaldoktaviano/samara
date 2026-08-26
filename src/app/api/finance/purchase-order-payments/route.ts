import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { computePOGrandTotal, summarizePOPayments } from '@/lib/po-payment'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['FINANCE', 'ADMIN', 'SUPER_ADMIN']

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  // Optional ?orderId= — lets a notification click (which only carries the PO's id, not
  // this specific payment request's own id) resolve straight to the relevant request(s).
  const orderId = new URL(request.url).searchParams.get('orderId')

  const requests = await db.pOPaymentRequest.findMany({
    where: orderId ? { orderId } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      order: {
        select: {
          poNumber: true, supplierName: true, createdAt: true, deliveryLocation: { select: { name: true } },
          requestedByName: true, requestedByOffice: true, requestedByDepartment: true, requestedByRole: true,
          discountType: true, discountValue: true, extraCharges: true,
          items: { select: { id: true, itemName: true, unit: true, orderedQty: true, receivedQty: true, unitCost: true } },
          // Only needed to compute the PO's overall payment status below —
          // a PO can be paid across multiple DP/final-settlement installments.
          paymentRequests: { select: { amount: true, status: true } },
          reimbursements: { select: { amount: true, status: true } },
        },
      },
      requestedBy: { select: { name: true } },
      paidBy: { select: { name: true } },
    },
  })

  // "Paid" on an individual request can be misleading if it was just a DP —
  // poPaymentStatus reflects the whole PO's progress, so Finance can tell a
  // settled installment apart from one that still has a final payment coming.
  const withPoStatus = requests.map(r => {
    const grandTotal = computePOGrandTotal(r.order)
    const { paymentStatus } = summarizePOPayments(grandTotal, r.order.paymentRequests, r.order.reimbursements)
    return { ...r, poPaymentStatus: paymentStatus, order: { ...r.order, paymentRequests: undefined, reimbursements: undefined } }
  })

  return NextResponse.json(withPoStatus)
}
