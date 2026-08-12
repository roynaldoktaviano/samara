import { getDb } from '@/lib/get-db'
import { Session } from 'next-auth'
import { sendPushToUsers } from '@/lib/push'

type Db = Awaited<ReturnType<typeof getDb>>

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
