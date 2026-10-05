'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    // Dev-mode chunk URLs under /_next/static/ don't rotate per edit the way
    // production's content-hashed filenames do, so the SW's cache-first strategy
    // would permanently pin whatever JS was cached on first load — silently
    // defeating Fast Refresh for any browser that's ever registered it in dev.
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return

    // The cashier subdomain gets its own offline-capable worker (the vessel bar loses signal at sea).
    if (window.location.hostname.startsWith('cashier.')) {
      navigator.serviceWorker.register('/cashier-sw.js').catch((err) => console.error('[sw] register failed:', err))
      // Hand the worker everything this page already loaded, so it's cached for offline launches.
      navigator.serviceWorker.ready.then((reg) => {
        const assets = performance.getEntriesByType('resource').map((e) => e.name)
          .filter((u) => u.includes('/_next/static/') || u.includes('fonts.g') || /\.(png|jpe?g|webp|svg)(\?|$)/i.test(u))
        reg.active?.postMessage({ type: 'precache', page: window.location.pathname, assets })
      }).catch(() => {})
      return
    }

    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('[sw] register failed:', err))
  }, [])
  return null
}
