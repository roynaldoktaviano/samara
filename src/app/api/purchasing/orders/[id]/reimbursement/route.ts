import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { notifyByRole } from '@/lib/notify-purchasing'
import { computePOGrandTotal, summarizePOPayments, describeInstallment } from '@/lib/po-payment'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
  const { amount, notePhotoKeys, notes, requesterName, bankName, accountNumber, accountHolderName } = body
  if (!amount || Number(amount) <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  if (!Array.isArray(notePhotoKeys) || notePhotoKeys.length === 0) return NextResponse.json({ error: 'At least one receipt/nota photo is required' }, { status: 400 })
  if (!requesterName?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!bankName?.trim()) return NextResponse.json({ error: 'Bank name is required' }, { status: 400 })
  if (!accountNumber?.trim()) return NextResponse.json({ error: 'Account number is required' }, { status: 400 })
  if (!accountHolderName?.trim()) return NextResponse.json({ error: 'Account holder name is required' }, { status: 400 })

  const grandTotal = computePOGrandTotal(order)
  const { requestedTotal, remaining } = summarizePOPayments(grandTotal, order.paymentRequests, order.reimbursements)
  if (Number(amount) > remaining + 0.5) {
    return NextResponse.json({ error: `Amount exceeds the remaining balance (Rp ${new Intl.NumberFormat('id-ID').format(remaining)})` }, { status: 400 })
  }
  const installmentLabel = describeInstallment(grandTotal, requestedTotal, Number(amount))

  const amountFormatted = `Rp ${new Intl.NumberFormat('id-ID').format(Number(amount))}`

  const reimbursement = await db.pOReimbursement.create({
    data: {
      id: crypto.randomUUID(),
      orderId: id,
      requestedById: session.user.id,
      amount: Number(amount),
      notePhotoKeys,
      notes: notes?.trim() || null,
      requesterName: requesterName.trim(),
      bankName: bankName.trim(),
      accountNumber: accountNumber.trim(),
      accountHolderName: accountHolderName.trim(),
      updatedAt: new Date(),
    },
  })

  notifyByRole(db, ['FINANCE', 'ADMIN', 'SUPER_ADMIN'], 'PO_REIMBURSEMENT_REQUESTED',
    `${installmentLabel} (Reimbursement) Requested`,
    `${order.poNumber}${order.supplierName ? ` — ${order.supplierName}` : ''} has a reimbursement request from ${requesterName.trim()} — ${installmentLabel.toLowerCase()} (${amountFormatted})`,
    id,
  ).catch(console.error)

  return NextResponse.json(reimbursement, { status: 201 })
}
