'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Image as ImageIcon, FileText, Video, Upload, Trash2, Loader2, Link2, FolderOpen, FolderPlus,
  ChevronLeft, Settings, Plus, Pencil, Check, X, Megaphone, Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ACCENT = '#bdac7e'

type MediaFileType = 'image' | 'document' | 'video'

interface Yacht { id: string; name: string }
interface MediaCategoryRecord { id: string; name: string; sortOrder: number }
interface MediaFolderRecord { id: string; yachtId: string | null; categoryId: string; parentId: string | null; name: string }

interface MediaFile {
  id: string
  yachtId: string | null
  yacht: { id: string; name: string } | null
  categoryId: string
  type: MediaFileType
  name: string
  url: string
  sizeBytes: number | null
  mimeType: string | null
  folderId: string | null
  createdAt: string
  uploadedBy: { name: string | null; email: string | null }
}

interface PromoRecord {
  id: string
  yachtId: string | null
  yacht: { id: string; name: string } | null
  title: string
  description: string | null
  imageUrl: string | null
  ctaLabel: string | null
  ctaUrl: string | null
  isActive: boolean
  createdAt: string
}

function formatSize(bytes: number | null) {
  if (bytes == null) return null
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileCard({ file, onDelete, deleting }: { file: MediaFile; onDelete: (f: MediaFile) => void; deleting: boolean }) {
  return (
    <Card>
      <CardContent className="py-3 px-4 flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-muted-foreground">
          {file.type === 'image' && <ImageIcon className="h-4 w-4" />}
          {file.type === 'document' && <FileText className="h-4 w-4" />}
          {file.type === 'video' && <Video className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium truncate block hover:underline">{file.name}</a>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {formatSize(file.sizeBytes) ?? 'External link'} · {file.uploadedBy.name ?? file.uploadedBy.email ?? 'Unknown'}
          </p>
        </div>
        <button
          onClick={() => onDelete(file)}
          disabled={deleting}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-600 transition-colors shrink-0"
          title="Delete"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </CardContent>
    </Card>
  )
}

export default function MediaKit() {
  const [yachts, setYachts] = useState<Yacht[]>([])
  const [selectedYachtId, setSelectedYachtId] = useState<string>('') // '' = General (shows on every yacht)
  const [files, setFiles] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)

  const [categories, setCategories] = useState<MediaCategoryRecord[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<string>('')

  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkSaving, setLinkSaving] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  // null = top level of the active category. Folders can nest to unlimited depth.
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [mediaFolders, setMediaFolders] = useState<MediaFolderRecord[]>([])
  const [deletingFolder, setDeletingFolder] = useState(false)

  // category management dialog
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)

  // Agent Portal promo — shown as a popup on login (General) or on yacht pick (per-yacht)
  const [promos, setPromos] = useState<PromoRecord[]>([])
  const [promoDialogOpen, setPromoDialogOpen] = useState(false)
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null)
  const [promoTitle, setPromoTitle] = useState('')
  const [promoDescription, setPromoDescription] = useState('')
  const [promoImageUrl, setPromoImageUrl] = useState('')
  const [promoImageMeta, setPromoImageMeta] = useState<{ sizeBytes: number; mimeType: string } | null>(null)
  const [promoCtaLabel, setPromoCtaLabel] = useState('')
  const [promoCtaUrl, setPromoCtaUrl] = useState('')
  const [promoSaving, setPromoSaving] = useState(false)
  const [promoUploading, setPromoUploading] = useState(false)
  const [activatingPromoId, setActivatingPromoId] = useState<string | null>(null)
  const [deletingPromoId, setDeletingPromoId] = useState<string | null>(null)
  const promoFileInputRef = useRef<HTMLInputElement>(null)

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

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/folders')
      if (res.ok) setMediaFolders(await res.json())
    } catch (e) { console.error(e) }
  }, [])

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/categories')
      if (res.ok) setCategories(await res.json())
    } catch (e) { console.error(e) }
  }, [])

  const fetchPromos = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/promos')
      if (res.ok) setPromos(await res.json())
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => { fetchYachts(); fetchFiles(); fetchFolders(); fetchCategories(); fetchPromos() }, [fetchYachts, fetchFiles, fetchFolders, fetchCategories, fetchPromos])

  useEffect(() => {
    if (!activeCategoryId && categories.length) setActiveCategoryId(categories[0].id)
  }, [categories, activeCategoryId])

  const activeCategory = categories.find(c => c.id === activeCategoryId) ?? null

  const scopedFiles = useMemo(() => {
    const scoped = selectedYachtId ? files.filter(f => f.yachtId === selectedYachtId) : files.filter(f => !f.yachtId)
    return scoped.filter(f => f.categoryId === activeCategoryId)
  }, [files, selectedYachtId, activeCategoryId])

  const scopedPromos = useMemo(
    () => promos
      .filter(p => (p.yachtId ?? '') === selectedYachtId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [promos, selectedYachtId]
  )

  const scopedFolders = useMemo(
    () => mediaFolders.filter(f => (f.yachtId ?? '') === selectedYachtId && f.categoryId === activeCategoryId),
    [mediaFolders, selectedYachtId, activeCategoryId]
  )

  useEffect(() => { setActiveFolderId(null) }, [activeCategoryId, selectedYachtId])

  // Everything visible at the currently open level — top level (null) or inside a folder.
  const currentFiles = useMemo(
    () => scopedFiles.filter(f => (f.folderId ?? null) === activeFolderId),
    [scopedFiles, activeFolderId]
  )
  const currentFolders = useMemo(
    () => scopedFolders.filter(f => (f.parentId ?? null) === activeFolderId),
    [scopedFolders, activeFolderId]
  )
  // Breadcrumb trail from category root down to the open folder.
  const folderPath = useMemo(() => {
    const path: MediaFolderRecord[] = []
    let current = activeFolderId ? scopedFolders.find(f => f.id === activeFolderId) ?? null : null
    while (current) {
      path.unshift(current)
      current = current.parentId ? scopedFolders.find(f => f.id === current!.parentId) ?? null : null
    }
    return path
  }, [scopedFolders, activeFolderId])
  const activeFolder = folderPath[folderPath.length - 1] ?? null

  function folderFileCount(folderId: string) {
    return scopedFiles.filter(f => f.folderId === folderId).length
  }

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !activeCategoryId) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('yachtId', selectedYachtId)
      form.append('categoryId', activeCategoryId)
      const uploadRes = await fetch('/api/marketing/media/upload', { method: 'POST', body: form })
      const uploadData = await uploadRes.json().catch(() => ({}))
      if (!uploadRes.ok) { toast.error(uploadData.error ?? 'Upload failed'); return }

      const saveRes = await fetch('/api/marketing/media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yachtId: selectedYachtId || null,
          categoryId: activeCategoryId,
          type: file.type.startsWith('image/') ? 'image' : 'document',
          name: file.name,
          url: uploadData.url,
          sizeBytes: uploadData.sizeBytes,
          mimeType: uploadData.mimeType,
          folderId: activeFolderId,
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
    if (!linkName.trim() || !linkUrl.trim() || !activeCategoryId) { toast.error('Name and URL are required'); return }
    setLinkSaving(true)
    try {
      const res = await fetch('/api/marketing/media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yachtId: selectedYachtId || null,
          categoryId: activeCategoryId,
          type: 'video',
          name: linkName.trim(),
          url: linkUrl.trim(),
          folderId: activeFolderId,
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? 'Failed to save link'); return }
      toast.success('Video link added')
      setLinkDialogOpen(false)
      await fetchFiles()
    } catch (e) { console.error(e); toast.error('Failed to save link') }
    finally { setLinkSaving(false) }
  }

  function openNewFolderDialog() {
    setNewFolderName('')
    setNewFolderDialogOpen(true)
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim()
    if (!name || !activeCategoryId) { toast.error('Folder name is required'); return }
    if (currentFolders.some(f => f.name.toLowerCase() === name.toLowerCase())) { toast.error('A folder with that name already exists here'); return }
    setCreatingFolder(true)
    try {
      const res = await fetch('/api/marketing/folders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yachtId: selectedYachtId || null, categoryId: activeCategoryId, parentId: activeFolderId, name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Failed to create folder'); return }
      await fetchFolders()
      setActiveFolderId(data.id)
      setNewFolderDialogOpen(false)
    } catch (e) { console.error(e); toast.error('Failed to create folder') }
    finally { setCreatingFolder(false) }
  }

  async function handleDeleteFolder() {
    if (!activeFolder) return
    if (!confirm(`Delete folder "${activeFolder.name}"? It must be empty.`)) return
    setDeletingFolder(true)
    try {
      const res = await fetch(`/api/marketing/folders/${activeFolder.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? 'Failed to delete folder'); return }
      await fetchFolders()
      setActiveFolderId(activeFolder.parentId)
    } catch (e) { console.error(e); toast.error('Failed to delete folder') }
    finally { setDeletingFolder(false) }
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

  async function handleAddCategory() {
    const name = newCategoryName.trim()
    if (!name) { toast.error('Category name is required'); return }
    setAddingCategory(true)
    try {
      const res = await fetch('/api/marketing/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Failed to add category'); return }
      setNewCategoryName('')
      await fetchCategories()
      setActiveCategoryId(data.id)
    } catch (e) { console.error(e); toast.error('Failed to add category') }
    finally { setAddingCategory(false) }
  }

  function startEditCategory(c: MediaCategoryRecord) {
    setEditingCategoryId(c.id)
    setEditingCategoryName(c.name)
  }

  async function handleSaveCategoryName(id: string) {
    const name = editingCategoryName.trim()
    if (!name) { toast.error('Category name is required'); return }
    setSavingCategoryId(id)
    try {
      const res = await fetch(`/api/marketing/categories/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Failed to rename category'); return }
      setEditingCategoryId(null)
      await fetchCategories()
    } catch (e) { console.error(e); toast.error('Failed to rename category') }
    finally { setSavingCategoryId(null) }
  }

  async function handleDeleteCategory(c: MediaCategoryRecord) {
    if (!confirm(`Delete category "${c.name}"? It must be empty.`)) return
    setDeletingCategoryId(c.id)
    try {
      const res = await fetch(`/api/marketing/categories/${c.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Failed to delete category'); return }
      if (activeCategoryId === c.id) setActiveCategoryId('')
      await fetchCategories()
    } catch (e) { console.error(e); toast.error('Failed to delete category') }
    finally { setDeletingCategoryId(null) }
  }

  function openCreatePromoDialog() {
    setEditingPromoId(null)
    setPromoTitle('')
    setPromoDescription('')
    setPromoImageUrl('')
    setPromoImageMeta(null)
    setPromoCtaLabel('')
    setPromoCtaUrl('')
    setPromoDialogOpen(true)
  }

  function openEditPromoDialog(p: PromoRecord) {
    setEditingPromoId(p.id)
    setPromoTitle(p.title)
    setPromoDescription(p.description ?? '')
    setPromoImageUrl(p.imageUrl ?? '')
    setPromoImageMeta(null)
    setPromoCtaLabel(p.ctaLabel ?? '')
    setPromoCtaUrl(p.ctaUrl ?? '')
    setPromoDialogOpen(true)
  }

  async function handlePromoImagePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPromoUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('yachtId', selectedYachtId)
      form.append('categoryId', 'promo')
      const res = await fetch('/api/marketing/media/upload', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Upload failed'); return }
      setPromoImageUrl(data.url)
      setPromoImageMeta({ sizeBytes: data.sizeBytes, mimeType: data.mimeType })
    } catch (e) { console.error(e); toast.error('Upload failed') }
    finally { setPromoUploading(false) }
  }

  async function handleSavePromo() {
    if (!promoTitle.trim()) { toast.error('Title is required'); return }
    setPromoSaving(true)
    try {
      const body = {
        title: promoTitle.trim(),
        description: promoDescription.trim() || null,
        imageUrl: promoImageUrl || null,
        imageSizeBytes: promoImageMeta?.sizeBytes ?? null,
        imageMimeType: promoImageMeta?.mimeType ?? null,
        ctaLabel: promoCtaLabel.trim() || null,
        ctaUrl: promoCtaUrl.trim() || null,
      }
      const res = editingPromoId
        ? await fetch(`/api/marketing/promos/${editingPromoId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          })
        : await fetch('/api/marketing/promos', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, yachtId: selectedYachtId || null }),
          })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Failed to save promo'); return }
      toast.success(editingPromoId ? 'Promo updated' : 'Promo created')
      setPromoDialogOpen(false)
      await fetchPromos()
    } catch (e) { console.error(e); toast.error('Failed to save promo') }
    finally { setPromoSaving(false) }
  }

  async function handleActivatePromo(p: PromoRecord) {
    setActivatingPromoId(p.id)
    try {
      const res = await fetch(`/api/marketing/promos/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: true }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? 'Failed to activate promo'); return }
      toast.success('Promo activated')
      await fetchPromos()
    } catch (e) { console.error(e); toast.error('Failed to activate promo') }
    finally { setActivatingPromoId(null) }
  }

  async function handleDeletePromo(p: PromoRecord) {
    if (!confirm(`Delete promo "${p.title}"?`)) return
    setDeletingPromoId(p.id)
    try {
      const res = await fetch(`/api/marketing/promos/${p.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? 'Failed to delete promo'); return }
      await fetchPromos()
    } catch (e) { console.error(e); toast.error('Failed to delete promo') }
    finally { setDeletingPromoId(null) }
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

      <Card>
        <CardContent className="py-4 px-5 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Megaphone className="h-3.5 w-3.5" style={{ color: ACCENT }} />
                Agent Portal Promo — {selectedYachtId ? (yachts.find(y => y.id === selectedYachtId)?.name ?? '') : 'General'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedYachtId
                  ? 'Shown as a popup when an agent picks this yacht in the Agent Portal. Only one draft can be active at a time.'
                  : 'Shown as a popup right after an agent logs into the Agent Portal. Only one draft can be active at a time.'}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={openCreatePromoDialog}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Promo
            </Button>
          </div>

          {scopedPromos.length === 0 ? (
            <p className="text-xs text-muted-foreground">No promo drafts for this scope yet.</p>
          ) : (
            <div className="space-y-2">
              {scopedPromos.map(p => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.title} className="h-10 w-14 object-cover rounded shrink-0" />
                  ) : (
                    <div className="h-10 w-14 rounded bg-muted flex items-center justify-center shrink-0">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.title}</p>
                    {p.isActive && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: ACCENT }}>
                        <Star className="h-2.5 w-2.5 fill-current" /> Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!p.isActive && (
                      <Button
                        size="sm" variant="outline" className="h-7 text-xs px-2.5"
                        disabled={activatingPromoId === p.id}
                        onClick={() => handleActivatePromo(p)}
                      >
                        {activatingPromoId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Set Active'}
                      </Button>
                    )}
                    <button
                      onClick={() => openEditPromoDialog(p)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeletePromo(p)}
                      disabled={deletingPromoId === p.id}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-600 transition-colors"
                      title="Delete"
                    >
                      {deletingPromoId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 border-b">
        <div className="flex gap-x-6 gap-y-2 flex-wrap">
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveCategoryId(c.id)}
              className={cn(
                'relative pb-3 text-sm whitespace-nowrap transition-colors',
                activeCategoryId === c.id ? 'text-foreground font-medium' : 'text-muted-foreground/70 hover:text-foreground'
              )}
            >
              {c.name}
              {activeCategoryId === c.id && <span className="absolute left-0 right-0 -bottom-px h-px" style={{ background: ACCENT }} />}
            </button>
          ))}
        </div>
        <button
          onClick={() => setManageCategoriesOpen(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pb-3 shrink-0"
        >
          <Settings className="h-3.5 w-3.5" /> Manage categories
        </button>
      </div>

      {!activeCategory ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          No categories yet — click "Manage categories" to add one.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs flex-wrap min-w-0">
              <button
                onClick={() => setActiveFolderId(null)}
                className={cn('transition-colors', !activeFolderId ? 'text-foreground font-medium' : 'text-muted-foreground/70 hover:text-foreground')}
              >
                {activeCategory.name}
              </button>
              {folderPath.map(f => (
                <span key={f.id} className="flex items-center gap-2">
                  <span className="text-muted-foreground/30">/</span>
                  <button
                    onClick={() => setActiveFolderId(f.id)}
                    className={cn('transition-colors', f.id === activeFolderId ? 'text-foreground font-medium' : 'text-muted-foreground/70 hover:text-foreground')}
                  >
                    {f.name}
                  </button>
                </span>
              ))}
              {activeFolder && currentFiles.length === 0 && currentFolders.length === 0 && (
                <button
                  onClick={handleDeleteFolder}
                  disabled={deletingFolder}
                  className="flex items-center gap-1 text-muted-foreground hover:text-red-600 transition-colors ml-2"
                >
                  {deletingFolder ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Delete this folder
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={openNewFolderDialog}>
                <FolderPlus className="h-3.5 w-3.5 mr-1.5" /> New Folder
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFilePicked} />
              <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                Upload
              </Button>
              <Button size="sm" style={{ backgroundColor: ACCENT }} className="text-white" onClick={openLinkDialog}>
                <Link2 className="h-3.5 w-3.5 mr-1.5" /> Add video link
              </Button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : currentFiles.length === 0 && currentFolders.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nothing here yet.</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {currentFolders.map(folder => (
                <Card key={folder.id} className="cursor-pointer hover:border-[#bdac7e]/50 transition-colors" onClick={() => setActiveFolderId(folder.id)}>
                  <CardContent className="py-3 px-4 flex items-center gap-3">
                    <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{folder.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {folderFileCount(folder.id)} file{folderFileCount(folder.id) === 1 ? '' : 's'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {currentFiles.map(f => <FileCard key={f.id} file={f} onDelete={handleDelete} deleting={deletingId === f.id} />)}
            </div>
          )}
        </>
      )}

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Link2 className="h-4 w-4 text-[#bdac7e]" /> Add Video Link</DialogTitle>
            <DialogDescription>Paste a YouTube or Vimeo (unlisted) link — it will show up in the Agent Portal's {activeCategory?.name} section.</DialogDescription>
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

      <Dialog open={promoDialogOpen} onOpenChange={setPromoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-[#bdac7e]" /> {editingPromoId ? 'Edit Promo' : 'Add Promo'}</DialogTitle>
            <DialogDescription>
              {selectedYachtId
                ? 'Shown as a popup in the Agent Portal when an agent picks this yacht.'
                : 'Shown as a popup right after an agent logs into the Agent Portal.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="promo-title">Title</Label>
              <Input id="promo-title" value={promoTitle} onChange={e => setPromoTitle(e.target.value)} placeholder="e.g. Low Season Special" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="promo-description">Description</Label>
              <Textarea id="promo-description" value={promoDescription} onChange={e => setPromoDescription(e.target.value)} placeholder="Short promo copy shown under the title…" rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Image</Label>
              {promoImageUrl ? (
                <div className="flex items-center gap-3">
                  <img src={promoImageUrl} alt="Promo" className="h-16 w-24 object-cover rounded border" />
                  <Button size="sm" variant="outline" onClick={() => { setPromoImageUrl(''); setPromoImageMeta(null) }}>Remove</Button>
                </div>
              ) : (
                <>
                  <input ref={promoFileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePromoImagePicked} />
                  <Button size="sm" variant="outline" disabled={promoUploading} onClick={() => promoFileInputRef.current?.click()}>
                    {promoUploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                    Upload image
                  </Button>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="promo-cta-label">CTA button label</Label>
                <Input id="promo-cta-label" value={promoCtaLabel} onChange={e => setPromoCtaLabel(e.target.value)} placeholder="e.g. Learn More" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="promo-cta-url">CTA URL</Label>
                <Input id="promo-cta-url" value={promoCtaUrl} onChange={e => setPromoCtaUrl(e.target.value)} placeholder="https://…" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoDialogOpen(false)}>Cancel</Button>
            <Button disabled={promoSaving} onClick={handleSavePromo} style={{ backgroundColor: ACCENT }} className="text-white">
              {promoSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingPromoId ? 'Save Changes' : 'Create Promo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FolderPlus className="h-4 w-4 text-[#bdac7e]" /> New Folder</DialogTitle>
            <DialogDescription>
              {activeFolder ? `Inside "${activeFolder.name}"` : `Inside ${activeCategory?.name}`} — this also shows as a folder in the Agent Portal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="new-folder-name">Folder name</Label>
            <Input
              id="new-folder-name"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              placeholder="e.g. Exterior"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderDialogOpen(false)}>Cancel</Button>
            <Button disabled={creatingFolder} onClick={handleCreateFolder} style={{ backgroundColor: ACCENT }} className="text-white">
              {creatingFolder && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manageCategoriesOpen} onOpenChange={setManageCategoriesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings className="h-4 w-4 text-[#bdac7e]" /> Manage Categories</DialogTitle>
            <DialogDescription>Rename, add, or remove the tabs shown here and in the Agent Portal. A category can't be removed while it still has files.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2 max-h-80 overflow-y-auto">
            {categories.map(c => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                {editingCategoryId === c.id ? (
                  <>
                    <Input
                      className="h-8"
                      value={editingCategoryName}
                      onChange={e => setEditingCategoryName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSaveCategoryName(c.id)}
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveCategoryName(c.id)}
                      disabled={savingCategoryId === c.id}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-emerald-600 transition-colors shrink-0"
                      title="Save"
                    >
                      {savingCategoryId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => setEditingCategoryId(null)} className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors shrink-0" title="Cancel">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm truncate">{c.name}</span>
                    <button
                      onClick={() => startEditCategory(c)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(c)}
                      disabled={deletingCategoryId === c.id}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-600 transition-colors shrink-0"
                      title="Delete"
                    >
                      {deletingCategoryId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1 border-t">
            <Input
              className="h-9"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
              placeholder="New category name…"
            />
            <Button size="sm" disabled={addingCategory} onClick={handleAddCategory} style={{ backgroundColor: ACCENT }} className="text-white shrink-0">
              {addingCategory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageCategoriesOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
