'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Warehouse, Ship, Eye, AlertTriangle, Package, MapPin, Truck, Layers, SlidersHorizontal, User, ChevronRight, CornerDownRight } from 'lucide-react'
import { renderLocationOptions } from '@/components/purchasing/LocationOptions'
import { formatMoney } from '@/lib/format'

interface Yacht { id: string; name: string }
interface StockLocation {
  id: string; name: string; type: string; yachtId: string | null
  parentId: string | null; manager: string | null; address: string | null; storageClass: string | null
  managedBy: string; isActive: boolean
  consumptionMode: 'HOLD_AS_STOCK' | 'EXPENSE_ON_RECEIVE' | null; isPosBar: boolean
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
  WAREHOUSE: 'bg-warning/15 text-warning',
  VESSEL:    'bg-info/15 text-info',
  TRANSIT:   'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  SITE:      'bg-success/15 text-success',
  ADJUSTMENT:'bg-muted text-muted-foreground',
}
const STORAGE_COLOR: Record<string, string> = {
  Dry: 'bg-warning/10 text-warning border border-warning/30',
  Cold: 'bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30',
  Frozen: 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30',
  Mixed: 'bg-muted/50 text-muted-foreground border border-border',
}

const BLANK = { name: '', type: 'WAREHOUSE', yachtId: '', parentId: '', manager: '', address: '', storageClass: '', managedBy: 'WAREHOUSE', consumptionMode: '', isPosBar: false }

