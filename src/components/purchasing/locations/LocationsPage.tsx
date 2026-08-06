'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Warehouse, Ship, Eye, AlertTriangle, Package, MapPin, Truck, Layers, SlidersHorizontal, User, ChevronRight } from 'lucide-react'

interface Yacht { id: string; name: string }
interface StockLocation {
  id: string; name: string; type: string; yachtId: string | null
  parentId: string | null; manager: string | null; storageClass: string | null
  managedBy: string; isActive: boolean
  yacht?: { id: string; name: string } | null
  parent?: { id: string; name: string } | null
}
interface StockRow {
  item: { id: string; sku: string; name: string; category: string; baseUnit: string; minStock: number }
  qty: number; costPerUnit: number
}

const TYPE_LABEL: Record<string, string> = {
  WAREHOUSE: 'Warehouse', VESSEL: 'Vessel', TRANSIT: 'Transit', SITE: 'Site', ADJUSTMENT: 'Adjustment',
}
const TYPE_COLOR: Record<string, string> = {
  WAREHOUSE: 'bg-amber-100 text-amber-700',
  VESSEL:    'bg-blue-100 text-blue-700',
  TRANSIT:   'bg-purple-100 text-purple-700',
  SITE:      'bg-green-100 text-green-700',
  ADJUSTMENT:'bg-gray-100 text-gray-600',
}
const STORAGE_COLOR: Record<string, string> = {
  Dry: 'bg-orange-50 text-orange-700 border border-orange-200',
  Cold: 'bg-cyan-50 text-cyan-700 border border-cyan-200',
  Frozen: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  Mixed: 'bg-gray-50 text-gray-600 border border-gray-200',
}

const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)

const BLANK = { name: '', type: 'WAREHOUSE', yachtId: '', parentId: '', manager: '', storageClass: '', managedBy: 'WAREHOUSE' }

