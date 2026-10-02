'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Search, Martini, Pencil, Trash2, X, Globe, Anchor, Check } from 'lucide-react'

interface Yacht { id: string; name: string }
interface Category { id: string; name: string; isActive: boolean }
interface CatalogItem { id: string; sku: string; name: string; category: string; baseUnit: string }
interface RecipeLine { id: string; itemId: string; qty: number; unitCost: number; cost: number; item: { id: string; sku: string; name: string; baseUnit: string } }
interface Recipe {
  id: string; name: string; description: string | null; categoryId: string; yachtId: string | null; price: number; isActive: boolean
  category: { id: string; name: string }; yacht: { id: string; name: string } | null; lines: RecipeLine[]; cost: number
}
interface FormLine { itemId: string; name: string; unit: string; qty: string }

const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n)
const fmtQty = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)
const inp = 'w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white transition-colors'
const BLANK_FORM = { name: '', description: '', categoryId: '', price: '', lines: [] as FormLine[] }

/** Food cost % of the selling price — the usual bar metric. */
const costPct = (cost: number, price: number) => (price > 0 ? Math.round(cost / price * 100) : null)

export default function PosRecipesPage() {
  const [yachts, setYachts] = useState<Yacht[]>([])
  const [scope, setScope] = useState('global')
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [form, setForm] = useState(BLANK_FORM)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [extraCosts, setExtraCosts] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/pos/recipes?yachtId=${scope}`)
    if (res.ok) setRecipes(await res.json())
    setLoading(false)
  }, [scope])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/yachts').then(r => r.json()).then(d => setYachts(Array.isArray(d) ? d.map((y: { id: string; name: string }) => ({ id: y.id, name: y.name })) : []))
    fetch('/api/pos/categories').then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d.filter((c: Category) => c.isActive) : []))
    fetch('/api/purchasing/items').then(r => r.json()).then(d => setCatalog(Array.isArray(d) ? d : []))
  }, [])

  function openAdd() {
    setForm({ ...BLANK_FORM, lines: [] })
    setEditId(null); setSaveError(''); setShowForm(true)
  }
  function openEdit(r: Recipe) {
    setForm({
      name: r.name, description: r.description ?? '', categoryId: r.categoryId, price: String(r.price),
      lines: r.lines.map(l => ({ itemId: l.itemId, name: l.item.name, unit: l.item.baseUnit, qty: String(l.qty) })),
    })
    setEditId(r.id); setSaveError(''); setShowForm(true)
  }

  /** Ingredient picker modal result — replaces the whole recipe line list. */
  function applyPicked(lines: FormLine[]) {
    setForm(f => ({ ...f, lines }))
    setShowPicker(false)
    const missing = lines.map(l => l.itemId).filter(id => !unitCostOf.has(id))
    if (missing.length) {
      fetch(`/api/pos/recipes/item-costs?ids=${missing.join(',')}`).then(r => r.ok ? r.json() : {}).then(d => setExtraCosts(prev => ({ ...prev, ...d })))
    }
  }
  const removeLine = (itemId: string) => setForm(f => ({ ...f, lines: f.lines.filter(l => l.itemId !== itemId) }))
  const setLineQty = (itemId: string, qty: string) => setForm(f => ({ ...f, lines: f.lines.map(l => l.itemId === itemId ? { ...l, qty } : l) }))

  async function save() {
    if (!form.name.trim()) { setSaveError('Menu name is required'); return }
    if (!form.categoryId) { setSaveError('Please pick a category'); return }
    if (!form.price || Number(form.price) < 0) { setSaveError('Please set a price'); return }
    if (form.lines.length === 0) { setSaveError('Add at least one ingredient'); return }
    if (form.lines.some(l => !(Number(l.qty) > 0))) { setSaveError('Every ingredient needs a quantity above 0'); return }
    setSaving(true); setSaveError('')
    const res = await fetch(editId ? `/api/pos/recipes/${editId}` : '/api/pos/recipes', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(), description: form.description.trim() || null, categoryId: form.categoryId,
        ...(!editId && { yachtId: scope === 'global' ? null : scope }),
        price: Number(form.price),
        lines: form.lines.map(l => ({ itemId: l.itemId, qty: Number(l.qty) })),
      }),
    })
    const data = await res.json()
    if (!res.ok) { setSaveError(data.error ?? 'Failed to save'); setSaving(false); return }
    setSaving(false); setShowForm(false); load()
  }

  async function toggleActive(r: Recipe) {
    await fetch(`/api/pos/recipes/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !r.isActive }),
    })
    load()
  }

  async function del(r: Recipe) {
    if (!confirm(`Delete menu "${r.name}"? Past sales keep their history.`)) return
    await fetch(`/api/pos/recipes/${r.id}`, { method: 'DELETE' })
    load()
  }

  // Live cost estimate in the form, from the unit costs the list already loaded.
  const unitCostOf = new Map<string, number>([
    ...recipes.flatMap(r => r.lines.map(l => [l.itemId, l.unitCost] as [string, number])),
    ...Object.entries(extraCosts),
  ])
  const formCost = form.lines.reduce((s, l) => s + (unitCostOf.get(l.itemId) ?? 0) * (Number(l.qty) || 0), 0)
  const formHasUnknownCost = form.lines.some(l => !unitCostOf.has(l.itemId))

  const filtered = recipes.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">POS Menu</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Drinks &amp; dishes made from stock ingredients. Each sale deducts the recipe from the bar stock and is costed as Bar COGS on the trip.
          </p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 h-9 px-4 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-md transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Menu
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
          <input className={`${inp} pl-8 w-56`} placeholder="Search menu…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Menu</th>
                <th className="text-left px-4 py-3 font-medium">Recipe</th>
                <th className="text-left px-4 py-3 font-medium">Scope</th>
                <th className="text-right px-4 py-3 font-medium">Price</th>
                <th className="text-right px-4 py-3 font-medium" title="Current moving-average cost of the ingredients">Est. Cost</th>
                <th className="text-right px-4 py-3 font-medium" title="Price − Est. Cost (cost as % of price)">Margin</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}><td className="px-4 py-3.5" colSpan={8}><div className="h-3.5 w-full rounded bg-muted animate-pulse" /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                  <Martini className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No menu on this scope yet.
                </td></tr>
              ) : filtered.map(r => {
                const pct = costPct(r.cost, r.price)
                return (
                  <tr key={r.id} className="hover:bg-muted/30 align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.category.name}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.lines.map(l => (
                        <div key={l.id}>{fmtQty(l.qty)} {l.item.baseUnit} · {l.item.name}</div>
                      ))}
                    </td>
                    <td className="px-4 py-3">
                      {r.yachtId
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{r.yacht?.name}</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Global</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums whitespace-nowrap">{fmtMoney(r.price)}</td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{r.cost ? fmtMoney(r.cost) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      {r.cost ? <>
                        <span className={r.price - r.cost < 0 ? 'text-red-600 font-medium' : ''}>{fmtMoney(r.price - r.cost)}</span>
                        {pct != null && <span className="block text-[11px] text-muted-foreground">cost {pct}%</span>}
                      </> : <span className="text-muted-foreground">—</span>}
                    </td>
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
                        <button onClick={() => del(r)} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
                <h3 className="text-sm font-semibold">{editId ? 'Edit Menu' : `Add Menu to ${scope === 'global' ? 'Global' : yachts.find(y => y.id === scope)?.name}`}</h3>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-md"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {saveError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{saveError}</div>}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Name <span className="text-red-500">*</span></label>
                  <input className={inp} placeholder="e.g. Mojito" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
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
                    <label className="text-sm font-medium">Selling Price <span className="text-red-500">*</span></label>
                    <input className={inp} type="number" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Recipe (per 1 portion) <span className="text-red-500">*</span></label>
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    Quantity is in the item&apos;s stock unit (e.g. ml for spirits, pcs for cans). Leave out small ingredients like ice, sugar or garnish.
                  </p>
                  <button type="button" onClick={() => setShowPicker(true)}
                    className={`${inp} pl-8 relative text-left text-muted-foreground hover:border-amber-500`}>
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" />
                    {form.lines.length ? 'Add / edit ingredients from Item Master…' : 'Search Item Master to add ingredients…'}
                  </button>
                  {form.lines.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No ingredients added yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {form.lines.map(l => {
                        const uc = unitCostOf.get(l.itemId)
                        return (
                          <div key={l.itemId} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 bg-muted/20">
                            <span className="flex-1 text-sm truncate">{l.name}</span>
                            <input type="number" min="0" step="any" value={l.qty} placeholder="0" onChange={e => setLineQty(l.itemId, e.target.value)}
                              className="w-20 h-7 border rounded px-1.5 text-xs text-right bg-white" />
                            <span className="text-xs text-muted-foreground w-10">{l.unit}</span>
                            <span className="text-[11px] text-muted-foreground w-20 text-right tabular-nums">{uc != null && Number(l.qty) > 0 ? fmtMoney(uc * Number(l.qty)) : ''}</span>
                            <button onClick={() => removeLine(l.itemId)} className="text-muted-foreground hover:text-red-500 transition-colors"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        )
                      })}
                      <div className="flex justify-between text-xs pt-1">
                        <span className="text-muted-foreground">
                          Est. cost per portion{formHasUnknownCost && ' (loading…)'}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {fmtMoney(formCost)}
                          {Number(form.price) > 0 && !formHasUnknownCost && <span className="ml-1 font-normal text-muted-foreground">· cost {costPct(formCost, Number(form.price))}%</span>}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t shrink-0">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold disabled:opacity-50 transition-colors">
                  {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Menu'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showPicker && (
        <IngredientPicker catalog={catalog} initial={form.lines} onClose={() => setShowPicker(false)} onApply={applyPicked} />
      )}
    </div>
  )
}

