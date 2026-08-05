import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { notifyByRole } from '@/lib/notify-purchasing'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['FINANCE', 'ADMIN', 'SUPER_ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const reimbursement = await db.deliveryFeeReimbursement.findUnique({
    where: { id },
    include: {
      deliveryFee: { select: { feeNumber: true, notes: true, purchaseOrder: { select: { poNumber: true, supplierName: true, deliveryLocation: { select: { name: true } } } } } },
      requestedBy: { select: { name: true } },
      paidBy: { select: { name: true } },
    },
  })
  if (!reimbursement) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(reimbursement)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.deliveryFeeReimbursement.findUnique({ where: { id }, select: { status: true, deliveryFeeId: true, deliveryFee: { select: { purchaseOrderId: true } } } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'PAID') return NextResponse.json({ error: 'This reimbursement has already been marked as paid' }, { status: 409 })

  const body = await req.json()
  const { transferProofKeys } = body
  if (!Array.isArray(transferProofKeys) || transferProofKeys.length === 0) return NextResponse.json({ error: 'At least one transfer proof photo is required' }, { status: 400 })

  const updated = await db.deliveryFeeReimbursement.update({
    where: { id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      paidById: session.user.id,
      transferProofKeys,
      updatedAt: new Date(),
    },
    include: { deliveryFee: { select: { feeNumber: true, purchaseOrder: { select: { poNumber: true, supplierName: true } } } } },
  })

  const dfLabel = updated.deliveryFee.purchaseOrder
    ? `${updated.deliveryFee.feeNumber} (${updated.deliveryFee.purchaseOrder.poNumber}${updated.deliveryFee.purchaseOrder.supplierName ? ` — ${updated.deliveryFee.purchaseOrder.supplierName}` : ''})`
    : updated.deliveryFee.feeNumber
  notifyByRole(db, ['PURCHASING', 'ADMIN', 'SUPER_ADMIN'], 'DF_REIMBURSEMENT_PAID',
    'Delivery Fee Reimbursement Paid',
    `${dfLabel} reimbursement to ${updated.requesterName} has been paid (Rp ${new Intl.NumberFormat('id-ID').format(updated.amount)})`,
    existing.deliveryFee.purchaseOrderId ?? existing.deliveryFeeId,
  ).catch(console.error)

  return NextResponse.json(updated)
}
