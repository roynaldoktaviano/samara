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

  const requests = await db.pOPaymentRequest.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      order: { select: { poNumber: true, supplierName: true, deliveryLocation: { select: { name: true } }, requestedByName: true, requestedByOffice: true, requestedByDepartment: true, requestedByRole: true } },
      requestedBy: { select: { name: true } },
      paidBy: { select: { name: true } },
    },
  })

  return NextResponse.json(requests)
}
