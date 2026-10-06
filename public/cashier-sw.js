// Cashier terminal service worker — registered only on the cashier subdomain (see
// ServiceWorkerRegister). Unlike the ERP's sw.js this one DOES keep the app working without
// signal: the vessel bar is often out of range at sea. It only caches the app shell (page HTML,
// JS/CSS chunks, fonts, product images). API data and the queue of unsynced sales live in the
// page itself (src/lib/cashier-offline.ts), never here.
const SHELL_CACHE = 'cashier-shell-v1'
const ASSET_CACHE = 'cashier-assets-v2'
const KEEP = [SHELL_CACHE, ASSET_CACHE]
const MAX_ASSETS = 400

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => trim(ASSET_CACHE, MAX_ASSETS))
      .then(() => self.clients.claim())
  )
})

async function trim(name, max) {
  const cache = await caches.open(name)
  const keys = await cache.keys()
  // Cache keys come back in insertion order — drop the oldest (stale build chunks pile up per deploy).
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

function isAsset(request, url) {
  if (url.origin === self.location.origin) {
    return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/app-icons/') || url.pathname.startsWith('/_next/image')
  }
  // Google Fonts + product/vessel images hosted elsewhere (R2 / CDN).
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || request.destination === 'image'
}

// The first visit loads the app before this worker controls the page, so none of it was cached
// on the way in — the page sends us what it loaded (see ServiceWorkerRegister) to store now, so
// the very next launch already works offline.
self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type !== 'precache') return
  event.waitUntil((async () => {
    if (data.page) {
      try {
        const response = await fetch(data.page, { credentials: 'same-origin' })
        if (response.ok) await (await caches.open(SHELL_CACHE)).put(new URL(data.page, self.location.origin).pathname, response)
      } catch { /* offline right now — the next online visit caches it */ }
    }
    const assets = await caches.open(ASSET_CACHE)
    await Promise.all((data.assets || []).map(async (u) => {
      try {
        const url = new URL(u, self.location.origin)
        if (await assets.match(u)) return // the page already filtered this list to static assets
        const response = await fetch(u, url.origin === self.location.origin ? {} : { mode: 'no-cors' })
        if (response.ok || response.type === 'opaque') await assets.put(u, response)
      } catch { /* skip */ }
    }))
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // Page loads: network first (always the latest build when online), fall back to the last copy.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put(url.pathname, copy))
          }
          return response
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE)
          return (await cache.match(url.pathname)) || (await cache.keys().then((keys) => keys[0] && cache.match(keys[0]))) ||
            new Response('Offline — open this terminal once while online first.', { status: 503, headers: { 'Content-Type': 'text/plain' } })
        })
    )
    return
  }

  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return

  // Static assets: cache first (build chunks are content-hashed, images rarely change).
  if (isAsset(request, url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        try {
          const response = await fetch(request)
          if (response.ok || response.type === 'opaque') cache.put(request, response.clone())
          return response
        } catch {
          return new Response('', { status: 504 })
        }
      })
    )
  }
})