export default function LocationsPage() {
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [yachts, setYachts] = useState<Yacht[]>([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<StockLocation | null>(null)
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<StockLocation | null>(null)

  const [invModal, setInvModal] = useState<{ open: boolean; yacht: Yacht | null }>({ open: false, yacht: null })
  const [invRows, setInvRows] = useState<StockRow[]>([])
  const [invLoading, setInvLoading] = useState(false)

  const [filterType, setFilterType] = useState<string>('ALL')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [locRes, yachtRes] = await Promise.all([
      fetch('/api/purchasing/locations'),
      fetch('/api/yachts'),
    ])
    if (locRes.ok) setLocations(await locRes.json())
    if (yachtRes.ok) {
      const data = await yachtRes.json()
      setYachts(Array.isArray(data) ? data.map((y: Yacht) => ({ id: y.id, name: y.name })) : [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() { setForm({ ...BLANK }); setEditing(null); setFormError(''); setModal(true) }
  function openEdit(loc: StockLocation) {
    setForm({
      name: loc.name, type: loc.type,
      yachtId: loc.yachtId ?? '',
      parentId: loc.parentId ?? '',
      manager: loc.manager ?? '',
      storageClass: loc.storageClass ?? '',
      managedBy: loc.managedBy ?? 'WAREHOUSE',
    })
    setEditing(loc); setFormError(''); setModal(true)
  }

  async function save() {
    setSaving(true); setFormError('')
    const method = editing ? 'PUT' : 'POST'
    const url = editing ? `/api/purchasing/locations/${editing.id}` : '/api/purchasing/locations'
    const payload = {
      name: form.name, type: form.type,
      yachtId: form.type === 'VESSEL' ? form.yachtId : undefined,
      parentId: form.parentId || undefined,
      manager: form.manager || undefined,
      storageClass: form.storageClass || undefined,
      managedBy: form.managedBy,
    }
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setModal(false); setSaving(false); load()
  }

  async function toggleActive(loc: StockLocation) {
    await fetch(`/api/purchasing/locations/${loc.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: loc.name, type: loc.type, yachtId: loc.yachtId, parentId: loc.parentId, manager: loc.manager, storageClass: loc.storageClass, managedBy: loc.managedBy, isActive: !loc.isActive }),
    })
    load()
  }

  async function doDelete(loc: StockLocation) {
    const res = await fetch(`/api/purchasing/locations/${loc.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Failed to delete') }
    setDeleteConfirm(null); load()
  }

  async function openInventory(yacht: Yacht) {
    setInvModal({ open: true, yacht }); setInvLoading(true); setInvRows([])
    let loc = locations.find(l => l.type === 'VESSEL' && l.yachtId === yacht.id)
    if (!loc) {
      const res = await fetch('/api/purchasing/locations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Stok ${yacht.name}`, type: 'VESSEL', yachtId: yacht.id }),
      })
      if (res.ok) { loc = await res.json(); await load() }
    }
    if (loc) {
      const res = await fetch(`/api/purchasing/stock?locationId=${loc.id}`)
      if (res.ok) {
        const data = await res.json()
        setInvRows((data.locations ?? []).flatMap((l: { rows: StockRow[] }) => l.rows))
      }
    }
    setInvLoading(false)
  }

  const filtered = locations.filter(l => {
    if (filterType !== 'ALL' && l.type !== filterType) return false
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const typeCounts = ['WAREHOUSE', 'VESSEL', 'TRANSIT', 'SITE', 'ADJUSTMENT'].reduce<Record<string, number>>((acc, t) => {
    acc[t] = locations.filter(l => l.type === t).length
    return acc
  }, {})

  const totalInvValue = invRows.reduce((s, r) => s + r.qty * r.costPerUnit, 0)
  const lowStockRows = invRows.filter(r => r.item.minStock > 0 && r.qty < r.item.minStock)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Stock Locations</h2>
          <p className="text-muted-foreground text-sm mt-1">Gudang, kapal, transit, dan lokasi penyimpanan lainnya</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> Add Location
        </button>
      </div>

      {/* Type filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setFilterType('ALL')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterType === 'ALL' ? 'bg-foreground text-background' : 'border hover:bg-muted'}`}>
          All ({locations.length})
        </button>
        {Object.entries(typeCounts).filter(([, n]) => n > 0).map(([t, n]) => (
          <button key={t} onClick={() => setFilterType(t === filterType ? 'ALL' : t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterType === t ? 'bg-foreground text-background' : 'border hover:bg-muted'}`}>
            {TYPE_LABEL[t]} ({n})
          </button>
        ))}
        <input
          className="ml-auto border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 w-48"
          placeholder="Cari lokasi..."
          value={search} onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-lg border overflow-hidden animate-pulse">
          <div className="h-10 bg-muted/50 border-b" />
          {[...Array(4)].map((_, i) => <div key={i} className="px-5 py-4 border-t flex gap-4"><div className="h-4 w-40 rounded bg-muted" /><div className="h-4 w-20 rounded bg-muted" /></div>)}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nama Lokasi</th>
                <th className="text-left px-4 py-3 font-medium">Tipe</th>
                <th className="text-left px-4 py-3 font-medium">Parent</th>
                <th className="text-left px-4 py-3 font-medium">Vessel</th>
                <th className="text-left px-4 py-3 font-medium">PIC / Manager</th>
                <th className="text-left px-4 py-3 font-medium">Storage Class</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  Tidak ada lokasi ditemukan.
                </td></tr>
              ) : filtered.map(loc => (
                <tr key={loc.id} className={`hover:bg-muted/30 transition-colors ${!loc.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium">{loc.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLOR[loc.type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {TYPE_LABEL[loc.type] ?? loc.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{loc.parent?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {loc.yacht ? (
                      <button onClick={() => openInventory(loc.yacht!)}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium">
                        <Ship className="h-3 w-3" /> {loc.yacht.name}
                      </button>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{loc.manager || '—'}</td>
                  <td className="px-4 py-3">
                    {loc.storageClass ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STORAGE_COLOR[loc.storageClass] ?? 'bg-gray-100 text-gray-600'}`}>
                        {loc.storageClass}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActive(loc)}>
                      {loc.isActive
                        ? <ToggleRight className="h-5 w-5 text-green-600 mx-auto" />
                        : <ToggleLeft className="h-5 w-5 text-muted-foreground mx-auto" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {loc.type === 'VESSEL' && loc.yacht && (
                        <button onClick={() => openInventory(loc.yacht!)}
                          className="p-1.5 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="View Inventory">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => openEdit(loc)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteConfirm(loc)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      {modal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

              {/* Header */}
              <div className="px-6 pt-6 pb-5" style={{ background: 'linear-gradient(135deg, #bdac7e 0%, #a89860 100%)' }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white/20 rounded-xl">
                      <MapPin className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg leading-tight">
                        {editing ? 'Edit Location' : 'Add Location'}
                      </h3>
                      <p className="text-amber-100 text-xs mt-0.5">
                        {editing ? 'Perbarui detail lokasi penyimpanan' : 'Tambah lokasi penyimpanan baru'}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setModal(false)} className="p-1.5 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
                {formError && (
                  <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {formError}
                  </div>
                )}

                {/* Location Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Nama Lokasi <span className="text-red-500 normal-case">*</span>
                  </label>
                  <input
                    className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all placeholder:text-gray-400"
                    placeholder="e.g. Gudang Utama Bajo"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    autoFocus
                  />
                </div>

                {/* Type selector — visual cards */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Tipe Lokasi <span className="text-red-500 normal-case">*</span>
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {([
                      { value: 'WAREHOUSE', label: 'Warehouse', icon: Warehouse, color: 'amber' },
                      { value: 'VESSEL',    label: 'Vessel',    icon: Ship,      color: 'blue'  },
                      { value: 'TRANSIT',   label: 'Transit',   icon: Truck,     color: 'purple'},
                      { value: 'SITE',      label: 'Site',      icon: Layers,    color: 'green' },
                      { value: 'ADJUSTMENT',label: 'Adjust',    icon: SlidersHorizontal, color: 'gray' },
                    ] as const).map(({ value, label, icon: Icon, color }) => {
                      const active = form.type === value
                      const colorMap: Record<string, string> = {
                        amber:  active ? 'border-amber-400 bg-amber-50 text-amber-700'  : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-amber-200 hover:text-amber-600',
                        blue:   active ? 'border-blue-400 bg-blue-50 text-blue-700'    : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-blue-200 hover:text-blue-600',
                        purple: active ? 'border-purple-400 bg-purple-50 text-purple-700': 'border-gray-100 bg-gray-50 text-gray-400 hover:border-purple-200 hover:text-purple-600',
                        green:  active ? 'border-green-400 bg-green-50 text-green-700'  : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-green-200 hover:text-green-600',
                        gray:   active ? 'border-gray-400 bg-gray-100 text-gray-700'   : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-300 hover:text-gray-600',
                      }
                      return (
                        <button key={value} type="button"
                          onClick={() => setForm(f => ({ ...f, type: value, yachtId: '' }))}
                          className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl border-2 transition-all ${colorMap[color]}`}>
                          <Icon className="h-4 w-4" />
                          <span className="text-[10px] font-semibold leading-none">{label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Vessel selector — only when VESSEL */}
                {form.type === 'VESSEL' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Kapal <span className="text-red-500 normal-case">*</span>
                    </label>
                    <div className="relative">
                      <Ship className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-400 pointer-events-none" />
                      <select
                        className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:bg-white transition-all appearance-none"
                        value={form.yachtId} onChange={e => setForm(f => ({ ...f, yachtId: e.target.value }))}>
                        <option value="">— Pilih kapal —</option>
                        {yachts.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* Divider */}
                <div className="border-t border-dashed" />

                {/* Storage Class */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Storage Class</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {([
                      { value: 'Dry',    label: 'Dry',    desc: 'Kering',  cls: 'orange' },
                      { value: 'Cold',   label: 'Cold',   desc: 'Dingin',  cls: 'cyan'   },
                      { value: 'Frozen', label: 'Frozen', desc: 'Beku',    cls: 'indigo' },
                      { value: 'Mixed',  label: 'Mixed',  desc: 'Campuran',cls: 'gray'   },
                    ] as const).map(({ value, label, desc, cls }) => {
                      const active = form.storageClass === value
                      const colorMap: Record<string, string> = {
                        orange: active ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-orange-200',
                        cyan:   active ? 'border-cyan-400 bg-cyan-50 text-cyan-700'       : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-cyan-200',
                        indigo: active ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-indigo-200',
                        gray:   active ? 'border-gray-400 bg-gray-100 text-gray-700'      : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-300',
                      }
                      return (
                        <button key={value} type="button"
                          onClick={() => setForm(f => ({ ...f, storageClass: active ? '' : value }))}
                          className={`flex flex-col items-center py-2.5 px-2 rounded-xl border-2 transition-all ${colorMap[cls]}`}>
                          <span className="text-xs font-bold">{label}</span>
                          <span className="text-[10px] opacity-70 mt-0.5">{desc}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Parent Location */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Parent Location</label>
                  <div className="relative">
                    <ChevronRight className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <select
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all appearance-none"
                      value={form.parentId} onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))}>
                      <option value="">— Tidak ada —</option>
                      {locations.filter(l => l.id !== editing?.id).map(l => (
                        <option key={l.id} value={l.id}>{l.name} · {TYPE_LABEL[l.type] ?? l.type}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Managed By */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Siapa yang bisa Receive?</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'WAREHOUSE', label: 'Warehouse', desc: 'Tim gudang Bajo / kapal', icon: Warehouse, color: 'teal' },
                      { value: 'PURCHASING', label: 'Purchasing', desc: 'Tim purchasing Bali', icon: Package, color: 'amber' },
                    ] as const).map(({ value, label, desc, icon: Icon, color }) => {
                      const active = form.managedBy === value
                      const colorMap: Record<string, string> = {
                        teal:  active ? 'border-teal-400 bg-teal-50 text-teal-700'   : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-teal-200',
                        amber: active ? 'border-amber-400 bg-amber-50 text-amber-700': 'border-gray-100 bg-gray-50 text-gray-400 hover:border-amber-200',
                      }
                      return (
                        <button key={value} type="button"
                          onClick={() => setForm(f => ({ ...f, managedBy: value }))}
                          className={`flex items-center gap-3 px-3 py-3 rounded-xl border-2 transition-all text-left ${colorMap[color]}`}>
                          <Icon className="h-4 w-4 shrink-0" />
                          <div>
                            <p className="text-xs font-bold leading-none">{label}</p>
                            <p className="text-[10px] opacity-70 mt-0.5">{desc}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* PIC / Manager */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">PIC / Manager</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <input
                      className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#bdac7e] focus:bg-white transition-all placeholder:text-gray-400"
                      placeholder="Nama penanggungjawab"
                      value={form.manager}
                      onChange={e => setForm(f => ({ ...f, manager: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50/80">
                <button onClick={() => setModal(false)}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border rounded-xl hover:bg-white transition-all">
                  Batal
                </button>
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 text-sm text-white rounded-xl font-semibold disabled:opacity-50 transition-colors shadow-sm" style={{ backgroundColor: '#bdac7e' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#a89860')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#bdac7e')}>
                  {saving
                    ? <><span className="h-3.5 w-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Menyimpan...</>
                    : editing ? 'Simpan Perubahan' : 'Tambah Lokasi'
                  }
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-2">Hapus Lokasi?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-medium text-foreground">{deleteConfirm.name}</span> akan dihapus permanen.
              Lokasi yang masih memiliki stok tidak bisa dihapus.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
              <button onClick={() => doDelete(deleteConfirm)} className="px-4 py-2 text-sm bg-destructive text-white rounded-md hover:bg-destructive/90">Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vessel Inventory Modal ── */}
      {invModal.open && invModal.yacht && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-50"><Ship className="h-5 w-5 text-blue-500" /></div>
                <div>
                  <h3 className="font-bold text-lg">{invModal.yacht.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Real-time inventory on vessel</p>
                </div>
              </div>
              <button onClick={() => setInvModal({ open: false, yacht: null })} className="p-2 hover:bg-muted rounded-lg transition-colors">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {invLoading ? (
                <div className="p-8 space-y-3 animate-pulse">
                  {[...Array(4)].map((_, i) => <div key={i} className="flex justify-between py-2"><div className="h-4 w-40 rounded bg-muted" /><div className="h-4 w-16 rounded bg-muted" /></div>)}
                </div>
              ) : invRows.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">Belum ada stok di kapal ini</p>
                  <p className="text-xs mt-1">Item akan muncul setelah transfer dari gudang</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-6 px-6 py-3.5 bg-muted/30 border-b text-sm">
                    <div><span className="text-muted-foreground">Total items: </span><span className="font-semibold">{invRows.length}</span></div>
                    <div><span className="text-muted-foreground">Value: </span><span className="font-semibold">{fmtMoney(totalInvValue)}</span></div>
                    {lowStockRows.length > 0 && (
                      <div className="flex items-center gap-1 text-red-600 font-medium ml-auto">
                        <AlertTriangle className="h-3.5 w-3.5" />{lowStockRows.length} low stock
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto"><table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground border-b sticky top-0 bg-white">
                      <tr>
                        <th className="text-left px-6 py-2.5 font-medium">Item</th>
                        <th className="text-left px-4 py-2.5 font-medium">Category</th>
                        <th className="text-right px-6 py-2.5 font-medium">Stock</th>
                        <th className="text-right px-6 py-2.5 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {invRows.map(({ item, qty, costPerUnit }) => {
                        const isLow = item.minStock > 0 && qty < item.minStock
                        return (
                          <tr key={item.id} className={`hover:bg-muted/20 ${isLow ? 'bg-red-50/40' : ''}`}>
                            <td className="px-6 py-3">
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground font-mono mt-0.5">{item.sku}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">{item.category}</span>
                            </td>
                            <td className="px-6 py-3 text-right">
                              <span className={`font-semibold ${isLow ? 'text-red-600' : ''}`}>{qty} {item.baseUnit}</span>
                              {isLow && <AlertTriangle className="h-3 w-3 text-red-500 inline ml-1" />}
                            </td>
                            <td className="px-6 py-3 text-right text-muted-foreground">{fmtMoney(qty * costPerUnit)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table></div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t bg-muted/20 shrink-0 text-right">
              <button onClick={() => setInvModal({ open: false, yacht: null })} className="px-5 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
