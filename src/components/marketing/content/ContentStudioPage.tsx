'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PenSquare, Plus, ImageIcon, Video, FileText, MessageCircle, Loader2 } from 'lucide-react'
import { PageHeader, ModuleHero } from '@/components/marketing/shared/MarketingUI'
import ContentEditor from './ContentEditor'
import ContentDetailSheet from './ContentDetailSheet'
import { FORMAT_LABELS, STATUS_LABELS, STATUS_STYLE, STATUS_ORDER, type ContentItem, type ContentStatus } from './contentTypes'

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : null

export default function ContentStudioPage() {
  const [items, setItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ContentStatus | 'ALL'>('ALL')
  const [editorOpen, setEditorOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketing/content')
      if (res.ok) setItems(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: items.length }
    for (const s of STATUS_ORDER) c[s] = items.filter(i => i.status === s).length
    return c
  }, [items])

  const filtered = filter === 'ALL' ? items : items.filter(i => i.status === filter)

  return (
    <div className="p-4 md:p-6 space-y-5">
      <PageHeader
        eyebrow="CREATE & PUBLISH" title="Content Studio"
        subtitle="Produce, review and approve content — social, video, ads — in one shared queue."
        action={
          <Button onClick={() => setEditorOpen(true)} style={{ backgroundColor: '#bdac7e', color: 'white' }} className="hover:opacity-90">
            <Plus className="h-4 w-4 mr-2" /> New content
          </Button>
        }
      />

      {!loading && items.length === 0 && (
        <ModuleHero icon={PenSquare} title="No content yet" description="Content ideas move through Idea → In Production → Waiting Approval → Approved → Published, with comments and file versions kept on each item." />
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <FilterTab label="All" count={counts.ALL} active={filter === 'ALL'} onClick={() => setFilter('ALL')} />
        {STATUS_ORDER.map(s => (
          <FilterTab key={s} label={STATUS_LABELS[s]} count={counts[s]} active={filter === s} onClick={() => setFilter(s)} />
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Nothing in this stage.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <ContentCard key={item.id} item={item} onClick={() => setOpenId(item.id)} />
          ))}
        </div>
      )}

      <ContentEditor open={editorOpen} onOpenChange={setEditorOpen} onCreated={id => { fetchItems(); setOpenId(id) }} />
      <ContentDetailSheet id={openId} onOpenChange={open => !open && setOpenId(null)} onChanged={fetchItems} />
    </div>
  )
}

function FilterTab({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-[#bdac7e] text-white border-[#bdac7e]' : 'bg-white text-muted-foreground border-border hover:bg-muted/50'}`}
    >
      {label} <span className={active ? 'opacity-80' : 'opacity-60'}>{count}</span>
    </button>
  )
}

function ContentCard({ item, onClick }: { item: ContentItem; onClick: () => void }) {
  const latest = item.versions?.[0] ?? null
  const due = fmtDate(item.dueDate)
  return (
    <button onClick={onClick} className="text-left border rounded-xl bg-white overflow-hidden hover:shadow-md hover:border-[#bdac7e]/50 transition-all">
      <div className="h-36 bg-muted/40 flex items-center justify-center relative">
        {latest?.mediaUrl ? (
          latest.mediaType === 'video' ? (
            <video src={latest.mediaUrl} className="w-full h-full object-cover" muted />
          ) : latest.mediaType === 'image' ? (
            <img src={latest.mediaUrl} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <FileText className="h-8 w-8 text-muted-foreground/40" />
          )
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
        )}
        <Badge className={`absolute top-2 right-2 ${STATUS_STYLE[item.status]}`}>{STATUS_LABELS[item.status]}</Badge>
      </div>
      <div className="p-3.5 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-sm leading-snug line-clamp-2">{item.title}</h3>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
          <span>{FORMAT_LABELS[item.format]}</span>
          {item.campaignTag && <><span>·</span><span className="truncate max-w-[120px]">{item.campaignTag}</span></>}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span>{item.ownerName ?? 'Unassigned'}</span>
          <div className="flex items-center gap-2.5">
            {(item._count?.comments ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" />{item._count?.comments}</span>
            )}
            {latest?.mediaType === 'video' && <Video className="h-3 w-3" />}
            {due && <span>{due}</span>}
          </div>
        </div>
      </div>
    </button>
  )
}
