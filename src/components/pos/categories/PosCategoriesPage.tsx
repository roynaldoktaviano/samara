'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Tag, Pencil, Trash2, X } from 'lucide-react'

interface Category { id: string; name: string; sortOrder: number; isActive: boolean; itemCount: number }

const BLANK = { name: '', sortOrder: 0 }
const inp = 'w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white transition-colors'

export default function PosCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(BLANK)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/pos/categories')
    if (res.ok) setCategories(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() { setForm(BLANK); setEditId(null); setSaveError(''); setShowForm(true) }
  function openEdit(c: Category) { setForm({ name: c.name, sortOrder: c.sortOrder }); setEditId(c.id); setSaveError(''); setShowForm(true) }

  async function save() {
    if (!form.name.trim()) { setSaveError('Category name is required'); return }
    setSaving(true); setSaveError('')
    const res = await fetch(editId ? `/api/pos/categories/${editId}` : '/api/pos/categories', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setSaveError(data.error ?? 'Failed to save'); setSaving(false); return }
    setSaving(false); setShowForm(false); load()
  }

  async function toggleActive(c: Category) {
    await fetch(`/api/pos/categories/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !c.isActive }),
    })
    load()
  }

  async function del(c: Category) {
    if (!confirm(`Delete category "${c.name}"?`)) return
    const res = await fetch(`/api/pos/categories/${c.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Failed to delete'); return }
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">POS Categories</h2>
          <p className="text-muted-foreground text-sm mt-1">Groups used to organize the Cashier app's menu</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 h-9 px-4 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-md transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Category
        </button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-center px-4 py-3 font-medium">Sort Order</th>
              <th className="text-center px-4 py-3 font-medium">Products</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}><td className="px-4 py-3.5" colSpan={5}><div className="h-3.5 w-full rounded bg-muted animate-pulse" /></td></tr>
              ))
            ) : categories.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                <Tag className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No categories yet.
              </td></tr>
            ) : categories.map(c => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-center text-muted-foreground">{c.sortOrder}</td>
                <td className="px-4 py-3 text-center text-muted-foreground">{c.itemCount}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                    {c.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openEdit(c)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => toggleActive(c)} className="px-2.5 py-1 text-xs border rounded-md text-muted-foreground hover:bg-muted transition-colors">
                      {c.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => del(c)} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <h3 className="text-sm font-semibold">{editId ? 'Edit Category' : 'Add Category'}</h3>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-md"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-5 space-y-4">
                {saveError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{saveError}</div>}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Name <span className="text-red-500">*</span></label>
                  <input className={inp} placeholder="e.g. Beverages" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Sort Order</label>
                  <input className={inp} type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) || 0 }))} />
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold disabled:opacity-50 transition-colors">
                  {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Category'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
