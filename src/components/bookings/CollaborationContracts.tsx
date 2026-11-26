'use client'

import { useRef, useState } from 'react'
import { FileText, Loader2, Paperclip, Pencil, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useFileDrop } from '@/hooks/useFileDrop'
import {
  COLLAB_CONTRACT_MAX_SIZE, COLLAB_CONTRACT_TYPES, MAX_COLLAB_CONTRACTS, contractFileName, isPdfUrl,
} from '@/lib/collaboration-budget'

async function uploadContract(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/bookings/collaboration-contracts', { method: 'POST', body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.url) throw new Error(data.error ?? 'Upload failed')
  return data.url as string
}

function ContractTile({ url, onRemove, disabled }: { url: string; onRemove?: () => void; disabled?: boolean }) {
  const name = contractFileName(url)
  return (
    <div className="relative border rounded-lg overflow-hidden bg-muted/20 group">
      <a href={url} target="_blank" rel="noopener noreferrer" className="block" title={name}>
        {isPdfUrl(url) ? (
          <div className="h-24 flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <FileText className="h-8 w-8 text-red-500/80" />
            <span className="text-[10px] font-semibold uppercase">PDF</span>
          </div>
        ) : (
          <img src={url} alt={name} className="h-24 w-full object-cover" />
        )}
        <p className="px-2 py-1 text-[11px] truncate border-t bg-background">{name}</p>
      </a>
      {onRemove && (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className="absolute top-1 right-1 size-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 disabled:opacity-50"
          aria-label="Remove file"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

/**
 * Picker for Collaboration Book contract files — images or PDFs, max 3. Each file is uploaded
 * to R2 as soon as it's chosen; `value` holds the resulting public URLs.
 */
export function CollaborationContractsInput({ value, onChange, disabled, onUploadingChange }: {
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  onUploadingChange?: (uploading: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const busy = disabled || uploading > 0

  const addFiles = async (files: File[]) => {
    if (busy) return
    const typed = files.filter(f => COLLAB_CONTRACT_TYPES.includes(f.type))
    if (typed.length < files.length) toast.error('Only JPG, PNG, WEBP or PDF files are allowed')
    const sized = typed.filter(f => f.size <= COLLAB_CONTRACT_MAX_SIZE)
    if (sized.length < typed.length) toast.error('Each file must be under 10MB')
    const room = MAX_COLLAB_CONTRACTS - value.length
    if (sized.length > room) toast.error(`Maximum ${MAX_COLLAB_CONTRACTS} files`)
    const take = sized.slice(0, Math.max(0, room))
    if (!take.length) return

    setUploading(take.length)
    onUploadingChange?.(true)
    const results = await Promise.allSettled(take.map(uploadContract))
    setUploading(0)
    onUploadingChange?.(false)
    const urls = results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []))
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failed) toast.error(failed.reason instanceof Error ? failed.reason.message : 'Upload failed')
    if (urls.length) onChange([...value, ...urls].slice(0, MAX_COLLAB_CONTRACTS))
  }

  const { isDragging, dropProps } = useFileDrop(files => { void addFiles(files) }, busy)
  const canAdd = value.length + uploading < MAX_COLLAB_CONTRACTS

  return (
    <div className="space-y-1.5">
      <div
        {...dropProps}
        className={`grid grid-cols-3 gap-2 rounded-lg ${isDragging ? 'ring-2 ring-primary bg-primary/5' : ''}`}
      >
        {value.map((url, i) => (
          <ContractTile key={url} url={url} disabled={busy} onRemove={() => onChange(value.filter((_, j) => j !== i))} />
        ))}
        {Array.from({ length: uploading }).map((_, i) => (
          <div key={`up-${i}`} className="border rounded-lg h-[122px] flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Uploading…
          </div>
        ))}
        {canAdd && (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed rounded-lg h-[122px] flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground hover:border-primary/50 disabled:opacity-50"
          >
            <Plus className="h-5 w-5" />
            {isDragging ? 'Drop to add' : 'Add file'}
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">Image or PDF · max {MAX_COLLAB_CONTRACTS} files · up to 10MB each</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void addFiles(f) }}
      />
    </div>
  )
}

/**
 * Collaboration contract files inside a booking detail view — read-only tiles (click to open),
 * plus an inline editor for Marketing/Admin. `onSaved` receives the fresh URL list.
 */
export function CollaborationContractsCard({ booking, canEdit, onSaved }: {
  booking: { id: string; collaborationContracts?: string[] | null }
  canEdit: boolean
  onSaved?: (next: { collaborationContracts: string[] }) => void
}) {
  const files = booking.collaborationContracts ?? []
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/contracts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collaborationContracts: draft }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Failed to save contracts'); return }
      onSaved?.({ collaborationContracts: data.collaborationContracts ?? [] })
      setEditing(false)
      toast.success('Contracts saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border overflow-hidden text-xs">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-b">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
          <Paperclip className="h-3 w-3" /> Collaboration Contract
        </p>
        {canEdit && !editing && (
          <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] font-semibold" onClick={() => { setDraft(files); setEditing(true) }}>
            <Pencil className="h-3 w-3 mr-1" /> {files.length ? 'Edit' : 'Upload'}
          </Button>
        )}
      </div>

      {editing ? (
        <div className="p-3 space-y-3">
          <CollaborationContractsInput value={draft} onChange={setDraft} disabled={saving} onUploadingChange={setUploading} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
            <Button type="button" size="sm" loading={saving} disabled={uploading} onClick={save}>Save</Button>
          </div>
        </div>
      ) : files.length === 0 ? (
        <p className="px-3 py-3 text-muted-foreground">No contract uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 p-3">
          {files.map(url => <ContractTile key={url} url={url} />)}
        </div>
      )}
    </div>
  )
}
