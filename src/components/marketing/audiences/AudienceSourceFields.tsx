'use client'

import { useState, useEffect, useRef } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import AudiencePicker from '@/components/marketing/campaigns/AudiencePicker'

// Shared between the campaign builder's Audience step and the standalone Audiences
// (saved segments) page — both edit the exact same "sources" shape that
// EmailCampaign.audienceSources and AudienceSegment.sources persist as JSON.

export interface AudienceSourceState { enabled: boolean; search: string; excludeIds: Set<string> }

export interface AudienceState {
  // yachtId: legacy single-select used only to narrow the per-person picker below.
  // yachtIds/minSpend: rule-based conditions — a guest qualifies if they've sailed on
  // ANY selected yacht AND (if set) their total confirmed spend meets the minimum.
  customers: AudienceSourceState & { yachtId: string; yachtIds: string[]; minSpend: string }
  leads: AudienceSourceState
  agents: AudienceSourceState
  agentLeads: AudienceSourceState
  manualEmails: string
}

export interface YachtSummary { id: string; name: string }

const emptySource = (): AudienceSourceState => ({ enabled: false, search: '', excludeIds: new Set() })

export const emptyAudience = (): AudienceState => ({
  customers: { ...emptySource(), enabled: true, yachtId: '', yachtIds: [], minSpend: '' },
  leads: emptySource(),
  agents: emptySource(),
  agentLeads: emptySource(),
  manualEmails: '',
})

function toFilter(s: AudienceSourceState, extra?: Record<string, unknown>) {
  if (!s.enabled) return undefined
  return {
    ...(s.search && { search: s.search }),
    ...(s.excludeIds.size > 0 && { excludeIds: [...s.excludeIds] }),
    ...extra,
  }
}

function guestHasCondition(c: AudienceState['customers']): boolean {
  return c.yachtIds.length > 0 || !!c.minSpend
}

// Split out of buildAudienceSources so the live per-condition count (GuestConditionCount
// below) can preview just the guest source without needing the rest of the audience state.
function buildCustomersFilter(c: AudienceState['customers']) {
  const minSpend = parseFloat(c.minSpend)
  const conditions = {
    ...(c.yachtIds.length > 0 && { yachtIds: c.yachtIds }),
    ...(c.minSpend && Number.isFinite(minSpend) && minSpend > 0 && { minSpend }),
  }
  return toFilter(c, {
    ...(c.yachtId && { yachtId: c.yachtId }),
    ...(Object.keys(conditions).length > 0 && { conditions }),
  })
}

export function buildAudienceSources(a: AudienceState) {
  return {
    ...(a.customers.enabled && { customers: buildCustomersFilter(a.customers) }),
    ...(a.leads.enabled && { leads: toFilter(a.leads) }),
    ...(a.agents.enabled && { agents: toFilter(a.agents) }),
    ...(a.agentLeads.enabled && { agentLeads: toFilter(a.agentLeads) }),
    manualEmails: a.manualEmails.split(/[\n,]/).map(s => s.trim()).filter(Boolean),
  }
}

export function audienceStateFromSources(sources: any): AudienceState {
  const fill = (src: any): AudienceSourceState => ({
    enabled: !!src,
    search: src?.search ?? '',
    excludeIds: new Set<string>(src?.excludeIds ?? []),
  })
  return {
    customers: {
      ...fill(sources?.customers),
      yachtId: sources?.customers?.yachtId ?? '',
      yachtIds: sources?.customers?.conditions?.yachtIds ?? [],
      minSpend: sources?.customers?.conditions?.minSpend != null ? String(sources.customers.conditions.minSpend) : '',
    },
    leads: fill(sources?.leads),
    agents: fill(sources?.agents),
    agentLeads: fill(sources?.agentLeads),
    manualEmails: (sources?.manualEmails ?? []).join('\n'),
  }
}

