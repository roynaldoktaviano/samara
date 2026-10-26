import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { receiveTransferLeg } from '@/lib/purchasing/transferActions'

import { roleMatches } from '@/lib/role-utils'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { notifyAssignedYachtCaptains, notifyRequester } from '@/lib/notify-purchasing'
import { getOrCreateTransferReceiveToken, resolveBaseUrl } from '@/lib/purchasing/receiveLink'
import { tripFromBooking, tripFromOpenTrip, tripBookingSelect, openTripSelect } from '@/lib/purchasing/tripLink'
import { resolveAssignedYachtId } from '@/lib/purchasing/yachtScope'
import { canDispatchFrom, DISPATCH_OWNER_LABEL } from '@/lib/purchasing/dispatchPermission'
import { backorderShortDispatch, reopenForCancelledTransfer } from '@/lib/purchasing/prLineReopen'

class AlreadyDispatchedError extends Error {}

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']
// Cruise Director / Boat Captain: only transfers to or from their own yacht — receive what
// arrives there; dispatching what leaves stays Cruise Director-only (see
// dispatchPermission.ts). Boat Captain is here because notifyAssignedYachtCaptains already
// pings them about every transfer heading to their yacht.
const YACHT_ROLES = ['CRUISE_DIRECTOR', 'BOAT_CAPTAIN']

async function yachtRoleCanAccess(db: Awaited<ReturnType<typeof getDb>>, userId: string, transfer: { fromLocationId: string; toLocationId: string }): Promise<boolean> {
  const [yachtId, locs] = await Promise.all([
    resolveAssignedYachtId(db, userId),
    db.stockLocation.findMany({ where: { id: { in: [transfer.fromLocationId, transfer.toLocationId] } }, select: { yachtId: true } }),
  ])
  return !!yachtId && locs.some(l => l.yachtId === yachtId)
}

