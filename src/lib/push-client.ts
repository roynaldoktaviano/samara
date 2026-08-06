// Browser-side half of Web Push — pairs with src/lib/push.ts (server) and
// public/sw.js (the push/notificationclick handlers). Only called from client
// components; never imported into server code.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)))
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function subscribeToPush(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPushSupported()) return { ok: false, error: 'Push notifications are not supported in this browser' }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) return { ok: false, error: 'Push is not configured' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, error: 'Permission denied' }

  try {
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
    }

    const json = subscription.toJSON()
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent }),
    })
    if (!res.ok) return { ok: false, error: 'Failed to save subscription' }
    return { ok: true }
  } catch (err) {
    console.error('[push-client] subscribe failed:', err)
    return { ok: false, error: 'Failed to subscribe' }
  }
}
