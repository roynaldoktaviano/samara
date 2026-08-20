'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    // Dev-mode chunk URLs under /_next/static/ don't rotate per edit the way
    // production's content-hashed filenames do, so the SW's cache-first strategy
    // would permanently pin whatever JS was cached on first load — silently
    // defeating Fast Refresh for any browser that's ever registered it in dev.
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.error('[sw] register failed:', err))
    }
  }, [])
  return null
}
