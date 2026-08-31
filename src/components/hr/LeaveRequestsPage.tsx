'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, X, CalendarDays, Check, ThumbsUp, ThumbsDown, ClipboardList, Ship } from 'lucide-react'

interface EmployeeLite { id: string; fullName: string; employeeNumber: string; leaveBalance: number | null }
interface Trip { bookingCode: string; destination: string | null; startDate: string; endDate: string }
interface LeaveRequest {
  id: string
  employee: EmployeeLite
  startDate: string; endDate: string; days: number
  reason: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  requestedBy: { id: string; name: string | null } | null
  requestedAt: string
  decidedBy: { id: string; name: string | null } | null
  decidedAt: string | null
  decisionNote: string | null
  // Trips of the crew member's yacht that fall inside the leave range (Work Location
  // name matched against Yacht name, same as payroll's Uang Layar) — empty for
  // shore-based staff or a crew member whose yacht has no trip in that window.
  trips: Trip[]
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

function EmployeeCombobox({ value, options, onChange }: {
  value: string; options: EmployeeLite[]; onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const opts = q ? options.filter(e => e.fullName.toLowerCase().includes(q) || e.employeeNumber.toLowerCase().includes(q)) : options
  const selected = options.find(e => e.id === value)

  return (
    <div className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setSearch('') }}
        className="w-full h-10 border rounded-lg px-3 text-sm text-left flex items-center justify-between bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors">
        <span className={selected ? '' : 'text-muted-foreground'}>{selected ? `${selected.fullName} (${selected.employeeNumber})` : '— Select employee —'}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-xl z-50 max-h-60 flex flex-col">
            <div className="p-2 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input autoFocus className="w-full h-8 border rounded px-2.5 pl-8 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="overflow-y-auto">
              {opts.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">No employees found</p>}
              {opts.map(e => (
                <button key={e.id} type="button" onClick={() => { onChange(e.id); setOpen(false); setSearch('') }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors">
                  {e.fullName} <span className="text-muted-foreground">({e.employeeNumber})</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function LeaveRequestsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'All' | 'PENDING' | 'APPROVED' | 'REJECTED'>('All')

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ employeeId: '', startDate: '', endDate: '', reason: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [decision, setDecision] = useState<{ req: LeaveRequest; action: 'approve' | 'reject' } | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [deciding, setDeciding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [rRes, eRes] = await Promise.all([fetch('/api/hr/leave-requests'), fetch('/api/hr/employees')])
    if (rRes.ok) setRequests(await rRes.json())
    if (eRes.ok) setEmployees((await eRes.json()).filter((e: EmployeeLite & { isActive: boolean }) => e.isActive))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const days = form.startDate && form.endDate
    ? Math.max(0, Math.round((new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) / 86400000) + 1)
    : 0

  function openAdd() { setForm({ employeeId: '', startDate: '', endDate: '', reason: '' }); setFormError(''); setModal(true) }

  async function save() {
    if (!form.employeeId) { setFormError('Please select an employee'); return }
    if (!form.startDate || !form.endDate) { setFormError('Please select a date range'); return }
    setSaving(true); setFormError('')
    const res = await fetch('/api/hr/leave-requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setModal(false); setSaving(false); load()
  }

  async function decide() {
    if (!decision) return
    setDeciding(true)
    await fetch(`/api/hr/leave-requests/${decision.req.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: decision.action, decisionNote }),
    })
    setDeciding(false); setDecision(null); setDecisionNote(''); load()
  }

  const filtered = statusFilter === 'All' ? requests : requests.filter(r => r.status === statusFilter)
  const counts = {
    All: requests.length,
    PENDING: requests.filter(r => r.status === 'PENDING').length,
    APPROVED: requests.filter(r => r.status === 'APPROVED').length,
    REJECTED: requests.filter(r => r.status === 'REJECTED').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Leave Requests</h2>
          <p className="text-muted-foreground text-sm mt-1">Employee leave requests and approvals</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> New Leave Request
        </button>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {(['All', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
              statusFilter === s ? 'border-amber-500 text-amber-700' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {s === 'All' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            {counts[s] > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusFilter === s ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                {counts[s]}
              </span>
            )}
          </button>
        ))}
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
                <th className="text-left px-4 py-3 font-medium">Employee</th>
                <th className="text-left px-4 py-3 font-medium">Dates</th>
                <th className="text-center px-4 py-3 font-medium">Days</th>
                <th className="text-left px-4 py-3 font-medium">Trips Affected</th>
                <th className="text-left px-4 py-3 font-medium">Reason</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Requested By</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                  <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  No leave requests {statusFilter !== 'All' ? `with status "${statusFilter}"` : 'yet'}.
                </td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.employee.fullName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{r.employee.employeeNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(r.startDate)} – {fmtDate(r.endDate)}</td>
                  <td className="px-4 py-3 text-center font-semibold">{r.days}</td>
                  <td className="px-4 py-3 text-xs">
                    {r.trips.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                          <Ship className="h-3 w-3" /> {r.trips.length} trip{r.trips.length !== 1 ? 's' : ''}
                        </span>
                        <div className="text-muted-foreground space-y-0.5">
                          {r.trips.map(t => (
                            <p key={t.bookingCode} className="whitespace-nowrap">
                              <span className="font-mono">{t.bookingCode}</span> ({fmtDate(t.startDate)} – {fmtDate(t.endDate)})
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-48 truncate" title={r.reason ?? undefined}>{r.reason ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status]}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.requestedBy?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    {r.status === 'PENDING' && (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setDecision({ req: r, action: 'approve' })} title="Approve"
                          className="p-1.5 text-muted-foreground hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setDecision({ req: r, action: 'reject' })} title="Reject"
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-red-50 rounded-lg transition-colors">
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* ── New Leave Request Modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-amber-600" />
                <h3 className="font-bold text-sm">New Leave Request</h3>
              </div>
              <button onClick={() => setModal(false)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee</label>
                <EmployeeCombobox value={form.employeeId} options={employees} onChange={id => setForm(f => ({ ...f, employeeId: id }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Start Date</label>
                  <input type="date" className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">End Date</label>
                  <input type="date" className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
                </div>
              </div>
              {days > 0 && <p className="text-xs text-muted-foreground">{days} day{days !== 1 ? 's' : ''} of leave</p>}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</label>
                <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                  value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
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

      {/* ── Approve/Reject Modal ── */}
      {decision && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                {decision.action === 'approve' ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-red-600" />}
                {decision.action === 'approve' ? 'Approve' : 'Reject'} leave request
              </h3>
              <p className="text-sm text-muted-foreground">
                {decision.req.employee.fullName} — {decision.req.days} day{decision.req.days !== 1 ? 's' : ''} ({fmtDate(decision.req.startDate)} – {fmtDate(decision.req.endDate)})
              </p>
              {decision.action === 'approve' && (
                <p className="text-xs text-muted-foreground">Leave balance will go from {decision.req.employee.leaveBalance ?? 0} to {(decision.req.employee.leaveBalance ?? 0) - decision.req.days} days.</p>
              )}
              <textarea rows={2} placeholder={decision.action === 'reject' ? 'Reason (optional)' : 'Note (optional)'}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                value={decisionNote} onChange={e => setDecisionNote(e.target.value)} />
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => { setDecision(null); setDecisionNote('') }} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={decide} disabled={deciding}
                className={`px-5 py-2 text-sm text-white rounded-lg font-semibold disabled:opacity-50 transition-colors ${decision.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-destructive hover:bg-destructive/90'}`}>
                {deciding ? 'Saving...' : decision.action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
