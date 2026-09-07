'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Loader2, ImageIcon, FileText, CheckCircle2, MessageSquare, ArrowRight, Send, ExternalLink, Smartphone, Check, X, Heart, MessageCircle, Layers, ChevronRight, Link2, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import ContentDetailSheet from '@/components/marketing/content/ContentDetailSheet'
import { FORMAT_LABELS, STATUS_LABELS, type ContentItem, type ContentStatus } from '@/components/marketing/content/contentTypes'
import { PILL, type Campaign } from './campaignTypes'

// Mirrors proto-3's ContentApproval screen (src/app/proto-3/App.jsx) — a persistent
// asset grid on the left and a review panel on the right that updates in place when you
// click a tile, instead of this app's usual click-to-open slide-over (ContentDetailSheet,
// still used by the standalone Content Studio page — kept untouched, out of scope here).
// The review panel only re-implements the approval moment (Request changes / Approve);
// every other transition (start production, submit, publish, upload a version, full
// comment thread) routes to "Open full editor", which opens that same shared sheet — so
// this stays a reskin of the approval step, not a second content-workflow engine to
// maintain in parallel.
const CONTENT_STATUS_HEX: Record<ContentStatus, string> = {
  IDEA: 'bg-[#eef0f2] text-[#626872]',
  IN_PRODUCTION: 'bg-[#eaf1ff] text-[#2864d7]',
  WAITING_APPROVAL: 'bg-[#fff2d8] text-[#996313]',
  APPROVED: 'bg-[#e6f7ee] text-[#087b4c]',
  REVISION: 'bg-[#fdecec] text-[#bd3c3c]',
  PUBLISHED: 'bg-[#f3ebfa] text-[#8553b5]',
}

const FILTERS = [
  { key: 'ALL', label: 'All', match: () => true },
  { key: 'NEEDS_APPROVAL', label: 'Needs approval', match: (s: ContentStatus) => s === 'WAITING_APPROVAL' || s === 'REVISION' },
  { key: 'APPROVED', label: 'Approved', match: (s: ContentStatus) => s === 'APPROVED' || s === 'PUBLISHED' },
  { key: 'IN_PRODUCTION', label: 'In production', match: (s: ContentStatus) => s === 'IDEA' || s === 'IN_PRODUCTION' },
] as const

