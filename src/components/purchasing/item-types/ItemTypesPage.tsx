'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { Tags, Plus, Pencil, Trash2, Loader2, Lock, FolderOpen } from 'lucide-react'

interface ItemCategory {
  id: string
  typeCode: string
  name: string
  skuPrefix: string
  isActive: boolean
  itemCount: number
}

interface ItemType {
  id: string
  code: string
  label: string
  isLocked: boolean
  isActive: boolean
  itemCount: number
  categories: ItemCategory[]
}

const EMPTY_TYPE_FORM = { code: '', label: '', isActive: true }
const EMPTY_CAT_FORM = { name: '', skuPrefix: '', isActive: true }

export default function ItemTypesPage() {
  const [types, setTypes] = useState<ItemType[]>([])
  const [loading, setLoading] = useState(true)

  // Type add/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editType, setEditType] = useState<ItemType | null>(null)
  const [form, setForm] = useState(EMPTY_TYPE_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteType, setConfirmDeleteType] = useState<ItemType | null>(null)
  const [deletingType, setDeletingType] = useState<string | null>(null)

  // Categories panel
  const [categoriesFor, setCategoriesFor] = useState<ItemType | null>(null)
  const [catDialogOpen, setCatDialogOpen] = useState(false)
  const [editCat, setEditCat] = useState<ItemCategory | null>(null)
  const [catForm, setCatForm] = useState(EMPTY_CAT_FORM)
  const [catSaving, setCatSaving] = useState(false)
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<ItemCategory | null>(null)
  const [deletingCat, setDeletingCat] = useState<string | null>(null)

  const fetchTypes = useCallback(async (): Promise<ItemType[]> => {
    setLoading(true)
    try {
      const res = await fetch('/api/purchasing/item-types')
      const data = await res.json()
      setTypes(data)
      return data
    } catch {
      toast.error('Failed to load item types')
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTypes() }, [fetchTypes])

  async function refreshKeepingCategoriesPanel() {
    const fresh = await fetchTypes()
    if (categoriesFor) {
      const updated = fresh.find(t => t.id === categoriesFor.id)
      if (updated) setCategoriesFor(updated)
    }
  }

  function openAdd() {
    setEditType(null)
    setForm(EMPTY_TYPE_FORM)
    setDialogOpen(true)
  }

  function openEdit(t: ItemType) {
    setEditType(t)
    setForm({ code: t.code, label: t.label, isActive: t.isActive })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.label.trim() || (!editType && !form.code.trim())) {
      toast.error('Semua field wajib diisi')
      return
    }
    setSaving(true)
    try {
      const url = editType ? `/api/purchasing/item-types/${editType.id}` : '/api/purchasing/item-types'
      const method = editType ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Gagal menyimpan')
      toast.success(editType ? 'Tipe diperbarui' : 'Tipe ditambahkan')
      setDialogOpen(false)
      fetchTypes()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteType(t: ItemType) {
    setDeletingType(t.id)
    try {
      const res = await fetch(`/api/purchasing/item-types/${t.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Gagal menghapus')
      toast.success('Tipe dihapus')
      setConfirmDeleteType(null)
      fetchTypes()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeletingType(null)
    }
  }

  function openAddCat(t: ItemType) {
    setCategoriesFor(t)
    setEditCat(null)
    setCatForm(EMPTY_CAT_FORM)
    setCatDialogOpen(true)
  }

  function openEditCat(t: ItemType, c: ItemCategory) {
    setCategoriesFor(t)
    setEditCat(c)
    setCatForm({ name: c.name, skuPrefix: c.skuPrefix, isActive: c.isActive })
    setCatDialogOpen(true)
  }

  async function handleSaveCat() {
    if (!categoriesFor) return
    if (!catForm.skuPrefix.trim() || (!editCat && !catForm.name.trim())) {
      toast.error('Nama kategori dan SKU prefix wajib diisi')
      return
    }
    setCatSaving(true)
    try {
      const url = editCat
        ? `/api/purchasing/item-types/${categoriesFor.id}/categories/${editCat.id}`
        : `/api/purchasing/item-types/${categoriesFor.id}/categories`
      const method = editCat ? 'PUT' : 'POST'
      const body = editCat
        ? { isActive: catForm.isActive, skuPrefix: catForm.skuPrefix }
        : { name: catForm.name, skuPrefix: catForm.skuPrefix }
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Gagal menyimpan')
      toast.success(editCat ? 'Kategori diperbarui' : 'Kategori ditambahkan')
      setCatDialogOpen(false)
      refreshKeepingCategoriesPanel()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCatSaving(false)
    }
  }

  async function handleDeleteCat(t: ItemType, c: ItemCategory) {
    setDeletingCat(c.id)
    try {
      const res = await fetch(`/api/purchasing/item-types/${t.id}/categories/${c.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Gagal menghapus')
      toast.success('Kategori dihapus')
      setConfirmDeleteCat(null)
      refreshKeepingCategoriesPanel()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeletingCat(null)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Tags className="h-4 w-4" /> Item Types
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Manage item types and their categories used across Item Master
              </CardDescription>
            </div>
            <Button size="sm" onClick={openAdd} className="gap-1.5 bg-amber-600 hover:bg-amber-700">
              <Plus className="h-4 w-4" /> Add Type
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : types.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Tags className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No item types yet
            </div>
          ) : (
            <div className="space-y-2">
              {types.map(t => {
                const deleteBlockedReason = t.isLocked
                  ? 'Tipe bawaan sistem tidak bisa dihapus'
                  : t.itemCount > 0
                  ? `Masih dipakai oleh ${t.itemCount} item`
                  : null
                return (
                  <div key={t.id} className={`rounded-lg border p-3.5 ${!t.isActive ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{t.label}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t.code}</span>
                          {t.isLocked && (
                            <Badge variant="outline" className="text-[10px] gap-1"><Lock className="h-2.5 w-2.5" /> System</Badge>
                          )}
                          {!t.isActive && <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t.categories.length} categories · {t.itemCount} items
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setCategoriesFor(t)}>
                          <FolderOpen className="h-3.5 w-3.5" /> Categories
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {deleteBlockedReason ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground/40 cursor-not-allowed" disabled>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{deleteBlockedReason}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setConfirmDeleteType(t)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Type Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => !saving && setDialogOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editType ? 'Edit Type' : 'Add Type'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {!editType && (
              <div className="space-y-1.5">
                <Label className="text-xs">Code <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. MERCHANDISE"
                  className="uppercase font-mono"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Cannot be changed after creation while in use</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Label <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. Merchandise" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
            </div>
            {editType && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Active</Label>
                  <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-amber-600 hover:bg-amber-700">
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editType ? 'Save Changes' : 'Add Type'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Type Confirmation */}
      <Dialog open={!!confirmDeleteType} onOpenChange={v => !v && setConfirmDeleteType(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Type</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-semibold text-foreground">{confirmDeleteType?.label}</span>?
            Its categories will be deleted too. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteType(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!!deletingType} onClick={() => confirmDeleteType && handleDeleteType(confirmDeleteType)}>
              {deletingType && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Categories Panel */}
      <Dialog open={!!categoriesFor} onOpenChange={v => !v && setCategoriesFor(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Categories · {categoriesFor?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1 max-h-96 overflow-y-auto">
            {categoriesFor?.categories.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No categories yet</p>
            )}
            {categoriesFor?.categories.map(c => (
              <div key={c.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${!c.isActive ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 shrink-0">SKU: {c.skuPrefix}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.itemCount} items{!c.isActive ? ' · Inactive' : ''}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => categoriesFor && openEditCat(categoriesFor, c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {c.itemCount > 0 ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground/40 cursor-not-allowed" disabled>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Masih dipakai oleh {c.itemCount} item</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setConfirmDeleteCat(c)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => categoriesFor && openAddCat(categoriesFor)}>
              <Plus className="h-4 w-4" /> Add Category
            </Button>
            <Button variant="outline" onClick={() => setCategoriesFor(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Category Dialog */}
      <Dialog open={catDialogOpen} onOpenChange={v => !catSaving && setCatDialogOpen(v)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editCat ? `Edit Category · ${editCat.name}` : 'Add Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {!editCat && (
              <div className="space-y-1.5">
                <Label className="text-xs">Name <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. General" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">SKU Prefix <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. GEN" className="uppercase font-mono" value={catForm.skuPrefix} onChange={e => setCatForm(f => ({ ...f, skuPrefix: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Used to auto-generate SKUs for items in this category, e.g. {catForm.skuPrefix || 'GEN'}-01</p>
            </div>
            {editCat && (
              <div className="flex items-center justify-between">
                <Label className="text-xs">Active</Label>
                <Switch checked={catForm.isActive} onCheckedChange={v => setCatForm(f => ({ ...f, isActive: v }))} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)} disabled={catSaving}>Cancel</Button>
            <Button onClick={handleSaveCat} disabled={catSaving} className="bg-amber-600 hover:bg-amber-700">
              {catSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editCat ? 'Save Changes' : 'Add Category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Category Confirmation */}
      <Dialog open={!!confirmDeleteCat} onOpenChange={v => !v && setConfirmDeleteCat(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-semibold text-foreground">{confirmDeleteCat?.name}</span>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteCat(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!!deletingCat}
              onClick={() => categoriesFor && confirmDeleteCat && handleDeleteCat(categoriesFor, confirmDeleteCat)}
            >
              {deletingCat && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
