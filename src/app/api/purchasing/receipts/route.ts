import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { receiveGoods } from '@/lib/purchasing/receiveGoods'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const receipts = await db.goodsReceipt.findMany({
    orderBy: { receivedAt: 'desc' },
    include: { items: { select: { id: true } } },
  })
  const [locations, orders] = await Promise.all([
    db.stockLocation.findMany({ select: { id: true, name: true } }),
    db.purchaseOrder.findMany({ where: { id: { in: receipts.map(r => r.orderId) } }, select: { id: true, poNumber: true } }),
  ])
  const locMap = new Map(locations.map(l => [l.id, l]))
  const orderMap = new Map(orders.map(o => [o.id, o]))
  return NextResponse.json(receipts.map(r => ({
    ...r, itemCount: r.items.length, items: undefined,
    location: locMap.get(r.locationId) ?? null,
    order: orderMap.get(r.orderId) ?? null,
  })))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { orderId, locationId, notes, receivePhotoKey, receiverName, items } = body
  if (!orderId || !locationId) return NextResponse.json({ error: 'orderId dan locationId wajib diisi' }, { status: 400 })
  if (!items || !Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Minimal 1 item dibutuhkan' }, { status: 400 })

  // Permission + status check
  const poForPermission = await db.purchaseOrder.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      deliveryLocationId: true,
      deliveryLocation: { select: { managedBy: true } },
      transitStops: { orderBy: { sequence: 'asc' }, take: 1, select: { location: { select: { managedBy: true } } } },
    },
  })
  if (!poForPermission) return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  if (!['IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(poForPermission.status))
    return NextResponse.json({ error: 'Barang hanya dapat diterima setelah PO berstatus In Transit' }, { status: 400 })

  // When the PO has a transit route, goods from the supplier can only land at the first
  // transit stop — the client-supplied locationId is ignored/overridden for routed POs
  // (receiveGoods below re-derives this the same way; here we only need it to know which
  // team's permission applies).
  const firstStop = poForPermission.transitStops[0]
  const receivingLocationManagedBy = (firstStop ? firstStop.location.managedBy : poForPermission.deliveryLocation?.managedBy) ?? 'WAREHOUSE'
  const receiveAllowed = receivingLocationManagedBy === 'PURCHASING'
    ? ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']
    : ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']
  if (!roleMatches(role, receiveAllowed))
    return NextResponse.json({ error: `Only ${receivingLocationManagedBy.toLowerCase()} team can receive items for this PO` }, { status: 403 })

  const result = await receiveGoods(db, {
    orderId,
    locationId,
    notes,
    receivePhotoKey,
    receiverName,
    receivedById: session.user.id,
    receivedByEmployeeId: null,
    movementCreatedById: session.user.id,
    items,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json(result.gr, { status: 201 })
}
