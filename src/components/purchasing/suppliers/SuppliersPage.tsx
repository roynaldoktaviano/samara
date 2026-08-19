'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Building2, Phone, Mail, MapPin, Pencil, Trash2, X, Check, ChevronDown } from 'lucide-react'

interface SupplierLocation { city: string; address: string }
interface Supplier {
  id: string; name: string
  locations: SupplierLocation[]
  contact: string | null; phone: string | null
  email: string | null; notes: string | null
  isActive: boolean; createdAt: string
  _count?: { orders: number }
}
interface SupplierDetail extends Supplier {
  history: { id: string; poNumber: string; status: string; orderedAt: string; itemCount: number; totalValue: number }[]
  totalSpend: number; totalOrders: number
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground', ORDERED: 'bg-blue-100 text-blue-700',
  IN_TRANSIT: 'bg-amber-100 text-amber-700', PARTIALLY_RECEIVED: 'bg-orange-100 text-orange-700',
  RECEIVED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700',
}
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', ORDERED: 'Ordered', IN_TRANSIT: 'On Delivery',
  PARTIALLY_RECEIVED: 'Partially Received', RECEIVED: 'Received', CANCELLED: 'Cancelled',
}

const CITY_OPTIONS = [
  'Jakarta', 'Surabaya', 'Bali', 'Denpasar', 'Lombok', 'Labuan Bajo',
  'Makassar', 'Manado', 'Sorong', 'Raja Ampat', 'Komodo', 'Semarang',
  'Bandung', 'Yogyakarta', 'Medan', 'Balikpapan', 'Ambon', 'Kupang',
]

const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)
const fmtDate = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

const BLANK = {
  name: '', locations: [] as SupplierLocation[],
  contact: '', phone: '', email: '', notes: '',
}

