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
import { toast } from 'sonner'
import { Palette, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { ImageUploadField } from '@/components/marketing/builder/BlockInspector'

interface Brand {
  id: string
  name: string
  companyName: string
  address: string | null
  logoUrl: string | null
  facebookUrl: string | null
  instagramUrl: string | null
  whatsappNumber: string | null
  linkedinUrl: string | null
  websiteUrl: string | null
  isActive: boolean
  createdAt: string
}

const EMPTY: Omit<Brand, 'id' | 'createdAt'> = {
  name: '', companyName: '', address: null, logoUrl: null,
  facebookUrl: null, instagramUrl: null, whatsappNumber: null,
  linkedinUrl: null, websiteUrl: null, isActive: true,
}

export default function Brands() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editBrand, setEditBrand] = useState<Brand | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [confirmDelete, setConfirmDelete] = useState<Brand | null>(null)

  const fetchBrands = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketing/brands')
      setBrands(await res.json())
    } catch { toast.error('Failed to load brands') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchBrands() }, [fetchBrands])

  const openAdd = () => {
    setEditBrand(null)
    setForm(EMPTY)
    setDialogOpen(true)
  }

  const openEdit = (b: Brand) => {
    setEditBrand(b)
    setForm({
      name: b.name, companyName: b.companyName, address: b.address, logoUrl: b.logoUrl,
      facebookUrl: b.facebookUrl, instagramUrl: b.instagramUrl, whatsappNumber: b.whatsappNumber,
      linkedinUrl: b.linkedinUrl, websiteUrl: b.websiteUrl, isActive: b.isActive,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Brand name is required'); return }
    if (!form.companyName.trim()) { toast.error('Company name is required'); return }
    setSaving(true)
    try {
      const url = editBrand ? `/api/marketing/brands/${editBrand.id}` : '/api/marketing/brands'
      const method = editBrand ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success(editBrand ? 'Brand updated' : 'Brand added')
      setDialogOpen(false)
      fetchBrands()
    } catch { toast.error('Failed to save brand') }
    finally { setSaving(false) }
  }

  const handleDelete = async (brand: Brand) => {
    setDeleting(brand.id)
    try {
      const res = await fetch(`/api/marketing/brands/${brand.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Brand deleted')
      setConfirmDelete(null)
      fetchBrands()
    } catch { toast.error('Failed to delete brand') }
    finally { setDeleting(null) }
  }

  const field = (key: keyof typeof form) => (
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value || null }))
  )

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="h-4 w-4" /> Brands
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Saved brand presets — logo, company name, address, and social links you can apply to an email footer in one click
              </CardDescription>
            </div>
            <Button size="sm" onClick={openAdd} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Brand
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
            </div>
          ) : brands.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Palette className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No brands added yet
            </div>
          ) : (
            <div className="space-y-3">
              {brands.map(b => (
                <div key={b.id} className={`rounded-lg border p-4 ${!b.isActive ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 flex gap-3">
                      {b.logoUrl && (
                        <img src={b.logoUrl} alt={b.name} className="h-10 w-10 rounded object-contain border shrink-0 bg-white" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-sm">{b.name}</span>
                          {!b.isActive && <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                          {([
                            ['Company', b.companyName],
                            ['Address', b.address],
                            ['Website', b.websiteUrl],
                            ['WhatsApp', b.whatsappNumber],
                            ['Facebook', b.facebookUrl],
                            ['Instagram', b.instagramUrl],
                            ['LinkedIn', b.linkedinUrl],
                          ] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <span className="text-muted-foreground w-20 shrink-0">{k}</span>
                              <span className="text-foreground font-medium truncate">: {v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(b)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setConfirmDelete(b)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => !saving && setDialogOpen(v)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editBrand ? 'Edit Brand' : 'Add Brand'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Brand name <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. Samara Liveaboard" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Company name <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. PT Samara Wisata Bahari" value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Address</Label>
              <Input placeholder="Company address" value={form.address ?? ''} onChange={field('address')} />
            </div>
            <ImageUploadField label="Logo" src={form.logoUrl ?? ''} onChange={logoUrl => setForm(f => ({ ...f, logoUrl: logoUrl || null }))} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Facebook URL</Label>
                <Input placeholder="https://facebook.com/..." value={form.facebookUrl ?? ''} onChange={field('facebookUrl')} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Instagram URL</Label>
                <Input placeholder="https://instagram.com/..." value={form.instagramUrl ?? ''} onChange={field('instagramUrl')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">WhatsApp number or link</Label>
                <Input placeholder="+62 ... or https://wa.me/..." value={form.whatsappNumber ?? ''} onChange={field('whatsappNumber')} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">LinkedIn URL</Label>
                <Input placeholder="https://linkedin.com/company/..." value={form.linkedinUrl ?? ''} onChange={field('linkedinUrl')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Website URL</Label>
              <Input placeholder="https://..." value={form.websiteUrl ?? ''} onChange={field('websiteUrl')} />
            </div>
            {editBrand && (
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
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editBrand ? 'Save Changes' : 'Add Brand'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!confirmDelete} onOpenChange={v => !v && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Brand</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-semibold text-foreground">{confirmDelete?.name}</span>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!!deleting}
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
