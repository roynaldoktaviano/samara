import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['FINANCE', 'ADMIN', 'SUPER_ADMIN']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const reimbursements = await db.deliveryFeeReimbursement.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      deliveryFee: { select: { feeNumber: true, purchaseOrder: { select: { poNumber: true, supplierName: true, deliveryLocation: { select: { name: true } } } } } },
      requestedBy: { select: { name: true } },
      paidBy: { select: { name: true } },
    },
  })

  return NextResponse.json(reimbursements)
}