function CitySelect({ value, onChange, usedCities }: {
  value: string; onChange: (v: string) => void; usedCities: string[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const opts = CITY_OPTIONS.filter(c => !search || c.toLowerCase().includes(search.toLowerCase()))
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full h-9 border rounded-md px-3 text-sm text-left flex items-center justify-between bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors">
        <span className={value ? '' : 'text-muted-foreground'}>{value || 'Select city...'}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-xl z-50 max-h-48 flex flex-col">
            <div className="p-2 border-b shrink-0">
              <input autoFocus className="w-full h-8 border rounded px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="overflow-y-auto">
              {opts.map(c => (
                <button key={c} onClick={() => { onChange(c); setOpen(false); setSearch('') }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-amber-50 flex items-center justify-between transition-colors ${usedCities.includes(c) && c !== value ? 'text-muted-foreground' : ''}`}>
                  {c}
                  {value === c && <Check className="h-3.5 w-3.5 text-amber-600" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCity, setFilterCity] = useState('')
  const [detail, setDetail] = useState<SupplierDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/purchasing/suppliers')
    if (res.ok) setSuppliers(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function openDetail(s: Supplier) {
    setDetail(null); setDetailLoading(true)
    const res = await fetch(`/api/purchasing/suppliers/${s.id}`)
    if (res.ok) setDetail(await res.json())
    setDetailLoading(false)
  }

  function openAdd() { setForm(BLANK); setEditId(null); setSaveError(''); setShowForm(true) }
  function openEdit(s: Supplier) {
    setForm({
      name: s.name,
      locations: Array.isArray(s.locations) ? s.locations : [],
      contact: s.contact ?? '', phone: s.phone ?? '',
      email: s.email ?? '', notes: s.notes ?? '',
    })
    setEditId(s.id); setSaveError(''); setShowForm(true)
  }

  async function save() {
    if (!form.name.trim()) { setSaveError('Name is required'); return }
    const validLocs = form.locations.filter(l => l.city.trim())
    setSaving(true); setSaveError('')
    const res = await fetch(editId ? `/api/purchasing/suppliers/${editId}` : '/api/purchasing/suppliers', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, locations: validLocs }),
    })
    const data = await res.json()
    if (!res.ok) { setSaveError(data.error ?? 'Failed to save'); setSaving(false); return }
    setSaving(false); setShowForm(false); load()
    if (detail && editId === detail.id) openDetail(data)
  }

  async function toggleActive(s: Supplier) {
    await fetch(`/api/purchasing/suppliers/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !s.isActive }),
    })
    load()
    if (detail?.id === s.id) openDetail({ ...s, isActive: !s.isActive })
  }

  async function del(s: Supplier) {
    if (!confirm(`Delete supplier "${s.name}"?`)) return
    const res = await fetch(`/api/purchasing/suppliers/${s.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Failed to delete'); return }
    if (detail?.id === s.id) setDetail(null)
    load()
  }

  function addLocation() { setForm(f => ({ ...f, locations: [...f.locations, { city: '', address: '' }] })) }
  function removeLocation(i: number) { setForm(f => ({ ...f, locations: f.locations.filter((_, idx) => idx !== i) })) }
  function updateLocation(i: number, key: keyof SupplierLocation, val: string) {
    setForm(f => ({ ...f, locations: f.locations.map((l, idx) => idx === i ? { ...l, [key]: val } : l) }))
  }

  const allCities = Array.from(new Set(suppliers.flatMap(s => (s.locations ?? []).map(l => l.city).filter(Boolean)))).sort()

  const filtered = suppliers.filter(s => {
    const q = search.toLowerCase()
    const locs: SupplierLocation[] = Array.isArray(s.locations) ? s.locations : []
    const matchSearch = !q || s.name.toLowerCase().includes(q) ||
      s.contact?.toLowerCase().includes(q) || s.phone?.includes(q) ||
      locs.some(l => l.city.toLowerCase().includes(q) || l.address?.toLowerCase().includes(q))
    const matchCity = !filterCity || locs.some(l => l.city === filterCity)
    return matchSearch && matchCity
  })

  const inp = 'w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white transition-colors'

  return (
    <div className="flex gap-6 h-full">

      {/* Left: list */}
      <div className="w-80 shrink-0 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input className={`${inp} pl-8`} placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={openAdd} className="h-9 px-3 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-md transition-colors flex items-center shrink-0">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {allCities.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setFilterCity('')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${!filterCity ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
              All
            </button>
            {allCities.map(c => (
              <button key={c} onClick={() => setFilterCity(filterCity === c ? '' : c)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterCity === c ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          {loading ? [...Array(4)].map((_, i) => (
            <div key={i} className="rounded-lg border p-3 animate-pulse space-y-2">
              <div className="h-4 w-32 rounded bg-muted" /><div className="h-3 w-20 rounded bg-muted" />
            </div>
          )) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              {suppliers.length === 0 ? 'No suppliers yet.' : 'No results.'}
            </div>
          ) : filtered.map(s => {
            const locs: SupplierLocation[] = Array.isArray(s.locations) ? s.locations : []
            return (
              <button key={s.id} onClick={() => openDetail(s)}
                className={`w-full text-left rounded-lg border p-3 transition-colors hover:border-amber-300 hover:bg-amber-50/50 ${detail?.id === s.id ? 'border-amber-400 bg-amber-50' : 'bg-white'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold truncate ${!s.isActive ? 'text-muted-foreground line-through' : ''}`}>{s.name}</p>
                    {locs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {locs.map((l, i) => <span key={i} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">{l.city}</span>)}
                      </div>
                    )}
                    {s.contact && <p className="text-xs text-muted-foreground truncate mt-0.5">{s.contact}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-xs text-muted-foreground">{s._count?.orders ?? 0} PO</span>
                    {!s.isActive && <p className="text-xs text-red-500 font-medium">Inactive</p>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 min-w-0">
        {!detail && !detailLoading && (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            <div className="text-center"><Building2 className="h-10 w-10 mx-auto mb-2 opacity-20" /><p>Select a supplier to view details</p></div>
          </div>
        )}
        {detailLoading && (
          <div className="space-y-4 animate-pulse">
            <div className="h-8 w-48 rounded bg-muted" /><div className="h-4 w-32 rounded bg-muted" />
            <div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="rounded-lg border p-4 space-y-2"><div className="h-3 w-16 rounded bg-muted" /><div className="h-6 w-24 rounded bg-muted" /></div>)}</div>
          </div>
        )}
        {detail && !detailLoading && (() => {
          const locs: SupplierLocation[] = Array.isArray(detail.locations) ? detail.locations : []
          return (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-2xl font-bold tracking-tight">{detail.name}</h2>
                    {!detail.isActive && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Inactive</span>}
                  </div>
                  <p className="text-muted-foreground text-sm mt-0.5">Added {fmtDate(detail.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openEdit(detail)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-muted transition-colors">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button onClick={() => toggleActive(detail)}
                    className={`px-3 py-1.5 text-sm border rounded-lg transition-colors ${detail.isActive ? 'hover:bg-red-50 hover:text-red-600 hover:border-red-200' : 'hover:bg-green-50 hover:text-green-700'}`}>
                    {detail.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                  {detail.totalOrders === 0 && (
                    <button onClick={() => del(detail)} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Total Orders</p><p className="text-2xl font-bold mt-1">{detail.totalOrders}</p></div>
                <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Total Spend</p><p className="text-xl font-bold mt-1">{fmtMoney(detail.totalSpend)}</p></div>
                <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Avg Order Value</p><p className="text-xl font-bold mt-1">{detail.totalOrders > 0 ? fmtMoney(detail.totalSpend / detail.totalOrders) : '—'}</p></div>
              </div>

              {/* Locations */}
              {locs.length > 0 && (
                <div className="rounded-lg border p-4 space-y-3">
                  <h3 className="text-sm font-semibold">Locations</h3>
                  <div className="space-y-2">
                    {locs.map((l, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-sm">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium shrink-0 mt-0.5">{l.city}</span>
                        {l.address && <span className="text-muted-foreground">{l.address}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact */}
              {(detail.contact || detail.phone || detail.email) && (
                <div className="rounded-lg border p-4 space-y-2">
                  <h3 className="text-sm font-semibold">Contact</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {detail.contact && <div className="flex items-center gap-2 text-muted-foreground"><Building2 className="h-3.5 w-3.5 shrink-0" />{detail.contact}</div>}
                    {detail.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5 shrink-0" />{detail.phone}</div>}
                    {detail.email && <div className="flex items-center gap-2 text-muted-foreground col-span-2"><Mail className="h-3.5 w-3.5 shrink-0" />{detail.email}</div>}
                  </div>
                </div>
              )}

              <div className="rounded-lg border overflow-hidden">
                <div className="px-4 py-3 bg-muted/40 border-b"><h3 className="text-sm font-semibold">Order History</h3></div>
                {detail.history.length === 0 ? (
                  <p className="text-center py-8 text-sm text-muted-foreground">No orders yet</p>
                ) : (
                  <div className="overflow-x-auto"><table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground border-b bg-muted/20">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium">PO No.</th>
                        <th className="text-left px-4 py-2.5 font-medium">Date</th>
                        <th className="text-center px-4 py-2.5 font-medium">Items</th>
                        <th className="text-left px-4 py-2.5 font-medium">Status</th>
                        <th className="text-right px-4 py-2.5 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {detail.history.map(o => (
                        <tr key={o.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3 font-mono font-medium text-sm">{o.poNumber}</td>
                          <td className="px-4 py-3 text-muted-foreground">{fmtDate(o.orderedAt)}</td>
                          <td className="px-4 py-3 text-center text-muted-foreground">{o.itemCount}</td>
                          <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[o.status] ?? ''}`}>{STATUS_LABEL[o.status] ?? o.status}</span></td>
                          <td className="px-4 py-3 text-right font-medium">{fmtMoney(o.totalValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </div>
            </div>
          )
        })()}
      </div>

      {/* Form modal */}
      {showForm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
                <h3 className="text-sm font-semibold">{editId ? 'Edit Supplier' : 'Add Supplier'}</h3>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-md"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {saveError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{saveError}</div>}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Name <span className="text-red-500">*</span></label>
                  <input className={inp} placeholder="e.g. PT Maju Bersama" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>

                {/* Locations */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-muted-foreground">Locations</label>
                    <button onClick={addLocation} className="text-xs text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Add location
                    </button>
                  </div>
                  {form.locations.length === 0 ? (
                    <button onClick={addLocation}
                      className="w-full border border-dashed rounded-lg py-3 text-sm text-muted-foreground hover:border-amber-400 hover:text-amber-700 transition-colors flex items-center justify-center gap-2">
                      <MapPin className="h-4 w-4" /> Add city &amp; address
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {form.locations.map((loc, i) => (
                        <div key={i} className="rounded-lg border p-3 space-y-2 bg-muted/20">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Location {i + 1}</span>
                            <button onClick={() => removeLocation(i)} className="text-muted-foreground hover:text-red-500 transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <CitySelect
                            value={loc.city}
                            onChange={v => updateLocation(i, 'city', v)}
                            usedCities={form.locations.map(l => l.city)}
                          />
                          <input className={inp} placeholder="Address (optional)"
                            value={loc.address} onChange={e => updateLocation(i, 'address', e.target.value)} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">Contact Person</label>
                    <input className={inp} placeholder="Name" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">Phone</label>
                    <input className={inp} placeholder="+62..." value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Email</label>
                    <input className={inp} type="email" placeholder="supplier@email.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Notes</label>
                    <textarea className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white resize-none"
                      rows={2} placeholder="Payment terms, etc." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t shrink-0">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold disabled:opacity-50 transition-colors">
                  {saving ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</> : editId ? 'Save Changes' : 'Add Supplier'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