function GuestConditions({ audience, setAudience, yachts }: {
  audience: AudienceState
  setAudience: (updater: (a: AudienceState) => AudienceState) => void
  yachts: YachtSummary[]
}) {
  const toggleYacht = (id: string) => setAudience(a => ({
    ...a,
    customers: {
      ...a.customers,
      yachtIds: a.customers.yachtIds.includes(id) ? a.customers.yachtIds.filter(y => y !== id) : [...a.customers.yachtIds, id],
    },
  }))

  return (
    <div className="ml-6 border rounded-lg p-3 space-y-3 bg-muted/20">
      <p className="text-xs font-medium text-muted-foreground">Conditions (optional) — a guest must match all of these</p>
      {yachts.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Has sailed on</Label>
          <div className="flex flex-wrap gap-1.5">
            {yachts.map(y => {
              const active = audience.customers.yachtIds.includes(y.id)
              return (
                <button key={y.id} type="button" onClick={() => toggleYacht(y.id)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${active ? 'bg-[#bdac7e] text-white border-[#bdac7e]' : 'bg-white text-muted-foreground hover:border-[#bdac7e]/60'}`}>
                  {y.name}
                </button>
              )
            })}
          </div>
          {audience.customers.yachtIds.length > 1 && (
            <p className="text-[11px] text-muted-foreground">Matches guests who sailed on any one of the selected yachts.</p>
          )}
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">Minimum total spend, confirmed payments (USD)</Label>
        <Input type="number" min="0" step="100" value={audience.customers.minSpend}
          onChange={e => setAudience(a => ({ ...a, customers: { ...a.customers, minSpend: e.target.value } }))}
          placeholder="e.g. 10000" className="h-8 text-sm max-w-45" />
      </div>
      {guestHasCondition(audience.customers) && <GuestConditionCount customers={audience.customers} />}
    </div>
  )
}

// Auto-refreshes as soon as a condition changes — the whole point is that setting a
// condition tells you who's included without having to hit a separate "Refresh" button
// or scroll down to the overall audience count.
function GuestConditionCount({ customers }: { customers: AudienceState['customers'] }) {
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/marketing/audience-preview', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customers: buildCustomersFilter(customers) }),
        })
        const data = await res.json()
        setCount(res.ok ? data.count : null)
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers.yachtIds.join(','), customers.minSpend, customers.search, customers.excludeIds.size])

  return (
    <p className="text-xs font-medium flex items-center gap-1.5" style={{ color: '#7a6a3f' }}>
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : '→'}
      {loading ? 'Counting guests...' : `${count ?? 0} guest${count === 1 ? '' : 's'} match${count === 1 ? 'es' : ''} this condition`}
    </p>
  )
}

export function AudienceSourceFields({ audience, setAudience, yachts }: {
  audience: AudienceState
  setAudience: (updater: (a: AudienceState) => AudienceState) => void
  yachts: YachtSummary[]
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <AudiencePicker
          source="customers" label="Guest" hint="From bookings"
          enabled={audience.customers.enabled} onToggle={v => setAudience(a => ({ ...a, customers: { ...a.customers, enabled: v } }))}
          search={audience.customers.search} onSearchChange={v => setAudience(a => ({ ...a, customers: { ...a.customers, search: v } }))}
          excludeIds={audience.customers.excludeIds} onExcludeIdsChange={ids => setAudience(a => ({ ...a, customers: { ...a.customers, excludeIds: ids } }))}
          yachtId={audience.customers.yachtId} onYachtChange={v => setAudience(a => ({ ...a, customers: { ...a.customers, yachtId: v } }))}
          yachts={yachts}
          hideList={guestHasCondition(audience.customers)}
        />
        {audience.customers.enabled && <GuestConditions audience={audience} setAudience={setAudience} yachts={yachts} />}
      </div>
      <AudiencePicker
        source="leads" label="Leads"
        enabled={audience.leads.enabled} onToggle={v => setAudience(a => ({ ...a, leads: { ...a.leads, enabled: v } }))}
        search={audience.leads.search} onSearchChange={v => setAudience(a => ({ ...a, leads: { ...a.leads, search: v } }))}
        excludeIds={audience.leads.excludeIds} onExcludeIdsChange={ids => setAudience(a => ({ ...a, leads: { ...a.leads, excludeIds: ids } }))}
      />
      <AudiencePicker
        source="agents" label="Agent"
        enabled={audience.agents.enabled} onToggle={v => setAudience(a => ({ ...a, agents: { ...a.agents, enabled: v } }))}
        search={audience.agents.search} onSearchChange={v => setAudience(a => ({ ...a, agents: { ...a.agents, search: v } }))}
        excludeIds={audience.agents.excludeIds} onExcludeIdsChange={ids => setAudience(a => ({ ...a, agents: { ...a.agents, excludeIds: ids } }))}
      />
      <AudiencePicker
        source="agentLeads" label="Agent Leads"
        enabled={audience.agentLeads.enabled} onToggle={v => setAudience(a => ({ ...a, agentLeads: { ...a.agentLeads, enabled: v } }))}
        search={audience.agentLeads.search} onSearchChange={v => setAudience(a => ({ ...a, agentLeads: { ...a.agentLeads, search: v } }))}
        excludeIds={audience.agentLeads.excludeIds} onExcludeIdsChange={ids => setAudience(a => ({ ...a, agentLeads: { ...a.agentLeads, excludeIds: ids } }))}
      />
      <div className="border rounded-lg p-4 space-y-2">
        <Label className="font-medium text-sm">Manual emails (optional)</Label>
        <Textarea rows={3} value={audience.manualEmails} onChange={e => setAudience(a => ({ ...a, manualEmails: e.target.value }))} placeholder={'one per line, or comma-separated'} className="font-mono text-xs" />
      </div>
    </div>
  )
}
