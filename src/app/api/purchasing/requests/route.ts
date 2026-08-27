import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { notifyByRoleForRequest } from '@/lib/notify-purchasing'
import { computeCurrentLegLabel } from '@/lib/purchasing/transitChain'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { sendPushToUser } from '@/lib/push'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE', 'CREW', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR']
const PURCHASING_ROLES = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']
// Roles that only ever see/create their own submissions — never Purchasing's full queue.
const OWN_ONLY_ROLES = ['WAREHOUSE', 'CREW', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR']

async function generatePrNumber(db: Awaited<ReturnType<typeof getDb>>) {
  const year = new Date().getFullYear()
  const month = String(new Date().getMonth() + 1).padStart(2, '0')
  const prefix = `PR-${year}${month}-`
  const last = await db.purchaseRequest.findFirst({
    where: { prNumber: { startsWith: prefix } },
    orderBy: { prNumber: 'desc' },
    select: { prNumber: true },
  })
  const seq = last ? (parseInt(last.prNumber.split('-').pop() ?? '0') || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  // Warehouse/Crew/Boat Captain/Cruise Director only ever see their own submissions,
  // not Purchasing's full queue — see OWN_ONLY_ROLES above.
  const isOwnOnly = OWN_ONLY_ROLES.includes(role)

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
      OR: [{ status: { not: 'PENDING_APPROVAL' } }, { requestedById: session.user.id }],
      ...(isOwnOnly ? { requestedById: session.user.id } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      items: { select: { id: true, quantity: true, estimatedCost: true, itemName: true } },
      deliveryLocation: { select: { id: true, name: true, type: true, managedBy: true, yachtId: true } },
      requestedByEmployee: { select: { id: true, fullName: true, employeeNumber: true } },
      verifiedBy: { select: { id: true, name: true } },
      tripBooking: { select: { id: true, bookingCode: true, yacht: { select: { name: true } } } },
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
      itemCount: r.items.length,
      itemNames: r.items.map(i => i.itemName),
      totalBudget: r.items.reduce((s, i) => s + i.quantity * i.estimatedCost, 0),
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
  const { deliveryLocationId, notes, items, requestedByEmployeeId, neededByDate, isUrgent, urgentReason, purpose, tripBookingId } = body as {
    deliveryLocationId?: string; notes?: string
    items?: { itemId?: string; itemName: string; quantity: number; unit: string; estimatedCost?: number; supplierId?: string; supplierName?: string; notes?: string; imageKeys?: string[] }[]
    requestedByEmployeeId?: string; neededByDate?: string; isUrgent?: boolean; urgentReason?: string
    purpose?: 'STOCK_INVENTORY' | 'TRIP'; tripBookingId?: string
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
  if (purpose && !['STOCK_INVENTORY', 'TRIP'].includes(purpose)) {
    return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 })
  }
  if (purpose === 'TRIP' && !tripBookingId) {
    return NextResponse.json({ error: 'Please select which trip this request is for' }, { status: 400 })
  }
  const loc = await db.stockLocation.findUnique({ where: { id: deliveryLocationId }, select: { id: true } })
  if (!loc) return NextResponse.json({ error: 'Selected vessel/location was not found' }, { status: 400 })
  if (purpose === 'TRIP' && tripBookingId) {
    const trip = await db.booking.findUnique({ where: { id: tripBookingId }, select: { id: true } })
    if (!trip) return NextResponse.json({ error: 'Selected trip was not found' }, { status: 400 })
  }

  // Route to the requester's manager for approval, same as the public /request-order
  // intake — every PR needs its requester's manager to sign off regardless of who's
  // creating it (including Purchasing/Admin creating their own request), unless the org
  // chart genuinely has no usable manager on file. The requester is whoever this PR is
  // for: the explicit requestedByEmployeeId when Purchasing is filing on someone else's
  // behalf, otherwise the logged-in user's own Employee profile.
  const requesterEmployee = requestedByEmployeeId
    ? await db.employee.findUnique({ where: { id: requestedByEmployeeId }, select: { id: true, fullName: true, managerId: true } })
    : await db.employee.findUnique({ where: { userId: session.user.id }, select: { id: true, fullName: true, managerId: true } })
  const manager = requesterEmployee?.managerId
    ? await db.employee.findUnique({ where: { id: requesterEmployee.managerId }, select: { id: true, userId: true } })
    : null
  const approverEmployeeId = manager?.userId ? manager.id : null

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
      tripBookingId: purpose === 'TRIP' ? (tripBookingId || null) : null,
      status: approverEmployeeId ? 'PENDING_APPROVAL' : 'DRAFT',
      updatedAt: new Date(),
      items: {
        create: items.map((it) => ({
          id: crypto.randomUUID(),
          itemId: it.itemId || null,
          itemName: it.itemName,
          quantity: Number(it.quantity),
          unit: it.unit,
          estimatedCost: Number(it.estimatedCost) || 0,
          supplierId: it.supplierId || null,
          supplierName: it.supplierName?.trim() || null,
          notes: it.notes?.trim() || null,
          imageKeys: Array.isArray(it.imageKeys) ? it.imageKeys.filter(Boolean) : [],
        })),
      },
    },
    include: { items: true },
  })

  if (approverEmployeeId && manager?.userId) {
    // Awaiting manager sign-off — Purchasing hears about this request only after it's
    // approved (see [id]/approval/route.ts), not now.
    db.notification.create({
      data: {
        userId: manager.userId,
        type: isUrgent ? 'PR_APPROVAL_URGENT' : 'PR_APPROVAL_NEEDED',
        title: isUrgent ? '🔴 Urgent request needs your approval' : 'Request needs your approval',
        body: `${requesterEmployee?.fullName ?? 'A request'} — ${prNumber} is waiting for your approval.${isUrgent ? ` URGENT: ${urgentReason?.trim()}` : ''}`,
        requestId: request.id,
      },
    }).catch(() => {})
    sendPushToUser(db, manager.userId, {
      title: isUrgent ? '🔴 Urgent request needs your approval' : 'Request needs your approval',
      body: `${requesterEmployee?.fullName ?? 'A request'} — ${prNumber} is waiting for your approval.`,
      url: '/',
    }).catch(() => {})
  } else if (!roleMatches(role, PURCHASING_ROLES)) {
    // No usable manager on file — fall back to notifying Purchasing directly, same as
    // before, so the request doesn't sit unseen. Skip when Purchasing/Admin themselves
    // created it, since they don't need to be told about their own action.
    notifyByRoleForRequest(
      db, PURCHASING_ROLES, 'REQUEST_ORDER_SUBMITTED', 'New purchase request submitted',
      `${prNumber} was submitted with ${request.items.length} item${request.items.length !== 1 ? 's' : ''} and is waiting for review.`,
      request.id,
    ).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  return NextResponse.json(request, { status: 201 })
}
