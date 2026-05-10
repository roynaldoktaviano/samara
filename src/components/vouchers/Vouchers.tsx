'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Tag, Loader2 } from 'lucide-react'

const ACCENT = '#bdac7e'

interface Voucher {
  id: string
  code: string
  name: string
  description: string | null
  type: 'PERCENTAGE' | 'FIXED'
  value: number
  minBooking: number | null
  maxUses: number | null
  usedCount: number
  validFrom: string | null
  validUntil: string | null
  isActive: boolean
  createdAt: string
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const fmtValue = (v: Voucher) =>
  v.type === 'PERCENTAGE' ? `${v.value}%` : `$${v.value.toLocaleString()}`

const emptyForm = () => ({
  code: '',
  name: '',
  description: '',
  type: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED',
  value: '',
  minBooking: '',
  maxUses: '',
  validFrom: '',
  validUntil: '',
  isActive: true,
})

export default function Vouchers() {
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing]       = useState<Voucher | null>(null)
  const [form, setForm]             = useState(emptyForm())
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState('')

  const [deleteId, setDeleteId]     = useState<string | null>(null)
  const [deleting, setDeleting]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/vouchers')
      if (res.ok) setVouchers(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormError('')
    setDialogOpen(true)
  }

  const openEdit = (v: Voucher) => {
    setEditing(v)
    setForm({
      code: v.code,
      name: v.name,
      description: v.description ?? '',
      type: v.type,
      value: String(v.value),
      minBooking: v.minBooking != null ? String(v.minBooking) : '',
      maxUses: v.maxUses != null ? String(v.maxUses) : '',
      validFrom: v.validFrom ? v.validFrom.slice(0, 10) : '',
      validUntil: v.validUntil ? v.validUntil.slice(0, 10) : '',
      isActive: v.isActive,
    })
    setFormError('')
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.value) {
      setFormError('Code, name, and value are required.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = {
        code: form.code,
        name: form.name,
        description: form.description || null,
        type: form.type,
        value: parseFloat(form.value),
        minBooking: form.minBooking ? parseFloat(form.minBooking) : null,
        maxUses: form.maxUses ? parseInt(form.maxUses) : null,
        validFrom: form.validFrom || null,
        validUntil: form.validUntil || null,
        isActive: form.isActive,
      }
      const url    = editing ? `/api/vouchers/${editing.id}` : '/api/vouchers'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setFormError(err.error ?? 'Failed to save voucher.')
        return
      }
      setDialogOpen(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (v: Voucher) => {
    await fetch(`/api/vouchers/${v.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !v.isActive }),
    })
    setVouchers(prev => prev.map(x => x.id === v.id ? { ...x, isActive: !v.isActive } : x))
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await fetch(`/api/vouchers/${deleteId}`, { method: 'DELETE' })
      setDeleteId(null)
      load()
    } finally {
      setDeleting(false)
    }
  }

  const filtered = vouchers.filter(v =>
    filter === 'ALL'      ? true :
    filter === 'ACTIVE'   ? v.isActive :
    !v.isActive
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vouchers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage discount codes for campaigns and bookings</p>
        </div>
        <Button onClick={openCreate} style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
          <Plus className="h-4 w-4 mr-2" /> New Voucher
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-4 py-1.5 rounded-full text-sm font-medium border transition-colors"
            style={filter === f
              ? { backgroundColor: ACCENT, color: 'white', borderColor: ACCENT }
              : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
          >
            {f === 'ALL' ? 'All' : f === 'ACTIVE' ? 'Active' : 'Inactive'}
            <span className="ml-1.5 text-xs opacity-75">
              {f === 'ALL' ? vouchers.length : f === 'ACTIVE' ? vouchers.filter(v => v.isActive).length : vouchers.filter(v => !v.isActive).length}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Min Booking</TableHead>
              <TableHead>Uses</TableHead>
              <TableHead>Valid Period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Loading vouchers…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-16">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Tag className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No vouchers found</p>
                    <Button size="sm" variant="outline" onClick={openCreate}>Create your first voucher</Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : filtered.map(v => (
              <TableRow key={v.id} className="hover:bg-muted/20">
                <TableCell>
                  <code className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded bg-muted">{v.code}</code>
                </TableCell>
                <TableCell>
                  <div className="font-medium text-sm">{v.name}</div>
                  {v.description && <div className="text-xs text-muted-foreground truncate max-w-40">{v.description}</div>}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {v.type === 'PERCENTAGE' ? 'Percentage' : 'Fixed'}
                  </Badge>
                </TableCell>
                <TableCell className="font-semibold text-sm" style={{ color: ACCENT }}>
                  {fmtValue(v)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {v.minBooking ? `$${v.minBooking.toLocaleString()}` : '—'}
                </TableCell>
                <TableCell className="text-sm">
                  {v.maxUses ? `${v.usedCount} / ${v.maxUses}` : `${v.usedCount} / ∞`}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {v.validFrom || v.validUntil
                    ? `${fmtDate(v.validFrom)} → ${fmtDate(v.validUntil)}`
                    : 'No limit'}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={v.isActive}
                    onCheckedChange={() => handleToggleActive(v)}
                    style={v.isActive ? { backgroundColor: ACCENT } : {}}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(v)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(v.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Voucher' : 'New Voucher'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Code <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. SUMMER25"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Auto-converted to uppercase</p>
              </div>
              <div className="space-y-1.5">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. Summer Campaign"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                placeholder="Optional description…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type <span className="text-destructive">*</span></Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as 'PERCENTAGE' | 'FIXED' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                    <SelectItem value="FIXED">Fixed Amount ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Value <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">
                    {form.type === 'PERCENTAGE' ? '%' : '$'}
                  </span>
                  <Input
                    type="number"
                    min="0"
                    max={form.type === 'PERCENTAGE' ? 100 : undefined}
                    step="0.01"
                    placeholder="0"
                    className="pl-7"
                    value={form.value}
                    onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Min Booking (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min="0"
                    placeholder="No minimum"
                    className="pl-6"
                    value={form.minBooking}
                    onChange={e => setForm(f => ({ ...f, minBooking: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Max Uses</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={form.maxUses}
                  onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Valid From</Label>
                <Input
                  type="date"
                  value={form.validFrom}
                  onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Valid Until</Label>
                <Input
                  type="date"
                  min={form.validFrom}
                  value={form.validUntil}
                  onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <Label className="text-sm font-medium">Active</Label>
                <p className="text-xs text-muted-foreground">Voucher can be applied during booking</p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))}
                style={form.isActive ? { backgroundColor: ACCENT } : {}}
              />
            </div>

            {formError && (
              <p className="text-xs text-destructive bg-destructive/8 rounded-lg px-3 py-2 border border-destructive/20">
                {formError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              style={{ backgroundColor: ACCENT, color: 'white' }}
              className="hover:opacity-90"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editing ? 'Save Changes' : 'Create Voucher'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onOpenChange={v => { if (!v) setDeleteId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Voucher</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to delete this voucher? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
