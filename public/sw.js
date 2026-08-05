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
