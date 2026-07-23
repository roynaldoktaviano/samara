'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Image as ImageIcon, FileText, Video, Upload, Trash2, Loader2, Link2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ACCENT = '#bdac7e'

type MediaCategory = 'brochure' | 'itinerary' | 'deck_plan' | 'rates_terms' | 'press_kit' | 'testimonial' | 'photo' | 'video' | 'reel'
type MediaFileType = 'image' | 'document' | 'video'

const CATEGORIES: { id: MediaCategory; label: string; kind: 'file' | 'link' }[] = [
  { id: 'brochure',    label: 'Brochures',      kind: 'file' },
  { id: 'itinerary',   label: 'Itineraries',    kind: 'file' },
  { id: 'deck_plan',   label: 'Deck Plans',     kind: 'file' },
  { id: 'rates_terms', label: 'Rates & T&Cs',   kind: 'file' },
  { id: 'press_kit',   label: 'Press Kit',      kind: 'file' },
  { id: 'testimonial', label: 'Testimonials',   kind: 'file' },
  { id: 'photo',       label: 'Photos',         kind: 'file' },
  { id: 'video',       label: 'Videos',         kind: 'link' },
  { id: 'reel',        label: 'Reels',          kind: 'link' },
]

interface Yacht { id: string; name: string }

interface MediaFile {
  id: string
  yachtId: string | null
  yacht: { id: string; name: string } | null
  category: MediaCategory
  type: MediaFileType
  name: string
  url: string
  sizeBytes: number | null
  mimeType: string | null
  folder: string | null
  createdAt: string
  uploadedBy: { name: string | null; email: string | null }
}

