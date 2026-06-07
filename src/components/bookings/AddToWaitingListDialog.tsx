'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Search, X, User, Check } from 'lucide-react'
import { toast } from 'sonner'

interface CustomerResult {
  id: string
  name: string
  phone?: string | null
  email?: string | null
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  bookingId?: string
  yachtId?: string
  openTripId?: string
  startDate: string
  endDate: string
  onAdded: () => void
  excludeCustomerIds?: string[]
}

export default function AddToWaitingListDialog({
  open, onOpenChange,
  bookingId, yachtId, openTripId,
  startDate, endDate,
  onAdded,
  excludeCustomerIds = [],
}: Props) {
  const [search, setSearch]                   = useState('')
  const [results, setResults]                 = useState<CustomerResult[]>([])
  const [searching, setSearching]             = useState(false)
  const [showDropdown, setShowDropdown]       = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null)
  const [phone, setPhone]                     = useState('')
  const [email, setEmail]                     = useState('')
  const [notes, setNotes]                     = useState('')
  const [saving, setSaving]                   = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const applyFilter = (data: CustomerResult[]) =>
    data.filter(c => !excludeCustomerIds.includes(c.id)).slice(0, 8)

  // Load recent customers on open (so list appears immediately on focus)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/customers?limit=30')
        const data = await res.json()
        if (!cancelled) setResults(applyFilter(Array.isArray(data) ? data : []))
      } catch { /* silent */ }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, excludeCustomerIds.join(',')])

  // Debounced search while typing
  useEffect(() => {
    if (selectedCustomer) return
    if (search.trim().length < 2) return
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(search)}`)
        const data = await res.json()
        setResults(applyFilter(Array.isArray(data) ? data : []))
        setShowDropdown(true)
      } catch { /* silent */ } finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selectedCustomer])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectCustomer = (c: CustomerResult) => {
    setSelectedCustomer(c)
    setSearch(c.name)
    setPhone(c.phone ?? '')
    setEmail(c.email ?? '')
    setShowDropdown(false)
  }

  const clearSelection = () => {
    setSelectedCustomer(null)
    setSearch('')
    setPhone('')
    setEmail('')
    setResults([])
  }

  const reset = () => { clearSelection(); setNotes('') }

  const handleSubmit = async () => {
    const contactName = selectedCustomer?.name || search.trim()
    if (!contactName) { toast.error('Nama kontak wajib diisi'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/waiting-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId:    bookingId  || null,
          yachtId:      yachtId   || null,
          openTripId:   openTripId || null,
          startDate,
          endDate,
          customerId:   selectedCustomer?.id || null,
          contactName,
          contactPhone: phone.trim() || null,
          contactEmail: email.trim() || null,
          notes:        notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Gagal menambahkan')
      }
      toast.success(`${contactName} ditambahkan ke waiting list`)
      reset()
      onOpenChange(false)
      onAdded()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  const contactName = selectedCustomer?.name || search.trim()

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah ke Waiting List</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Customer search */}
          <div className="space-y-1.5">
            <Label>Cari atau masukkan nama guest <span className="text-red-500">*</span></Label>
            <div ref={searchRef} className="relative">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-8 pr-8"
                  placeholder="Cari nama, telepon, email..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); if (selectedCustomer) setSelectedCustomer(null) }}
                  disabled={saving}
                  onFocus={() => setShowDropdown(true)}
                />
                {(search || selectedCustomer) && (
                  <button
                    type="button"
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    onClick={clearSelection}
                    tabIndex={-1}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Results dropdown */}
              {showDropdown && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg overflow-hidden">
                  {searching ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Mencari...
                    </div>
                  ) : results.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Tidak ditemukan — akan dibuat sebagai guest baru
                    </div>
                  ) : (
                    results.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left transition-colors"
                        onMouseDown={e => { e.preventDefault(); selectCustomer(c) }}
                      >
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[c.phone, c.email].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {selectedCustomer && (
              <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                <Check className="h-3 w-3" /> Guest terpilih: <span className="font-medium">{selectedCustomer.name}</span>
              </p>
            )}
          </div>

          {/* Contact fields — shown when no existing customer selected */}
          {!selectedCustomer && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>No. WhatsApp</Label>
                <Input
                  placeholder="+62..."
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  placeholder="email@..."
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Catatan</Label>
            <Textarea
              placeholder="Preferensi, catatan khusus..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={saving}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !contactName}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Tambahkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
