import { getDb } from '@/lib/get-db'
import { Session } from 'next-auth'
import { sendPushToUsers } from '@/lib/push'
import { computePOGrandTotal, summarizePOPayments } from '@/lib/po-payment'

type Db = Awaited<ReturnType<typeof getDb>>

export const PURCHASING_ROLES = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function notifyByRole(
  db: Db,
  roles: string[],
  type: string,
  title: string,
  body: string,
  orderId: string,
) {
  const users = await db.user.findMany({
    where: { role: { in: roles as never[] } },
    select: { id: true },
  })
  if (!users.length) return

  await db.notification.createMany({
    data: users.map((u) => ({
      id: crypto.randomUUID(),
      userId: u.id,
      type,
      title,
      body,
      orderId,
    })),
    skipDuplicates: true,
  })

  // Real device/OS push on top of the in-app bell above — this is what actually shows
  // up in the notification tray while the app/tab is closed. Best-effort: sendPushToUser
  // never throws past itself (see src/lib/push.ts), so a push failure never blocks the
  // in-app notification that already landed.
  sendPushToUsers(db, users.map(u => u.id), { title, body }).catch(console.error)
}

// Same as notifyByRole above, but links the notification to a PurchaseRequest
// (Notification.requestId) instead of a PurchaseOrder — used for PR-stage events
// (e.g. a new PR submitted) that happen before any PO exists yet.
export async function notifyByRoleForRequest(
  db: Db,
  roles: string[],
  type: string,
  title: string,
  body: string,
  requestId: string,
) {
  const users = await db.user.findMany({
    where: { role: { in: roles as never[] } },
    select: { id: true },
  })
  if (!users.length) return

  await db.notification.createMany({
    data: users.map((u) => ({
      id: crypto.randomUUID(),
      userId: u.id,
      type,
      title,
      body,
      requestId,
    })),
    skipDuplicates: true,
  })

  sendPushToUsers(db, users.map(u => u.id), { title, body }).catch(console.error)
}

// Routes a PR-stage notification to whichever Purchasing staffer is assigned that PR's
// division (User.purchasingDivision) instead of broadcasting to the whole team. Falls
// back to notifyByRoleForRequest (everyone in Purchasing/Admin) when the PR has no
// division set, or nobody's been assigned to that division yet — this is what keeps a
// newly-added division (no account created for it yet) from silently dropping requests.
export async function notifyPurchasingForRequest(
  db: Db,
  division: string | null,
  type: string,
  title: string,
  body: string,
  requestId: string,
) {
  if (division) {
    const assigned = await db.user.findMany({
      where: { purchasingDivision: division as never },
      select: { id: true },
    })
    if (assigned.length) {
      await db.notification.createMany({
        data: assigned.map(u => ({ id: crypto.randomUUID(), userId: u.id, type, title, body, requestId })),
        skipDuplicates: true,
      })
      sendPushToUsers(db, assigned.map(u => u.id), { title, body }).catch(console.error)
      return
    }
  }
  await notifyByRoleForRequest(db, PURCHASING_ROLES, type, title, body, requestId)
}

// Progress updates back to whoever a PR is from — both the ERP login that submitted it
// (requestedById) and, when filed on someone else's behalf, that employee's own login
// (requestedByEmployee.userId), de-duplicated. `skipUserId` is the person acting right
// now, so nobody gets told about their own action. Never throws: progress pings are
// best-effort and must not fail the action that triggered them.
export async function notifyRequester(
  db: Db,
  requestId: string,
  opts: { type: string; title: string; body: string; skipUserId?: string },
) {
  try {
    const pr = await db.purchaseRequest.findUnique({
      where: { id: requestId },
      select: { requestedById: true, requestedByEmployee: { select: { userId: true } } },
    })
    if (!pr) return
    const userIds = [...new Set([pr.requestedById, pr.requestedByEmployee?.userId].filter((x): x is string => !!x))]
      .filter(u => u !== opts.skipUserId)
    if (!userIds.length) return
    await db.notification.createMany({
      data: userIds.map(userId => ({ id: crypto.randomUUID(), userId, type: opts.type, title: opts.title, body: opts.body, requestId })),
      skipDuplicates: true,
    })
    sendPushToUsers(db, userIds, { title: opts.title, body: opts.body }).catch(console.error)
  } catch (e) {
    console.error('notifyRequester failed', e)
  }
}