function formatSize(bytes: number | null) {
  if (bytes == null) return null
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function MediaKit() {
  const [yachts, setYachts] = useState<Yacht[]>([])
  const [selectedYachtId, setSelectedYachtId] = useState<string>('') // '' = General (shows on every yacht)
  const [files, setFiles] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<MediaCategory>('brochure')

  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkSaving, setLinkSaving] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchYachts = useCallback(async () => {
    try {
      const res = await fetch('/api/yachts')
      if (res.ok) setYachts((await res.json()).map((y: { id: string; name: string }) => ({ id: y.id, name: y.name })))
    } catch (e) { console.error(e) }
  }, [])

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketing/media')
      if (res.ok) setFiles(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchYachts(); fetchFiles() }, [fetchYachts, fetchFiles])

  const activeMeta = CATEGORIES.find(c => c.id === activeCategory)!

  const scopedFiles = useMemo(() => {
    const scoped = selectedYachtId ? files.filter(f => f.yachtId === selectedYachtId) : files.filter(f => !f.yachtId)
    return scoped.filter(f => f.category === activeCategory)
  }, [files, selectedYachtId, activeCategory])

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('yachtId', selectedYachtId)
      form.append('category', activeCategory)
      const uploadRes = await fetch('/api/marketing/media/upload', { method: 'POST', body: form })
      const uploadData = await uploadRes.json().catch(() => ({}))
      if (!uploadRes.ok) { toast.error(uploadData.error ?? 'Upload failed'); return }

      const saveRes = await fetch('/api/marketing/media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yachtId: selectedYachtId || null,
          category: activeCategory,
          type: file.type.startsWith('image/') ? 'image' : 'document',
          name: file.name,
          url: uploadData.url,
          sizeBytes: uploadData.sizeBytes,
          mimeType: uploadData.mimeType,
        }),
      })
      if (!saveRes.ok) { const d = await saveRes.json().catch(() => ({})); toast.error(d.error ?? 'Failed to save file'); return }
      toast.success(`${file.name} uploaded`)
      await fetchFiles()
    } catch (e) { console.error(e); toast.error('Upload failed') }
    finally { setUploading(false) }
  }

  function openLinkDialog() {
    setLinkName('')
    setLinkUrl('')
    setLinkDialogOpen(true)
  }

  async function handleSaveLink() {
    if (!linkName.trim() || !linkUrl.trim()) { toast.error('Name and URL are required'); return }
    setLinkSaving(true)
    try {
      const res = await fetch('/api/marketing/media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yachtId: selectedYachtId || null,
          category: activeCategory,
          type: 'video',
          name: linkName.trim(),
          url: linkUrl.trim(),
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? 'Failed to save link'); return }
      toast.success('Video link added')
      setLinkDialogOpen(false)
      await fetchFiles()
    } catch (e) { console.error(e); toast.error('Failed to save link') }
    finally { setLinkSaving(false) }
  }

  async function handleDelete(file: MediaFile) {
    if (!confirm(`Delete "${file.name}"?`)) return
    setDeletingId(file.id)
    try {
      const res = await fetch(`/api/marketing/media/${file.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete'); return }
      setFiles(prev => prev.filter(f => f.id !== file.id))
    } catch (e) { console.error(e); toast.error('Failed to delete') }
    finally { setDeletingId(null) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Media Kit</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Files uploaded here appear in the Agent Portal for the selected yacht — or under "General" to show on every yacht.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-64">
          <Select value={selectedYachtId || '__fleet__'} onValueChange={v => setSelectedYachtId(v === '__fleet__' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="General" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__fleet__">General (shows on every yacht)</SelectItem>
              {yachts.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-x-6 gap-y-2 flex-wrap border-b">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveCategory(c.id)}
            className={cn(
              'relative pb-3 text-sm whitespace-nowrap transition-colors',
              activeCategory === c.id ? 'text-foreground font-medium' : 'text-muted-foreground/70 hover:text-foreground'
            )}
          >
            {c.label}
            {activeCategory === c.id && <span className="absolute left-0 right-0 -bottom-px h-px" style={{ background: ACCENT }} />}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {scopedFiles.length} item{scopedFiles.length === 1 ? '' : 's'} — {selectedYachtId ? yachts.find(y => y.id === selectedYachtId)?.name : 'General'}
        </p>
        {activeMeta.kind === 'file' ? (
          <>
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFilePicked} />
            <Button size="sm" style={{ backgroundColor: ACCENT }} className="text-white" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
              Upload
            </Button>
          </>
        ) : (
          <Button size="sm" style={{ backgroundColor: ACCENT }} className="text-white" onClick={openLinkDialog}>
            <Link2 className="h-3.5 w-3.5 mr-1.5" /> Add video link
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : scopedFiles.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No files yet in this category.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {scopedFiles.map(f => (
            <Card key={f.id}>
              <CardContent className="py-3 px-4 flex items-start gap-3">
                <div className="mt-0.5 shrink-0 text-muted-foreground">
                  {f.type === 'image' && <ImageIcon className="h-4 w-4" />}
                  {f.type === 'document' && <FileText className="h-4 w-4" />}
                  {f.type === 'video' && <Video className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium truncate block hover:underline">{f.name}</a>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {formatSize(f.sizeBytes) ?? 'External link'} · {f.uploadedBy.name ?? f.uploadedBy.email ?? 'Unknown'}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(f)}
                  disabled={deletingId === f.id}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-600 transition-colors shrink-0"
                  title="Delete"
                >
                  {deletingId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Link2 className="h-4 w-4 text-[#bdac7e]" /> Add Video Link</DialogTitle>
            <DialogDescription>Paste a YouTube or Vimeo (unlisted) link — it will show up in the Agent Portal's {activeMeta.label} section.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="link-name">Title</Label>
              <Input id="link-name" value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="e.g. Full Walkthrough" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="link-url">Video URL</Label>
              <Input id="link-url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://youtube.com/watch?v=…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
            <Button disabled={linkSaving} onClick={handleSaveLink} style={{ backgroundColor: ACCENT }} className="text-white">
              {linkSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
