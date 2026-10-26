import type { Prisma } from '@prisma/client'
import type { getDb } from '@/lib/get-db'
import { notifyByRoleForRequest, notifyPurchasingForRequest, notifyRequester } from '@/lib/notify-purchasing'

type Db = Awaited<ReturnType<typeof getDb>>
type DbOrTx = Db | Prisma.TransactionClient

// Keeps a PR honest when something that was going to fulfil its lines stops: a Transfer or PO is
// cancelled, the warehouse ships less than it promised, or the PR itself is rejected/cancelled.
// Before this, those lines stayed "converted" — the PR looked done while nothing was coming.

/** A line back to "not decided yet": Warehouse (via lines) or Purchasing (direct) picks it up again. */
export const RESET_LINE = {
  convertedAt: null,
  convertedPoId: null,
  warehouseDecision: null,
  warehouseCheckedById: null,
  warehouseCheckedAt: null,
  warehouseCheckNote: null,
  backorderQty: 0,
  backorderLocationId: null,
} as const

const LIVE_TR = ['PENDING', 'DISPATCHED', 'RECEIVED'] as const

/**
 * After reopening lines, move the PR back to where they get worked on: DRAFT when everything left
 * is an untouched Warehouse line, else ON_PROCESS. Reopened Warehouse lines reopen the warehouse
 * check (warehouseDoneAt = null) so the Process button shows again.
 */
export async function settleReopenedPr(db: DbOrTx, requestId: string) {
  const pr = await db.purchaseRequest.findUnique({
    where: { id: requestId },
    select: { status: true, items: { select: { viaWarehouse: true, convertedAt: true, verifyRejectedAt: true, warehouseDecision: true } } },
  })
  if (!pr || !['DRAFT', 'ON_PROCESS', 'CONVERTED'].includes(pr.status)) return
  const open = pr.items.filter(i => !i.verifyRejectedAt)
  const fresh = (i: (typeof open)[number]) => i.viaWarehouse && !i.convertedAt && !i.warehouseDecision
  const warehouseAgain = open.some(fresh)
  const status = open.length > 0 && open.every(fresh) ? 'DRAFT' : 'ON_PROCESS'
  await db.purchaseRequest.update({
    where: { id: requestId },
    data: {
      status,
      ...(warehouseAgain && { warehouseDoneAt: null }),
      ...(pr.status === 'CONVERTED' && { convertedAt: null, convertedById: null }),
      updatedAt: new Date(),
    },
  })
}

/**
 * A PR Transfer (not a PO transit leg) was cancelled before dispatch. Per item on it:
 *  - nothing else of this PR carries the item → its line(s) reopen completely (Warehouse processes
 *    it again, or Purchasing converts it again if it was Purchasing's transfer pick);
 *  - another live TR of this PR already carries part of it → the cancelled qty goes back to the
 *    line's backorder, so it ships once stock lands (allocateBackorders).
 * Returns the item names put back, for the caller's message.
 */
