import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

async function generateFeeNumber(db: Awaited<ReturnType<typeof getDb>>) {
  const prefix = `DF-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-`
  const last = await db.deliveryFee.findFirst({ where: { feeNumber: { startsWith: prefix } }, orderBy: { feeNumber: 'desc' }, select: { feeNumber: true } })
  const seq = last ? (parseInt(last.feeNumber.split('-').pop() ?? '0') || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const fees = await db.deliveryFee.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      purchaseOrder: { select: { poNumber: true, supplierName: true } },
      createdBy: { select: { name: true } },
      paymentRequests: { select: { status: true } },
      reimbursements: { select: { status: true } },
    },
  })

  return NextResponse.json(fees.map(f => {
    const paymentStatus = f.paymentRequests.length === 0 && f.reimbursements.length === 0
      ? 'UNPAID'
      : [...f.paymentRequests, ...f.reimbursements].some(p => p.status === 'PAID') ? 'PAID' : 'PENDING'
    return {
      ...f,
      createdByName: f.createdBy?.name ?? null,
      paymentStatus,
      paymentRequests: undefined,
      reimbursements: undefined,
      createdBy: undefined,
    }
  }))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { purchaseOrderId, notes } = body
  // No longer required — a shipment can consolidate several POs or be a standalone
  // cargo delivery with no single PO behind it, in which case notes carries the description.
  if (purchaseOrderId) {
    const order = await db.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, select: { id: true } })
    if (!order) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  } else if (!notes?.trim()) {
    return NextResponse.json({ error: 'Add a note describing this delivery when no PO is linked' }, { status: 400 })
  }

  const feeNumber = await generateFeeNumber(db)
  const fee = await db.deliveryFee.create({
    data: {
      id: crypto.randomUUID(),
      feeNumber,
      purchaseOrderId: purchaseOrderId || null,
      notes: notes?.trim() || null,
      createdById: session.user.id,
      updatedAt: new Date(),
    },
    include: { purchaseOrder: { select: { poNumber: true, supplierName: true } } },
  })
  return NextResponse.json(fee, { status: 201 })
}
