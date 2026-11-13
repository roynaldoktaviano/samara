'use client'

// Chat › Freshchat — list of the read-only conversations imported from Freshchat.
import { useEffect, useRef, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import { FRESHCHAT_SOURCE, freshchatSource } from '@/components/freshchat/FreshchatThread'

interface Item {
  id: string; name: string; channelName: string | null; channelSource: string | null; lastMessageAt: string | null
  preview: string | null; messageCount: number; agent: string | null; owner: string | null
}

const SOURCES = [['', 'All'], ...Object.entries(FRESHCHAT_SOURCE).map(([k, v]) => [k, v.label])] as [string, string][]

export default function FreshchatList({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [source, setSource] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t) }, [q])
  useEffect(() => { setPage(1) }, [debounced, source])
  useEffect(() => {
    const my = ++seq.current
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (debounced) params.set('q', debounced)
    if (source) params.set('source', source)
    fetch(`/api/freshchat/conversations?${params}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (my !== seq.current || !d) return
        setItems(prev => (page === 1 ? d.items : [...prev, ...d.items]))
        setTotal(d.total)
      })
      .finally(() => { if (my === seq.current) setLoading(false) })
  }, [debounced, source, page])

  return (
    <>
      <div className="px-4 pb-2 md:p-3 md:border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-3 md:left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 md:h-3.5 md:w-3.5 text-muted-foreground pointer-events-none" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, number or message…" aria-label="Search Freshchat history"
            className="pl-9 md:pl-8 h-10 md:h-9 rounded-full md:rounded-md bg-muted md:bg-transparent border-0 md:border" />
        </div>
        <div role="group" aria-label="Filter by channel" className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {SOURCES.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={source === v} onClick={() => setSource(v)}
              className={cn('shrink-0 h-7 px-2.5 rounded-md text-[11px] font-medium border transition-colors',
                source === v ? 'bg-foreground text-background border-foreground' : 'text-muted-foreground hover:bg-muted')}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">{loading && page === 1 ? 'Loading…' : `${total.toLocaleString()} conversations · read-only history from Freshchat`}</p>
      </div>
      <div className="flex-1 overflow-y-auto pb-28 md:pb-0">
        {!loading && items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center p-6">No Freshchat history matches.</p>
        ) : items.map(it => {
          const src = freshchatSource(it.channelSource)
          const Icon = src.icon
          return (
            <button key={it.id} type="button" onClick={() => onSelect(it.id)}
              className={cn('w-full flex items-center gap-3 px-4 py-3 text-left md:border-b transition-colors', selectedId === it.id ? 'bg-muted/60' : 'hover:bg-muted/40')}>
              <span className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center" style={{ backgroundColor: `${src.color}22`, color: src.color }}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{it.name}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{it.lastMessageAt ? formatDate(it.lastMessageAt, 'short') : ''}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{it.preview || '—'}</p>
                <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                  {[it.channelName ?? src.label, `${it.messageCount} msgs`, it.owner ? `Sales: ${it.owner}` : it.agent ? `Agent: ${it.agent}` : null].filter(Boolean).join(' · ')}
                </p>
              </div>
            </button>
          )
        })}
        {items.length < total && (
          <div className="p-3 text-center">
            <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