export async function reopenForCancelledTransfer(db: Db, transferId: string, actorUserId: string): Promise<string[]> {
  const transfer = await db.stockTransfer.findUnique({
    where: { id: transferId },
    select: {
      transferNumber: true, fromLocationId: true, purchaseRequestId: true, purchaseOrderId: true,
      items: { select: { itemId: true, itemName: true, requestedQty: true } },
    },
  })
  if (!transfer?.purchaseRequestId || transfer.purchaseOrderId) return []
  const pr = await db.purchaseRequest.findUnique({
    where: { id: transfer.purchaseRequestId },
    select: {
      id: true, prNumber: true, status: true, division: true,
      transfers: { where: { id: { not: transferId }, status: { in: [...LIVE_TR] } }, select: { items: { select: { itemId: true } } } },
      items: { select: { id: true, itemId: true, itemName: true, viaWarehouse: true, convertedAt: true, convertedPoId: true, verifyRejectedAt: true, backorderLocationId: true } },
    },
  })
  if (!pr || ['CANCELLED', 'REJECTED'].includes(pr.status)) return []

  const stillCarried = new Set(pr.transfers.flatMap(t => t.items.map(i => i.itemId)).filter(Boolean) as string[])
  const reopened: string[] = []
  let directReopened = false
  for (const ti of transfer.items) {
    if (!ti.itemId) continue
    const lines = pr.items.filter(l => l.itemId === ti.itemId && l.convertedAt && !l.convertedPoId && !l.verifyRejectedAt)
    if (!lines.length) continue
    if (stillCarried.has(ti.itemId)) {
      const line = lines[0]
      await db.purchaseRequestItem.update({
        where: { id: line.id },
        data: { backorderQty: { increment: ti.requestedQty }, backorderLocationId: line.backorderLocationId ?? transfer.fromLocationId },
      })
    } else {
      await db.purchaseRequestItem.updateMany({ where: { id: { in: lines.map(l => l.id) } }, data: RESET_LINE })
      if (lines.some(l => !l.viaWarehouse)) directReopened = true
    }
    reopened.push(ti.itemName)
  }
  if (!reopened.length) return []
  await settleReopenedPr(db, pr.id)

  const body = `${transfer.transferNumber} was cancelled — ${reopened.join(', ')} on ${pr.prNumber} ${reopened.length === 1 ? 'needs' : 'need'} to be processed again.`
  await notifyByRoleForRequest(db, ['WAREHOUSE', 'ADMIN'], 'PR_TRANSFER_CANCELLED', 'Transfer cancelled', body, pr.id).catch(console.error)
  if (directReopened) await notifyPurchasingForRequest(db, pr.division ?? null, 'PR_TRANSFER_CANCELLED', 'Transfer cancelled', body, pr.id).catch(console.error)
  await notifyRequester(db, pr.id, { type: 'PR_TRANSFER_CANCELLED', title: 'Warehouse shipment cancelled', body, skipUserId: actorUserId }).catch(console.error)
  return reopened
}

/** A PO made from a PR was cancelled — its PR lines go back to Purchasing to convert again (or reject). */
export async function reopenForCancelledPo(db: Db, orderId: string, actorUserId: string): Promise<void> {
  const po = await db.purchaseOrder.findUnique({ where: { id: orderId }, select: { poNumber: true, requestId: true } })
  const lines = await db.purchaseRequestItem.findMany({ where: { convertedPoId: orderId }, select: { id: true, itemName: true, requestId: true } })
  if (!po || !lines.length) return
  const requestIds = [...new Set(lines.map(l => l.requestId))]
  await db.purchaseRequestItem.updateMany({ where: { id: { in: lines.map(l => l.id) } }, data: { convertedAt: null, convertedPoId: null } })
  for (const requestId of requestIds) {
    const pr = await db.purchaseRequest.findUnique({ where: { id: requestId }, select: { prNumber: true, status: true, division: true } })
    if (!pr || ['CANCELLED', 'REJECTED'].includes(pr.status)) continue
    await settleReopenedPr(db, requestId)
    const names = lines.filter(l => l.requestId === requestId).map(l => l.itemName)
    const body = `${po.poNumber} was cancelled — ${names.join(', ')} on ${pr.prNumber} ${names.length === 1 ? 'is' : 'are'} back on the request to convert again or reject.`
    await notifyPurchasingForRequest(db, pr.division ?? null, 'PR_PO_CANCELLED', 'PO cancelled', body, requestId).catch(console.error)
    await notifyRequester(db, requestId, { type: 'PR_PO_CANCELLED', title: 'Order cancelled', body, skipUserId: actorUserId }).catch(console.error)
  }
}

/**
 * The warehouse dispatched less than a PR Transfer asked for. The shortfall goes back on the PR
 * line's backorder at the source warehouse — it ships once stock lands there — instead of
 * silently disappearing. `short` is per catalog item, in base units.
 */
