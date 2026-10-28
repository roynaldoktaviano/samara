import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { PURCHASING_ROLES } from '@/lib/notify-purchasing'
import { computeCurrentLegLabel } from '@/lib/purchasing/transitChain'
import { routePrLines, initialPrStatus, notifyPrRouted } from '@/lib/purchasing/requestItems'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { sendPushToUser } from '@/lib/push'
import { resolveTripLink, tripBookingSelect, openTripSelect, tripOf } from '@/lib/purchasing/tripLink'
import { resolveAssignedYachtId, yachtCrewWhere, yachtRequestWhere } from '@/lib/purchasing/yachtScope'
import { generatePrNumber } from '@/lib/purchasing/docNumber'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE', 'CREW', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR']
const WAREHOUSE_ROLES = ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']
// Roles that only ever see/create their own submissions — never the full queue. Warehouse
// is deliberately NOT here: they now need to see every DRAFT PR pending their stock check,
// not just ones they happened to submit themselves (see the Warehouse stock-check flow).
const OWN_ONLY_ROLES = ['CREW', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  // Warehouse/Crew/Boat Captain/Cruise Director only ever see their own submissions,
  // not Purchasing's full queue — see OWN_ONLY_ROLES above.
  const isOwnOnly = OWN_ONLY_ROLES.includes(role)
  // ...except Boat Captain/Cruise Director also see every PR headed to their own yacht.
  const yachtScope = roleMatches(role, ['BOAT_CAPTAIN', 'CRUISE_DIRECTOR'])
    ? yachtRequestWhere(await resolveAssignedYachtId(db, session.user.id))
    : null

  // Every Purchasing/Admin user can still see every PR here — division (see
  // User.purchasingDivision / PurchaseRequest.division) is only a client-side DEFAULT
  // filter (RequestsPage.tsx), not a server-side restriction. The full list is always
  // available; a division-assigned user just starts on a narrower view of it.
  const requests = await db.purchaseRequest.findMany({
    where: {
      // PRs still awaiting the requester's manager haven't been approved yet — Purchasing
      // shouldn't see them in the general queue until the approval endpoint flips them to
      // DRAFT. But whoever submitted it should still see it here (not just vanish from
      // their own view) so they know it's sitting with their manager — the manager check
      // itself lives in the approval endpoint's identity check, not here.
      AND: [
        { OR: [{ status: { not: 'PENDING_APPROVAL' } }, { requestedById: session.user.id }] },
        ...(isOwnOnly
          ? [{ OR: [{ requestedById: session.user.id }, ...(yachtScope ? [yachtScope] : [])] }]
          : []),
        // Warehouse only deals with PRs headed to a ship (see routePrLines) — PRs for a warehouse
        // or an office/site go straight to Purchasing and stay out of its list (own ones aside).
        ...(roleMatches(role, ['WAREHOUSE'])
          ? [{ OR: [{ requestedById: session.user.id }, { deliveryLocation: { type: 'VESSEL' as const } }, { items: { some: { viaWarehouse: true } } }] }]
          : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      items: { select: { id: true, quantity: true, estimatedCost: true, itemName: true, warehouseDecision: true, convertedAt: true, viaWarehouse: true, backorderQty: true } },
      deliveryLocation: { select: { id: true, name: true, type: true, managedBy: true, yachtId: true } },
      requestedByEmployee: { select: { id: true, fullName: true, employeeNumber: true } },
      verifiedBy: { select: { id: true, name: true } },
      tripBooking: { select: tripBookingSelect },
      openTrip: { select: openTripSelect },
      // So the list can show how far a converted PR's PO(s) actually got (Ordered / On
      // Delivery / Received) instead of just the terminal "Converted" PR status — including
      // exactly where a routed PO physically is right now, same text as the PO's own list.
      orders: {
        select: {
          id: true, poNumber: true, status: true, dispatchedAt: true,
          deliveryLocation: { select: { name: true } },
          transitStops: { orderBy: { sequence: 'asc' }, select: { location: { select: { name: true } } } },
          transitTransfers: {
            where: { status: { in: ['PENDING', 'DISPATCHED'] } },
            orderBy: { legSequence: 'desc' },
            take: 1,
            select: { status: true, fromLocation: { select: { name: true } }, toLocation: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  const userIds = [...new Set(requests.map(r => r.requestedById))]
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
  const userMap = new Map(users.map(u => [u.id, u]))
  return NextResponse.json(
    requests.map(r => ({
      ...r,
      tripBooking: undefined,
      openTrip: undefined,
      trip: tripOf(r),
      itemCount: r.items.length,
      itemNames: r.items.map(i => i.itemName),
      // Warehouse already decided at least one line — Force Verify is no longer offered.
      warehouseStarted: r.items.some(i => !!i.warehouseDecision || !!i.convertedAt),
      // Warehouse still owns lines here — DRAFT, or a parallel ON_PROCESS PR not yet finished.
      warehousePending: r.status === 'DRAFT' || (r.status === 'ON_PROCESS' && !r.warehouseDoneAt && r.items.some(i => i.viaWarehouse)),
      totalBudget: r.items.reduce((s, i) => s + i.quantity * i.estimatedCost, 0),
      // Part of a line couldn't ship from stock yet (backorder waiting for restock at the
      // warehouse) — the PR stays outstanding until allocateBackorders() sends the rest.
      outstanding: r.status !== 'CANCELLED' && r.status !== 'REJECTED' && r.items.some(i => i.backorderQty > 0),
      // createdBy is always the ERP login that submitted the PR (e.g. a warehouse account).
      // requestedByEmployee (already in the include) is who it's actually for — optional,
      // e.g. warehouse forwarding a specific ship crew member's request. Both are exposed
      // separately so the UI can show "Created by X · Requested by Y" instead of picking one.
      createdBy: userMap.get(r.requestedById) ?? null,
      // Requests submitted via the internal Request Order page carry a real requestedByEmployee;
      // prefer that for display, falling back to the ERP user for requests created inside Purchasing.
      requestedBy: r.requestedByEmployee
        ? { name: `${r.requestedByEmployee.fullName} (${r.requestedByEmployee.employeeNumber})` }
        : (userMap.get(r.requestedById) ?? null),
      items: undefined,
      orders: r.orders.map(o => ({
        id: o.id,
        poNumber: o.poNumber,
        status: o.status,
        dispatchedAt: o.dispatchedAt,
        deliveryLocation: o.deliveryLocation,
        currentLegLabel: computeCurrentLegLabel(o),
      })),
    })),
  )
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { deliveryLocationId, notes, items, requestedByEmployeeId, neededByDate, isUrgent, urgentReason, purpose, tripBookingId, openTripId } = body as {
    deliveryLocationId?: string; notes?: string
    items?: { itemId?: string; itemName: string; quantity: number; unit: string; estimatedCost?: number; supplierId?: string; supplierName?: string; notes?: string; imageKeys?: string[]; sourceInventoryItemId?: string; requestType?: 'NEW' | 'REPLACEMENT'; damageDetail?: string }[]
    requestedByEmployeeId?: string; neededByDate?: string; isUrgent?: boolean; urgentReason?: string
    purpose?: 'STOCK_INVENTORY' | 'TRIP'; tripBookingId?: string; openTripId?: string
  }

  // Same validation as the public /request-order intake (POST /api/hr/request-orders) —
  // the two forms create the same PurchaseRequest/PurchaseRequestItem rows and should
  // reject the same bad input, regardless of which one it came through.
  if (!deliveryLocationId) return NextResponse.json({ error: 'Please select a delivery location' }, { status: 400 })
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Add at least one item to the request' }, { status: 400 })
  }
  for (const it of items) {
    if (!it.itemName?.trim()) return NextResponse.json({ error: 'Every item needs a name or description' }, { status: 400 })
    if (!it.quantity || Number(it.quantity) <= 0) return NextResponse.json({ error: `Quantity for "${it.itemName}" must be greater than 0` }, { status: 400 })
  }
  if (isUrgent && !urgentReason?.trim()) {
    return NextResponse.json({ error: 'Please explain why this request is urgent' }, { status: 400 })
  }
  for (const it of items) {
    if (it.requestType === 'REPLACEMENT' && !it.damageDetail?.trim()) {
      return NextResponse.json({ error: `Please describe the damage on "${it.itemName}" (replacement)` }, { status: 400 })
    }
  }
  if (purpose && !['STOCK_INVENTORY', 'TRIP'].includes(purpose)) {
    return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 })
  }
  if (purpose === 'TRIP' && !tripBookingId && !openTripId) {
    return NextResponse.json({ error: 'Please select which trip this request is for' }, { status: 400 })
  }
  const loc = await db.stockLocation.findUnique({ where: { id: deliveryLocationId }, select: { id: true } })
  if (!loc) return NextResponse.json({ error: 'Selected vessel/location was not found' }, { status: 400 })
  const tripLink = purpose === 'TRIP' ? await resolveTripLink(db, { tripBookingId, openTripId }) : { tripBookingId: null, openTripId: null }
  if ('error' in tripLink) return NextResponse.json({ error: 'Selected trip was not found' }, { status: 400 })
  const inventoryItemIds = [...new Set(items.map(it => it.sourceInventoryItemId).filter((x): x is string => !!x))]
  if (inventoryItemIds.length > 0) {
    const foundInventoryItems = await db.inventoryItem.findMany({ where: { id: { in: inventoryItemIds } }, select: { id: true } })
    if (foundInventoryItems.length !== inventoryItemIds.length) {
      return NextResponse.json({ error: 'One or more selected inventory items were not found' }, { status: 400 })
    }
  }

  // Route to the requester's manager for approval, same as the public /request-order
  // intake — every PR needs its requester's manager to sign off regardless of who's
  // creating it (including Purchasing/Admin creating their own request), unless the org
  // chart genuinely has no usable manager on file. The requester is whoever this PR is
  // for: the explicit requestedByEmployeeId when Purchasing is filing on someone else's
  // behalf, otherwise the logged-in user's own Employee profile.
  // Boat Captain / Cruise Director may only file on behalf of their own yacht's crew.
  if (requestedByEmployeeId && !roleMatches(role, ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']) && roleMatches(role, ['BOAT_CAPTAIN', 'CRUISE_DIRECTOR'])) {
    const ok = await db.employee.count({ where: { id: requestedByEmployeeId, ...(await yachtCrewWhere(db, session.user.id)) } })
    if (!ok) return NextResponse.json({ error: 'You can only request on behalf of your own yacht crew' }, { status: 403 })
  }
  const requesterEmployee = requestedByEmployeeId
    ? await db.employee.findUnique({ where: { id: requestedByEmployeeId }, select: { id: true, fullName: true, managerId: true } })
    : await db.employee.findUnique({ where: { userId: session.user.id }, select: { id: true, fullName: true, managerId: true } })
  const manager = requesterEmployee?.managerId
    ? await db.employee.findUnique({ where: { id: requesterEmployee.managerId }, select: { id: true, userId: true } })
    : null
  const approverEmployeeId = manager?.userId ? manager.id : null
  // Per-line route (Warehouse stock check vs straight to Purchasing, see routePrLines). Only
  // an all-Warehouse PR waits in DRAFT; any direct line puts it ON_PROCESS so Purchasing can
  // start while Warehouse checks the rest in parallel.
  const via = await routePrLines(db, deliveryLocationId || null, items.map(it => ({ itemId: it.itemId || null })))

  const prNumber = await generatePrNumber(db)
  const request = await db.purchaseRequest.create({
    data: {
      id: crypto.randomUUID(),
      prNumber,
      requestedById: session.user.id,
      requestedByEmployeeId: requestedByEmployeeId || null,
      approverEmployeeId,
      deliveryLocationId: deliveryLocationId || null,
      notes: notes?.trim() || null,
      neededByDate: neededByDate ? new Date(neededByDate) : null,
      isUrgent: !!isUrgent,
      urgentReason: isUrgent ? (urgentReason?.trim() || null) : null,
      purpose: purpose === 'TRIP' ? 'TRIP' : 'STOCK_INVENTORY',
      tripBookingId: tripLink.tripBookingId,
      openTripId: tripLink.openTripId,
      status: approverEmployeeId ? 'PENDING_APPROVAL' : initialPrStatus(via),
      updatedAt: new Date(),
      items: {
        create: items.map((it, idx) => ({
          id: crypto.randomUUID(),
          itemId: it.itemId || null,
          viaWarehouse: via[idx],
          itemName: it.itemName,
          quantity: Number(it.quantity),
          unit: it.unit,
          estimatedCost: Number(it.estimatedCost) || 0,
          supplierId: it.supplierId || null,
          supplierName: it.supplierName?.trim() || null,
          notes: it.notes?.trim() || null,
          imageKeys: Array.isArray(it.imageKeys) ? it.imageKeys.filter(Boolean) : [],
          sourceInventoryItemId: it.sourceInventoryItemId || null,
          requestType: it.requestType === 'REPLACEMENT' ? 'REPLACEMENT' : 'NEW',
          damageDetail: it.requestType === 'REPLACEMENT' ? (it.damageDetail?.trim() || null) : null,
        })),
      },
    },
    include: { items: true },
  })

  // Filed on someone else's behalf (e.g. crew for another crew member) — name the
  // person who actually created it so the approver sees who's accountable for it.
  const creatorEmployee = requestedByEmployeeId
    ? await db.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } })
    : null
  const onBehalfNote = requestedByEmployeeId && creatorEmployee?.id !== requestedByEmployeeId
    ? ` (created by ${session.user.name ?? 'another user'})`
    : ''

  if (approverEmployeeId && manager?.userId) {
    // Awaiting manager sign-off — Warehouse hears about this request only after it's
    // approved (see [id]/approval/route.ts), not now.
    db.notification.create({
      data: {
        userId: manager.userId,
        type: isUrgent ? 'PR_APPROVAL_URGENT' : 'PR_APPROVAL_NEEDED',
        title: isUrgent ? '🔴 Urgent request needs your approval' : 'Request needs your approval',
        body: `${requesterEmployee?.fullName ?? 'A request'}${onBehalfNote} — ${prNumber} is waiting for your approval.${isUrgent ? ` URGENT: ${urgentReason?.trim()}` : ''}`,
        requestId: request.id,
      },
    }).catch(() => {})
    sendPushToUser(db, manager.userId, {
      title: isUrgent ? '🔴 Urgent request needs your approval' : 'Request needs your approval',
      body: `${requesterEmployee?.fullName ?? 'A request'}${onBehalfNote} — ${prNumber} is waiting for your approval.`,
      url: '/',
    }).catch(() => {})
  } else {
    // No usable manager on file — the PR is live now: tell Purchasing about its direct lines
    // and Warehouse about the ones waiting for a stock check (skipping whoever created it).
    await notifyPrRouted(db, { id: request.id, prNumber, division: request.division ?? null }, via, {
      type: 'REQUEST_ORDER_SUBMITTED',
      skipPurchasing: roleMatches(role, PURCHASING_ROLES),
      skipWarehouse: roleMatches(role, WAREHOUSE_ROLES),
    })
  }

  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  return NextResponse.json(request, { status: 201 })
}
