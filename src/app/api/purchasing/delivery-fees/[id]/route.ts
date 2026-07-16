import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const fee = await db.deliveryFee.findUnique({
    where: { id },
    include: {
      purchaseOrder: {
        select: {
          poNumber: true, supplierName: true, status: true, orderedAt: true, expectedAt: true, notes: true,
          extraCharges: true, discountType: true, discountValue: true,
          deliveryLocation: { select: { name: true } },
          items: { select: { id: true, itemName: true, orderedQty: true, unitCost: true, unit: true } },
        },
      },
      createdBy: { select: { name: true } },
      paymentRequests: {
        orderBy: { createdAt: 'desc' },
        include: { requestedBy: { select: { name: true } }, paidBy: { select: { name: true } } },
      },
      reimbursements: {
        orderBy: { createdAt: 'desc' },
        include: { requestedBy: { select: { name: true } }, paidBy: { select: { name: true } } },
      },
    },
  })
  if (!fee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ...fee, createdByName: fee.createdBy?.name ?? null, createdBy: undefined })
}
