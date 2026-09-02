'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Clock, ClipboardList, ShieldAlert, ArrowLeft } from 'lucide-react'
import { MultiFilePicker, FilePreview } from '@/components/ui/file-preview'

interface Overtime {
  id: string
  date: string
  hours: number
  description: string
  proofFileKeys: string[]
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  requestedAt: string
  decidedBy: { id: string; name: string | null } | null
  decidedAt: string | null
  decisionNote: string | null
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' })

// Only a Saturday/Sunday or a national holiday is eligible — mirrors the server-side
// check in src/app/api/hr/overtime/mine/route.ts, done here too just so the picker can
// warn before a round trip. The server is still the source of truth.
function isWeekend(dateStr: string): boolean {
  if (!dateStr) return false
  const dow = new Date(dateStr).getUTCDay()
  return dow === 0 || dow === 6
}

export default function MyOvertimePage() {
  const [loading, setLoading] = useState(true)
  const [linked, setLinked] = useState(true)
  const [requests, setRequests] = useState<Overtime[]>([])
  const [selected, setSelected] = useState<Overtime | null>(null)
  const [holidays, setHolidays] = useState<Record<string, string>>({})

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ date: '', hours: '', description: '', proofFileKeys: [] as string[] })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/hr/overtime/mine')
    let list: Overtime[] = []
    if (res.ok) {
      const data = await res.json()
      setLinked(data.linked)
      list = data.requests ?? []
      setRequests(list)
    }
    setLoading(false)
    return list
  }, [])

  useEffect(() => { reload() }, [reload])

  // A light client-side hint for which dates qualify. /api/hr/national-holidays is
  // currently HR/ADMIN/SUPER_ADMIN-only, same as this page's nav entry for now — when
  // this page is opened up to every user, that endpoint needs a wider GET too, or the
  // holiday highlight below silently stops working (the actual eligibility check still
  // happens server-side in /api/hr/overtime/mine regardless).
  useEffect(() => {
    fetch('/api/hr/national-holidays').then(r => r.ok ? r.json() : []).then((rows: { date: string; name: string }[]) => {
      const map: Record<string, string> = {}
      for (const h of rows) map[h.date.slice(0, 10)] = h.name
      setHolidays(map)
    }).catch(() => {})
  }, [])

  function openAdd() { setForm({ date: '', hours: '', description: '', proofFileKeys: [] }); setFormError(''); setModal(true) }

  const dateQualifies = form.date ? (isWeekend(form.date) || !!holidays[form.date]) : true

  async function save() {
    if (!form.date) { setFormError('Please select a date'); return }
    if (!isWeekend(form.date) && !holidays[form.date]) { setFormError('Overtime can only be claimed for a weekend or a national holiday'); return }
    if (!form.hours || Number(form.hours) <= 0) { setFormError('Please enter the hours worked'); return }
    if (!form.description.trim()) { setFormError('Please describe the work done'); return }
    setSaving(true); setFormError('')
    const res = await fetch('/api/hr/overtime/mine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, hours: Number(form.hours) }),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setModal(false); setSaving(false); reload()
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        <div className="rounded-lg border overflow-hidden animate-pulse">
          <div className="h-10 bg-muted/50 border-b" />
          {[...Array(3)].map((_, i) => <div key={i} className="px-5 py-4 border-t flex gap-4"><div className="h-4 w-40 rounded bg-muted" /><div className="h-4 w-20 rounded bg-muted" /></div>)}
        </div>
      </div>
    )
  }

  if (!linked) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Overtime</h2>
          <p className="text-muted-foreground text-sm mt-1">Claim overtime worked on a weekend or national holiday</p>
        </div>
        <div className="rounded-xl border bg-amber-50 border-amber-200 px-6 py-10 text-center">
          <ShieldAlert className="h-8 w-8 mx-auto mb-3 text-amber-600" />
          <p className="font-medium text-sm">Your account isn&apos;t linked to an HR employee profile yet</p>
          <p className="text-muted-foreground text-sm mt-1">Ask an Admin to link your login to an employee record under Team, then you&apos;ll be able to claim overtime here.</p>
        </div>
      </div>
    )
  }

  if (selected) {
    return (
      <div className="space-y-6">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Overtime
        </button>

        <div className="rounded-2xl border bg-card max-w-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <h2 className="text-xl font-bold tracking-tight">{fmtDate(selected.date)}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{selected.hours}h overtime</p>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[selected.status]}`}>{selected.status.charAt(0) + selected.status.slice(1).toLowerCase()}</span>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Work Done</p>
              <p className="text-sm mt-0.5 whitespace-pre-wrap">{selected.description}</p>
            </div>

            {selected.proofFileKeys.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1.5">Proof</p>
                <div className="grid grid-cols-3 gap-2">
                  {selected.proofFileKeys.map((k, i) => (
                    <FilePreview key={i} src={k} alt={`Proof ${i + 1}`} className="w-full h-24 rounded-lg object-cover border" />
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground border-t pt-3">
              Requested {fmtDate(selected.requestedAt)}
            </div>

            {selected.status !== 'PENDING' && (
              <div className="text-xs text-muted-foreground">
                {selected.status === 'REJECTED' ? 'Rejected' : 'Approved'}{selected.decidedAt && ` ${fmtDate(selected.decidedAt)}`}{selected.decidedBy?.name && ` by ${selected.decidedBy.name}`}
                {selected.decisionNote && <p className="mt-1.5 rounded-lg bg-muted/40 px-3 py-2 text-foreground">{selected.decisionNote}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Overtime</h2>
          <p className="text-muted-foreground text-sm mt-1">Claim overtime worked on a weekend or national holiday</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> Claim Overtime
        </button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Hours</th>
              <th className="text-left px-4 py-3 font-medium">Work Done</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {requests.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-12 text-muted-foreground text-sm">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-20" />
                You haven&apos;t claimed any overtime yet.
              </td></tr>
            ) : requests.map(r => (
              <tr key={r.id} className="hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelected(r)}>
                <td className="px-4 py-3 font-medium flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />{fmtDate(r.date)}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.hours}h</td>
                <td className="px-4 py-3 text-muted-foreground text-xs max-w-64 truncate" title={r.description}>{r.description}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status]}`}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <h3 className="font-bold text-sm">Claim Overtime</h3>
              </div>
              <button onClick={() => setModal(false)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Overtime can only be claimed for a Saturday, Sunday, or a national holiday.</p>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</label>
                <input type="date" className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                {form.date && !dateQualifies && (
                  <p className="text-xs text-red-600">This date is a weekday and not a national holiday — it doesn&apos;t qualify.</p>
                )}
                {form.date && holidays[form.date] && (
                  <p className="text-xs text-green-700">National holiday: {holidays[form.date]}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hours Worked</label>
                <input type="number" min="0" step="0.5" className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="e.g. 4" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Work Done</label>
                <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                  placeholder="What did you work on?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Proof <span className="normal-case font-normal text-muted-foreground">(optional)</span></label>
                <MultiFilePicker files={form.proofFileKeys} onChange={v => setForm(f => ({ ...f, proofFileKeys: v }))} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {saving ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
