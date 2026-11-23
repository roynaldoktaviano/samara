'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BriefcaseBusiness } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { DEAL_MAKER_SOURCES, DEAL_MAKER_SOURCE_LABEL, type DealMakerSource } from '@/lib/deal-maker-switch'

/**
 * Admin switches for automatic deals per source (src/lib/deal-maker-switch.ts). Off keeps every lead
 * and its enquiry; only the automatic deal is skipped — the fast rollback the Freshsales deal maker had.
 */
export default function DealMakerSwitches() {
  const [state, setState] = useState<Record<DealMakerSource, boolean> | null>(null)
  const [busy, setBusy] = useState<DealMakerSource | null>(null)

  useEffect(() => {
    fetch('/api/deal-maker/switches').then(r => (r.ok ? r.json() : null)).then(setState).catch(() => {})
  }, [])

  async function toggle(source: DealMakerSource, on: boolean) {
    setBusy(source)
    try {
      const res = await fetch('/api/deal-maker/switches', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, on }) })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) { toast.error(body?.error ?? 'Could not save'); return }
      setState(body)
      toast.success(`Automatic deals from ${DEAL_MAKER_SOURCE_LABEL[source].label}: ${on ? 'on' : 'off'}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4" /> Automatic Deals</CardTitle>
        <CardDescription>
          Which enquiries open a deal by themselves. Switching a source off still saves the lead and all its tracking; sales can
          open the deal by hand. Direct WhatsApp chats and Instagram / Messenger DMs never open one automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!state ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : DEAL_MAKER_SOURCES.map(s => (
          <div key={s} className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">{DEAL_MAKER_SOURCE_LABEL[s].label}</p>
              <p className="text-xs text-muted-foreground">{DEAL_MAKER_SOURCE_LABEL[s].hint}</p>
            </div>
            <Switch checked={state[s]} disabled={busy === s} onCheckedChange={v => toggle(s, v)} aria-label={DEAL_MAKER_SOURCE_LABEL[s].label} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
