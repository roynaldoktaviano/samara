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
      items: { select: { orderedQty: true, unitCost: true } },
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
