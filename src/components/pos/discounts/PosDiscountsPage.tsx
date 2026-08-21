'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Percent, Pencil, Trash2, X } from 'lucide-react'

interface Yacht { id: string; name: string }
interface Discount {
  id: string; name: string; type: 'PERCENT' | 'FIXED'; value: number; yachtId: string | null
  startDate: string | null; endDate: string | null; isActive: boolean
  yacht: { id: string; name: string } | null
}

const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)
const fmtDate = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
const inp = 'w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white transition-colors'
const BLANK = { name: '', type: 'PERCENT' as 'PERCENT' | 'FIXED', value: '', yachtId: '', startDate: '', endDate: '' }

export default function PosDiscountsPage() {
  const [discounts, setDiscounts] = useState<Discount[]>([])
  const [yachts, setYachts] = useState<Yacht[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(BLANK)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/pos/discounts')
    if (res.ok) setDiscounts(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/yachts').then(r => r.json()).then(d => setYachts(Array.isArray(d) ? d.map((y: { id: string; name: string }) => ({ id: y.id, name: y.name })) : []))
  }, [])

  function openAdd() { setForm(BLANK); setEditId(null); setSaveError(''); setShowForm(true) }
  function openEdit(d: Discount) {
    setForm({
      name: d.name, type: d.type, value: String(d.value), yachtId: d.yachtId ?? '',
      startDate: d.startDate ? d.startDate.slice(0, 10) : '', endDate: d.endDate ? d.endDate.slice(0, 10) : '',
    })
    setEditId(d.id); setSaveError(''); setShowForm(true)
  }

  async function save() {
    if (!form.name.trim()) { setSaveError('Discount name is required'); return }
    if (!form.value || Number(form.value) <= 0) { setSaveError('Please set a value greater than 0'); return }
    if (form.type === 'PERCENT' && Number(form.value) > 100) { setSaveError('Percent discount cannot exceed 100'); return }
    setSaving(true); setSaveError('')
    const res = await fetch(editId ? `/api/pos/discounts/${editId}` : '/api/pos/discounts', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(), type: form.type, value: Number(form.value), yachtId: form.yachtId || null,
        startDate: form.startDate || null, endDate: form.endDate || null,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setSaveError(data.error ?? 'Failed to save'); setSaving(false); return }
    setSaving(false); setShowForm(false); load()
  }

  async function toggleActive(d: Discount) {
    await fetch(`/api/pos/discounts/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !d.isActive }),
    })
    load()
  }

  async function del(d: Discount) {
    if (!confirm(`Delete discount "${d.name}"?`)) return
    await fetch(`/api/pos/discounts/${d.id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">POS Discounts</h2>
          <p className="text-muted-foreground text-sm mt-1">Applied by staff at checkout in the Cashier app</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 h-9 px-4 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-md transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Discount
        </button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Value</th>
              <th className="text-left px-4 py-3 font-medium">Scope</th>
              <th className="text-left px-4 py-3 font-medium">Window</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}><td className="px-4 py-3.5" colSpan={6}><div className="h-3.5 w-full rounded bg-muted animate-pulse" /></td></tr>
              ))
            ) : discounts.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                <Percent className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No discounts yet.
              </td></tr>
            ) : discounts.map(d => (
              <tr key={d.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{d.name}</td>
                <td className="px-4 py-3">{d.type === 'PERCENT' ? `${d.value}%` : fmtMoney(d.value)}</td>
                <td className="px-4 py-3">
                  {d.yachtId ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{d.yacht?.name}</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Global</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {d.startDate || d.endDate ? `${d.startDate ? fmtDate(d.startDate) : '…'} – ${d.endDate ? fmtDate(d.endDate) : '…'}` : 'Always'}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.isActive ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                    {d.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openEdit(d)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => toggleActive(d)} className="px-2.5 py-1 text-xs border rounded-md text-muted-foreground hover:bg-muted transition-colors">
                      {d.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => del(d)} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
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
                <h3 className="text-sm font-semibold">{editId ? 'Edit Discount' : 'Add Discount'}</h3>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-md"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-5 space-y-4">
                {saveError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{saveError}</div>}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Name <span className="text-red-500">*</span></label>
                  <input className={inp} placeholder="e.g. Crew Discount" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Type</label>
                    <select className={inp} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'PERCENT' | 'FIXED' }))}>
                      <option value="PERCENT">Percent (%)</option>
                      <option value="FIXED">Fixed amount</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Value <span className="text-red-500">*</span></label>
                    <input className={inp} type="number" min="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Scope</label>
                  <select className={inp} value={form.yachtId} onChange={e => setForm(f => ({ ...f, yachtId: e.target.value }))}>
                    <option value="">Global (all yachts)</option>
                    {yachts.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">Start date</label>
                    <input className={inp} type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">End date</label>
                    <input className={inp} type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold disabled:opacity-50 transition-colors">
                  {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Discount'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
