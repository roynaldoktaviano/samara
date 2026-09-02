'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Search } from 'lucide-react'

export type AudienceSourceKey = 'customers' | 'leads' | 'agents' | 'agentLeads'

interface Member { id: string; name: string; email: string | null }
interface Yacht { id: string; name: string }

const PAGE_SIZE = 100

/**
 * One audience source in the campaign builder's Audience step: a toggle,
 * an optional search box, an optional yacht filter (guests only), and a
 * scrollable per-person checkbox list so specific people can be excluded
 * from an otherwise-broad source (e.g. "everyone except these two").
 */
export default function AudiencePicker({
  source, label, hint, enabled, onToggle, search, onSearchChange, excludeIds, onExcludeIdsChange, yachtId, onYachtChange, yachts, hideList,
}: {
  source: AudienceSourceKey
  label: string
  hint?: string
  enabled: boolean
  onToggle: (v: boolean) => void
  search: string
  onSearchChange: (v: string) => void
  excludeIds: Set<string>
  onExcludeIdsChange: (ids: Set<string>) => void
  yachtId?: string
  onYachtChange?: (v: string) => void
  yachts?: Yacht[]
  /** Skip the search/per-person checklist below the toggle — used when membership is
   * already fully determined by rule-based conditions (see GuestConditions), so picking
   * individuals would be both redundant and impractical against a list of hundreds. */
  hideList?: boolean
}) {
  const [members, setMembers] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchMembers = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ source, limit: String(PAGE_SIZE) })
    if (search) params.set('search', search)
    if (yachtId) params.set('yachtId', yachtId)
    fetch(`/api/marketing/audience-members?${params}`)
      .then(async r => {
        if (!r.ok) return
        setMembers(await r.json())
        setTotal(Number(r.headers.get('X-Total-Count')) || 0)
      })
      .finally(() => setLoading(false))
  }, [source, search, yachtId])

  useEffect(() => {
    if (!enabled || hideList) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchMembers, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [enabled, hideList, fetchMembers])

  // excludeIds may reference people outside the currently-fetched page, so just
  // report how many of the currently-visible rows are checked as a sanity cue —
  // the real "who's actually included" count comes from the audience preview below.
  const visibleCheckedCount = members.filter(m => !excludeIds.has(m.id)).length

  const toggleOne = (id: string) => {
    const next = new Set(excludeIds)
    next.has(id) ? next.delete(id) : next.add(id)
    onExcludeIdsChange(next)
  }

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <label className="flex items-center gap-2 font-medium text-sm">
        <input type="checkbox" checked={enabled} onChange={e => onToggle(e.target.checked)} />
        {label}
      </label>
      {hint && <p className="text-xs text-muted-foreground ml-6">{hint}</p>}

      {enabled && hideList && (
        <p className="text-xs text-muted-foreground ml-6">Membership is set by the conditions below — no need to pick individuals.</p>
      )}

      {enabled && !hideList && (
        <div className="ml-6 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => onSearchChange(e.target.value)} placeholder="Search name or email" className="h-8 text-sm pl-8" />
            </div>
            {onYachtChange && yachts && (
              <Select value={yachtId || 'all'} onValueChange={v => onYachtChange(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Any boat" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any boat</SelectItem>
                  {yachts.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="border rounded-md max-h-56 overflow-y-auto divide-y">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : members.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No matches</p>
            ) : (
              members.map(m => (
                <label key={m.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-muted/50 cursor-pointer">
                  <input type="checkbox" checked={!excludeIds.has(m.id)} onChange={() => toggleOne(m.id)} />
                  <span className="flex-1 truncate">{m.name}</span>
                  <span className="text-muted-foreground truncate max-w-[40%]">{m.email}</span>
                </label>
              ))
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {total} match{total === 1 ? '' : 'es'} total
            {total > members.length && ` — showing first ${members.length}, refine search to find others`}
            {excludeIds.size > 0 && ` · ${excludeIds.size} unchecked (excluded)`}
            {visibleCheckedCount === 0 && members.length > 0 && ' · none of the visible rows are checked'}
          </p>
        </div>
      )}
    </div>
  )
}
