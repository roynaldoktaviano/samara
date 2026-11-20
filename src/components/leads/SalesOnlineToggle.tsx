'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'

// Header switch for SALES only: Online = in the round-robin for new leads / chats, Offline = skipped
// (User.salesAway — see src/app/api/profile/sales-online/route.ts).
export function SalesOnlineToggle() {
  const [state, setState] = useState<{ isSales: boolean; online: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/profile/sales-online').then(r => (r.ok ? r.json() : null)).then(setState).catch(() => {})
  }, [])

  if (!state?.isSales) return null

  const change = async (online: boolean) => {
    setSaving(true)
    setState(s => (s ? { ...s, online } : s))
    try {
      const r = await fetch('/api/profile/sales-online', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ online }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Failed')
      toast.success(online ? 'You are Online — new leads can be assigned to you' : 'You are Offline — round-robin skips you')
    } catch (e) {
      setState(s => (s ? { ...s, online: !online } : s))
      toast.error(e instanceof Error ? e.message : 'Failed to change status')
    } finally {
      setSaving(false)
    }
  }

  return (
    <label
      className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted transition-colors cursor-pointer select-none"
      title={state.online ? 'Online: you receive new leads from the round-robin' : 'Offline: the round-robin skips you'}
    >
      <span className={`h-2 w-2 rounded-full ${state.online ? 'bg-green-500' : 'bg-gray-400'}`} />
      <span className={`text-xs font-medium hidden sm:inline ${state.online ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
        {state.online ? 'Online' : 'Offline'}
      </span>
      <Switch checked={state.online} disabled={saving} onCheckedChange={change} aria-label="Online for new leads" />
    </label>
  )
}
