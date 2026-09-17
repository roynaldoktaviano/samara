import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { createOrAppendTransfer, toBaseQty } from '@/lib/purchasing/transferActions'

// Warehouse's physical stock-check action on a single PR item — kept separate from the
// Purchasing-only .../items/[itemId] route so Warehouse never gains access to that route's
// other fields (price, supplier, verifyRejected).
const ALLOWED = ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json()
  const { decision, fromLocationId, note } = body as {
    decision?: 'TRANSFER' | 'PURCHASE'
    fromLocationId?: string
    note?: string
  }
  if (!decision || !['TRANSFER', 'PURCHASE'].includes(decision)) {
    return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
  }

  const request = await db.purchaseRequest.findUnique({ where: { id }, select: { status: true, prNumber: true, deliveryLocationId: true } })
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Stock can only be checked while the request is pending Warehouse review' }, { status: 409 })
  }

  const existingItem = await db.purchaseRequestItem.findUnique({
    where: { id: itemId },
    select: { id: true, requestId: true, itemId: true, itemName: true, quantity: true, unit: true, convertedAt: true, verifyRejectedAt: true },
  })
  if (!existingItem || existingItem.requestId !== id) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (existingItem.convertedAt) {
    return NextResponse.json({ error: 'Item has already been resolved — its decision can no longer change' }, { status: 409 })
  }
  if (existingItem.verifyRejectedAt) {
    return NextResponse.json({ error: 'Item was rejected — no stock check needed' }, { status: 409 })
  }

  if (decision === 'PURCHASE') {
    const item = await db.purchaseRequestItem.update({
      where: { id: itemId },
      data: {
        warehouseDecision: 'PURCHASE',
        warehouseCheckedById: session.user.id,
        warehouseCheckedAt: new Date(),
        warehouseCheckNote: note?.trim() || null,
      },
    })
    emitTenantEvent(session.user.tenantId, 'purchasing-requests')
    return NextResponse.json(item)
  }

  // decision === 'TRANSFER'
  if (!existingItem.itemId) {
    return NextResponse.json({ error: 'Custom/non-catalog items cannot be transferred from stock' }, { status: 400 })
  }
  if (!request.deliveryLocationId) {
    return NextResponse.json({ error: 'PR tidak punya delivery location — tidak bisa transfer dari stok' }, { status: 409 })
  }
  if (!fromLocationId) return NextResponse.json({ error: 'Pilih lokasi asal stok' }, { status: 400 })
  const fromLocation = await db.stockLocation.findUnique({ where: { id: fromLocationId }, select: { id: true, type: true } })
  if (!fromLocation || fromLocation.type !== 'WAREHOUSE' || fromLocationId === request.deliveryLocationId) {
    return NextResponse.json({ error: 'Lokasi asal tidak valid' }, { status: 400 })
  }

  const master = await db.purchaseItem.findUnique({ where: { id: existingItem.itemId }, select: { baseUnit: true, purchaseUnit: true, conversionFactor: true } })
  const baseQty = toBaseQty(existingItem.quantity, existingItem.unit, master)
  const lots = await db.stockLot.findMany({ where: { itemId: existingItem.itemId, locationId: fromLocationId }, select: { quantity: true } })
  const available = lots.reduce((s, l) => s + l.quantity, 0)
  if (available < baseQty) {
    return NextResponse.json({ error: `Stok "${existingItem.itemName}" tidak cukup di lokasi ini (tersedia: ${available})` }, { status: 409 })
  }

  const transferNumber = await createOrAppendTransfer(db, {
    requestId: id,
    prNumber: request.prNumber,
    deliveryLocationId: request.deliveryLocationId,
    fromLocationId,
    items: [{ itemId: existingItem.itemId, itemName: existingItem.itemName, baseQty }],
  })

  const item = await db.purchaseRequestItem.update({
    where: { id: itemId },
    data: {
      warehouseDecision: 'TRANSFER',
      warehouseCheckedById: session.user.id,
      warehouseCheckedAt: new Date(),
      warehouseCheckNote: note?.trim() || null,
      convertedAt: new Date(),
    },
  })
  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  emitTenantEvent(session.user.tenantId, 'purchasing-transfers')
  return NextResponse.json({ ...item, transferNumber })
}
