'use client'

// "Freshsales" section on Lead / Sales Pipeline / Guest details: the contact's Freshsales deals
// and its history (emails, WhatsApp chat log, notes, stage & owner changes). Freshsales is the
// source of truth for the sales pipeline (src/lib/freshsales-erp-sync.ts). Renders nothing when
// the record isn't linked to a Freshsales contact.
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Briefcase } from 'lucide-react'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDate, formatMoney } from '@/lib/format'
import { TimelineView, type TimelineItem } from '@/components/freshsales/FreshsalesTimeline'

interface Deal {
  id: string; name: string; amount: number | null; currency: string | null; pipeline: string | null; stage: string | null
  status: 'OPEN' | 'WON' | 'LOST'; owner: string | null; lostReason: string | null; createdAt: string | null; closedDate: string | null
}
interface Payload {
  linked: boolean
  contact?: { id: string; owner: string | null; lastContactedAt: string | null; historySynced: boolean }
  deals?: Deal[]
  timeline?: TimelineItem[]
}

export default function FreshsalesHistory({ leadId, customerId }: { leadId?: string | null; customerId?: string | null }) {
  const key = leadId ? `lead=${leadId}` : customerId ? `customer=${customerId}` : null
  const [res, setRes] = useState<{ key: string; data: Payload | null } | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!key) return
    let alive = true
    fetch(`/api/freshsales-history?${key}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setRes({ key, data: d }) })
      .catch(() => { if (alive) setRes({ key, data: null }) })
    return () => { alive = false }
  }, [key])

  const data = res?.key === key ? res.data : undefined
  if (!key || data === null || (data && !data.linked)) return null
  if (data === undefined) return <p className="text-xs text-muted-foreground">Loading Freshsales…</p>

  const deals = data.deals ?? []
  const timeline = data.timeline ?? []
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Freshsales</p>
        {data.contact?.owner && <span className="text-[11px] text-muted-foreground">Owner: {data.contact.owner}</span>}
      </div>
      {deals.length === 0 ? (
        <p className="text-xs text-muted-foreground">No deals in Freshsales.</p>
      ) : (
        <ul className="space-y-1.5">
          {deals.map(d => (
            <li key={d.id} className="rounded-lg border px-3 py-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium flex items-start gap-1.5 min-w-0"><Briefcase className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" /><span className="break-words">{d.name}</span></span>
                <StatusBadge size="sm" tone={d.status === 'WON' ? 'success' : d.status === 'LOST' ? 'destructive' : 'info'}>{d.stage ?? d.status}</StatusBadge>
              </div>
              <p className="text-muted-foreground mt-0.5">
                {[d.pipeline, d.amount != null ? formatMoney(d.amount, { currency: d.currency ?? 'USD' }) : null, d.owner, d.lostReason ? `Lost: ${d.lostReason}` : null, d.createdAt ? `Created ${formatDate(d.createdAt)}` : null].filter(Boolean).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs font-medium text-primary-strong hover:underline">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {open ? 'Hide' : 'Show'} Freshsales history ({timeline.length})
      </button>
      {open && (
        <div className="rounded-lg border -mx-1">
          {!data.contact?.historySynced && timeline.length === 0
            ? <p className="p-4 text-xs text-muted-foreground">History for this contact is still being pulled from Freshsales.</p>
            : <TimelineView items={timeline} />}
          <p className="px-5 pb-3 text-[10px] text-muted-foreground">WhatsApp chats show as a log only — Freshsales keeps the message text in Freshchat.</p>
        </div>
      )}
    </div>
  )
}
