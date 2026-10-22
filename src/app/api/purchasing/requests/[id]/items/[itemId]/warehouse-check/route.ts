import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { createOrAppendTransfer, toBaseQty } from '@/lib/purchasing/transferActions'
import { notifyPurchasingForRequest } from '@/lib/notify-purchasing'
import { addRestockLines, finishWarehouseCheck, loadWarehouseRequest, undecidedLines } from '@/lib/purchasing/warehouseProcess'

// Warehouse's "Process" on a single Warehouse-routed PR line — kept separate from the
// Purchasing-only .../items/[itemId] route so Warehouse never gains access to that route's
// other fields (price, supplier, verifyRejected). There is no choice to make: the system
// decides from free stock at the chosen warehouse —
//   nothing free  → PURCHASE: handed to Purchasing right away to buy straight to the ship
//   some/all free → TRANSFER: a TR for what's free now, the rest backordered at that warehouse
// — then this line's To Be Order goes to Purchasing at once on a Restock PR, and processing the
// last open line finishes Warehouse's check (see src/lib/purchasing/warehouseProcess.ts).
const ALLOWED = ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { fromLocationId, note } = (await req.json()) as { fromLocationId?: string; note?: string }

  const request = await db.purchaseRequest.findUnique({ where: { id }, select: { status: true, prNumber: true, division: true, deliveryLocationId: true, warehouseDoneAt: true } })
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  // DRAFT = all lines are Warehouse's; ON_PROCESS with warehouseDoneAt unset = Purchasing is
  // already on other lines while Warehouse still processes these (parallel PR).
  if (!(request.status === 'DRAFT' || (request.status === 'ON_PROCESS' && !request.warehouseDoneAt))) {
    return NextResponse.json({ error: 'Stock can only be checked while the request is pending Warehouse review' }, { status: 409 })
  }

  const existingItem = await db.purchaseRequestItem.findUnique({
    where: { id: itemId },
    select: { id: true, requestId: true, itemId: true, itemName: true, quantity: true, unit: true, convertedAt: true, verifyRejectedAt: true, viaWarehouse: true, warehouseDecision: true },
  })
  if (!existingItem || existingItem.requestId !== id) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (!existingItem.viaWarehouse || !existingItem.itemId) {
    return NextResponse.json({ error: 'This item goes straight to Purchasing — no warehouse check needed' }, { status: 409 })
  }
  if (existingItem.convertedAt || existingItem.warehouseDecision) {
    return NextResponse.json({ error: 'Item has already been processed' }, { status: 409 })
  }
  if (existingItem.verifyRejectedAt) {
    return NextResponse.json({ error: 'Item was rejected — no stock check needed' }, { status: 409 })
  }
  if (!request.deliveryLocationId) {
    return NextResponse.json({ error: 'PR tidak punya delivery location — tidak bisa transfer dari stok' }, { status: 409 })
  }
  if (!fromLocationId) return NextResponse.json({ error: 'Pilih lokasi asal stok' }, { status: 400 })
  const fromLocation = await db.stockLocation.findUnique({ where: { id: fromLocationId }, select: { id: true, type: true } })
  if (!fromLocation || fromLocation.type !== 'WAREHOUSE' || fromLocationId === request.deliveryLocationId) {
    return NextResponse.json({ error: 'Lokasi asal tidak valid' }, { status: 400 })
  }

  const catalogItemId = existingItem.itemId
  const master = await db.purchaseItem.findUnique({ where: { id: catalogItemId }, select: { baseUnit: true, purchaseUnit: true, conversionFactor: true } })
  const baseQty = toBaseQty(existingItem.quantity, existingItem.unit, master)

  // Decide + claim atomically — a double click must not transfer/hand over the line twice.
  const result = await db.$transaction(async tx => {
    const lots = await tx.stockLot.findMany({ where: { itemId: catalogItemId, locationId: fromLocationId }, select: { quantity: true } })
    // Stock already reserved (PENDING transfers out of this warehouse, not yet dispatched so
    // still in StockLot) can't be promised again to this line.
    const reserved = await tx.stockTransferItem.aggregate({
      where: { itemId: catalogItemId, transfer: { status: 'PENDING', fromLocationId } },
      _sum: { requestedQty: true },
    })
    const free = Math.max(0, lots.reduce((s, l) => s + l.quantity, 0) - (reserved._sum.requestedQty ?? 0))
    const now = new Date()
    const base = { warehouseCheckedById: session.user.id, warehouseCheckedAt: now, warehouseCheckNote: note?.trim() || null }

    if (free <= 0) {
      const claimed = await tx.purchaseRequestItem.updateMany({
        where: { id: itemId, convertedAt: null, warehouseDecision: null },
        data: { ...base, warehouseDecision: 'PURCHASE' },
      })
      return claimed.count ? { outcome: 'PURCHASE' as const, transferNumber: null, sendQty: 0, backorderQty: 0 } : null
    }

    const sendQty = Math.min(baseQty, free)
    const backorderQty = baseQty - sendQty
    const claimed = await tx.purchaseRequestItem.updateMany({
      where: { id: itemId, convertedAt: null, warehouseDecision: null },
      data: {
        ...base,
        warehouseDecision: 'TRANSFER',
        convertedAt: now,
        backorderQty,
        backorderLocationId: backorderQty > 0 ? fromLocationId : null,
      },
    })
    if (!claimed.count) return null
    const transferNumber = await createOrAppendTransfer(tx, {
      requestId: id,
      prNumber: request.prNumber,
      deliveryLocationId: request.deliveryLocationId!,
      fromLocationId,
      items: [{ itemId: catalogItemId, itemName: existingItem.itemName, baseQty: sendQty }],
    })
    return { outcome: 'TRANSFER' as const, transferNumber, sendQty, backorderQty }
  })
  if (!result) return NextResponse.json({ error: 'Item has already been processed' }, { status: 409 })

  // To Be Order for this line → Purchasing now (Restock PR to the warehouse).
  const fresh = (await loadWarehouseRequest(db, id))!
  const restockRequests = await addRestockLines(db, fresh, [itemId], session.user.id)

  // Out of stock → this line is Purchasing's to buy straight to the ship, right away: an
  // all-Warehouse DRAFT PR moves to ON_PROCESS (parallel — Warehouse keeps the rest).
  if (result.outcome === 'PURCHASE') {
    if (fresh.status === 'DRAFT') {
      await db.purchaseRequest.update({ where: { id }, data: { status: 'ON_PROCESS', updatedAt: new Date() } })
    }
    await notifyPurchasingForRequest(
      db, request.division ?? null, 'PR_FORWARDED_FROM_WAREHOUSE', 'Item kosong di gudang',
      `${request.prNumber} — ${existingItem.itemName} tidak ada di gudang, perlu dibelikan langsung ke kapal.`,
      id,
    )
  }

  // Last open line processed → Warehouse's check is done.
  const finished = undecidedLines(fresh).length === 0 ? !!(await finishWarehouseCheck(db, id, session.user.id)) : false

  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  if (result.transferNumber) emitTenantEvent(session.user.tenantId, 'purchasing-transfers')
  return NextResponse.json({ ...result, restockRequests, finished })
}