// Same as notifyRequester, for PO-stage events — resolves the PO's source PR first.
// No-op for a PO created directly in Purchasing without a PR.
export async function notifyRequesterForOrder(
  db: Db,
  orderId: string,
  opts: { type: string; title: string; body: string; skipUserId?: string },
) {
  const po = await db.purchaseOrder.findUnique({ where: { id: orderId }, select: { requestId: true } }).catch(() => null)
  if (po?.requestId) await notifyRequester(db, po.requestId, opts)
}

/** Tells the PR's requester their goods have reached the final destination — called
 * wherever a PO finalizes (a direct goods receipt in receiveGoods, or the last transit
 * leg in receiveTransferLeg), since both flows end the PO the same way. */
export function notifyPoArrivalToRequester(
  db: Db, orderId: string, newStatus: 'RECEIVED' | 'PARTIALLY_RECEIVED', poNumber: string | null, actingUserId: string | null,
) {
  notifyRequesterForOrder(db, orderId, {
    type: newStatus === 'RECEIVED' ? 'PR_PO_RECEIVED' : 'PR_PO_PARTIALLY_RECEIVED',
    title: newStatus === 'RECEIVED' ? 'Barang request kamu sudah sampai' : 'Barang request kamu sampai sebagian',
    body: newStatus === 'RECEIVED'
      ? `${poNumber ?? 'PO'} sudah diterima lengkap di lokasi tujuan.`
      : `${poNumber ?? 'PO'} baru diterima sebagian di lokasi tujuan.`,
    skipUserId: actingUserId ?? undefined,
  }).catch(console.error)
}

// Auto-delivers a receive link to whichever Boat Captain/Cruise Director is assigned
// (User.assignedYachtId) to `yachtId` — fired the moment a PO/Transfer starts moving
// toward their specific boat, instead of Purchasing manually generating and forwarding
// the link. `url` is the relative /po-receive or /crew-receive path; the push payload's
// `url` is what public/sw.js opens directly when the notification is tapped. No-op if
// nobody's been assigned to that yacht yet.
export async function notifyAssignedYachtCaptains(
  db: Db,
  yachtId: string,
  opts: { type: string; title: string; body: string; url: string; orderId?: string },
) {
  const users = await db.user.findMany({
    where: { role: { in: ['BOAT_CAPTAIN', 'CRUISE_DIRECTOR'] as never[] }, assignedYachtId: yachtId },
    select: { id: true },
  })
  if (!users.length) return

  await db.notification.createMany({
    data: users.map(u => ({
      id: crypto.randomUUID(),
      userId: u.id,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      ...(opts.orderId ? { orderId: opts.orderId } : {}),
    })),
    skipDuplicates: true,
  })

  sendPushToUsers(db, users.map(u => u.id), { title: opts.title, body: opts.body, url: opts.url }).catch(console.error)
}

// Called after any single installment (Request Payment / Debit Paid / Reimburse) is
// marked PAID — recomputes the PO's aggregate payment status across ALL installments
// and, if that now clears the grand total, reminds Purchasing it's ready to ship.
// Only fires while still ORDERED so it doesn't nag once "Mark as In Delivery" has
// already happened; naturally fires exactly once since a fully-paid PO can't un-pay.
export async function notifyIfPOFullyPaid(db: Db, orderId: string) {
  const order = await db.purchaseOrder.findUnique({
    where: { id: orderId },
    select: {
      status: true, poNumber: true, supplierName: true,
      discountType: true, discountValue: true, extraCharges: true,
      items: { select: { orderedQty: true, unitCost: true, discountType: true, discountValue: true } },
      paymentRequests: { select: { amount: true, status: true } },
      reimbursements: { select: { amount: true, status: true } },
    },
  })
  if (!order || order.status !== 'ORDERED') return

  const grandTotal = computePOGrandTotal(order)
  const { paymentStatus } = summarizePOPayments(grandTotal, order.paymentRequests, order.reimbursements)
  if (paymentStatus !== 'PAID') return

  await notifyByRole(db, ['PURCHASING', 'ADMIN', 'SUPER_ADMIN'], 'PO_FULLY_PAID',
    'PO Lunas — Siap Dikirim',
    `${order.poNumber}${order.supplierName ? ` — ${order.supplierName}` : ''} sudah lunas. Yuk proses pengiriman barangnya.`,
    orderId,
  )
}
