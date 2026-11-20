import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { computeCurrentLegLabel } from '@/lib/purchasing/transitChain'
import { createPurchaseRequest, type CreatePurchaseRequestBody } from '@/lib/purchasing/createRequest'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { tripBookingSelect, openTripSelect, tripOf } from '@/lib/purchasing/tripLink'
import { resolveAssignedYachtId, yachtRequestWhere } from '@/lib/purchasing/yachtScope'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE', 'CREW', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR']
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
      // Purchasing/Admin do see them though — read-only, with the approver named — so they
      // know what's coming and whose sign-off it's stuck on.
      AND: [
        ...(roleMatches(role, ['PURCHASING', 'ADMIN', 'SUPER_ADMIN'])
          ? []
          : [{ OR: [{ status: { not: 'PENDING_APPROVAL' as const } }, { requestedById: session.user.id }] }]),
        ...(isOwnOnly
          ? [{ OR: [{ requestedById: session.user.id }, ...(yachtScope ? [yachtScope] : [])] }]
          : []),
        // A DRAFT PR is entirely Warehouse's (every line still waits for its stock check — see
        // initialPrStatus), so it isn't a purchase request for Purchasing yet. It shows up once
        // Warehouse processes it to ON_PROCESS. Admin still sees it (Force Verify); own ones stay.
        ...(roleMatches(role, ['PURCHASING']) && !roleMatches(role, ['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE'])
          ? [{ OR: [{ status: { not: 'DRAFT' as const } }, { requestedById: session.user.id }] }]
          : []),
        // Warehouse only deals with PRs headed to a ship (see routePrLines) — PRs for a warehouse
        // or an office/site go straight to Purchasing and stay out of its list (own ones aside).
        ...(roleMatches(role, ['WAREHOUSE'])
          ? [
              { OR: [{ requestedById: session.user.id }, { deliveryLocation: { type: 'VESSEL' as const } }, { items: { some: { viaWarehouse: true } } }] },
              // Auto Restock PRs (To Be Order from a Warehouse check) are Purchasing's alone — even
              // though they're filed under the Warehouse account that processed the source PR.
              { restockForRequestId: null },
            ]
          : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      items: {
        // Warehouse never sees restock lines (To Be Order bought for the warehouse).
        ...(roleMatches(role, ['WAREHOUSE']) && { where: { restockLocationId: null } }),
        select: { id: true, quantity: true, estimatedCost: true, itemName: true, warehouseDecision: true, convertedAt: true, viaWarehouse: true, backorderQty: true },
      },
      deliveryLocation: { select: { id: true, name: true, type: true, managedBy: true, yachtId: true } },
      requestedByEmployee: { select: { id: true, fullName: true, employeeNumber: true } },
      approverEmployee: { select: { id: true, fullName: true } },
      restockFor: { select: { id: true, prNumber: true } },
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
  const result = await createPurchaseRequest(db, session, role, await req.json() as CreatePurchaseRequestBody)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  return NextResponse.json(result.request, { status: 201 })
}