const APPROVER_ROLES = ['ADMIN', 'SUPER_ADMIN', 'MARKETING_DIRECTOR']
const fmtWhen = (d: string) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function ContentApprovalTab({ campaign, onNew, onRefresh }: {
  campaign: Campaign; onNew: () => void; onRefresh: () => void
}) {
  const items = campaign.contentItems ?? []
  const [filter, setFilter] = useState<typeof FILTERS[number]['key']>('ALL')
  // Derived, not effect-driven: falls back to the first item whenever the manually
  // picked one is unset or has been filtered/deleted out from under it.
  const [manualActiveId, setActiveId] = useState<string | null>(null)
  const activeId = manualActiveId && items.some(i => i.id === manualActiveId) ? manualActiveId : (items[0]?.id ?? null)
  const [fullEditorId, setFullEditorId] = useState<string | null>(null)

  const approvedCount = items.filter(i => i.status === 'APPROVED' || i.status === 'PUBLISHED').length
  const attentionCount = items.filter(i => i.status === 'WAITING_APPROVAL' || i.status === 'REVISION').length
  const activeFilter = FILTERS.find(f => f.key === filter)!
  const filtered = items.filter(i => activeFilter.match(i.status))

  if (items.length === 0) {
    return (
      <div className="border rounded-xl bg-white p-12 text-center">
        <p className="text-sm text-muted-foreground mb-3">No content linked to this campaign yet.</p>
        <button onClick={onNew} className="h-[35px] px-3.5 rounded-md bg-[#22262b] hover:bg-[#0d0f11] text-white text-[12px] font-semibold inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> New content
        </button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-4 items-start">
      <div className="border rounded-xl bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b">
          <div>
            <h2 className="font-semibold text-sm">Campaign content</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">{items.length} asset{items.length === 1 ? '' : 's'} · {approvedCount} approved · {attentionCount} need attention</p>
          </div>
          <button onClick={onNew} className="h-[31px] px-2.5 rounded-md bg-[#22262b] hover:bg-[#0d0f11] text-white text-[10px] font-semibold inline-flex items-center gap-1 shrink-0">
            <Plus className="h-3.5 w-3.5" /> New content
          </button>
        </div>
        <div className="flex items-center gap-4 px-4 h-10 border-b overflow-x-auto">
          {FILTERS.map(f => {
            const count = f.key === 'ALL' ? items.length : items.filter(i => f.match(i.status)).length
            return (
              <button
                key={f.key} onClick={() => setFilter(f.key)}
                className={`shrink-0 text-[10px] relative h-full ${filter === f.key ? 'font-bold text-[#222]' : 'text-[#747a82]'}`}
              >
                {f.label} {count}
                {filter === f.key && <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-[#222]" />}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 p-3.5">
          {filtered.map(item => {
            const latest = item.versions?.[0] ?? null
            return (
              <button
                key={item.id} onClick={() => setActiveId(item.id)}
                className={`text-left border rounded-lg bg-white overflow-hidden transition-all ${activeId === item.id ? 'border-[#2a67dd] ring-1 ring-[#2a67dd]' : 'hover:shadow-md'}`}
              >
                <div className="h-[100px] bg-[#eef0f2] relative flex items-center justify-center">
                  {latest?.mediaUrl ? (
                    latest.mediaType === 'video' ? <video src={latest.mediaUrl} className="w-full h-full object-cover" muted /> : latest.mediaType === 'image' ? <img src={latest.mediaUrl} alt={item.title} className="w-full h-full object-cover" /> : <FileText className="h-6 w-6 text-muted-foreground/40" />
                  ) : <ImageIcon className="h-6 w-6 text-muted-foreground/30" />}
                  <span className={`absolute top-1.5 left-1.5 ${PILL} ${CONTENT_STATUS_HEX[item.status]}`}>{STATUS_LABELS[item.status]}</span>
                </div>
                <div className="p-2 space-y-0.5">
                  <h3 className="font-medium text-[10px] leading-snug line-clamp-1">{item.title}</h3>
                  <p className="text-[8px] text-muted-foreground">{FORMAT_LABELS[item.format]}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <ReviewPanel key={activeId} id={activeId} brand={campaign.brand} onOpenFull={id => setFullEditorId(id)} onChanged={onRefresh} />

      <ContentDetailSheet id={fullEditorId} onOpenChange={o => !o && setFullEditorId(null)} onChanged={onRefresh} />
    </div>
  )
}

// proto-3's review-panel — phone-preview mockup, version line, caption, the latest
// reviewer note, and the two approval-moment actions. Everything else (uploading a new
// version, full comment thread, publish/delete) is one click away via "Open full editor".
function ReviewPanel({ id, brand, onOpenFull, onChanged }: { id: string | null; brand: string | null; onOpenFull: (id: string) => void; onChanged: () => void }) {
  const { data: session } = useSession()
  const canApprove = APPROVER_ROLES.includes((session?.user as { role?: string })?.role ?? '')
  const [item, setItem] = useState<ContentItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [showFullCaption, setShowFullCaption] = useState(false)
  const [showRevisionBox, setShowRevisionBox] = useState(false)
  const [revisionNote, setRevisionNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPacket, setShowPacket] = useState(false)

  const fetchItem = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/marketing/content/${id}`)
      if (res.ok) setItem(await res.json())
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchItem() }, [fetchItem])

  const runAction = async (action: string, extra?: Record<string, unknown>) => {
    if (!id) return
    setBusy(true)
    try {
      const res = await fetch(`/api/marketing/content/${id}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
      })
      if (!res.ok) { toast.error((await res.json().catch(() => null))?.error ?? 'Action failed'); return }
      await fetchItem()
      onChanged()
      setShowRevisionBox(false); setRevisionNote('')
    } finally {
      setBusy(false)
    }
  }

  if (!id) return <div className="border rounded-xl bg-white p-8 text-center text-sm text-muted-foreground">Select an asset to review it.</div>
  if (loading && !item) return <div className="border rounded-xl bg-white p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  if (!item) return null

  const latest = item.versions?.[0] ?? null
  const lastNote = [...(item.comments ?? [])].reverse().find(c => c.text)

  return (
    <div className="border rounded-xl bg-white overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="min-w-0">
          <span className="text-[8px] text-muted-foreground block">{FORMAT_LABELS[item.format]}</span>
          <h2 className="font-semibold text-[13px] truncate">{item.title}</h2>
        </div>
        <button onClick={() => onOpenFull(id)} className="text-[9px] font-semibold shrink-0 inline-flex items-center gap-1" style={{ color: '#2764d9' }}>
          Open full editor <ExternalLink className="h-3 w-3" />
        </button>
      </div>

      <div className="bg-[#eef0f2] p-4 flex justify-center">
        <div className="w-[150px] rounded-[16px] border-[4px] border-[#1d2024] overflow-hidden bg-black shadow-lg">
          <div className="h-3 relative bg-black"><span className="absolute left-1/2 -translate-x-1/2 top-0.5 w-9 h-1 rounded bg-[#1d2024]" /></div>
          <div className="h-[190px] bg-[#0b0f14] relative">
            {latest?.mediaUrl ? (
              latest.mediaType === 'video' ? <video src={latest.mediaUrl} className="w-full h-full object-cover" muted /> : latest.mediaType === 'image' ? <img src={latest.mediaUrl} alt={item.title} className="w-full h-full object-cover" /> : null
            ) : (
              <div className="h-full flex items-center justify-center"><ImageIcon className="h-6 w-6 text-white/30" /></div>
            )}
          </div>
          {/* Instagram-post chrome around the real media — icons and caption preview are
              universal app UI, not campaign-specific data, so they're safe to replicate
              exactly; unlike proto-3 we don't overlay fake headline text onto the asset
              itself, since the real upload may not have any text burned in. */}
          <div className="px-2 py-1.5 text-white flex items-center gap-2.5 text-[11px]">
            <Heart className="h-3.5 w-3.5" /><MessageCircle className="h-3.5 w-3.5" /><Send className="h-3.5 w-3.5" />
          </div>
          {item.caption && (
            <p className="px-2 pb-2 text-white text-[7px] leading-snug line-clamp-2">
              <strong>{(brand ?? 'account').toLowerCase().replace(/\s+/g, '')}</strong> {item.caption}
            </p>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {item.versions.length > 0 && (
          <div className="flex items-center justify-between text-[8px] text-muted-foreground pb-3 border-b">
            <span>Version {latest?.versionNumber} of {item.versions.length} · {latest?.createdByName}</span>
            <button onClick={() => onOpenFull(id)} className="inline-flex items-center gap-1 font-semibold" style={{ color: '#2764d9' }}>
              <Layers className="h-3 w-3" /> Version history
            </button>
          </div>
        )}

        <div>
          <label className="text-[8px] tracking-wide text-muted-foreground font-semibold uppercase block mb-1">Caption</label>
          {item.caption ? (
            <>
              <p className={`text-[10px] leading-relaxed text-[#3a3d41] ${showFullCaption ? '' : 'line-clamp-2'}`}>{item.caption}</p>
              {!showFullCaption && item.caption.length > 90 && (
                <button onClick={() => setShowFullCaption(true)} className="text-[9px] mt-1" style={{ color: '#2764d9' }}>Show full caption</button>
              )}
            </>
          ) : <p className="text-[10px] text-muted-foreground">No caption yet.</p>}
        </div>

        {lastNote && (
          <div className="bg-[#fffaf0] rounded-md p-2.5 flex gap-2">
            <div className="min-w-0">
              <p className="text-[9px] flex justify-between gap-2"><strong>{lastNote.authorName}</strong><span className="text-muted-foreground shrink-0">{fmtWhen(lastNote.createdAt)}</span></p>
              <p className="text-[9px] text-[#5f646c] leading-snug mt-0.5">{lastNote.text}</p>
            </div>
          </div>
        )}

        <div className="pt-1">
          {item.status === 'WAITING_APPROVAL' ? (
            canApprove ? (
              showRevisionBox ? (
                <div className="space-y-2">
                  <textarea
                    value={revisionNote} onChange={e => setRevisionNote(e.target.value)} rows={2} autoFocus
                    placeholder="What needs to change?" className="w-full text-[10px] border rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-[#bdac7e]"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => { setShowRevisionBox(false); setRevisionNote('') }} className="h-7 px-2.5 rounded-md border text-[9px] font-semibold">Cancel</button>
                    <button
                      disabled={!revisionNote.trim() || busy} onClick={() => runAction('request_changes', { comment: revisionNote })}
                      className="h-7 px-2.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-[9px] font-semibold disabled:opacity-40"
                    >Send back</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <button onClick={() => setShowRevisionBox(true)} disabled={busy} className="flex-1 h-8 rounded-md border text-[#444950] hover:bg-muted/40 text-[10px] font-semibold inline-flex items-center justify-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" /> Request changes
                  </button>
                  <button onClick={() => runAction('approve')} disabled={busy} className="flex-1 h-8 rounded-md bg-[#22262b] hover:bg-[#0d0f11] text-white text-[10px] font-semibold inline-flex items-center justify-center gap-1.5">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><CheckCircle2 className="h-3.5 w-3.5" /> Approve content</>}
                  </button>
                </div>
              )
            ) : (
              <p className="text-[10px] text-muted-foreground text-center py-1">Waiting for a Marketing Director to review.</p>
            )
          ) : (
            <button onClick={() => onOpenFull(id)} className="w-full h-8 rounded-md border text-[10px] font-semibold inline-flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground">
              {item.status === 'IDEA' && <><ArrowRight className="h-3.5 w-3.5" /> Start production in full editor</>}
              {item.status === 'IN_PRODUCTION' && <><Send className="h-3.5 w-3.5" /> Submit for approval in full editor</>}
              {item.status === 'REVISION' && <><ArrowRight className="h-3.5 w-3.5" /> Revise in full editor</>}
              {item.status === 'APPROVED' && <><CheckCircle2 className="h-3.5 w-3.5" /> Mark published in full editor</>}
              {item.status === 'PUBLISHED' && <><CheckCircle2 className="h-3.5 w-3.5 text-violet-600" /> Published{item.liveUrl ? ' · view live' : ''}</>}
            </button>
          )}
        </div>

        {(item.status === 'APPROVED' || item.status === 'PUBLISHED') && (
          <button onClick={() => setShowPacket(true)} className="w-full h-8 border-t -mx-4 -mb-4 pt-3 text-[9px] font-semibold inline-flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground">
            <Smartphone className="h-3.5 w-3.5" /> View mobile publishing packet
          </button>
        )}
      </div>

      {showPacket && <MobilePublishingPacket item={item} onClose={() => setShowPacket(false)} onChanged={() => { onChanged(); fetchItem() }} />}
    </div>
  )
}

// proto-3's MobilePacket — the handoff a staffer uses on their phone to actually publish
// approved content: download the file, copy the caption, work through a posting
// checklist, then paste the live URL back in. "Confirm live" calls the exact same
// publish action as the full editor, so this is a real shortcut, not a decorative replica.
function MobilePublishingPacket({ item, onClose, onChanged }: { item: ContentItem; onClose: () => void; onChanged: () => void }) {
  const [checked, setChecked] = useState([false, false, false, false])
  const [liveUrl, setLiveUrl] = useState(item.liveUrl ?? '')
  const [busy, setBusy] = useState(false)
  const latest = item.versions?.[0] ?? null
  const approvedNote = [...(item.comments ?? [])].reverse().find(c => c.action === 'APPROVE')

  const toggle = (i: number) => setChecked(c => c.map((x, j) => j === i ? !x : x))

  const copyCaption = () => {
    if (!item.caption) return
    navigator.clipboard.writeText(item.caption).then(() => toast.success('Caption copied')).catch(() => toast.error('Could not copy'))
  }

  const confirmLive = async () => {
    if (!liveUrl.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/marketing/content/${item.id}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'publish', liveUrl: liveUrl.trim() }),
      })
      if (!res.ok) { toast.error((await res.json().catch(() => null))?.error ?? 'Failed to confirm'); return }
      toast.success('Marked as published')
      onChanged()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const instructions = [
    'Download the final file to the device you publish from',
    'Copy the approved caption',
    'Add trending/appropriate audio if this is a Reel or Story',
    'Publish, then paste the live post link below',
  ]

  return (
    <div className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-[2px] grid place-items-center p-5" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[860px] max-h-[92vh] overflow-y-auto grid grid-cols-1 md:grid-cols-[330px_1fr]" onClick={e => e.stopPropagation()}>
        <div className="relative min-h-[220px] md:min-h-[490px] bg-black flex items-end p-4">
          {latest?.mediaUrl && (
            latest.mediaType === 'video'
              ? <video src={latest.mediaUrl} className="absolute inset-0 w-full h-full object-cover" muted controls />
              : latest.mediaType === 'image'
                ? <img src={latest.mediaUrl} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
                : null
          )}
          {latest?.mediaUrl ? (
            <a href={latest.mediaUrl} target="_blank" rel="noreferrer" className="relative w-full h-9 rounded-md bg-white text-[#222] text-[10px] font-bold flex items-center justify-center gap-1.5 z-10">
              <ChevronRight className="h-3.5 w-3.5" /> Download final file
            </a>
          ) : (
            <p className="relative text-white/60 text-[10px] z-10">No file uploaded yet.</p>
          )}
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <span className="text-[8px] tracking-[.15em] text-[#9b7c43] font-bold">MOBILE PUBLISHING PACKET</span>
              <h2 className="text-[17px] font-semibold mt-1 truncate">{item.title}</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">{FORMAT_LABELS[item.format]}{item.ownerName ? ` · ${item.ownerName}` : ''}</p>
            </div>
            <button onClick={onClose} className="h-8 w-8 rounded-full bg-muted grid place-items-center shrink-0"><X className="h-4 w-4" /></button>
          </div>

          <div className="bg-[#eaf8f1] rounded-md p-2.5 flex items-center gap-2.5 mb-4">
            <CheckCircle2 className="h-4 w-4 text-[#158457] shrink-0" />
            <div className="min-w-0">
              <strong className="text-[10px] block text-[#157e51]">Approved and ready</strong>
              {approvedNote && <span className="text-[9px] text-[#157e51]/80">Approved by {approvedNote.authorName}</span>}
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[8px] tracking-wide text-muted-foreground font-semibold uppercase">Caption</label>
              {item.caption && <button onClick={copyCaption} className="text-[9px] font-semibold" style={{ color: '#2764d9' }}>Copy</button>}
            </div>
            <div className="border rounded-md bg-muted/30 p-2.5 text-[10px] leading-relaxed whitespace-pre-wrap">{item.caption || 'No caption written yet.'}</div>
          </div>

          <div className="mb-4">
            <label className="text-[8px] tracking-wide text-muted-foreground font-semibold uppercase block mb-1.5">Posting instructions</label>
            <div className="border rounded-md divide-y">
              {instructions.map((x, i) => (
                <button key={x} onClick={() => toggle(i)} className="w-full flex items-center gap-2 px-2.5 py-2 text-left text-[10px]">
                  <span className={`h-4 w-4 rounded border grid place-items-center shrink-0 ${checked[i] ? 'bg-[#1ba36a] border-[#1ba36a] text-white' : 'border-[#ccd1d6]'}`}>
                    {checked[i] && <Check className="h-2.5 w-2.5" />}
                  </span>
                  {x}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[8px] tracking-wide text-muted-foreground font-semibold uppercase block mb-1.5">After publishing</label>
            {item.status === 'PUBLISHED' ? (
              <p className="text-[10px] text-muted-foreground">
                Already marked as published{item.liveUrl && <> · <a href={item.liveUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: '#2764d9' }}>view live</a></>}
              </p>
            ) : (
              <div className="flex items-center border rounded-md pl-2.5 overflow-hidden">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  value={liveUrl} onChange={e => setLiveUrl(e.target.value)} placeholder="Paste the live post link"
                  className="h-9 flex-1 min-w-0 text-[10px] px-2 focus:outline-none"
                />
                <button
                  onClick={confirmLive} disabled={busy || !liveUrl.trim()}
                  className="h-9 px-3 bg-[#22262b] hover:bg-[#0d0f11] text-white text-[10px] font-semibold disabled:opacity-40 shrink-0"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm live'}
                </button>
              </div>
            )}
          </div>

          <p className="text-[9px] text-muted-foreground flex items-center gap-1.5 mt-3">
            <BarChart3 className="h-3 w-3" /> You can add real performance numbers later from the content detail.
          </p>
        </div>
      </div>
    </div>
  )
}