// For PO-driven transit legs only (transfer.purchaseOrderId set) — ad-hoc transfers made
// directly in the Transfers module aren't scoped this way. A leg's destination is usually a
// Vessel when it's the final hop of a shipping route; crew there have no ERP login and confirm
// via the token-based receive link instead (see receive-link/route.ts), so Vessel destinations
// skip this check entirely rather than requiring a WAREHOUSE/PURCHASING account to act on it.
async function legLocationAllowsRole(db: Awaited<ReturnType<typeof getDb>>, locationId: string, role: string): Promise<boolean> {
  const loc = await db.stockLocation.findUnique({ where: { id: locationId }, select: { type: true, managedBy: true } })
  if (!loc || loc.type === 'VESSEL') return true
  const allowed = loc.managedBy === 'PURCHASING' ? ['PURCHASING', 'ADMIN', 'SUPER_ADMIN'] : ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']
  return roleMatches(role, allowed)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, [...ALLOWED, ...YACHT_ROLES])) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const transfer = await db.stockTransfer.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          item: { select: { baseUnit: true, purchaseUnit: true, conversionFactor: true, standardCost: true } },
          orderedByEmployee: { select: { id: true, fullName: true } },
        },
      },
      dispatchedBy: { select: { id: true, name: true } },
      receivedBy: { select: { id: true, name: true } },
      expectedReceivedBy: { select: { id: true, name: true } },
      purchaseOrder: { select: { id: true, poNumber: true } },
      purchaseRequest: {
        select: {
          id: true, prNumber: true,
          requestedBy: { select: { name: true } },
          requestedByEmployee: { select: { fullName: true } },
        },
      },
      tripBooking: { select: tripBookingSelect },
      openTrip: { select: openTripSelect },
    },
  })
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!roleMatches(role, ALLOWED) && !(await yachtRoleCanAccess(db, session.user.id, transfer))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const dispatch = await canDispatchFrom(db, transfer.fromLocationId, { id: session.user.id, role })
  const [fromLoc, toLoc] = await Promise.all([
    db.stockLocation.findUnique({ where: { id: transfer.fromLocationId }, select: { id: true, name: true, type: true } }),
    db.stockLocation.findUnique({ where: { id: transfer.toLocationId }, select: { id: true, name: true, type: true } }),
  ])
  // All lots currently at the source location — catalog items keyed by itemId,
  // non-catalog ("non-stock") items keyed by itemName (they can have several
  // lots, one per receiving PO, so their availableQty is the sum across them).
  const stockLots = await db.stockLot.findMany({ where: { locationId: transfer.fromLocationId } })
  const stockMap = new Map<string, number>()
  const lotCostMap = new Map<string, number>()
  for (const lot of stockLots) {
    const key = lot.itemId ?? `name:${lot.itemName}`
    stockMap.set(key, (stockMap.get(key) ?? 0) + lot.quantity)
    if (lot.costPerUnit > 0) lotCostMap.set(key, lot.costPerUnit)
  }
  const items = transfer.items.map(i => {
    // Snapshotted cost once dispatched; before that, the source location's moving average.
    const unitCost = i.unitCost || lotCostMap.get(i.itemId ?? `name:${i.itemName}`) || (i.item?.standardCost ?? 0)
    return {
      ...i,
      baseUnit: i.item?.baseUnit ?? null,
      purchaseUnit: i.item?.purchaseUnit ?? null,
      conversionFactor: i.item?.conversionFactor ?? 1,
      availableQty: stockMap.get(i.itemId ?? `name:${i.itemName}`) ?? 0,
      unitCost,
      requestedValue: i.requestedQty * unitCost,
      dispatchedValue: i.dispatchedQty * unitCost,
      receivedValue: i.receivedQty * unitCost,
    }
  })
  const totalValue = items.reduce((sum, i) => sum + (transfer.status === 'PENDING' ? i.requestedValue : transfer.status === 'DISPATCHED' ? i.dispatchedValue : i.receivedValue), 0)
  return NextResponse.json({
    ...transfer,
    fromLocation: fromLoc,
    toLocation: toLoc,
    totalValue,
    items,
    canDispatch: dispatch.allowed,
    dispatchOwnerLabel: DISPATCH_OWNER_LABEL[dispatch.owner],
    tripBooking: undefined,
    openTrip: undefined,
    trip: transfer.openTrip ? tripFromOpenTrip(transfer.openTrip) : transfer.tripBooking ? tripFromBooking(transfer.tripBooking) : null,
    purchaseRequest: transfer.purchaseRequest && {
      id: transfer.purchaseRequest.id,
      prNumber: transfer.purchaseRequest.prNumber,
      // Prefer the actual requester (e.g. a ship crew member) over whoever's ERP
      // account created the PR — same fallback Purchasing's own PR detail page uses.
      requestedByName: transfer.purchaseRequest.requestedByEmployee?.fullName ?? transfer.purchaseRequest.requestedBy?.name ?? null,
    },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, [...ALLOWED, ...YACHT_ROLES])) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { action, items, dispatchPhotoKey, receivePhotoKey, expectedReceiverName, receivedByName } = body

  const transfer = await db.stockTransfer.findUnique({ where: { id }, include: { items: true } })
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!roleMatches(role, ALLOWED)) {
    if (!(await yachtRoleCanAccess(db, session.user.id, transfer))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (action !== 'receive' && action !== 'dispatch') return NextResponse.json({ error: 'Only dispatching/receiving is allowed for your role' }, { status: 403 })
    if (action === 'receive') {
      const [yachtId, toLoc] = await Promise.all([
        resolveAssignedYachtId(db, session.user.id),
        db.stockLocation.findUnique({ where: { id: transfer.toLocationId }, select: { yachtId: true } }),
      ])
      if (!yachtId || toLoc?.yachtId !== yachtId) return NextResponse.json({ error: 'You can only receive transfers arriving on your own yacht' }, { status: 403 })
    }
  }

  // Lets the Packing List print page (src/app/print/stock-transfer/[id]/page.tsx) add a
  // real item to this transfer when a new box row is picked from the inventory catalog,
  // rather than being a print-only note — only while the transfer hasn't moved yet, same
  // as every other edit here (cancel/dispatch/receive are all PENDING/one-shot gated).
  if (action === 'add-item') {
    if (transfer.status !== 'PENDING') return NextResponse.json({ error: 'Items can only be added to a PENDING transfer' }, { status: 409 })
    const { itemId, itemName, qty } = body as { itemId?: string; itemName?: string; qty?: number }
    const quantity = Number(qty)
    if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: 'Qty must be greater than 0' }, { status: 400 })
    let resolvedName = itemName?.trim() || ''
    if (itemId) {
      const item = await db.purchaseItem.findUnique({ where: { id: itemId }, select: { name: true } })
      if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
      resolvedName = item.name
    }
    if (!resolvedName) return NextResponse.json({ error: 'Item name is required' }, { status: 400 })

    // Already on this transfer (matched the same way dispatch/receive match a line —
    // itemId for catalog items, itemName for non-stock ones) — bump its requestedQty
    // instead of creating a second row for the same item.
    const existing = transfer.items.find(i => (itemId ? i.itemId === itemId : i.itemId === null && i.itemName === resolvedName))
    const result = existing
      ? await db.stockTransferItem.update({ where: { id: existing.id }, data: { requestedQty: { increment: quantity } } })
      : await db.stockTransferItem.create({
          data: { id: crypto.randomUUID(), transferId: id, itemId: itemId || null, itemName: resolvedName, requestedQty: quantity },
        })
    emitTenantEvent(session.user.tenantId, 'purchasing-transfers')
    return NextResponse.json(result, { status: existing ? 200 : 201 })
  }

  // Packing List shipping info (Depart on / ETA / Cargo vessel) — one cargo booking
  // covers the whole transfer, editable any time (unlike items, which lock once
  // dispatched), so no status gate here.
  if (action === 'update-shipping') {
    const { departAt, etaAt, cargoName } = body as { departAt?: string | null; etaAt?: string | null; cargoName?: string | null }
    const updated = await db.stockTransfer.update({
      where: { id },
      data: {
        departAt: departAt ? new Date(departAt) : null,
        etaAt: etaAt ? new Date(etaAt) : null,
        cargoName: cargoName?.trim() || null,
        updatedAt: new Date(),
      },
    })
    emitTenantEvent(session.user.tenantId, 'purchasing-transfers')
    return NextResponse.json(updated)
  }

  // Per-item "Ordered by" on the Packing List — who requested that specific line,
  // picked from Employee records. Also editable any time.
  if (action === 'set-item-ordered-by') {
    const { itemId: transferItemId, orderedByEmployeeId } = body as { itemId?: string; orderedByEmployeeId?: string | null }
    if (!transferItemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 })
    const result = await db.stockTransferItem.updateMany({
      where: { id: transferItemId, transferId: id },
      data: { orderedByEmployeeId: orderedByEmployeeId || null },
    })
    if (result.count === 0) return NextResponse.json({ error: 'Item not found on this transfer' }, { status: 404 })
    emitTenantEvent(session.user.tenantId, 'purchasing-transfers')
    return NextResponse.json({ ok: true })
  }

  if (action === 'cancel') {
    if (transfer.status !== 'PENDING') return NextResponse.json({ error: 'Only a PENDING transfer can be cancelled' }, { status: 409 })
    const cancelled = await db.stockTransfer.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'CANCELLED', updatedAt: new Date() } })
    if (!cancelled.count) return NextResponse.json({ error: 'Only a PENDING transfer can be cancelled' }, { status: 409 })
    // A PR's warehouse transfer: its lines must not stay "fulfilled" — put them back to be processed.
    const reopened = await reopenForCancelledTransfer(db, id, session.user.id)
    emitTenantEvent(session.user.tenantId, 'purchasing-transfers')
    if (reopened.length) emitTenantEvent(session.user.tenantId, 'purchasing-requests')
    return NextResponse.json({ ok: true, reopenedItems: reopened })
  }

  if (action === 'dispatch') {
    if (transfer.status !== 'PENDING') return NextResponse.json({ error: 'Transfer has already been processed' }, { status: 409 })
    if (!dispatchPhotoKey) return NextResponse.json({ error: 'Dispatch photo is required' }, { status: 400 })
    const dispatch = await canDispatchFrom(db, transfer.fromLocationId, { id: session.user.id, role })
    if (!dispatch.allowed) {
      return NextResponse.json({ error: `Only ${DISPATCH_OWNER_LABEL[dispatch.owner]} responsible for this location can dispatch it` }, { status: 403 })
    }
    const dispatchItems = (Array.isArray(items) ? items : []) as { itemId: string | null; itemName: string; dispatchedQty: number }[]

    // Quantities are booked against this transfer's own lines (one per item), matched the same
    // way everywhere — itemId for catalog items, itemName for non-stock ones.
    const lineKey = (it: { itemId: string | null; itemName: string }) => it.itemId ?? `name:${it.itemName}`
    const wanted = new Map<string, number>()
    for (const it of dispatchItems) {
      const qty = Number(it.dispatchedQty) || 0
      if (qty > 0) wanted.set(lineKey(it), (wanted.get(lineKey(it)) ?? 0) + qty)
    }
    const unknown = dispatchItems.filter(it => Number(it.dispatchedQty) > 0 && !transfer.items.some(l => lineKey(l) === lineKey(it)))
    if (unknown.length) return NextResponse.json({ error: `Not on this transfer: ${unknown.map(it => it.itemName).join(', ')}` }, { status: 400 })
    if (wanted.size === 0) return NextResponse.json({ error: 'Nothing to dispatch — enter a quantity, or cancel the transfer instead' }, { status: 400 })

    // Stock is re-checked here (not trusted from the client) — it can have moved since
    // the transfer was requested (another transfer, a sale, a stock count). Dispatching
    // more than what's physically on the shelf is rejected outright rather than allowed
    // to go negative with just a logged exception.
    const lots = await db.stockLot.findMany({ where: { locationId: transfer.fromLocationId } })
    const stockMap = new Map<string, number>()
    for (const lot of lots) {
      const key = lot.itemId ?? `name:${lot.itemName}`
      stockMap.set(key, (stockMap.get(key) ?? 0) + lot.quantity)
    }
    const nameOf = (key: string) => transfer.items.find(l => lineKey(l) === key)?.itemName ?? key
    const insufficient = [...wanted].filter(([key, qty]) => qty > (stockMap.get(key) ?? 0) + 1e-9)
    if (insufficient.length > 0) {
      const detail = insufficient.map(([key, qty]) => `${nameOf(key)} (available: ${stockMap.get(key) ?? 0}, requested: ${qty})`).join(', ')
      return NextResponse.json({ error: `Not enough stock for: ${detail}` }, { status: 409 })
    }

    // Cost snapshot per line: a pre-set cost (PO transit legs carry the GR price forward)
    // wins, else the source location's moving-average cost, else the item's last purchase cost.
    const dispatchCatalogIds = transfer.items.map(it => it.itemId).filter(Boolean) as string[]
    const stdCostMap = new Map((await db.purchaseItem.findMany({ where: { id: { in: dispatchCatalogIds } }, select: { id: true, standardCost: true } })).map(i => [i.id, i.standardCost]))
    const presetCost = new Map(transfer.items.map(ti => [lineKey(ti), ti.unitCost]))

    // Lines as of the moment of dispatch (re-read under the claim — a backorder could have been
    // appended to this TR after the page loaded); used below for the short-shipment check.
    let dispatchedLines: typeof transfer.items
    try {
      dispatchedLines = await db.$transaction(async (tx) => {
        // Claim first: a double tap waits here, then finds it no longer PENDING and stops
        // before taking the stock out a second time.
        const claimed = await tx.stockTransfer.updateMany({
          where: { id, status: 'PENDING' },
          data: {
            status: 'DISPATCHED',
            dispatchedById: session.user.id,
            expectedReceiverName: expectedReceiverName ?? null,
            dispatchPhotoKey,
            dispatchedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        if (!claimed.count) throw new AlreadyDispatchedError()
        const currentLines = await tx.stockTransferItem.findMany({ where: { transferId: id }, orderBy: { id: 'asc' } })

        for (const [key, qty] of wanted) {
          const sample = currentLines.find(l => lineKey(l) === key)!
          const lotWhere = sample.itemId
            ? { itemId: sample.itemId, locationId: transfer.fromLocationId }
            : { itemId: null, itemName: sample.itemName, locationId: transfer.fromLocationId }
          const lot = await tx.stockLot.findFirst({ where: lotWhere })
          const unitCost = presetCost.get(key)
            || lot?.costPerUnit
            || (sample.itemId ? stdCostMap.get(sample.itemId) ?? 0 : 0)

          if (lot) {
            await tx.stockLot.update({ where: { id: lot.id }, data: { quantity: { decrement: qty }, updatedAt: new Date() } })
          } else {
            await tx.stockLot.create({
              data: {
                id: crypto.randomUUID(), locationId: transfer.fromLocationId, quantity: -qty, costPerUnit: unitCost, updatedAt: new Date(),
                ...(sample.itemId ? { itemId: sample.itemId } : { itemName: sample.itemName }),
              },
            })
          }
          await tx.stockMovement.create({
            data: {
              id: crypto.randomUUID(), fromLocationId: transfer.fromLocationId, quantity: qty, type: 'TRANSFER_OUT', referenceId: id, referenceType: 'StockTransfer', createdById: session.user.id,
              ...(sample.itemId ? { itemId: sample.itemId } : { itemName: sample.itemName }),
              unitCost, totalCost: qty * unitCost,
            },
          })
          // Older transfers can still hold the same item on two lines — fill them in order.
          const lines = currentLines.filter(l => lineKey(l) === key)
          let left = qty
          for (const [i, line] of lines.entries()) {
            const lineQty = i === lines.length - 1 ? left : Math.min(left, line.requestedQty)
            left -= lineQty
            await tx.stockTransferItem.update({ where: { id: line.id }, data: { dispatchedQty: lineQty, unitCost } })
          }
        }
        return currentLines
      })
    } catch (e) {
      if (e instanceof AlreadyDispatchedError) return NextResponse.json({ error: 'Transfer has already been processed' }, { status: 409 })
      throw e
    }

    // Shipped less than a PR asked for: the rest goes back on that PR line's backorder
    // instead of quietly disappearing.
    if (transfer.purchaseRequestId && !transfer.purchaseOrderId) {
      const requestedByKey = new Map<string, number>()
      for (const l of dispatchedLines) if (l.itemId) requestedByKey.set(l.itemId, (requestedByKey.get(l.itemId) ?? 0) + l.requestedQty)
      const short = [...requestedByKey]
        .map(([itemId, req]) => ({ itemId, itemName: dispatchedLines.find(l => l.itemId === itemId)?.itemName ?? itemId, qty: req - (wanted.get(itemId) ?? 0) }))
        .filter(s => s.qty > 1e-9)
      await backorderShortDispatch(db, { transferNumber: transfer.transferNumber, fromLocationId: transfer.fromLocationId, purchaseRequestId: transfer.purchaseRequestId }, short, session.user.id)
      if (short.length) emitTenantEvent(session.user.tenantId, 'purchasing-requests')
    }
    emitTenantEvent(session.user.tenantId, 'purchasing-transfers')

    // Gudang stock sent out for a PR (no PO involved) — tell the requester it's moving.
    if (transfer.purchaseRequestId && !transfer.purchaseOrderId) {
      notifyRequester(db, transfer.purchaseRequestId, {
        type: 'PR_TRANSFER_DISPATCHED',
        title: 'Warehouse items have shipped',
        body: `${transfer.transferNumber} (from warehouse stock) has shipped and is on the way.`,
        skipUserId: session.user.id,
      }).catch(console.error)
    }

    // This leg's destination is a yacht's own stock location — auto-generate (or reuse)
    // the same no-login receive link the manual "Get Receive Link" button would produce,
    // and push it straight to that yacht's assigned Boat Captain/Cruise Director. Covers
    // both a plain ad-hoc transfer to a vessel and the final leg of a PO's transit chain.
    const toLocation = await db.stockLocation.findUnique({ where: { id: transfer.toLocationId }, select: { yachtId: true } })
    if (toLocation?.yachtId) {
      const yachtId = toLocation.yachtId
      getOrCreateTransferReceiveToken(db, id).then(({ token }) => {
        const link = `${resolveBaseUrl(req)}/crew-receive/${token}`
        notifyAssignedYachtCaptains(db, yachtId, {
          type: 'TRANSFER_IN_TRANSIT_RECEIVE',
          title: 'Goods On the Way to Your Yacht',
          body: `${transfer.transferNumber} is on its way. Confirm receipt here: ${link}`,
          url: `/crew-receive/${token}`,
        }).catch(console.error)
      }).catch(console.error)
    }

    return NextResponse.json({ ok: true })
  }

  if (action === 'receive') {
    if (transfer.purchaseOrderId && !(await legLocationAllowsRole(db, transfer.toLocationId, role))) {
      return NextResponse.json({ error: 'Only the team managing this location can receive here' }, { status: 403 })
    }
    const receiveItems = items as { itemId: string | null; itemName: string; receivedQty: number }[]
    const result = await receiveTransferLeg(db, id, {
      items: receiveItems,
      receivePhotoKey,
      receivedByName: receivedByName ?? null,
      receivedById: session.user.id,
      movementCreatedById: session.user.id,
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
