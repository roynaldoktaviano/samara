'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Trash2, CalendarOff, Loader2 } from 'lucide-react'

interface Holiday {
  id: string
  date: string
  name: string
  createdBy: { id: string; name: string | null } | null
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

export default function NationalHolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState(false)
  const [isRange, setIsRange] = useState(false)
  const [form, setForm] = useState({ startDate: '', endDate: '', name: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formNote, setFormNote] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/hr/national-holidays')
    if (res.ok) setHolidays(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() { setForm({ startDate: '', endDate: '', name: '' }); setIsRange(false); setFormError(''); setFormNote(''); setModal(true) }

  async function save() {
    const endDate = isRange ? form.endDate : form.startDate
    if (!form.startDate || !endDate || !form.name.trim()) { setFormError(isRange ? 'Start date, end date, and name are required' : 'Date and name are required'); return }
    if (endDate < form.startDate) { setFormError('End date must be on or after the start date'); return }
    setSaving(true); setFormError(''); setFormNote('')
    const res = await fetch('/api/hr/national-holidays', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, endDate }),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setSaving(false); load()
    if (data.skipped > 0) {
      setFormNote(`Added ${data.created} day${data.created !== 1 ? 's' : ''} — ${data.skipped} already had a holiday set and ${data.skipped !== 1 ? 'were' : 'was'} skipped.`)
    } else {
      setModal(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await fetch(`/api/hr/national-holidays/${deleteTarget.id}`, { method: 'DELETE' })
    setDeleting(false); setDeleteTarget(null); load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">National Holidays</h2>
          <p className="text-muted-foreground text-sm mt-1">Marked automatically as Day Off for everyone in Attendance Recap, and excluded from Payroll&apos;s Meal Allowance working-days count.</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> Add Holiday
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg border overflow-hidden animate-pulse">
          <div className="h-10 bg-muted/50 border-b" />
          {[...Array(3)].map((_, i) => <div key={i} className="px-5 py-4 border-t flex gap-4"><div className="h-4 w-40 rounded bg-muted" /></div>)}
        </div>
      ) : holidays.length === 0 ? (
        <div className="rounded-xl border py-12 text-center text-muted-foreground text-sm">
          <CalendarOff className="h-8 w-8 mx-auto mb-2 opacity-20" />
          No national holidays set yet.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left">
                <th className="px-5 py-2.5 font-medium text-muted-foreground text-xs">Date</th>
                <th className="px-5 py-2.5 font-medium text-muted-foreground text-xs">Name</th>
                <th className="px-5 py-2.5 font-medium text-muted-foreground text-xs">Added By</th>
                <th className="px-5 py-2.5 font-medium text-muted-foreground text-xs text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {holidays.map(h => (
                <tr key={h.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-medium">{fmtDate(h.date)}</td>
                  <td className="px-5 py-3">{h.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{h.createdBy?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => setDeleteTarget(h)} className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors" title="Remove">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-sm">Add National Holiday</h3>
              <button onClick={() => setModal(false)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
              {formNote && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{formNote}</p>}

              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={isRange} onChange={e => setIsRange(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                Multiple days (range) — e.g. Idul Fitri
              </label>

              {isRange ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Start Date</label>
                    <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value, endDate: f.endDate && f.endDate >= e.target.value ? f.endDate : e.target.value }))}
                      className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">End Date</label>
                    <input type="date" value={form.endDate} min={form.startDate || undefined} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                      className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500" />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</label>
                  <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value, endDate: e.target.value }))}
                    className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</label>
                <input type="text" placeholder="e.g. Independence Day" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5">
              <h3 className="font-bold text-sm">Remove {deleteTarget.name}?</h3>
              <p className="text-xs text-muted-foreground mt-1">This date will go back to being a normal working day in Attendance Recap and Payroll.</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={confirmDelete} disabled={deleting}
                className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-destructive hover:bg-destructive/90 disabled:opacity-50 transition-colors flex items-center gap-2">
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
