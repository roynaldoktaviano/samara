'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Search, PackagePlus, Pencil, Trash2, X, Globe, Anchor } from 'lucide-react'

interface Yacht { id: string; name: string }
interface Category { id: string; name: string; isActive: boolean }
interface CatalogItem { id: string; sku: string; name: string; category: string; baseUnit: string }
interface PackageItem { id: string; itemId: string; qty: number; item: { id: string; name: string; baseUnit: string } }
interface Pkg {
  id: string; name: string; description: string | null; categoryId: string; yachtId: string | null; price: number; isActive: boolean
  category: { id: string; name: string }; yacht: { id: string; name: string } | null; items: PackageItem[]
}

const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)
const inp = 'w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white transition-colors'
const BLANK_FORM = { name: '', description: '', categoryId: '', price: '', items: [] as { itemId: string; name: string; unit: string; qty: number }[] }

export default function PosPackagesPage() {
  const [yachts, setYachts] = useState<Yacht[]>([])
  const [scope, setScope] = useState('global')
  const [packages, setPackages] = useState<Pkg[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState(BLANK_FORM)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/pos/packages?yachtId=${scope}`)
    if (res.ok) setPackages(await res.json())
    setLoading(false)
  }, [scope])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/yachts').then(r => r.json()).then(d => setYachts(Array.isArray(d) ? d.map((y: { id: string; name: string }) => ({ id: y.id, name: y.name })) : []))
    fetch('/api/pos/categories').then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d.filter((c: Category) => c.isActive) : []))
    fetch('/api/purchasing/items').then(r => r.json()).then(d => setCatalog(Array.isArray(d) ? d : []))
  }, [])

  function openAdd() {
    setForm({ ...BLANK_FORM })
    setEditId(null); setSaveError(''); setShowForm(true)
  }
  function openEdit(p: Pkg) {
    setForm({
      name: p.name, description: p.description ?? '', categoryId: p.categoryId, price: String(p.price),
      items: p.items.map(it => ({ itemId: it.itemId, name: it.item.name, unit: it.item.baseUnit, qty: it.qty })),
    })
    setEditId(p.id); setSaveError(''); setShowForm(true)
  }

  function addItem(c: CatalogItem) {
    if (form.items.some(i => i.itemId === c.id)) return
    setForm(f => ({ ...f, items: [...f.items, { itemId: c.id, name: c.name, unit: c.baseUnit, qty: 1 }] }))
    setItemSearch('')
  }
  function removeItem(itemId: string) { setForm(f => ({ ...f, items: f.items.filter(i => i.itemId !== itemId) })) }
  function setItemQty(itemId: string, qty: number) { setForm(f => ({ ...f, items: f.items.map(i => i.itemId === itemId ? { ...i, qty: Math.max(1, qty) } : i) })) }

  async function save() {
    if (!form.name.trim()) { setSaveError('Package name is required'); return }
    if (!form.categoryId) { setSaveError('Please pick a category'); return }
    if (!form.price || Number(form.price) < 0) { setSaveError('Please set a price'); return }
    if (form.items.length === 0) { setSaveError('Add at least one item to the package'); return }
    setSaving(true); setSaveError('')
    const res = await fetch(editId ? `/api/pos/packages/${editId}` : '/api/pos/packages', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(), description: form.description.trim() || null, categoryId: form.categoryId,
        yachtId: scope === 'global' ? null : scope, price: Number(form.price),
        items: form.items.map(i => ({ itemId: i.itemId, qty: i.qty })),
      }),
    })
    const data = await res.json()
    if (!res.ok) { setSaveError(data.error ?? 'Failed to save'); setSaving(false); return }
    setSaving(false); setShowForm(false); load()
  }

  async function toggleActive(p: Pkg) {
    await fetch(`/api/pos/packages/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !p.isActive }),
    })
    load()
  }

  async function del(p: Pkg) {
    if (!confirm(`Delete package "${p.name}"?`)) return
    await fetch(`/api/pos/packages/${p.id}`, { method: 'DELETE' })
    load()
  }

  const itemResults = useMemo(() => {
    const q = itemSearch.toLowerCase()
    if (!q) return []
    return catalog.filter(c => !form.items.some(i => i.itemId === c.id) && c.name.toLowerCase().includes(q)).slice(0, 8)
  }, [catalog, itemSearch, form.items])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">POS Packages</h2>
          <p className="text-muted-foreground text-sm mt-1">Bundles sold at a set price in the Cashier app</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 h-9 px-4 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-md transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Package
        </button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => setScope('global')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${scope === 'global' ? 'bg-amber-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
          <Globe className="h-3 w-3" /> Global (all yachts)
        </button>
        {yachts.map(y => (
          <button key={y.id} onClick={() => setScope(y.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${scope === y.id ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            <Anchor className="h-3 w-3" /> {y.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="rounded-lg border p-4 h-32 animate-pulse bg-muted/30" />)
        ) : packages.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground text-sm">
            <PackagePlus className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No packages on this scope yet.
          </div>
        ) : packages.map(p => (
          <div key={p.id} className="rounded-lg border p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.category.name}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                {p.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
            <p className="text-xs text-muted-foreground">{p.items.length} item{p.items.length !== 1 ? 's' : ''}: {p.items.map(i => `${i.qty}× ${i.item.name}`).join(', ')}</p>
            <div className="flex items-center justify-between pt-1">
              <span className="font-bold text-amber-700">{fmtMoney(p.price)}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(p)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => toggleActive(p)} className="px-2 py-1 text-xs border rounded-md text-muted-foreground hover:bg-muted transition-colors">{p.isActive ? 'Off' : 'On'}</button>
                <button onClick={() => del(p)} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            {!p.yachtId && <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">Global</span>}
          </div>
        ))}
      </div>

      {showForm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
                <h3 className="text-sm font-semibold">{editId ? 'Edit Package' : `Add Package to ${scope === 'global' ? 'Global' : yachts.find(y => y.id === scope)?.name}`}</h3>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-md"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {saveError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{saveError}</div>}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Name <span className="text-red-500">*</span></label>
                  <input className={inp} placeholder="e.g. Sunset BBQ Set" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Description</label>
                  <textarea className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white resize-none" rows={2}
                    value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">POS Category <span className="text-red-500">*</span></label>
                    <select className={inp} value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
                      <option value="">Select…</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Price <span className="text-red-500">*</span></label>
                    <input className={inp} type="number" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Included Items <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input className={`${inp} pl-8`} placeholder="Search Item Master to add…" value={itemSearch} onChange={e => setItemSearch(e.target.value)} />
                    {itemResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                        {itemResults.map(c => (
                          <button key={c.id} type="button" onClick={() => addItem(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 transition-colors">
                            {c.name} <span className="text-xs text-muted-foreground">· {c.category}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {form.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No items added yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {form.items.map(it => (
                        <div key={it.itemId} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 bg-muted/20">
                          <span className="flex-1 text-sm truncate">{it.name}</span>
                          <input type="number" min="1" value={it.qty} onChange={e => setItemQty(it.itemId, Number(e.target.value) || 1)}
                            className="w-14 h-7 border rounded px-1.5 text-xs text-center" />
                          <span className="text-xs text-muted-foreground">{it.unit}</span>
                          <button onClick={() => removeItem(it.itemId)} className="text-muted-foreground hover:text-red-500 transition-colors"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t shrink-0">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold disabled:opacity-50 transition-colors">
                  {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Package'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
