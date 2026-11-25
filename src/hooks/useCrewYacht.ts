'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

/**
 * Ship crew (CREW role) only see the yacht they work on. Returns whether the signed-in user is
 * crew and, once resolved, that yacht's id (null = none could be resolved). The APIs enforce
 * the same scope — this only trims pickers/buttons so the UI matches.
 */
export function useCrewYacht(): { isCrew: boolean; yachtId: string | null; ready: boolean } {
  const { data: session, status } = useSession()
  const isCrew = (session?.user as { role?: string } | undefined)?.role === 'CREW'
  const [yachtId, setYachtId] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    if (!isCrew) return
    let cancelled = false
    fetch('/api/inventory/opnames/scope')
      .then(r => (r.ok ? r.json() : {}))
      .then((d: { yachtId?: string | null }) => { if (!cancelled) { setYachtId(d.yachtId ?? null); setResolved(true) } })
      .catch(() => { if (!cancelled) setResolved(true) })
    return () => { cancelled = true }
  }, [isCrew])

  return { isCrew, yachtId, ready: status !== 'loading' && (!isCrew || resolved) }
}
