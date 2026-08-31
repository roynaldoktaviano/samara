import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { notifyByRole } from '@/lib/notify-purchasing'

import { roleMatches } from '@/lib/role-utils'
import { emitTenantEvent } from '@/lib/realtime-bus'

const ALLOWED = ['PURCHASING', 'HR', 'ADMIN', 'SUPER_ADMIN']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const fee = await db.deliveryFee.findUnique({ where: { id }, select: { id: true, feeNumber: true, purchaseOrderId: true, purchaseOrder: { select: { poNumber: true, supplierName: true } } } })
  if (!fee) return NextResponse.json({ error: 'Delivery fee not found' }, { status: 404 })

  const body = await req.json()
  const { amount, notePhotoKeys, notes, notaDate, paidByPurchasing } = body
  if (!amount || Number(amount) <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  if (!Array.isArray(notePhotoKeys) || notePhotoKeys.length === 0) return NextResponse.json({ error: 'At least one receipt/nota photo is required' }, { status: 400 })

  const isDirect = !!paidByPurchasing
  const amountFormatted = `Rp ${new Intl.NumberFormat('id-ID').format(Number(amount))}`
  const label = fee.purchaseOrder
    ? `${fee.feeNumber} (${fee.purchaseOrder.poNumber}${fee.purchaseOrder.supplierName ? ` — ${fee.purchaseOrder.supplierName}` : ''})`
    : fee.feeNumber

  const paymentRequest = await db.deliveryFeePaymentRequest.create({
    data: {
      id: crypto.randomUUID(),
      deliveryFeeId: id,
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
    notifyByRole(db, ['FINANCE', 'ADMIN', 'SUPER_ADMIN'], 'DF_PAID_BY_PURCHASING',
      'Delivery Fee Debit Paid',
      `${label} was paid directly by the purchasing team (debit) — ${amountFormatted}`,
      fee.purchaseOrderId ?? fee.id,
    ).catch(console.error)
  } else {
    notifyByRole(db, ['FINANCE', 'ADMIN', 'SUPER_ADMIN'], 'DF_PAYMENT_REQUESTED',
      'Delivery Fee Payment Request',
      `${label} needs payment approval (${amountFormatted})`,
      fee.purchaseOrderId ?? fee.id,
    ).catch(console.error)
  }

  emitTenantEvent(session.user.tenantId, 'purchasing-finance')
  return NextResponse.json(paymentRequest, { status: 201 })
}
