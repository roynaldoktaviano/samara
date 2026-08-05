import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['FINANCE', 'ADMIN', 'SUPER_ADMIN']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const requests = await db.deliveryFeePaymentRequest.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      deliveryFee: { select: { feeNumber: true, notes: true, purchaseOrder: { select: { poNumber: true, supplierName: true, createdAt: true, deliveryLocation: { select: { name: true } } } } } },
      requestedBy: { select: { name: true } },
      paidBy: { select: { name: true } },
    },
  })

  return NextResponse.json(requests)
}
