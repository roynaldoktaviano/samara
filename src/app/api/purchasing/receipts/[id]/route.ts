import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const receipt = await db.goodsReceipt.findUnique({ where: { id }, include: { items: true } })
  if (!receipt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [receiver, receiverEmployee, location, order] = await Promise.all([
    receipt.receivedById ? db.user.findUnique({ where: { id: receipt.receivedById }, select: { id: true, name: true } }) : null,
    receipt.receivedByEmployeeId ? db.employee.findUnique({ where: { id: receipt.receivedByEmployeeId }, select: { id: true, fullName: true } }) : null,
    db.stockLocation.findUnique({ where: { id: receipt.locationId }, select: { id: true, name: true } }),
    db.purchaseOrder.findUnique({ where: { id: receipt.orderId }, select: { id: true, poNumber: true, supplierName: true } }),
  ])
  return NextResponse.json({ ...receipt, receiver, receiverEmployee, location, order })
}
