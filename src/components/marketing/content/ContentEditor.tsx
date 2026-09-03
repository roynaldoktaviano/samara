'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { FORMAT_LABELS, type ContentFormat } from './contentTypes'
import { useMarketingTeam, ownerOptionNames } from '@/components/marketing/shared/useMarketingTeam'

// Same modal chrome as CampaignHubEditor (mirrors proto-3's create-modal look) — dark
// near-black primary action, dense small type, 2-column form-grid. Scoped to this dialog only.
function label(text: string) {
  return <label className="block text-[9px] text-[#5f656c] mb-1.5">{text}</label>
}

function inputCls() {
  return 'block w-full h-[38px] rounded-md border border-[#dce0e4] px-2.5 text-[11px] text-[#2a2d31] bg-white focus:outline-none focus:ring-1 focus:ring-[#22262b]'
}

export default function ContentEditor({ open, onOpenChange, onCreated, campaignId, defaultFormat }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (id: string) => void
  campaignId?: string
  defaultFormat?: ContentFormat
}) {
  const { data: session } = useSession()
  const team = useMarketingTeam()
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState<ContentFormat>(defaultFormat ?? 'INSTAGRAM_REEL')
  const [campaignTag, setCampaignTag] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [caption, setCaption] = useState('')
  const [saving, setSaving] = useState(false)

  // ContentEditor is a single persistent instance reused for every "New content" trigger
  // (the plain button in Content & Approval and the per-channel shortcuts in Channels), so
  // the format has to be re-synced from the prop each time it opens rather than only on mount.
  useEffect(() => { if (open) setFormat(defaultFormat ?? 'INSTAGRAM_REEL') }, [open, defaultFormat])

  const reset = () => { setTitle(''); setCampaignTag(''); setOwnerName(''); setDueDate(''); setCaption('') }
  const close = () => { if (!saving) { onOpenChange(false); reset() } }

  const submit = async () => {
    if (!title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/marketing/content', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, format, campaignId: campaignId || null, campaignTag: campaignTag || null,
          ownerName: ownerName || session?.user?.name || session?.user?.email || null,
          dueDate: dueDate || null, caption: caption || null,
        }),
      })
      if (!res.ok) { toast.error((await res.json().catch(() => null))?.error ?? 'Failed to create content'); return }
      const item = await res.json()
      toast.success('Content idea created')
      onOpenChange(false)
      reset()
      onCreated(item.id)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && close()}>
      <DialogContent showCloseButton={false} className="p-0 gap-0 rounded-xl overflow-hidden border-0 shadow-[0_20px_60px_rgba(0,0,0,.23)] w-[min(560px,95vw)] sm:max-w-[560px]">
        <div className="min-h-[86px] flex items-center justify-between px-[21px] py-[17px] border-b border-[#e6e8eb]">
          <div>
            <div className="text-[10px] tracking-[.12em] font-bold text-[#9b7c43] mb-1.5">NEW CONTENT</div>
            <DialogTitle className="text-[17px] font-semibold text-[#1c1e21] m-0">Add a content idea</DialogTitle>
            <DialogDescription className="text-[9px] text-[#80858d] m-0 mt-1">It starts in the Idea column of Content Studio.</DialogDescription>
          </div>
          <button onClick={close} className="h-[30px] w-[30px] rounded-full bg-[#f1f3f4] grid place-items-center text-[#5b6067] shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-[22px] sm:px-[27px] py-[22px] max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              {label('TITLE')}
              <input className={inputCls()} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Raja Ampat: Beyond the Expected" autoFocus />
            </div>
            <div>
              {label('FORMAT')}
              <select className={inputCls()} value={format} onChange={e => setFormat(e.target.value as ContentFormat)}>
                {Object.entries(FORMAT_LABELS).map(([value, l]) => <option key={value} value={value}>{l}</option>)}
              </select>
            </div>
            <div>
              {label('DUE DATE')}
              <input type="date" className={inputCls()} value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div>
              {label('OWNER')}
              <select className={inputCls()} value={ownerName} onChange={e => setOwnerName(e.target.value)}>
                <option value="">{session?.user?.name ?? 'Unassigned'}</option>
                {ownerOptionNames(team, null).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            {!campaignId && (
              <div>
                {label('CAMPAIGN TAG (OPTIONAL)')}
                <input className={inputCls()} value={campaignTag} onChange={e => setCampaignTag(e.target.value)} placeholder="e.g. Otium Raja Ampat 2027" />
              </div>
            )}
            <div className="sm:col-span-2">
              {label('CAPTION / COPY (OPTIONAL)')}
              <textarea className={`${inputCls()} h-[70px] py-2.5 resize-none`} value={caption} onChange={e => setCaption(e.target.value)} placeholder="Draft caption or ad copy..." />
            </div>
          </div>
        </div>

        <div className="h-[62px] border-t border-[#e3e6e9] px-[22px] flex items-center justify-end gap-2">
          <button onClick={close} className="h-[35px] px-3.5 rounded-md border border-[#dfe3e7] bg-white text-[#444950] text-[11px] font-semibold">Cancel</button>
          <button
            onClick={submit} disabled={saving}
            className="h-[35px] px-3.5 rounded-md bg-[#22262b] hover:bg-[#0d0f11] text-white text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