export async function backorderShortDispatch(db: Db, transfer: { transferNumber: string; fromLocationId: string; purchaseRequestId: string }, short: { itemId: string; itemName: string; qty: number }[], actorUserId: string) {
  if (!short.length) return
  const pr = await db.purchaseRequest.findUnique({
    where: { id: transfer.purchaseRequestId },
    select: { id: true, prNumber: true, status: true, division: true, items: { select: { id: true, itemId: true, convertedAt: true, convertedPoId: true, verifyRejectedAt: true, backorderLocationId: true } } },
  })
  if (!pr || ['CANCELLED', 'REJECTED'].includes(pr.status)) return
  const noted: string[] = []
  for (const s of short) {
    const line = pr.items.find(l => l.itemId === s.itemId && l.convertedAt && !l.convertedPoId && !l.verifyRejectedAt)
    if (!line) continue
    await db.purchaseRequestItem.update({
      where: { id: line.id },
      data: { backorderQty: { increment: s.qty }, backorderLocationId: line.backorderLocationId ?? transfer.fromLocationId },
    })
    noted.push(`${s.itemName} ${Math.round(s.qty * 100) / 100}`)
  }
  if (!noted.length) return
  const body = `${transfer.transferNumber} shipped short for ${pr.prNumber}: ${noted.join(', ')} backordered — it will ship once stock arrives at the warehouse.`
  await notifyByRoleForRequest(db, ['WAREHOUSE', 'ADMIN'], 'PR_SHORT_SHIPPED', 'Transfer shipped short', body, pr.id).catch(console.error)
  await notifyPurchasingForRequest(db, pr.division ?? null, 'PR_SHORT_SHIPPED', 'Transfer shipped short', body, pr.id).catch(console.error)
  await notifyRequester(db, pr.id, { type: 'PR_SHORT_SHIPPED', title: 'Part of your items is backordered', body, skipUserId: actorUserId }).catch(console.error)
}

/**
 * Rejecting/cancelling a whole PR. Refused once anything is really under way (a PO past Draft, a
 * Transfer already shipped) — reject the remaining lines one by one instead. Otherwise everything
 * still pending is called off: PENDING Transfers cancelled (stock un-reserved), Draft POs cancelled,
 * backorders cleared, and converted lines reset so a later Reopen starts clean.
 * Returns an error message, or null when done.
 */
export async function stopPrFulfilment(db: Db, requestId: string, verb: 'rejected' | 'cancelled', actorName: string | null): Promise<string | null> {
  const pr = await db.purchaseRequest.findUnique({
    where: { id: requestId },
    select: {
      prNumber: true,
      orders: { where: { status: { notIn: ['DRAFT', 'CANCELLED'] } }, select: { poNumber: true } },
      transfers: { where: { status: { in: ['DISPATCHED', 'RECEIVED'] } }, select: { transferNumber: true } },
    },
  })
  if (!pr) return 'Request not found'
  const moving = [...pr.orders.map(o => o.poNumber), ...pr.transfers.map(t => t.transferNumber)]
  if (moving.length) {
    return `Some items are already ordered or shipped (${moving.join(', ')}) — reject the remaining items one by one instead.`
  }
  const now = new Date()
  await db.$transaction([
    db.stockTransfer.updateMany({ where: { purchaseRequestId: requestId, status: 'PENDING' }, data: { status: 'CANCELLED', updatedAt: now } }),
    db.purchaseOrder.updateMany({
      where: { requestId, status: 'DRAFT' },
      data: { status: 'CANCELLED', cancelledAt: now, cancelledByName: actorName, cancellationReason: `${pr.prNumber} was ${verb}`, updatedAt: now },
    }),
    db.purchaseRequestItem.updateMany({ where: { requestId, verifyRejectedAt: null }, data: RESET_LINE }),
  ])
  return null
}
