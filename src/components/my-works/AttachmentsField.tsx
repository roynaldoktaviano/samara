'use client'

import { useRef, useState } from 'react'
import { Paperclip, X, FileText, FileSpreadsheet, FileArchive, File as FileIcon, Upload, Loader2, Download } from 'lucide-react'
import { useFileDrop } from '@/hooks/useFileDrop'
import { uploadToR2WithProgress } from '@/lib/r2-client'
import { fmtSize, type Attachment } from './shared'

const MAX_SIZE = 25 * 1024 * 1024 // keep in sync with TODO_ATTACHMENT_MAX_SIZE (src/lib/todo.ts)
const MAX_COUNT = 20

function iconFor(a: { name: string; contentType: string }) {
  const ext = a.name.split('.').pop()?.toLowerCase() ?? ''
  if (a.contentType === 'application/pdf' || ['doc', 'docx', 'txt'].includes(ext)) return FileText
  if (['xls', 'xlsx', 'csv'].includes(ext)) return FileSpreadsheet
  if (['zip', 'rar', '7z'].includes(ext)) return FileArchive
  return FileIcon
}

interface Uploading { id: string; name: string; progress: number; error?: string }

export default function AttachmentsField({ value, onChange, uploadPrefix, onBusyChange, lockedUrls }: {
  value: Attachment[]
  onChange: (files: Attachment[]) => void
  uploadPrefix: string
  onBusyChange?: (busy: boolean) => void
  // Files that can't be removed here (an assignee may add files but not delete the owner's).
  lockedUrls?: Set<string>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<Uploading[]>([])
  // Uploads finish out of order — keep the latest list in a ref so each completion
  // appends to what's there now, not to the stale `value` it was started with.
  const latest = useRef(value)
  latest.current = value

  async function handleFiles(list: File[]) {
    const room = MAX_COUNT - value.length - uploading.filter(u => !u.error).length
    const files = list.slice(0, Math.max(0, room))
    if (!files.length) return
    const jobs = files.map(f => ({ file: f, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` }))
    setUploading(u => [...u, ...jobs.map(j => ({
      id: j.id, name: j.file.name, progress: 0,
      error: j.file.size > MAX_SIZE ? 'Over 25MB' : undefined,
    }))])
    onBusyChange?.(true)

    await Promise.all(jobs.filter(j => j.file.size <= MAX_SIZE).map(async ({ file, id }) => {
      const safe = file.name.replace(/[/\\?#%]/g, '_')
      try {
        const { url } = await uploadToR2WithProgress('/api/my-works/upload', `${uploadPrefix}${Date.now()}-${safe}`, file,
          p => setUploading(u => u.map(x => x.id === id ? { ...x, progress: p } : x)))
        const att: Attachment = { url, name: file.name, size: file.size, contentType: file.type || 'application/octet-stream', uploadedAt: new Date().toISOString() }
        latest.current = [...latest.current, att]
        onChange(latest.current)
        setUploading(u => u.filter(x => x.id !== id))
      } catch (e) {
        setUploading(u => u.map(x => x.id === id ? { ...x, error: e instanceof Error ? e.message : 'Upload failed' } : x))
      }
    }))
    onBusyChange?.(false)
  }

  const { isDragging, dropProps } = useFileDrop(handleFiles)

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => inputRef.current?.click()} {...dropProps}
        className={`w-full border-2 border-dashed rounded-lg px-4 py-4 text-center text-sm transition-colors ${isDragging ? 'border-amber-500 bg-amber-50' : 'border-muted-foreground/25 hover:border-amber-400 hover:bg-muted/30'}`}>
        <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
        <span className="font-medium">Drop files here</span> <span className="text-muted-foreground">or click to browse</span>
        <p className="text-xs text-muted-foreground mt-0.5">Any file type · max 25MB each</p>
      </button>
      <input ref={inputRef} type="file" multiple className="hidden"
        onChange={e => { if (e.target.files) handleFiles(Array.from(e.target.files)); e.target.value = '' }} />

      {(value.length > 0 || uploading.length > 0) && (
        <div className="space-y-1.5">
          {value.map(a => {
            const isImage = a.contentType.startsWith('image/')
            const Icon = iconFor(a)
            return (
              <div key={a.url} className="flex items-center gap-3 rounded-lg border px-2.5 py-2">
                {isImage
                  ? <img src={a.url} alt="" className="h-9 w-9 rounded object-cover border shrink-0" /> // eslint-disable-line @next/next/no-img-element
                  : <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0"><Icon className="h-4 w-4 text-muted-foreground" /></div>}
                <div className="flex-1 min-w-0">
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium truncate block hover:text-amber-700 hover:underline">{a.name}</a>
                  <p className="text-xs text-muted-foreground">{fmtSize(a.size)}</p>
                </div>
                <a href={a.url} target="_blank" rel="noopener noreferrer" download={a.name} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Open / download"><Download className="h-4 w-4" /></a>
                {!lockedUrls?.has(a.url) && (
                  <button type="button" onClick={() => onChange(value.filter(x => x.url !== a.url))} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600" title="Remove">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )
          })}
          {uploading.map(u => (
            <div key={u.id} className={`flex items-center gap-3 rounded-lg border px-2.5 py-2 ${u.error ? 'border-red-200 bg-red-50' : ''}`}>
              <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
                {u.error ? <Paperclip className="h-4 w-4 text-red-500" /> : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{u.name}</p>
                {u.error
                  ? <p className="text-xs text-red-600">{u.error}</p>
                  : <div className="h-1.5 mt-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-amber-500 transition-all" style={{ width: `${u.progress}%` }} /></div>}
              </div>
              {u.error && (
                <button type="button" onClick={() => setUploading(x => x.filter(y => y.id !== u.id))} className="p-1.5 rounded hover:bg-red-100 text-red-500"><X className="h-4 w-4" /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
