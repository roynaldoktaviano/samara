'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, X, CalendarDays, ClipboardList, ShieldAlert, Ship } from 'lucide-react'
import { FreelanceRecommendationsField, type FreelanceRecommendation } from './FreelanceRecommendationsField'

interface Trip { bookingCode: string; destination: string | null; startDate: string; endDate: string }
interface LeaveRequest {
  id: string
  startDate: string; endDate: string; days: number
  reason: string | null
  status: 'PENDING' | 'PENDING_HR_APPROVAL' | 'APPROVED' | 'REJECTED'
  requestedAt: string
  decidedBy: { id: string; name: string | null } | null
  decidedAt: string | null
  decisionNote: string | null
  // Trips of your yacht (if you're crew — Work Location matches a Yacht name) that fall
  // inside this leave range, same as what HR sees when deciding on a freelance replacement.
  trips: Trip[]
  needsFreelance: boolean
  freelanceRecommendations: FreelanceRecommendation[]
  // Crew-only first stage — true when a Cruise Director/Captain was resolved for your
  // yacht at request time. Once they approve, status moves PENDING → PENDING_HR_APPROVAL.
  requiresCrewApproval: boolean
  crewApprovedBy: { id: string; name: string | null } | null
  crewApprovedAt: string | null
  crewDecisionNote: string | null
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  PENDING_HR_APPROVAL: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}

function statusLabel(r: LeaveRequest): string {
  if (r.status === 'PENDING') return r.requiresCrewApproval ? 'Awaiting Cruise Director/Captain' : 'Pending'
  if (r.status === 'PENDING_HR_APPROVAL') return 'Awaiting HR'
  return r.status.charAt(0) + r.status.slice(1).toLowerCase()
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

export default function MyLeaveRequestsPage() {
  const [loading, setLoading] = useState(true)
  const [linked, setLinked] = useState(true)
  const [leaveBalance, setLeaveBalance] = useState<number | null>(null)
  const [requests, setRequests] = useState<LeaveRequest[]>([])

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<{ startDate: string; endDate: string; reason: string; needsFreelance: boolean; freelanceRecommendations: FreelanceRecommendation[] }>({
    startDate: '', endDate: '', reason: '', needsFreelance: false, freelanceRecommendations: [],
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/hr/leave-requests/mine')
    if (res.ok) {
      const data = await res.json()
      setLinked(data.linked)
      setLeaveBalance(data.employee?.leaveBalance ?? null)
      setRequests(data.requests ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const days = form.startDate && form.endDate
    ? Math.max(0, Math.round((new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) / 86400000) + 1)
    : 0
  const overBalance = leaveBalance != null && days > leaveBalance

  function openAdd() { setForm({ startDate: '', endDate: '', reason: '', needsFreelance: false, freelanceRecommendations: [] }); setFormError(''); setModal(true) }

  async function save() {
    if (!form.startDate || !form.endDate) { setFormError('Please select a date range'); return }
    if (overBalance) { setFormError(`You only have ${leaveBalance} day${leaveBalance !== 1 ? 's' : ''} of leave remaining`); return }
    setSaving(true); setFormError('')
    const res = await fetch('/api/hr/leave-requests/mine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setModal(false); setSaving(false); load()
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
          <h2 className="text-2xl font-bold tracking-tight">Leave Request</h2>
          <p className="text-muted-foreground text-sm mt-1">Request time off and track your approval status</p>
        </div>
        <div className="rounded-xl border bg-amber-50 border-amber-200 px-6 py-10 text-center">
          <ShieldAlert className="h-8 w-8 mx-auto mb-3 text-amber-600" />
          <p className="font-medium text-sm">Your account isn&apos;t linked to an HR employee profile yet</p>
          <p className="text-muted-foreground text-sm mt-1">Ask an Admin to link your login to an employee record under Team, then you&apos;ll be able to request leave here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Leave Request</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Request time off and track your approval status
            {leaveBalance != null && <> · <span className="font-medium text-foreground">{leaveBalance} day{leaveBalance !== 1 ? 's' : ''}</span> remaining</>}
          </p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> Request Leave
        </button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Dates</th>
              <th className="text-center px-4 py-3 font-medium">Days</th>
              <th className="text-left px-4 py-3 font-medium">Trips Affected</th>
              <th className="text-left px-4 py-3 font-medium">Reason</th>
              <th className="text-left px-4 py-3 font-medium">Recommendation</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Decision Note</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {requests.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-20" />
                You haven&apos;t requested any leave yet.
              </td></tr>
            ) : requests.map(r => (
              <tr key={r.id} className="hover:bg-muted/30 transition-colors">
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
                <td className="px-4 py-3 text-xs">
                  {!r.needsFreelance ? (
                    <span className="text-muted-foreground">—</span>
                  ) : r.freelanceRecommendations.length === 0 ? (
                    <span className="text-amber-700">Needed — no contact yet</span>
                  ) : (
                    <div className="space-y-0.5">
                      {r.freelanceRecommendations.map(fr => (
                        <p key={fr.id} className="whitespace-nowrap"><span className="font-medium">{fr.name || '—'}</span>{fr.phone && <span className="text-muted-foreground"> · {fr.phone}</span>}</p>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status]}`}>{statusLabel(r)}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs max-w-48 truncate" title={r.decisionNote ?? r.crewDecisionNote ?? undefined}>
                  {r.decisionNote ?? r.crewDecisionNote ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-amber-600" />
                <h3 className="font-bold text-sm">Request Leave</h3>
              </div>
              <button onClick={() => setModal(false)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
              {leaveBalance != null && (
                <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Leave Balance</span>
                  <span className="font-semibold text-amber-800">{leaveBalance} day{leaveBalance !== 1 ? 's' : ''} remaining</span>
                </div>
              )}
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
              {days > 0 && (
                <p className={`text-xs ${overBalance ? 'text-red-700 font-medium' : 'text-muted-foreground'}`}>
                  {days} day{days !== 1 ? 's' : ''} of leave
                  {overBalance && ' — exceeds your remaining balance'}
                </p>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</label>
                <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                  value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={form.needsFreelance}
                  onChange={e => setForm(f => ({ ...f, needsFreelance: e.target.checked, freelanceRecommendations: e.target.checked ? f.freelanceRecommendations : [] }))} />
                Need a freelance replacement for the trips I&apos;ll miss?
              </label>
              {form.needsFreelance && (
                <FreelanceRecommendationsField value={form.freelanceRecommendations} onChange={v => setForm(f => ({ ...f, freelanceRecommendations: v }))} />
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={save} disabled={saving || overBalance} className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {saving ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
