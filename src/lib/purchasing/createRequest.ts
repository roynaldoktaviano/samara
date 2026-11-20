import type { Session } from 'next-auth'
import type { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'
import { PURCHASING_ROLES } from '@/lib/notify-purchasing'
import { routePrLines, initialPrStatus, notifyPrRouted } from '@/lib/purchasing/requestItems'
import { sendPushToUser } from '@/lib/push'
import { resolveTripLink } from '@/lib/purchasing/tripLink'
import { resolveAssignedYachtId, yachtCrewWhere } from '@/lib/purchasing/yachtScope'
import { generatePrNumber } from '@/lib/purchasing/docNumber'

const WAREHOUSE_ROLES = ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']

export interface CreatePurchaseRequestBody {
  deliveryLocationId?: string; notes?: string
  items?: { itemId?: string; itemName: string; quantity: number; unit: string; estimatedCost?: number; supplierId?: string; supplierName?: string; notes?: string; imageKeys?: string[]; sourceInventoryItemId?: string; requestType?: 'NEW' | 'REPLACEMENT'; damageDetail?: string }[]
  requestedByEmployeeId?: string; neededByDate?: string; isUrgent?: boolean; urgentReason?: string
  purpose?: 'STOCK_INVENTORY' | 'TRIP'; tripBookingId?: string; openTripId?: string
}

type Db = Awaited<ReturnType<typeof getDb>>
export type CreatePurchaseRequestResult =
  | { ok: false; error: string; status: number }
  | { ok: true; request: Awaited<ReturnType<Db['purchaseRequest']['create']>> }

const fail = (error: string, status = 400): CreatePurchaseRequestResult => ({ ok: false, error, status })

/**
 * Creates a PurchaseRequest — shared by Purchasing › Requests (POST /api/purchasing/requests)
 * and the self-service "Purchase Request" menu every employee has
 * (POST /api/purchasing/requests/mine). Same validation, same manager-approval routing
 * (requester's Employee.managerId → PENDING_APPROVAL → My Approvals) and the same
 * notifications, whichever screen it came from. Who may call it at all stays in the routes.
 */
export async function createPurchaseRequest(db: Db, session: Session, role: string, body: CreatePurchaseRequestBody): Promise<CreatePurchaseRequestResult> {
  const { deliveryLocationId, notes, items, requestedByEmployeeId, neededByDate, isUrgent, urgentReason, purpose, tripBookingId, openTripId } = body
  const userId = session.user.id

  // Same validation as the public /request-order intake (POST /api/hr/request-orders) —
  // the forms create the same PurchaseRequest/PurchaseRequestItem rows and should reject
  // the same bad input, regardless of which one it came through.
  if (!deliveryLocationId) return fail('Please select a delivery location')
  if (!items || !Array.isArray(items) || items.length === 0) return fail('Add at least one item to the request')
  for (const it of items) {
    if (!it.itemName?.trim()) return fail('Every item needs a name or description')
    if (!it.quantity || Number(it.quantity) <= 0) return fail(`Quantity for "${it.itemName}" must be greater than 0`)
  }
  if (isUrgent && !urgentReason?.trim()) return fail('Please explain why this request is urgent')
  for (const it of items) {
    if (it.requestType === 'REPLACEMENT' && !it.damageDetail?.trim()) {
      return fail(`Please describe the damage on "${it.itemName}" (replacement)`)
    }
  }
  if (purpose && !['STOCK_INVENTORY', 'TRIP'].includes(purpose)) return fail('Invalid purpose')
  if (purpose === 'TRIP' && !tripBookingId && !openTripId) return fail('Please select which trip this request is for')
  const loc = await db.stockLocation.findUnique({ where: { id: deliveryLocationId }, select: { id: true, yachtId: true } })
  if (!loc) return fail('Selected vessel/location was not found')
  // Boat Captain / Cruise Director only ever request for their own yacht — the form locks
  // "Deliver to" to it, this keeps a hand-crafted request from going anywhere else.
  if (roleMatches(role, ['BOAT_CAPTAIN', 'CRUISE_DIRECTOR']) && !roleMatches(role, ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE'])) {
    const yachtId = await resolveAssignedYachtId(db, userId)
    if (!yachtId) return fail('No yacht is assigned to your account yet — ask Admin to set it', 403)
    if (loc.yachtId !== yachtId) return fail('You can only request for your own yacht', 403)
  }
  const tripLink = purpose === 'TRIP' ? await resolveTripLink(db, { tripBookingId, openTripId }) : { tripBookingId: null, openTripId: null }
  if ('error' in tripLink) return fail('Selected trip was not found')
  const inventoryItemIds = [...new Set(items.map(it => it.sourceInventoryItemId).filter((x): x is string => !!x))]
  if (inventoryItemIds.length > 0) {
    const foundInventoryItems = await db.inventoryItem.findMany({ where: { id: { in: inventoryItemIds } }, select: { id: true } })
    if (foundInventoryItems.length !== inventoryItemIds.length) return fail('One or more selected inventory items were not found')
  }

  // Route to the requester's manager for approval, same as the public /request-order
  // intake — every PR needs its requester's manager to sign off regardless of who's
  // creating it (including Purchasing/Admin creating their own request), unless the org
  // chart genuinely has no usable manager on file. The requester is whoever this PR is
  // for: the explicit requestedByEmployeeId when Purchasing is filing on someone else's
  // behalf, otherwise the logged-in user's own Employee profile.
  // Boat Captain / Cruise Director may only file on behalf of their own yacht crew.
  if (requestedByEmployeeId && !roleMatches(role, ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']) && roleMatches(role, ['BOAT_CAPTAIN', 'CRUISE_DIRECTOR'])) {
    const ok = await db.employee.count({ where: { id: requestedByEmployeeId, ...(await yachtCrewWhere(db, userId)) } })
    if (!ok) return fail('You can only request on behalf of your own yacht crew', 403)
  }
  const requesterEmployee = requestedByEmployeeId
    ? await db.employee.findUnique({ where: { id: requestedByEmployeeId }, select: { id: true, fullName: true, managerId: true } })
    : await db.employee.findUnique({ where: { userId }, select: { id: true, fullName: true, managerId: true } })
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
      requestedById: userId,
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
    ? await db.employee.findUnique({ where: { userId }, select: { id: true } })
    : null
  const onBehalfNote = requestedByEmployeeId && creatorEmployee?.id !== requestedByEmployeeId
    ? ` (created by ${session.user.name ?? 'another user'})`
    : ''

  if (approverEmployeeId && manager?.userId) {
    // Awaiting manager sign-off — Warehouse/Purchasing hear about this request only after
    // it's approved (see [id]/approval/route.ts), not now.
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

  return { ok: true, request }
}
