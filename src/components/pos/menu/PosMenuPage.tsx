'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Search, Receipt, Pencil, Trash2, X, Globe, Anchor } from 'lucide-react'

interface Yacht { id: string; name: string }
interface CatalogItem { id: string; sku: string; name: string; category: string; baseUnit: string; sellingPrice: number }
interface MenuRow {
  id: string; itemId: string; categoryId: string; yachtId: string | null; price: number; isActive: boolean; isOverride: boolean
  item: { id: string; sku: string; name: string; baseUnit: string; sellingPrice: number }
  category: { id: string; name: string }
  yacht: { id: string; name: string } | null
}
interface Category { id: string; name: string; isActive: boolean }

const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)
const inp = 'w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white transition-colors'

export default function PosMenuPage() {
  const [yachts, setYachts] = useState<Yacht[]>([])
  const [scope, setScope] = useState('global') // 'global' or a yacht id
  const [rows, setRows] = useState<MenuRow[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [showPicker, setShowPicker] = useState(false)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickItem, setPickItem] = useState<CatalogItem | null>(null)
  const [pickCategoryId, setPickCategoryId] = useState('')
  const [pickPrice, setPickPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [editRow, setEditRow] = useState<MenuRow | null>(null)
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editPrice, setEditPrice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/pos/menu-items?yachtId=${scope}`)
    if (res.ok) setRows(await res.json())
    setLoading(false)
  }, [scope])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/yachts').then(r => r.json()).then(d => setYachts(Array.isArray(d) ? d.map((y: { id: string; name: string }) => ({ id: y.id, name: y.name })) : []))
    fetch('/api/pos/categories').then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d.filter((c: Category) => c.isActive) : []))
  }, [])

  function openPicker() {
    setPickItem(null); setPickCategoryId(''); setPickPrice(''); setSaveError('')
    setShowPicker(true)
    fetch('/api/purchasing/items').then(r => r.json()).then(d => setCatalog(Array.isArray(d) ? d : []))
  }

  async function addToMenu() {
    if (!pickItem) return
    if (!pickCategoryId) { setSaveError('Please pick a category'); return }
    if (!pickPrice || Number(pickPrice) < 0) { setSaveError('Please set a price'); return }
    setSaving(true); setSaveError('')
    const res = await fetch('/api/pos/menu-items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: pickItem.id, categoryId: pickCategoryId, yachtId: scope === 'global' ? null : scope, price: Number(pickPrice) }),
    })
    const data = await res.json()
    if (!res.ok) { setSaveError(data.error ?? 'Failed to add'); setSaving(false); return }
    setSaving(false); setShowPicker(false); load()
  }

  function openEdit(r: MenuRow) { setEditRow(r); setEditCategoryId(r.categoryId); setEditPrice(String(r.price)) }

  async function saveEdit() {
    if (!editRow) return
    setSaving(true)
    await fetch(`/api/pos/menu-items/${editRow.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: editCategoryId, price: Number(editPrice) || 0 }),
    })
    setSaving(false); setEditRow(null); load()
  }

  async function toggleActive(r: MenuRow) {
    await fetch(`/api/pos/menu-items/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !r.isActive }),
    })
    load()
  }

  async function removeFromMenu(r: MenuRow) {
    if (!confirm(`Remove "${r.item.name}" from this menu?`)) return
    await fetch(`/api/pos/menu-items/${r.id}`, { method: 'DELETE' })
    load()
  }

  const existingIds = useMemo(() => new Set(rows.filter(r => !r.isOverride).map(r => r.itemId)), [rows])
  const filteredCatalog = useMemo(() => {
    const q = pickerSearch.toLowerCase()
    return catalog.filter(c => !existingIds.has(c.id) && (!q || c.name.toLowerCase().includes(q) || c.sku.toLowerCase().includes(q)))
  }, [catalog, pickerSearch, existingIds])

  const filteredRows = rows.filter(r => !search || r.item.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">POS Menu &amp; Pricing</h2>
          <p className="text-muted-foreground text-sm mt-1">Products sold in the Cashier app, per yacht or Global (all yachts)</p>
        </div>
        <button onClick={openPicker} className="flex items-center gap-1.5 h-9 px-4 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-md transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Product
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
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
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input className={`${inp} pl-8 w-56`} placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {scope !== 'global' && (
        <p className="text-xs text-muted-foreground">Showing this yacht's own products plus Global ones it hasn't overridden. Add a product here to override its Global price for this yacht only.</p>
      )}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Product</th>
              <th className="text-left px-4 py-3 font-medium">POS Category</th>
              <th className="text-left px-4 py-3 font-medium">Scope</th>
              <th className="text-right px-4 py-3 font-medium">Price</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}><td className="px-4 py-3.5" colSpan={6}><div className="h-3.5 w-full rounded bg-muted animate-pulse" /></td></tr>
              ))
            ) : filteredRows.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No products on this menu yet.
              </td></tr>
            ) : filteredRows.map(r => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <p className="font-medium">{r.item.name}</p>
                  <p className="text-xs text-muted-foreground">{r.item.sku}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.category.name}</td>
                <td className="px-4 py-3">
                  {r.yachtId ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{r.yacht?.name}</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Global</span>
                  )}
                  {r.isOverride && <span className="ml-1.5 text-xs text-muted-foreground italic">overridden here</span>}
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtMoney(r.price)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                    {r.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openEdit(r)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => toggleActive(r)} className="px-2.5 py-1 text-xs border rounded-md text-muted-foreground hover:bg-muted transition-colors">
                      {r.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => removeFromMenu(r)} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add product picker */}
      {showPicker && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setShowPicker(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
                <h3 className="text-sm font-semibold">Add Product to {scope === 'global' ? 'Global Menu' : `${yachts.find(y => y.id === scope)?.name}'s Menu`}</h3>
                <button onClick={() => setShowPicker(false)} className="p-1 hover:bg-muted rounded-md"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {saveError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{saveError}</div>}

                {!pickItem ? (
                  <>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input autoFocus className={`${inp} pl-8`} placeholder="Search Item Master…" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} />
                    </div>
                    <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                      {filteredCatalog.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground">No items found</div>
                      ) : filteredCatalog.slice(0, 50).map(c => (
                        <button key={c.id} type="button" onClick={() => { setPickItem(c); setPickPrice(String(c.sellingPrice || '')) }}
                          className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors border-b last:border-b-0">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.sku} · Item Master: {c.category}</p>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">{fmtMoney(c.sellingPrice)}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{pickItem.name}</p>
                        <p className="text-xs text-muted-foreground">{pickItem.sku}</p>
                      </div>
                      <button onClick={() => setPickItem(null)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">Change</button>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">POS Category <span className="text-red-500">*</span></label>
                      <select className={inp} value={pickCategoryId} onChange={e => setPickCategoryId(e.target.value)}>
                        <option value="">Select POS category…</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <p className="text-[11px] text-muted-foreground">This is where it's grouped in the Cashier app — separate from its Item Master category.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Price <span className="text-red-500">*</span></label>
                      <input className={inp} type="number" min="0" value={pickPrice} onChange={e => setPickPrice(e.target.value)} />
                    </div>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t shrink-0">
                <button onClick={() => setShowPicker(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                <button onClick={addToMenu} disabled={saving || !pickItem}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold disabled:opacity-50 transition-colors">
                  {saving ? 'Adding…' : 'Add to Menu'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Edit price/category */}
      {editRow && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setEditRow(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <h3 className="text-sm font-semibold">Edit {editRow.item.name}</h3>
                <button onClick={() => setEditRow(null)} className="p-1 hover:bg-muted rounded-md"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">POS Category</label>
                  <select className={inp} value={editCategoryId} onChange={e => setEditCategoryId(e.target.value)}>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Price</label>
                  <input className={inp} type="number" min="0" value={editPrice} onChange={e => setEditPrice(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t">
                <button onClick={() => setEditRow(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                <button onClick={saveEdit} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold disabled:opacity-50 transition-colors">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
