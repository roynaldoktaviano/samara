import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { notifyByRole } from '@/lib/notify-purchasing'

import { roleMatches } from '@/lib/role-utils'
import { emitTenantEvent } from '@/lib/realtime-bus'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const fee = await db.deliveryFee.findUnique({ where: { id }, select: { id: true, feeNumber: true, purchaseOrderId: true, purchaseOrder: { select: { poNumber: true, supplierName: true } } } })
  if (!fee) return NextResponse.json({ error: 'Delivery fee not found' }, { status: 404 })

  const body = await req.json()
  const { amount, notePhotoKeys, notes, notaDate, requesterName, bankName, accountNumber, accountHolderName } = body
  if (!amount || Number(amount) <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  if (!Array.isArray(notePhotoKeys) || notePhotoKeys.length === 0) return NextResponse.json({ error: 'At least one receipt/nota photo is required' }, { status: 400 })
  if (!requesterName?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!bankName?.trim()) return NextResponse.json({ error: 'Bank name is required' }, { status: 400 })
  if (!accountNumber?.trim()) return NextResponse.json({ error: 'Account number is required' }, { status: 400 })
  if (!accountHolderName?.trim()) return NextResponse.json({ error: 'Account holder name is required' }, { status: 400 })

  const amountFormatted = `Rp ${new Intl.NumberFormat('id-ID').format(Number(amount))}`
  const label = fee.purchaseOrder
    ? `${fee.feeNumber} (${fee.purchaseOrder.poNumber}${fee.purchaseOrder.supplierName ? ` — ${fee.purchaseOrder.supplierName}` : ''})`
    : fee.feeNumber

  const reimbursement = await db.deliveryFeeReimbursement.create({
    data: {
      id: crypto.randomUUID(),
      deliveryFeeId: id,
      requestedById: session.user.id,
      amount: Number(amount),
      notePhotoKeys,
      notes: notes?.trim() || null,
      notaDate: notaDate ? new Date(notaDate) : null,
      requesterName: requesterName.trim(),
      bankName: bankName.trim(),
      accountNumber: accountNumber.trim(),
      accountHolderName: accountHolderName.trim(),
      updatedAt: new Date(),
    },
  })

  notifyByRole(db, ['FINANCE', 'ADMIN', 'SUPER_ADMIN'], 'DF_REIMBURSEMENT_REQUESTED',
    'Delivery Fee Reimbursement Requested',
    `${label} has a reimbursement request from ${requesterName.trim()} (${amountFormatted})`,
    fee.purchaseOrderId ?? fee.id,
  ).catch(console.error)

  emitTenantEvent(session.user.tenantId, 'purchasing-finance')
  return NextResponse.json(reimbursement, { status: 201 })
}