/** Multi-select ingredient modal: tick several Item Master items and set each quantity in one go. */
function IngredientPicker({ catalog, initial, onClose, onApply }: {
  catalog: CatalogItem[]; initial: FormLine[]; onClose: () => void; onApply: (lines: FormLine[]) => void
}) {
  const [q, setQ] = useState('')
  // Insertion-ordered so the recipe keeps the order items were picked in.
  const [picked, setPicked] = useState<FormLine[]>(initial)
  const [error, setError] = useState('')
  const pickedIds = useMemo(() => new Set(picked.map(p => p.itemId)), [picked])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = s ? catalog.filter(c => c.name.toLowerCase().includes(s) || c.sku.toLowerCase().includes(s)) : catalog
    return list.slice(0, 100)
  }, [catalog, q])

  const toggle = (c: CatalogItem) => setPicked(p => pickedIds.has(c.id) ? p.filter(x => x.itemId !== c.id) : [...p, { itemId: c.id, name: c.name, unit: c.baseUnit, qty: '' }])
  const setQty = (c: CatalogItem, qty: string) => setPicked(p => pickedIds.has(c.id)
    ? p.map(x => x.itemId === c.id ? { ...x, qty } : x)
    : [...p, { itemId: c.id, name: c.name, unit: c.baseUnit, qty }])
  const qtyOf = (id: string) => picked.find(p => p.itemId === id)?.qty ?? ''

  function apply() {
    if (picked.some(p => !(Number(p.qty) > 0))) { setError('Set a quantity above 0 for every ticked ingredient'); return }
    onApply(picked)
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
            <div>
              <h3 className="text-sm font-semibold">Pick Ingredients</h3>
              <p className="text-[11px] text-muted-foreground">Tick items and set the quantity per 1 portion (in the item&apos;s stock unit).</p>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-muted rounded-md"><X className="h-4 w-4" /></button>
          </div>
          <div className="px-5 pt-4 pb-2 shrink-0 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input autoFocus className={`${inp} pl-8`} placeholder="Search by name or SKU…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            {picked.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {picked.map(p => (
                  <span key={p.itemId} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${Number(p.qty) > 0 ? 'bg-amber-100 text-amber-800' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {p.name}{Number(p.qty) > 0 && ` · ${p.qty} ${p.unit}`}
                    <button onClick={() => setPicked(prev => prev.filter(x => x.itemId !== p.itemId))} className="hover:text-red-600"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-2">
            {results.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No items found</p>
            ) : (
              <div className="divide-y border rounded-lg">
                {results.map(c => {
                  const on = pickedIds.has(c.id)
                  return (
                    <div key={c.id} className={`flex items-center gap-3 px-3 py-2 ${on ? 'bg-amber-50/60' : 'hover:bg-muted/30'}`}>
                      <button type="button" onClick={() => toggle(c)}
                        className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center ${on ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white'}`}>
                        {on && <Check className="h-3 w-3" />}
                      </button>
                      <button type="button" onClick={() => toggle(c)} className="flex-1 min-w-0 text-left">
                        <p className="text-sm truncate">{c.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{c.sku} · {c.category}</p>
                      </button>
                      <input type="number" min="0" step="any" placeholder="0" value={qtyOf(c.id)} onChange={e => setQty(c, e.target.value)}
                        className="w-20 h-7 border rounded px-1.5 text-xs text-right bg-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
                      <span className="text-xs text-muted-foreground w-10">{c.baseUnit}</span>
                    </div>
                  )
                })}
              </div>
            )}
            {results.length === 100 && <p className="text-[11px] text-muted-foreground text-center py-2">Showing first 100 — refine the search to find more.</p>}
          </div>
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-t shrink-0">
            <span className={`text-xs ${error ? 'text-red-600' : 'text-muted-foreground'}`}>{error || `${picked.length} ingredient${picked.length === 1 ? '' : 's'} selected`}</span>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
              <button onClick={apply} className="px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold transition-colors">Apply</button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
