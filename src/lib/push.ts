import webpush from 'web-push'
import type { PrismaClient } from '@prisma/client'

let configured = false
function ensureConfigured() {
  if (configured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID keys are not configured (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT)')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

interface PushPayload {
  title: string
  body: string
  url?: string
}

// Sends a browser/OS push to every device the user has subscribed on. Best-effort: a
// subscription that the push service reports as gone (404/410 — user revoked
// permission, uninstalled, etc.) is pruned so we stop wasting sends on it. Failures
// never throw past this function — push is a bonus channel on top of the in-app
// notification bell, not the source of truth.
export async function sendPushToUser(db: PrismaClient, userId: string, payload: PushPayload): Promise<void> {
  try {
    ensureConfigured()
  } catch (err) {
    console.error('[push] not configured:', err)
    return
  }

  const subscriptions = await db.pushSubscription.findMany({ where: { userId } })
  if (subscriptions.length === 0) return

  await Promise.all(
    subscriptions.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        )
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
        } else {
          console.error('[push] send failed for subscription', sub.id, err)
        }
      }
    }),
  )
}

export async function sendPushToUsers(db: PrismaClient, userIds: string[], payload: PushPayload): Promise<void> {
  await Promise.all(userIds.map(userId => sendPushToUser(db, userId, payload)))
}
