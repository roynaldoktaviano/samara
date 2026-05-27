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
import { Building2, Plus, Pencil, Trash2, Loader2, CreditCard } from 'lucide-react'

interface Bank {
  id: string
  name: string
  bankAddress: string | null
  swiftCode: string | null
  beneficiaryName: string | null
  idrAccount: string | null
  usdAccount: string | null
  address: string | null
  isActive: boolean
  createdAt: string
}

const EMPTY: Omit<Bank, 'id' | 'createdAt'> = {
  name: '', bankAddress: null, swiftCode: null,
  beneficiaryName: null, idrAccount: null, usdAccount: null,
  address: null, isActive: true,
}

export default function Banks() {
  const [banks, setBanks] = useState<Bank[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editBank, setEditBank] = useState<Bank | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [confirmDelete, setConfirmDelete] = useState<Bank | null>(null)

  const fetchBanks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/banks')
      setBanks(await res.json())
    } catch { toast.error('Failed to load banks') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchBanks() }, [fetchBanks])

  const openAdd = () => {
    setEditBank(null)
    setForm(EMPTY)
    setDialogOpen(true)
  }

  const openEdit = (b: Bank) => {
    setEditBank(b)
    setForm({
      name: b.name, bankAddress: b.bankAddress, swiftCode: b.swiftCode,
      beneficiaryName: b.beneficiaryName, idrAccount: b.idrAccount,
      usdAccount: b.usdAccount, address: b.address, isActive: b.isActive,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Bank name is required'); return }
    setSaving(true)
    try {
      const url  = editBank ? `/api/banks/${editBank.id}` : '/api/banks'
      const method = editBank ? 'PUT' : 'POST'
      const res  = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success(editBank ? 'Bank updated' : 'Bank added')
      setDialogOpen(false)
      fetchBanks()
    } catch { toast.error('Failed to save bank') }
    finally { setSaving(false) }
  }

  const handleDelete = async (bank: Bank) => {
    setDeleting(bank.id)
    try {
      const res = await fetch(`/api/banks/${bank.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Bank deleted')
      setConfirmDelete(null)
      fetchBanks()
    } catch { toast.error('Failed to delete bank') }
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
                <Building2 className="h-4 w-4" /> Bank Accounts
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Manage bank accounts that appear on invoices
              </CardDescription>
            </div>
            <Button size="sm" onClick={openAdd} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Bank
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-3">
              {[1,2].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
            </div>
          ) : banks.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No banks added yet
            </div>
          ) : (
            <div className="space-y-3">
              {banks.map(b => (
                <div key={b.id} className={`rounded-lg border p-4 ${!b.isActive ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-sm">{b.name}</span>
                        {!b.isActive && <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                        {([
                          ['Beneficiary', b.beneficiaryName],
                          ['Swift Code',  b.swiftCode],
                          ['IDR Account', b.idrAccount],
                          ['USD Account', b.usdAccount],
                          ['Bank Address', b.bankAddress],
                          ['Address',     b.address],
                        ] as [string, string | null][]).filter(([,v]) => v).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <span className="text-muted-foreground w-24 shrink-0">{k}</span>
                            <span className="text-foreground font-medium truncate">: {v}</span>
                          </div>
                        ))}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editBank ? 'Edit Bank' : 'Add Bank'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Bank Name <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. Mandiri Bank" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Beneficiary Name</Label>
              <Input placeholder="e.g. PT. Samara Yacht Agency" value={form.beneficiaryName ?? ''} onChange={field('beneficiaryName')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Swift Code</Label>
                <Input placeholder="e.g. BMRIIDJAXXX" value={form.swiftCode ?? ''} onChange={field('swiftCode')} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bank Address</Label>
                <Input placeholder="Branch address" value={form.bankAddress ?? ''} onChange={field('bankAddress')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">IDR Account</Label>
                <Input placeholder="Account number" value={form.idrAccount ?? ''} onChange={field('idrAccount')} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">USD Account</Label>
                <Input placeholder="Account number" value={form.usdAccount ?? ''} onChange={field('usdAccount')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Beneficiary Address</Label>
              <Input placeholder="Company address" value={form.address ?? ''} onChange={field('address')} />
            </div>
            {editBank && (
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
              {editBank ? 'Save Changes' : 'Add Bank'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!confirmDelete} onOpenChange={v => !v && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Bank</DialogTitle>
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
