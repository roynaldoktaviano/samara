'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Trash2, Sparkles, Phone, Mail } from 'lucide-react'

interface EmployeeRole { id: string; title: string }
interface Candidate {
  id: string; fullName: string; phone: string | null; email: string | null
  source: string | null; notes: string | null
  status: 'NEW' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED'
  appliedRole: EmployeeRole | null
  createdAt: string
}

const STATUSES = ['NEW', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'] as const
const STATUS_LABEL: Record<string, string> = {
  NEW: 'New', SCREENING: 'Screening', INTERVIEW: 'Interview', OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Rejected',
}
const STATUS_COLOR: Record<string, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  SCREENING: 'bg-blue-100 text-blue-700',
  INTERVIEW: 'bg-purple-100 text-purple-700',
  OFFER: 'bg-amber-100 text-amber-700',
  HIRED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}

const BLANK = { fullName: '', appliedRoleId: '', phone: '', email: '', source: '', notes: '' }

export default function TalentPoolPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [roles, setRoles] = useState<EmployeeRole[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'All' | typeof STATUSES[number]>('All')

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<Candidate | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [cRes, rRes] = await Promise.all([fetch('/api/hr/candidates'), fetch('/api/hr/roles')])
    if (cRes.ok) setCandidates(await cRes.json())
    if (rRes.ok) setRoles(await rRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() { setForm({ ...BLANK }); setFormError(''); setModal(true) }

  async function save() {
    if (!form.fullName.trim()) { setFormError('Full name is required'); return }
    setSaving(true); setFormError('')
    const res = await fetch('/api/hr/candidates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setModal(false); setSaving(false); load()
  }

  async function changeStatus(c: Candidate, status: string) {
    await fetch(`/api/hr/candidates/${c.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    load()
  }

  async function doDelete(c: Candidate) {
    await fetch(`/api/hr/candidates/${c.id}`, { method: 'DELETE' })
    setDeleteConfirm(null); load()
  }

  const filtered = statusFilter === 'All' ? candidates : candidates.filter(c => c.status === statusFilter)
  const activeCount = candidates.filter(c => c.status !== 'HIRED' && c.status !== 'REJECTED').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Talent Pool</h2>
          <p className="text-muted-foreground text-sm mt-1">{activeCount} candidate{activeCount !== 1 ? 's' : ''} in the active pipeline</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> Add Candidate
        </button>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {(['All', ...STATUSES] as const).map(s => {
          const count = s === 'All' ? candidates.length : candidates.filter(c => c.status === s).length
          return (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                statusFilter === s ? 'border-amber-500 text-amber-700' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {s === 'All' ? 'All' : STATUS_LABEL[s]}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusFilter === s ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="rounded-lg border overflow-hidden animate-pulse">
          <div className="h-10 bg-muted/50 border-b" />
          {[...Array(3)].map((_, i) => <div key={i} className="px-5 py-4 border-t flex gap-4"><div className="h-4 w-40 rounded bg-muted" /><div className="h-4 w-20 rounded bg-muted" /></div>)}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Candidate</th>
                <th className="text-left px-4 py-3 font-medium">Applied Role</th>
                <th className="text-left px-4 py-3 font-medium">Contact</th>
                <th className="text-left px-4 py-3 font-medium">Source</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  No candidates {statusFilter !== 'All' ? `with status "${STATUS_LABEL[statusFilter]}"` : 'yet'}.
                </td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{c.fullName}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{c.appliedRole?.title ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    <div className="flex flex-col gap-0.5">
                      {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                      {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                      {!c.phone && !c.email && '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{c.source ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <select value={c.status} onChange={e => changeStatus(c, e.target.value)}
                      className={`text-xs font-medium rounded-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-amber-500 ${STATUS_COLOR[c.status]}`}>
                      {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <button onClick={() => setDeleteConfirm(c)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-red-50 rounded-lg transition-colors">
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

      {/* ── Add Candidate Modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-600" />
                <h3 className="font-bold text-sm">Add Candidate</h3>
              </div>
              <button onClick={() => setModal(false)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name</label>
                <input autoFocus className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Applied Role</label>
                <select className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={form.appliedRoleId} onChange={e => setForm(f => ({ ...f, appliedRoleId: e.target.value }))}>
                  <option value="">—</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone</label>
                  <input className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</label>
                  <input className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Source</label>
                <input placeholder="e.g. Referral, LinkedIn, Walk-in" className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</label>
                <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : 'Add Candidate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-2">Remove Candidate?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-medium text-foreground">{deleteConfirm.fullName}</span> will be removed from the talent pool permanently.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
              <button onClick={() => doDelete(deleteConfirm)} className="px-4 py-2 text-sm bg-destructive text-white rounded-md hover:bg-destructive/90">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
