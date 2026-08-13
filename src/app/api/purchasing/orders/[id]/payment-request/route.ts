import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { notifyByRole, notifyIfPOFullyPaid } from '@/lib/notify-purchasing'
import { computePOGrandTotal, summarizePOPayments, describeInstallment } from '@/lib/po-payment'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const order = await db.purchaseOrder.findUnique({
    where: { id },
    select: {
      id: true, poNumber: true, supplierName: true, discountType: true, discountValue: true, extraCharges: true,
      items: { select: { orderedQty: true, unitCost: true } },
      paymentRequests: { select: { amount: true, status: true } },
      reimbursements: { select: { amount: true, status: true } },
    },
  })
  if (!order) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })

  const body = await req.json()
  const { amount, notePhotoKeys, notes, notaDate, paidByPurchasing } = body
  if (!amount || Number(amount) <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  if (!Array.isArray(notePhotoKeys) || notePhotoKeys.length === 0) return NextResponse.json({ error: 'At least one receipt/nota photo is required' }, { status: 400 })

  // Installments (DP + final settlement, in any mix of payment method) are
  // capped at what's left of the PO total — never let requests add up to
  // more than the order is actually worth.
  const grandTotal = computePOGrandTotal(order)
  const { requestedTotal, remaining } = summarizePOPayments(grandTotal, order.paymentRequests, order.reimbursements)
  if (Number(amount) > remaining + 0.5) {
    return NextResponse.json({ error: `Amount exceeds the remaining balance (Rp ${new Intl.NumberFormat('id-ID').format(remaining)})` }, { status: 400 })
  }
  const installmentLabel = describeInstallment(grandTotal, requestedTotal, Number(amount))

  const isDirect = !!paidByPurchasing
  const amountFormatted = `Rp ${new Intl.NumberFormat('id-ID').format(Number(amount))}`

  const paymentRequest = await db.pOPaymentRequest.create({
    data: {
      id: crypto.randomUUID(),
      orderId: id,
      requestedById: session.user.id,
      amount: Number(amount),
      notePhotoKeys,
      notes: notes?.trim() || null,
      notaDate: notaDate ? new Date(notaDate) : null,
      updatedAt: new Date(),
      ...(isDirect && {
        status: 'PAID',
        paymentMethod: 'CARD',
        paidAt: new Date(),
        paidById: session.user.id,
      }),
    },
  })

  if (isDirect) {
    notifyByRole(db, ['FINANCE', 'ADMIN', 'SUPER_ADMIN'], 'PO_PAID_BY_PURCHASING',
      `Debit Paid — ${installmentLabel}`,
      `${order.poNumber}${order.supplierName ? ` — ${order.supplierName}` : ''} was paid directly by the purchasing team (debit), ${installmentLabel.toLowerCase()} — ${amountFormatted}`,
      id,
    ).catch(console.error)
    notifyIfPOFullyPaid(db, id).catch(console.error)
  } else {
    notifyByRole(db, ['FINANCE', 'ADMIN', 'SUPER_ADMIN'], 'PO_PAYMENT_REQUESTED',
      `${installmentLabel} Requested`,
      `${order.poNumber}${order.supplierName ? ` — ${order.supplierName}` : ''} needs payment approval — ${installmentLabel.toLowerCase()} (${amountFormatted})`,
      id,
    ).catch(console.error)
  }

  return NextResponse.json(paymentRequest, { status: 201 })
}
