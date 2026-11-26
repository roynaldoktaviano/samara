'use client'

import { useState, useEffect, useRef } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Loader2, ChevronDown, ChevronRight, CalendarX2 } from 'lucide-react'
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
  // websites: lead qualifies if any of its inquiries came from ANY selected site (Inquiry.website).
  leads: AudienceSourceState & { websites: string[] }
  agents: AudienceSourceState
  agentLeads: AudienceSourceState
  internal: AudienceSourceState
  internalSalesMarketing: AudienceSourceState
  manualEmails: string
  // Drop guests who booked / had a payment requested in the chosen month(s).
  // excludeBookedCurrent = rolling "this month" (rolls over automatically — resolved
  // server-side at preview and send time); excludeBookedMonths = fixed "YYYY-MM" months.
  excludeBooked: boolean
  excludeBookedCurrent: boolean
  excludeBookedMonths: string[]
}

export interface YachtSummary { id: string; name: string }

const emptySource = (): AudienceSourceState => ({ enabled: false, search: '', excludeIds: new Set() })

export const emptyAudience = (): AudienceState => ({
  customers: { ...emptySource(), enabled: true, yachtId: '', yachtIds: [], minSpend: '' },
  leads: { ...emptySource(), websites: [] },
  agents: emptySource(),
  agentLeads: emptySource(),
  internal: emptySource(),
  internalSalesMarketing: emptySource(),
  manualEmails: '',
  excludeBooked: true,
  excludeBookedCurrent: true,
  excludeBookedMonths: [],
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
    ...(a.leads.enabled && { leads: toFilter(a.leads, a.leads.websites.length > 0 ? { websites: a.leads.websites } : undefined) }),
    ...(a.agents.enabled && { agents: toFilter(a.agents) }),
    ...(a.agentLeads.enabled && { agentLeads: toFilter(a.agentLeads) }),
    ...(a.internal.enabled && { internal: toFilter(a.internal) }),
    ...(a.internalSalesMarketing.enabled && { internalSalesMarketing: toFilter(a.internalSalesMarketing) }),
    manualEmails: a.manualEmails.split(/[\n,]/).map(s => s.trim()).filter(Boolean),
    ...(a.excludeBooked && a.excludeBookedCurrent && { excludeBookedThisMonth: true }),
    ...(a.excludeBooked && a.excludeBookedMonths.length > 0 && { excludeBookedMonths: a.excludeBookedMonths }),
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
    leads: { ...fill(sources?.leads), websites: sources?.leads?.websites ?? [] },
    agents: fill(sources?.agents),
    agentLeads: fill(sources?.agentLeads),
    internal: fill(sources?.internal),
    internalSalesMarketing: fill(sources?.internalSalesMarketing),
    manualEmails: (sources?.manualEmails ?? []).join('\n'),
    ...(() => {
      const months: string[] = Array.isArray(sources?.excludeBookedMonths) ? sources.excludeBookedMonths : []
      const current = !!sources?.excludeBookedThisMonth
      return { excludeBooked: current || months.length > 0, excludeBookedCurrent: current || months.length === 0, excludeBookedMonths: months }
    })(),
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
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground hover:border-primary/60'}`}>
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
    <p className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--primary-strong)' }}>
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : '→'}
      {loading ? 'Counting guests…' : `${count ?? 0} guest${count === 1 ? '' : 's'} match${count === 1 ? 'es' : ''} this condition`}
    </p>
  )
}

