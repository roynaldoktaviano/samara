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
// other fields (price, supplier, verifyRejected). Warehouse sets the Reserve (base units, at
// most the free stock at the chosen warehouse; omitted → min(Requested, free)) —
//   reserve 0     → PURCHASE: handed to Purchasing right away to buy straight to the ship
//   reserve > 0   → TRANSFER: a TR for the reserve now, the rest backordered at that warehouse
// — then this line's To Be Order goes to Purchasing at once on a Restock PR, and processing the
// last open line finishes Warehouse's check (see src/lib/purchasing/warehouseProcess.ts).
const ALLOWED = ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { fromLocationId, note, reserveQty } = (await req.json()) as { fromLocationId?: string; note?: string; reserveQty?: number }
  if (reserveQty !== undefined && (typeof reserveQty !== 'number' || !Number.isFinite(reserveQty) || reserveQty < 0)) {
    return NextResponse.json({ error: 'Invalid reserve quantity' }, { status: 400 })
  }

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
    return NextResponse.json({ error: 'PR has no delivery location — cannot transfer from stock' }, { status: 409 })
  }
  if (!fromLocationId) return NextResponse.json({ error: 'Select a source stock location' }, { status: 400 })
  const fromLocation = await db.stockLocation.findUnique({ where: { id: fromLocationId }, select: { id: true, type: true } })
  if (!fromLocation || fromLocation.type !== 'WAREHOUSE' || fromLocationId === request.deliveryLocationId) {
    return NextResponse.json({ error: 'Invalid source location' }, { status: 400 })
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
    if (reserveQty !== undefined && reserveQty > free + 1e-6) return { overFree: free }
    const sendQty = reserveQty !== undefined ? Math.min(reserveQty, free) : Math.min(baseQty, free)
    const now = new Date()
    const base = { warehouseCheckedById: session.user.id, warehouseCheckedAt: now, warehouseCheckNote: note?.trim() || null }

    if (sendQty <= 0) {
      const claimed = await tx.purchaseRequestItem.updateMany({
        where: { id: itemId, convertedAt: null, warehouseDecision: null },
        data: { ...base, warehouseDecision: 'PURCHASE' },
      })
      return claimed.count ? { outcome: 'PURCHASE' as const, transferNumber: null, sendQty: 0, backorderQty: 0 } : null
    }

    const backorderQty = Math.max(0, baseQty - sendQty)
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
  if ('overFree' in result && result.overFree !== undefined) {
    return NextResponse.json({ error: `Reserve can't exceed the current stock (${Math.round(result.overFree * 100) / 100} ${master?.baseUnit ?? ''})`.trim() }, { status: 400 })
  }

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
      db, request.division ?? null, 'PR_FORWARDED_FROM_WAREHOUSE', 'Item out of stock in warehouse',
      `${request.prNumber} — ${existingItem.itemName} is not available in the warehouse and needs to be purchased directly for the vessel.`,
      id,
    )
  }

  // Last open line processed → Warehouse's check is done.
  const finished = undecidedLines(fresh).length === 0 ? !!(await finishWarehouseCheck(db, id, session.user.id)) : false

  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  if (result.transferNumber) emitTenantEvent(session.user.tenantId, 'purchasing-transfers')
  return NextResponse.json({ ...result, restockRequests, finished })
}