// Mirrors effectiveConsumptionMode in src/lib/purchasing/consumptionMode.ts.
function effectiveMode(l: { type: string; consumptionMode: string | null; isPosBar: boolean }) {
  if (l.isPosBar) return 'HOLD_AS_STOCK'
  if (l.consumptionMode) return l.consumptionMode
  return l.type === 'VESSEL' ? 'EXPENSE_ON_RECEIVE' : 'HOLD_AS_STOCK'
}
const MODE_LABEL: Record<string, string> = { HOLD_AS_STOCK: 'Held as stock', EXPENSE_ON_RECEIVE: 'Expensed on receive' }

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
      address: loc.address ?? '',
      storageClass: loc.storageClass ?? '',
      managedBy: loc.managedBy ?? 'WAREHOUSE',
      consumptionMode: loc.consumptionMode ?? '',
      isPosBar: loc.isPosBar,
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
      address: form.address || undefined,
      storageClass: form.storageClass || undefined,
      managedBy: form.managedBy,
      consumptionMode: form.isPosBar ? '' : form.consumptionMode,
      isPosBar: form.type === 'VESSEL' && form.isPosBar,
    }
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setModal(false); setSaving(false); load()
  }

  async function toggleActive(loc: StockLocation) {
    await fetch(`/api/purchasing/locations/${loc.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: loc.name, type: loc.type, yachtId: loc.yachtId, parentId: loc.parentId, manager: loc.manager, address: loc.address, storageClass: loc.storageClass, managedBy: loc.managedBy, isActive: !loc.isActive }),
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

  // Groups the (possibly filtered) list so a location's children render immediately
  // under it, indented — instead of interleaved alphabetically with everything else
  // (e.g. 4 unrelated rows all just named "Bar"). A child whose parent got filtered
  // out of view still renders, just at depth 0 with no indentation — its parent name
  // stays visible via the small label under its own name either way.
  const idSet = new Set(filtered.map(l => l.id))
  const byParent = new Map<string, StockLocation[]>()
  const topLevel: StockLocation[] = []
  filtered.forEach(l => {
    if (l.parentId && idSet.has(l.parentId)) {
      const arr = byParent.get(l.parentId) ?? []
      arr.push(l)
      byParent.set(l.parentId, arr)
    } else {
      topLevel.push(l)
    }
  })
  const byName = (a: StockLocation, b: StockLocation) => a.name.localeCompare(b.name)
  const groupedRows: { loc: StockLocation; depth: number }[] = []
  topLevel.sort(byName).forEach(t => {
    groupedRows.push({ loc: t, depth: 0 })
    ;(byParent.get(t.id) ?? []).sort(byName).forEach(c => groupedRows.push({ loc: c, depth: 1 }))
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
          <p className="text-muted-foreground text-sm mt-1">Warehouses, vessels, transit and other storage locations</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium px-4 py-2 rounded-md transition-colors">
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
          className="ml-auto border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-48"
          placeholder="Search locations…"
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
                <th className="text-left px-4 py-3 font-medium">Location Name</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Vessel</th>
                <th className="text-left px-4 py-3 font-medium">PIC / Manager</th>
                <th className="text-left px-4 py-3 font-medium">Storage Class</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {groupedRows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  No locations found.
                </td></tr>
              ) : groupedRows.map(({ loc, depth }) => (
                <tr key={loc.id} className={`hover:bg-muted/30 transition-colors ${!loc.isActive ? 'opacity-50' : ''} ${depth > 0 ? 'bg-muted/10' : ''}`}>
                  <td className="px-4 py-3 font-medium">
                    {depth > 0 ? (
                      <span className="flex items-center gap-1.5 pl-5 font-normal text-muted-foreground">
                        <CornerDownRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
                        {loc.name}
                      </span>
                    ) : (
                      <>
                        {loc.name}
                        {/* Parent exists but got filtered out of the current view (e.g. a
                            different type filter) — keep its context visible instead of
                            silently losing it now that there's no separate Parent column. */}
                        {loc.parent && (
                          <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">in {loc.parent.name}</span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLOR[loc.type] ?? 'bg-muted text-muted-foreground'}`}>
                      {TYPE_LABEL[loc.type] ?? loc.type}
                    </span>
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {loc.isPosBar && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-destructive/15 text-destructive">POS Bar</span>}
                      <span className={`text-[10px] ${effectiveMode(loc) === 'EXPENSE_ON_RECEIVE' ? 'text-warning' : 'text-muted-foreground'}`}>
                        {MODE_LABEL[effectiveMode(loc)]}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {loc.yacht ? (
                      <button onClick={() => openInventory(loc.yacht!)}
                        className="flex items-center gap-1 text-info hover:text-info/80 font-medium">
                        <Ship className="h-3 w-3" /> {loc.yacht.name}
                      </button>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{loc.manager || '—'}</td>
                  <td className="px-4 py-3">
                    {loc.storageClass ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STORAGE_COLOR[loc.storageClass] ?? 'bg-muted text-muted-foreground'}`}>
                        {loc.storageClass}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActive(loc)}>
                      {loc.isActive
                        ? <ToggleRight className="h-5 w-5 text-success mx-auto" />
                        : <ToggleLeft className="h-5 w-5 text-muted-foreground mx-auto" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {loc.type === 'VESSEL' && loc.yacht && (
                        <button onClick={() => openInventory(loc.yacht!)}
                          className="p-1.5 text-muted-foreground hover:text-info hover:bg-info/10 rounded-lg transition-colors" title="View Inventory">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => openEdit(loc)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteConfirm(loc)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
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
            <div className="pointer-events-auto bg-card rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

              {/* Header */}
              <div className="px-6 pt-6 pb-5" style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)' }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary-foreground/20 rounded-xl">
                      <MapPin className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="font-bold text-primary-foreground text-lg leading-tight">
                        {editing ? 'Edit Location' : 'Add Location'}
                      </h3>
                      <p className="text-primary-foreground/80 text-xs mt-0.5">
                        {editing ? 'Update storage location details' : 'Add a new storage location'}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setModal(false)} className="p-1.5 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/20 rounded-lg transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
                {formError && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {formError}
                  </div>
                )}

                {/* Location Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Location Name <span className="text-destructive normal-case">*</span>
                  </label>
                  <input
                    className="w-full border-2 border-border bg-muted/50 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-ring focus:bg-card transition-all placeholder:text-muted-foreground"
                    placeholder="e.g. Bajo Main Warehouse"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    autoFocus
                  />
                </div>

                {/* Type selector — visual cards */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Location Type <span className="text-destructive normal-case">*</span>
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
                        amber:  active ? 'border-warning bg-warning/10 text-warning'  : 'border-border bg-muted/50 text-muted-foreground/70 hover:border-primary/40 hover:text-warning',
                        blue:   active ? 'border-info bg-info/10 text-info'    : 'border-border bg-muted/50 text-muted-foreground/70 hover:border-info/30 hover:text-info',
                        purple: active ? 'border-purple-400 bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300': 'border-border bg-muted/50 text-muted-foreground/70 hover:border-purple-200 dark:hover:border-purple-500/30 hover:text-purple-600 dark:hover:text-purple-300',
                        green:  active ? 'border-success bg-success/10 text-success'  : 'border-border bg-muted/50 text-muted-foreground/70 hover:border-success/30 hover:text-success',
                        gray:   active ? 'border-muted-foreground/60 bg-muted text-foreground/80'   : 'border-border bg-muted/50 text-muted-foreground/70 hover:border-muted-foreground/40 hover:text-muted-foreground',
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
                      Vessel <span className="text-destructive normal-case">*</span>
                    </label>
                    <div className="relative">
                      <Ship className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-info pointer-events-none" />
                      <select
                        className="w-full border-2 border-border bg-muted/50 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-ring focus:bg-card transition-all appearance-none"
                        value={form.yachtId} onChange={e => setForm(f => ({ ...f, yachtId: e.target.value }))}>
                        <option value="">— Select vessel —</option>
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
                      { value: 'Dry',    label: 'Dry',    desc: 'Ambient',  cls: 'orange' },
                      { value: 'Cold',   label: 'Cold',   desc: 'Chilled',  cls: 'cyan'   },
                      { value: 'Frozen', label: 'Frozen', desc: 'Freezer',   cls: 'indigo' },
                      { value: 'Mixed',  label: 'Mixed',  desc: 'Combined',cls: 'gray'   },
                    ] as const).map(({ value, label, desc, cls }) => {
                      const active = form.storageClass === value
                      const colorMap: Record<string, string> = {
                        orange: active ? 'border-warning bg-warning/10 text-warning' : 'border-border bg-muted/50 text-muted-foreground/70 hover:border-primary/40',
                        cyan:   active ? 'border-cyan-400 bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300'       : 'border-border bg-muted/50 text-muted-foreground/70 hover:border-cyan-200 dark:hover:border-cyan-500/30',
                        indigo: active ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'border-border bg-muted/50 text-muted-foreground/70 hover:border-indigo-200 dark:hover:border-indigo-500/30',
                        gray:   active ? 'border-muted-foreground/60 bg-muted text-foreground/80'      : 'border-border bg-muted/50 text-muted-foreground/70 hover:border-muted-foreground/40',
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
                    <ChevronRight className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
                    <select
                      className="w-full border-2 border-border bg-muted/50 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-ring focus:bg-card transition-all appearance-none"
                      value={form.parentId} onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))}>
                      <option value="">— None —</option>
                      {renderLocationOptions(locations, {
                        excludeIds: editing ? new Set([editing.id]) : undefined,
                        renderLabel: l => `${l.name} · ${TYPE_LABEL[l.type] ?? l.type}`,
                      })}
                    </select>
                  </div>
                </div>

                {/* Managed By */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Who can receive?</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'WAREHOUSE', label: 'Warehouse', desc: 'Bajo warehouse / vessel team', icon: Warehouse, color: 'teal' },
                      { value: 'PURCHASING', label: 'Purchasing', desc: 'Bali purchasing team', icon: Package, color: 'amber' },
                    ] as const).map(({ value, label, desc, icon: Icon, color }) => {
                      const active = form.managedBy === value
                      const colorMap: Record<string, string> = {
                        teal:  active ? 'border-teal-400 bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300'   : 'border-border bg-muted/50 text-muted-foreground/70 hover:border-teal-200 dark:hover:border-teal-500/30',
                        amber: active ? 'border-warning bg-warning/10 text-warning': 'border-border bg-muted/50 text-muted-foreground/70 hover:border-primary/40',
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

                {/* Usage (pemakaian) recognition */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">When is stock here counted as used?</label>
                  {form.type === 'VESSEL' && (
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, isPosBar: !f.isPosBar }))}
                      className={`w-full flex items-center justify-between px-3 py-3 rounded-xl border-2 transition-all text-left ${form.isPosBar ? 'border-destructive bg-destructive/10 text-destructive' : 'border-border bg-muted/50 text-muted-foreground hover:border-destructive/30'}`}>
                      <div>
                        <p className="text-xs font-bold leading-none">POS Bar for this yacht</p>
                        <p className="text-[10px] opacity-70 mt-0.5">The cashier sells from here. Stock is held and only counted as used when sold, given as complimentary, or lost in stock count. One bar per yacht.</p>
                      </div>
                      {form.isPosBar ? <ToggleRight className="h-5 w-5 shrink-0" /> : <ToggleLeft className="h-5 w-5 shrink-0" />}
                    </button>
                  )}
                  {!form.isPosBar && (
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: '', label: 'Auto', desc: form.type === 'VESSEL' ? 'Vessel: used on receive' : 'Held as stock' },
                        { value: 'HOLD_AS_STOCK', label: 'Hold as stock', desc: 'Used only when it leaves' },
                        { value: 'EXPENSE_ON_RECEIVE', label: 'Used on receive', desc: 'Counted as used once received' },
                      ] as const).map(({ value, label, desc }) => {
                        const active = form.consumptionMode === value
                        return (
                          <button key={value || 'auto'} type="button"
                            onClick={() => setForm(f => ({ ...f, consumptionMode: value }))}
                            className={`px-3 py-2.5 rounded-xl border-2 transition-all text-left ${active ? 'border-primary bg-primary/10 text-primary-strong' : 'border-border bg-muted/50 text-muted-foreground/70 hover:border-primary/40'}`}>
                            <p className="text-xs font-bold leading-none">{label}</p>
                            <p className="text-[10px] opacity-70 mt-0.5">{desc}</p>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* PIC / Manager */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">PIC / Manager</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
                    <input
                      className="w-full border-2 border-border bg-muted/50 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-ring focus:bg-card transition-all placeholder:text-muted-foreground"
                      placeholder="Person in charge"
                      value={form.manager}
                      onChange={e => setForm(f => ({ ...f, manager: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Address</label>
                  <textarea
                    className="w-full border-2 border-border bg-muted/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-ring focus:bg-card transition-all placeholder:text-muted-foreground resize-none"
                    placeholder="Full address of this location — used as Ship To on POs"
                    rows={2}
                    value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/50">
                <button onClick={() => setModal(false)}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border rounded-xl hover:bg-card transition-all">
                  Cancel
                </button>
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 text-sm text-primary-foreground rounded-xl font-semibold disabled:opacity-50 transition-colors shadow-sm" style={{ backgroundColor: 'var(--primary)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--primary-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--primary)')}>
                  {saving
                    ? <><span className="h-3.5 w-3.5 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" /> Saving…</>
                    : editing ? 'Save Changes' : 'Add Location'
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
          <div className="bg-card rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-2">Delete Location?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-medium text-foreground">{deleteConfirm.name}</span> will be permanently deleted.
              Locations that still hold stock cannot be deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
              <button onClick={() => doDelete(deleteConfirm)} className="px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vessel Inventory Modal ── */}
      {invModal.open && invModal.yacht && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-info/10"><Ship className="h-5 w-5 text-info" /></div>
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
                  <p className="text-sm font-medium">No stock on this vessel yet</p>
                  <p className="text-xs mt-1">Items will appear after a transfer from the warehouse</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-6 px-6 py-3.5 bg-muted/30 border-b text-sm">
                    <div><span className="text-muted-foreground">Total items: </span><span className="font-semibold">{invRows.length}</span></div>
                    <div><span className="text-muted-foreground">Value: </span><span className="font-semibold">{formatMoney(totalInvValue)}</span></div>
                    {lowStockRows.length > 0 && (
                      <div className="flex items-center gap-1 text-destructive font-medium ml-auto">
                        <AlertTriangle className="h-3.5 w-3.5" />{lowStockRows.length} low stock
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto"><table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground border-b sticky top-0 bg-card">
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
                          <tr key={item.id} className={`hover:bg-muted/20 ${isLow ? 'bg-destructive/5' : ''}`}>
                            <td className="px-6 py-3">
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground font-mono mt-0.5">{item.sku}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">{item.category}</span>
                            </td>
                            <td className="px-6 py-3 text-right">
                              <span className={`font-semibold ${isLow ? 'text-destructive' : ''}`}>{qty} {item.baseUnit}</span>
                              {isLow && <AlertTriangle className="h-3 w-3 text-destructive inline ml-1" />}
                            </td>
                            <td className="px-6 py-3 text-right text-muted-foreground">{formatMoney(qty * costPerUnit)}</td>
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