function LeadConditions({ audience, setAudience }: {
  audience: AudienceState
  setAudience: (updater: (a: AudienceState) => AudienceState) => void
}) {
  const [websites, setWebsites] = useState<string[]>([])
  useEffect(() => {
    fetch('/api/leads/websites').then(r => r.ok ? r.json() : []).then(setWebsites).catch(() => {})
  }, [])

  const selected = audience.leads.websites
  const toggleWebsite = (w: string) => setAudience(a => ({
    ...a,
    leads: { ...a.leads, websites: a.leads.websites.includes(w) ? a.leads.websites.filter(x => x !== w) : [...a.leads.websites, w] },
  }))

  if (websites.length === 0) return null
  return (
    <div className="ml-6 border rounded-lg p-3 space-y-1.5 bg-muted/20">
      <Label className="text-xs">Came from website (optional)</Label>
      <div className="flex flex-wrap gap-1.5">
        {websites.map(w => {
          const active = selected.includes(w)
          return (
            <button key={w} type="button" onClick={() => toggleWebsite(w)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground hover:border-primary/60'}`}>
              {w}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {selected.length === 0
          ? 'No website selected — all leads are included.'
          : 'Matches leads with an inquiry from any one of the selected websites. Anonymous = leads whose inquiries have no website recorded (mostly Freshsales imports).'}
      </p>
    </div>
  )
}

interface BookedGuest { customerId: string; name: string | null; email: string; reason: string }

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Current year in WITA (UTC+8).
function currentYear(): number {
  return new Date(Date.now() + 8 * 3600_000).getUTCFullYear()
}

// Applies across every source (matched by email), so it sits above them all. Month "This month
// (auto)" is re-resolved at send time, so a campaign saved in November but sent in December
// excludes December's bookers; a picked month + year stays exactly as picked.
function BookedMonthsExclusion({ enabled, current, months, onChange }: {
  enabled: boolean
  current: boolean
  months: string[]
  onChange: (patch: Partial<Pick<AudienceState, 'excludeBooked' | 'excludeBookedCurrent' | 'excludeBookedMonths'>>) => void
}) {
  const [data, setData] = useState<{ label: string; guests: BookedGuest[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const query = `current=${current ? 1 : 0}&months=${months.join(',')}`
  const nothingPicked = !current && months.length === 0

  // Single pick: either "auto" or one fixed YYYY-MM.
  const fixed = !current && months[0] ? months[0] : null
  const thisYear = currentYear()
  const selYear = fixed ? Number(fixed.slice(0, 4)) : thisYear
  const selMonth = fixed ? fixed.slice(5, 7) : 'auto'
  // 3 years back … 3 years ahead
  const years = Array.from({ length: 7 }, (_, i) => thisYear - 3 + i)
  if (!years.includes(selYear)) { years.push(selYear); years.sort((a, b) => a - b) }

  const pick = (month: string, year: number) =>
    month === 'auto'
      ? onChange({ excludeBookedCurrent: true, excludeBookedMonths: [] })
      : onChange({ excludeBookedCurrent: false, excludeBookedMonths: [`${year}-${month}`] })

  useEffect(() => {
    if (!enabled || nothingPicked) { setData(null); return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/marketing/booked-this-month?${query}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [enabled, query, nothingPicked])

  const count = data?.guests.length ?? 0

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <label className="flex items-center gap-2 font-medium text-sm">
        <input type="checkbox" checked={enabled} onChange={e => onChange({ excludeBooked: e.target.checked })} />
        <CalendarX2 className="h-4 w-4 text-muted-foreground" />
        Exclude guests who booked in…
      </label>
      <p className="text-xs text-muted-foreground ml-6">
        Skips anyone whose booking was confirmed, who had a payment requested, or whose trip starts in the selected month — matched by email across all sources below. &quot;This month (auto)&quot; switches to the new month automatically.
      </p>
      {enabled && (
        <div className="ml-6 space-y-2">
          <div className="flex flex-wrap gap-2">
            <NativeSelect value={selMonth} onChange={e => pick(e.target.value, selYear)} className="w-44">
              <option value="auto">This month (auto)</option>
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>
              ))}
            </NativeSelect>
            <NativeSelect value={String(selYear)} onChange={e => pick(selMonth, Number(e.target.value))} disabled={selMonth === 'auto'} className="w-28">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </NativeSelect>
          </div>
          {nothingPicked ? (
            <p className="text-xs text-muted-foreground">Pick at least one month — nothing is excluded right now.</p>
          ) : loading ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</p>
          ) : data ? (
            <>
              <button type="button" onClick={() => setOpen(o => !o)} disabled={count === 0}
                className="text-xs font-medium flex items-center gap-1 text-left disabled:cursor-default" style={{ color: 'var(--primary-strong)' }}>
                {count > 0 && (open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />)}
                {data.label}: {count} guest{count === 1 ? '' : 's'} excluded{count > 0 && (open ? ' — hide' : ' — show who')}
              </button>
              {open && count > 0 && (
                <div className="border rounded-md max-h-56 overflow-y-auto divide-y">
                  {data.guests.map(g => (
                    <div key={g.customerId} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                      <span className="flex-1 truncate">{g.name ?? '—'}</span>
                      <span className="text-muted-foreground truncate max-w-[35%]">{g.email}</span>
                      <span className="text-muted-foreground whitespace-nowrap">{g.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Couldn&apos;t load the list.</p>
          )}
        </div>
      )}
    </div>
  )
}

export function AudienceSourceFields({ audience, setAudience, yachts }: {
  audience: AudienceState
  setAudience: (updater: (a: AudienceState) => AudienceState) => void
  yachts: YachtSummary[]
}) {
  return (
    <div className="space-y-5">
      <BookedMonthsExclusion
        enabled={audience.excludeBooked}
        current={audience.excludeBookedCurrent}
        months={audience.excludeBookedMonths}
        onChange={patch => setAudience(a => ({ ...a, ...patch }))}
      />
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
      <div className="space-y-2">
        <AudiencePicker
          source="leads" label="Leads"
          enabled={audience.leads.enabled} onToggle={v => setAudience(a => ({ ...a, leads: { ...a.leads, enabled: v } }))}
          search={audience.leads.search} onSearchChange={v => setAudience(a => ({ ...a, leads: { ...a.leads, search: v } }))}
          excludeIds={audience.leads.excludeIds} onExcludeIdsChange={ids => setAudience(a => ({ ...a, leads: { ...a.leads, excludeIds: ids } }))}
          websites={audience.leads.websites}
        />
        {audience.leads.enabled && <LeadConditions audience={audience} setAudience={setAudience} />}
      </div>
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
      <AudiencePicker
        source="internal" label="Internal" hint="Staff accounts (this ERP's own users)"
        enabled={audience.internal.enabled} onToggle={v => setAudience(a => ({ ...a, internal: { ...a.internal, enabled: v } }))}
        search={audience.internal.search} onSearchChange={v => setAudience(a => ({ ...a, internal: { ...a.internal, search: v } }))}
        excludeIds={audience.internal.excludeIds} onExcludeIdsChange={ids => setAudience(a => ({ ...a, internal: { ...a.internal, excludeIds: ids } }))}
      />
      <AudiencePicker
        source="internalSalesMarketing" label="Internal Sales & Marketing" hint="Staff with a Sales, Marketing or Admin role"
        enabled={audience.internalSalesMarketing.enabled} onToggle={v => setAudience(a => ({ ...a, internalSalesMarketing: { ...a.internalSalesMarketing, enabled: v } }))}
        search={audience.internalSalesMarketing.search} onSearchChange={v => setAudience(a => ({ ...a, internalSalesMarketing: { ...a.internalSalesMarketing, search: v } }))}
        excludeIds={audience.internalSalesMarketing.excludeIds} onExcludeIdsChange={ids => setAudience(a => ({ ...a, internalSalesMarketing: { ...a.internalSalesMarketing, excludeIds: ids } }))}
      />
      <div className="border rounded-lg p-4 space-y-2">
        <Label className="font-medium text-sm">Manual emails (optional)</Label>
        <Textarea rows={3} value={audience.manualEmails} onChange={e => setAudience(a => ({ ...a, manualEmails: e.target.value }))} placeholder={'one per line, or comma-separated'} className="font-mono text-xs" />
      </div>
    </div>
  )
}
