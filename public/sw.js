// Minimal service worker — exists purely to satisfy "installable PWA" criteria.
// This ERP is data-heavy and near-always used online, so we deliberately do NOT
// cache API responses or HTML pages (stale bookings/inventory would be worse than
// no offline support at all). Only static, hashed build assets and icons are cached.
const CACHE_NAME = 'samara-erp-static-v1'
const STATIC_PATH_PREFIXES = ['/_next/static/', '/icons/', '/logo.svg']

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (!STATIC_PATH_PREFIXES.some((p) => url.pathname.startsWith(p))) return

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) cache.put(request, response.clone())
      return response
    })
  )
})

// Web Push — payload is JSON: { title, body, url }. Sent via src/lib/push.ts
// (web-push library) whenever the server calls sendPushToUser/sendPushToUsers.
self.addEventListener('push', (event) => {
  let data = { title: 'Samara ERP', body: 'You have a new notification.' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    if (event.data) data.body = event.data.text()
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    })
  )
})

// Focus an already-open tab if one exists (matching by origin), otherwise open a new
// one — avoids piling up duplicate tabs when the user taps several push notifications.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
