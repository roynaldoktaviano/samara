import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { freeStock } from '@/lib/purchasing/warehouseProcess'
import { warehouseHomeLocationId } from '@/lib/purchasing/warehouseHome'

// Warehouse's "Approve" on a single Warehouse-routed PR line — kept separate from the
// Purchasing-only .../items/[itemId] route so Warehouse never gains access to that route's
// other fields (price, supplier, verifyRejected). Approving only saves the source warehouse and
// the Reserve (base units, at most the free stock there) — nothing moves yet. "Process Purchase
// Request" (PATCH .../warehouse-forward) then decides every approved line at once:
//   reserve > 0   → TRANSFER: a TR for the reserve, the rest backordered at that warehouse
//   reserve 0     → the whole line backordered there — shipped once restock arrives
// action 'unapprove' clears the approval again while the line is still undecided.
const ALLOWED = ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = (await req.json()) as { action?: 'approve' | 'unapprove'; fromLocationId?: string; note?: string; reserveQty?: number }
  const { action, note, reserveQty } = body
  // The WAREHOUSE role always takes from its home warehouse (Gudang Labuan Bajo) — not its pick.
  const home = roleMatches(role, ['WAREHOUSE']) ? await warehouseHomeLocationId(db) : null
  const fromLocationId = home ?? body.fromLocationId

  const request = await db.purchaseRequest.findUnique({ where: { id }, select: { status: true, deliveryLocationId: true, warehouseDoneAt: true } })
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  // DRAFT = all lines are Warehouse's; ON_PROCESS with warehouseDoneAt unset = Purchasing is
  // already on other lines while Warehouse still checks these (parallel PR).
  if (!(request.status === 'DRAFT' || (request.status === 'ON_PROCESS' && !request.warehouseDoneAt))) {
    return NextResponse.json({ error: 'Stock can only be checked while the request is pending Warehouse review' }, { status: 409 })
  }

  const existingItem = await db.purchaseRequestItem.findUnique({
    where: { id: itemId },
    select: { id: true, requestId: true, itemId: true, convertedAt: true, verifyRejectedAt: true, viaWarehouse: true, warehouseDecision: true },
  })
  if (!existingItem || existingItem.requestId !== id) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (!existingItem.viaWarehouse || !existingItem.itemId) {
    return NextResponse.json({ error: 'This item goes straight to Purchasing — no warehouse check needed' }, { status: 409 })
  }
  if (existingItem.convertedAt || existingItem.warehouseDecision) {
    return NextResponse.json({ error: 'Item has already been processed' }, { status: 409 })
  }

  if (action === 'unapprove') {
    await db.purchaseRequestItem.update({
      where: { id: itemId },
      data: { warehouseApprovedAt: null, warehouseApprovedById: null, warehouseReserveQty: null, warehouseFromLocationId: null },
    })
    emitTenantEvent(session.user.tenantId, 'purchasing-requests')
    return NextResponse.json({ ok: true })
  }

  if (existingItem.verifyRejectedAt) {
    return NextResponse.json({ error: 'Item was rejected — no stock check needed' }, { status: 409 })
  }
  if (!request.deliveryLocationId) {
    return NextResponse.json({ error: 'PR has no delivery location — cannot transfer from stock' }, { status: 409 })
  }
  if (!fromLocationId) return NextResponse.json({ error: 'Select a source stock location' }, { status: 400 })
  const fromLocation = await db.stockLocation.findUnique({ where: { id: fromLocationId }, select: { id: true, type: true } })
  if (!fromLocation || fromLocation.type !== 'WAREHOUSE' || fromLocationId === request.deliveryLocationId) {
    return NextResponse.json({ error: 'Invalid source location' }, { status: 400 })
  }
  if (typeof reserveQty !== 'number' || !Number.isFinite(reserveQty) || reserveQty < 0) {
    return NextResponse.json({ error: 'Enter a reserve quantity (0 or more)' }, { status: 400 })
  }
  const free = (await freeStock(db, [{ itemId: existingItem.itemId, locationId: fromLocationId }])).get(`${existingItem.itemId}:${fromLocationId}`) ?? 0
  if (reserveQty > free + 1e-6) {
    const master = await db.purchaseItem.findUnique({ where: { id: existingItem.itemId }, select: { baseUnit: true } })
    return NextResponse.json({ error: `Reserve can't exceed the current stock (${Math.round(free * 100) / 100} ${master?.baseUnit ?? ''})`.trim() }, { status: 400 })
  }

  await db.purchaseRequestItem.update({
    where: { id: itemId },
    data: {
      warehouseApprovedAt: new Date(),
      warehouseApprovedById: session.user.id,
      warehouseReserveQty: reserveQty,
      warehouseFromLocationId: fromLocationId,
      warehouseCheckNote: note?.trim() || null,
    },
  })
  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  return NextResponse.json({ ok: true })
}
