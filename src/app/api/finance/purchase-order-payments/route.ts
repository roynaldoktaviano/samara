import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { computePOGrandTotal, summarizePOPayments, labelInstallments } from '@/lib/po-payment'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['FINANCE', 'HR', 'ADMIN', 'SUPER_ADMIN']

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
          // Only needed to compute the PO's overall payment status, and this request's
          // own installment context (earlier DP/top-up rows + balance owed before it),
          // below — a PO can be paid across multiple DP/final-settlement installments.
          paymentRequests: { select: { id: true, amount: true, status: true, createdAt: true, paidAt: true } },
          reimbursements: { select: { id: true, amount: true, status: true, createdAt: true, paidAt: true } },
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

    // This request's own installment context — which earlier DP/top-up rows (payment
    // requests or reimbursements) came before it for the same PO, and how much of the
    // PO total was still unaccounted-for right before this one was raised. Lets a
    // "Balance Payment" detail screen show "DP: Rp X, paid <date>" + the remaining
    // balance it's settling, without a new DB column — everything's derived from the
    // sibling rows already on the order.
    const allInstallments = [
      ...r.order.paymentRequests.map(p => ({ ...p, kind: 'payment' as const })),
      ...r.order.reimbursements.map(rb => ({ ...rb, kind: 'reimbursement' as const })),
    ]
    const labeled = labelInstallments(grandTotal, allInstallments)
    const thisIdx = labeled.findIndex(i => i.id === r.id)
    const priorInstallments = labeled.slice(0, thisIdx)
    const requestedBefore = priorInstallments.reduce((s, i) => s + i.amount, 0)

    return {
      ...r,
      poPaymentStatus: paymentStatus,
      // This installment's own label (Down Payment/Additional Payment/Final Payment/Full
      // Payment) — shown alongside the DP context so a paid Balance/Final request also
      // shows its own settled amount and date, not just what came before it.
      installmentLabel: labeled[thisIdx]?.label ?? null,
      remainingBalance: Math.max(0, grandTotal - requestedBefore - r.amount),
      priorInstallments: priorInstallments.map(p => ({
        label: p.label,
        amount: p.amount,
        date: p.status === 'PAID' && p.paidAt ? p.paidAt : p.createdAt,
        status: p.status,
        kind: p.kind,
      })),
      order: { ...r.order, paymentRequests: undefined, reimbursements: undefined },
    }
  })

  return NextResponse.json(withPoStatus)
}
