import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const request = await db.purchaseRequest.findUnique({ where: { id }, select: { status: true } })
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'ON_PROCESS') {
    return NextResponse.json({ error: 'Items can only be edited while the request is On Process' }, { status: 409 })
  }

  const existingItem = await db.purchaseRequestItem.findUnique({ where: { id: itemId }, select: { id: true, requestId: true } })
  if (!existingItem || existingItem.requestId !== id) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const body = await req.json()
  const { estimatedCost, supplierId, supplierName, exemptionReason, selectionJustification } = body

  const item = await db.purchaseRequestItem.update({
    where: { id: itemId },
    data: {
      ...(estimatedCost !== undefined && { estimatedCost: Number(estimatedCost) || 0 }),
      ...(supplierId !== undefined && { supplierId: supplierId || null, supplierName: supplierName || null }),
      ...(exemptionReason !== undefined && { exemptionReason: exemptionReason?.trim() || null }),
      ...(selectionJustification !== undefined && { selectionJustification: selectionJustification?.trim() || null }),
    },
  })
  return NextResponse.json(item)
}
