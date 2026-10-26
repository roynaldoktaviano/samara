'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, X, CalendarDays, Check, ThumbsUp, ThumbsDown, ClipboardList, Ship, ArrowLeft } from 'lucide-react'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { formatDate, formatDateRange } from '@/lib/format'
import { FreelanceRecommendationsField, type FreelanceRecommendation } from './FreelanceRecommendationsField'

interface EmployeeLite { id: string; fullName: string; employeeNumber: string; leaveBalance: number | null; employmentStatus: string | null; isCrew: boolean }
interface Trip { bookingCode: string; destination: string | null; startDate: string; endDate: string }
interface LeaveRequest {
  id: string
  employee: EmployeeLite
  startDate: string; endDate: string; days: number
  reason: string | null
  type: 'LEAVE' | 'WFH'
  status: 'PENDING' | 'PENDING_HR_APPROVAL' | 'APPROVED' | 'REJECTED'
  requestedBy: { id: string; name: string | null } | null
  requestedAt: string
  decidedBy: { id: string; name: string | null } | null
  decidedAt: string | null
  decisionNote: string | null
  // Trips of the crew member's yacht that fall inside the leave range (Work Location
  // name matched against Yacht name, same as payroll's Uang Layar) — empty for
  // shore-based staff or a crew member whose yacht has no trip in that window.
  trips: Trip[]
  needsFreelance: boolean
  freelanceRecommendations: FreelanceRecommendation[]
  // Crew-only first stage — true when a Cruise Director/Captain was resolved for this
  // employee's yacht at request time (see resolveCrewLeaveApprover). Once they approve,
  // status moves PENDING → PENDING_HR_APPROVAL and these fields fill in; HR can't decide
  // while this is true and status is still PENDING.
  requiresCrewApproval: boolean
  crewApprovedBy: { id: string; name: string | null } | null
  crewApprovedAt: string | null
  crewDecisionNote: string | null
}

const STATUS_TONE: Record<string, StatusTone> = {
  PENDING: 'warning',
  PENDING_HR_APPROVAL: 'info',
  APPROVED: 'success',
  REJECTED: 'destructive',
}

function statusLabel(r: LeaveRequest): string {
  if (r.status === 'PENDING') return r.requiresCrewApproval ? 'Awaiting Cruise Director/Captain' : 'Pending'
  if (r.status === 'PENDING_HR_APPROVAL') return 'Awaiting HR'
  return r.status.charAt(0) + r.status.slice(1).toLowerCase()
}

// `id` goes on the trigger; the field's <Label> must use `${id}-label` as its id so the
// trigger is announced as "<label> <selected employee>".
function EmployeeCombobox({ id, value, options, onChange }: {
  id: string; value: string; options: EmployeeLite[]; onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const opts = q ? options.filter(e => e.fullName.toLowerCase().includes(q) || e.employeeNumber.toLowerCase().includes(q)) : options
  const selected = options.find(e => e.id === value)

  return (
    <div className="relative">
      <button type="button" id={id} aria-labelledby={`${id}-label ${id}`} aria-expanded={open} onClick={() => { setOpen(o => !o); setSearch('') }}
        className="w-full h-9 border border-input rounded-md px-3 text-sm text-left flex items-center justify-between bg-transparent dark:bg-input/30 shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className={selected ? '' : 'text-muted-foreground'}>{selected ? `${selected.fullName} (${selected.employeeNumber})` : '— Select employee —'}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 bg-popover border rounded-lg shadow-xl z-50 max-h-60 flex flex-col">
            <div className="p-2 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input autoFocus className="h-8 pl-8" aria-label="Search employee"
                  placeholder="Search employee…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="overflow-y-auto">
              {opts.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">No employees found</p>}
              {opts.map(e => (
                <button key={e.id} type="button" onClick={() => { onChange(e.id); setOpen(false); setSearch('') }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 transition-colors">
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
  const [form, setForm] = useState<{ type: 'LEAVE' | 'WFH'; employeeId: string; startDate: string; endDate: string; reason: string; needsFreelance: boolean; freelanceRecommendations: FreelanceRecommendation[] }>({
    type: 'LEAVE', employeeId: '', startDate: '', endDate: '', reason: '', needsFreelance: false, freelanceRecommendations: [],
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [decision, setDecision] = useState<{ req: LeaveRequest; action: 'approve' | 'reject' } | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [deciding, setDeciding] = useState(false)

  const [selected, setSelected] = useState<LeaveRequest | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [rRes, eRes] = await Promise.all([fetch('/api/hr/leave-requests'), fetch('/api/hr/employees')])
    const list: LeaveRequest[] = rRes.ok ? await rRes.json() : []
    setRequests(list)
    // Freelance staff aren't on the leave-accrual system — same rule the API enforces
    // (src/app/api/hr/leave-requests/route.ts), kept out of the picker so HR can't pick
    // one and only find out from a submit error.
    if (eRes.ok) setEmployees((await eRes.json()).filter((e: EmployeeLite & { isActive: boolean }) => e.isActive && e.employmentStatus !== 'Freelance'))
    setLoading(false)
    return list
  }, [])

  useEffect(() => { load() }, [load])

  const selectedEmployee = employees.find(e => e.id === form.employeeId)
  // Mirrors countLeaveDays on the server: crew count every calendar day (they work
  // weekends too), everyone else skips Sat/Sun since those were never working days.
  const days = form.startDate && form.endDate ? (() => {
    const start = new Date(form.startDate)
    const end = new Date(form.endDate)
    if (end < start) return 0
    if (selectedEmployee?.isCrew) return Math.round((end.getTime() - start.getTime()) / 86400000) + 1
    let count = 0
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dow = d.getUTCDay()
      if (dow !== 0 && dow !== 6) count++
    }
    return count
  })() : 0
  const overBalance = form.type === 'LEAVE' && selectedEmployee?.leaveBalance != null && days > selectedEmployee.leaveBalance

  function openAdd() { setForm({ type: 'LEAVE', employeeId: '', startDate: '', endDate: '', reason: '', needsFreelance: false, freelanceRecommendations: [] }); setFormError(''); setModal(true) }

  async function save() {
    if (!form.employeeId) { setFormError('Please select an employee'); return }
    if (!form.startDate || !form.endDate) { setFormError('Please select a date range'); return }
    if (overBalance) { setFormError(`${selectedEmployee!.fullName} only has ${selectedEmployee!.leaveBalance} day${selectedEmployee!.leaveBalance !== 1 ? 's' : ''} of leave remaining`); return }
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
    setDeciding(false); setDecision(null); setDecisionNote('')
    const list = await load()
    setSelected(prev => (prev && list.find(r => r.id === prev.id)) ?? null)
  }

  // "Pending" buckets both PENDING (still with the Cruise Director/Captain, if
  // requiresCrewApproval) and PENDING_HR_APPROVAL (that stage cleared, now with HR) — the
  // status badge/label still shows the precise stage per row (see statusLabel).
  const filtered = statusFilter === 'All' ? requests
    : statusFilter === 'PENDING' ? requests.filter(r => r.status === 'PENDING' || r.status === 'PENDING_HR_APPROVAL')
    : requests.filter(r => r.status === statusFilter)
  const counts = {
    All: requests.length,
    PENDING: requests.filter(r => r.status === 'PENDING' || r.status === 'PENDING_HR_APPROVAL').length,
    APPROVED: requests.filter(r => r.status === 'APPROVED').length,
    REJECTED: requests.filter(r => r.status === 'REJECTED').length,
  }

  return (
    <div className="space-y-6">
      {selected ? (
        <>
          <Button variant="ghost" onClick={() => setSelected(null)} className="-ml-3 gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft /> Back to Leave Requests
          </Button>

          <div className="rounded-2xl border bg-card max-w-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="text-xl font-bold tracking-tight">{selected.employee.fullName}</h2>
                <p className="text-sm text-muted-foreground mt-0.5 font-mono">{selected.employee.employeeNumber} · <span className="font-sans font-medium">{selected.type === 'WFH' ? 'Work From Home' : 'Leave'}</span></p>
              </div>
              <StatusBadge tone={STATUS_TONE[selected.status]} className="px-2.5 py-1">{statusLabel(selected)}</StatusBadge>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Dates</p>
                  <p className="text-sm font-medium mt-0.5">{formatDateRange(selected.startDate, selected.endDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Days</p>
                  <p className="text-sm font-medium mt-0.5">{selected.days} day{selected.days !== 1 ? 's' : ''}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Reason</p>
                <p className="text-sm">{selected.reason ?? '—'}</p>
              </div>

              {selected.trips.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1.5 flex items-center gap-1">
                    <Ship className="h-3 w-3" /> Trips Affected ({selected.trips.length})
                  </p>
                  <div className="space-y-1">
                    {selected.trips.map(t => (
                      <p key={t.bookingCode} className="text-sm text-muted-foreground">
                        <span className="font-mono text-foreground">{t.bookingCode}</span> — {formatDate(t.startDate)} to {formatDate(t.endDate)}{t.destination ? ` · ${t.destination}` : ''}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {selected.needsFreelance && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1.5">Freelance Recommendation</p>
                  {selected.freelanceRecommendations.length === 0 ? (
                    <p className="text-sm text-warning">Flagged as needing a freelance replacement — requester hasn&apos;t suggested anyone yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {selected.freelanceRecommendations.map(fr => (
                        <p key={fr.id} className="text-sm"><span className="font-medium">{fr.name || '—'}</span>{fr.phone && <span className="text-muted-foreground"> · {fr.phone}</span>}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selected.requiresCrewApproval && (
                <div className="text-xs">
                  <p className="text-muted-foreground uppercase tracking-wide font-semibold mb-1">Cruise Director/Captain Approval</p>
                  {selected.crewApprovedAt ? (
                    <div className="text-muted-foreground">
                      Approved {formatDate(selected.crewApprovedAt)}{selected.crewApprovedBy?.name && ` by ${selected.crewApprovedBy.name}`}
                      {selected.crewDecisionNote && <p className="mt-1.5 rounded-lg bg-muted/40 px-3 py-2 text-foreground">{selected.crewDecisionNote}</p>}
                    </div>
                  ) : selected.status === 'REJECTED' ? (
                    <p className="text-muted-foreground">Rejected before reaching HR.</p>
                  ) : (
                    <p className="text-warning">Waiting on the Cruise Director/Captain to approve first.</p>
                  )}
                </div>
              )}

              <div className="text-xs text-muted-foreground border-t pt-3">
                Requested {formatDate(selected.requestedAt)}{selected.requestedBy?.name && ` by ${selected.requestedBy.name}`}
              </div>

              {(selected.status === 'APPROVED' || selected.status === 'REJECTED') && (
                <div className="text-xs text-muted-foreground">
                  {selected.status === 'APPROVED' ? 'Approved' : 'Rejected'}{selected.decidedAt && ` ${formatDate(selected.decidedAt)}`}{selected.decidedBy?.name && ` by ${selected.decidedBy.name}`}
                  {selected.decisionNote && <p className="mt-1.5 rounded-lg bg-muted/40 px-3 py-2 text-foreground">{selected.decisionNote}</p>}
                </div>
              )}
            </div>

            {(selected.status === 'PENDING_HR_APPROVAL' || (selected.status === 'PENDING' && !selected.requiresCrewApproval)) && (
              <div className="flex justify-end gap-2 px-5 py-4 border-t">
                <Button variant="outline" onClick={() => setDecision({ req: selected, action: 'reject' })}
                  className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 dark:hover:bg-destructive/10">
                  <ThumbsDown /> Reject
                </Button>
                <Button variant="success" onClick={() => setDecision({ req: selected, action: 'approve' })}>
                  <ThumbsUp /> Approve
                </Button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Leave Requests</h2>
              <p className="text-muted-foreground text-sm mt-1">Employee leave requests and approvals</p>
            </div>
            <Button onClick={openAdd}>
              <Plus /> New Leave Request
            </Button>
          </div>

          <div className="flex gap-1 border-b overflow-x-auto">
            {(['All', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                  statusFilter === s ? 'border-primary text-primary-strong' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                {s === 'All' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                {counts[s] > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusFilter === s ? 'bg-primary/15 text-primary-strong' : 'bg-muted text-muted-foreground'}`}>
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
                    <th className="text-left px-4 py-3 font-medium">Type</th>
                    <th className="text-left px-4 py-3 font-medium">Dates</th>
                    <th className="text-center px-4 py-3 font-medium">Days</th>
                    <th className="text-left px-4 py-3 font-medium">Trips Affected</th>
                    <th className="text-left px-4 py-3 font-medium">Reason</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Requested By</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                      <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      No leave requests {statusFilter !== 'All' ? `with status "${statusFilter}"` : 'yet'}.
                    </td></tr>
                  ) : filtered.map(r => (
                    <tr key={r.id} className="hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelected(r)}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{r.employee.fullName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{r.employee.employeeNumber}</p>
                      </td>
                      <td className="px-4 py-3"><span className={`inline-block mb-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${r.type === 'WFH' ? 'bg-info/15 text-info' : 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300'}`}>{r.type === 'WFH' ? 'WFH' : 'Leave'}</span></td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDateRange(r.startDate, r.endDate)}</td>
                      <td className="px-4 py-3 text-center font-semibold">{r.days}</td>
                      <td className="px-4 py-3 text-xs">
                        {r.trips.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-info/15 text-info font-medium">
                            <Ship className="h-3 w-3" /> {r.trips.length} trip{r.trips.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-48 truncate" title={r.reason ?? undefined}>{r.reason ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge tone={STATUS_TONE[r.status]}>{statusLabel(r)}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{r.requestedBy?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </>
      )}

      {/* ── New Leave Request Modal ── */}
      <Dialog open={modal} onOpenChange={o => { if (!o) setModal(false) }}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden" aria-describedby={undefined} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="flex-row items-center gap-2 px-6 py-4 pr-12 border-b text-left">
            <CalendarDays className="h-4 w-4 text-primary-strong" />
            <DialogTitle className="text-sm font-bold">{form.type === 'WFH' ? 'New WFH Request' : 'New Leave Request'}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {formError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{formError}</p>}
            <div role="group" aria-label="Request type" className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-muted">
              {(['LEAVE', 'WFH'] as const).map(t => (
                <button key={t} type="button" aria-pressed={form.type === t} onClick={() => setForm(f => ({ ...f, type: t, needsFreelance: t === 'WFH' ? false : f.needsFreelance, freelanceRecommendations: t === 'WFH' ? [] : f.freelanceRecommendations }))}
                  className={`h-8 rounded-md text-sm font-medium transition-colors ${form.type === t ? 'bg-card shadow-sm text-primary-strong' : 'text-muted-foreground hover:text-foreground'}`}>
                  {t === 'LEAVE' ? 'Leave' : 'Work From Home'}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label id="leave-employee-label" htmlFor="leave-employee" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee</Label>
              <EmployeeCombobox id="leave-employee" value={form.employeeId} options={employees} onChange={id => setForm(f => ({ ...f, employeeId: id }))} />
              {selectedEmployee && selectedEmployee.leaveBalance != null && (
                <p className="text-xs text-muted-foreground">{selectedEmployee.leaveBalance} day{selectedEmployee.leaveBalance !== 1 ? 's' : ''} remaining</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="leave-start-date" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Start Date</Label>
                <Input id="leave-start-date" type="date"
                  value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leave-end-date" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">End Date</Label>
                <Input id="leave-end-date" type="date"
                  value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            {days > 0 && (
              <p className={`text-xs ${overBalance ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                {days} day{days !== 1 ? 's' : ''} {form.type === 'WFH' ? 'of WFH — does not use leave balance' : 'of leave'}
                {overBalance && ' — exceeds remaining balance'}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="leave-reason" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</Label>
              <Textarea id="leave-reason" rows={2} className="resize-none"
                value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            {form.type === 'LEAVE' && <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.needsFreelance}
                onChange={e => setForm(f => ({ ...f, needsFreelance: e.target.checked, freelanceRecommendations: e.target.checked ? f.freelanceRecommendations : [] }))} />
              Need a freelance replacement for the trips missed?
            </label>}
            {form.needsFreelance && (
              <FreelanceRecommendationsField value={form.freelanceRecommendations} onChange={v => setForm(f => ({ ...f, freelanceRecommendations: v }))} />
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/50">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={overBalance}>
              {saving ? 'Submitting…' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Approve/Reject Modal ── */}
      <Dialog open={!!decision} onOpenChange={o => { if (!o) { setDecision(null); setDecisionNote('') } }}>
        {decision && (
          <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden" showCloseButton={false} onInteractOutside={e => e.preventDefault()}>
            <div className="px-6 py-5 space-y-3">
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                {decision.action === 'approve' ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-destructive" />}
                {decision.action === 'approve' ? 'Approve' : 'Reject'} {decision.req.type === 'WFH' ? 'WFH' : 'leave'} request
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {decision.req.employee.fullName} — {decision.req.days} day{decision.req.days !== 1 ? 's' : ''} ({formatDateRange(decision.req.startDate, decision.req.endDate)})
              </DialogDescription>
              {decision.action === 'approve' && decision.req.type === 'WFH' && (
                <p className="text-xs text-muted-foreground">Marked as WFH in Attendance Recap — leave balance is not affected.</p>
              )}
              {decision.action === 'approve' && decision.req.type !== 'WFH' && (
                <p className="text-xs text-muted-foreground">Leave balance will go from {decision.req.employee.leaveBalance ?? 0} to {(decision.req.employee.leaveBalance ?? 0) - decision.req.days} days.</p>
              )}
              <Textarea rows={2} placeholder={decision.action === 'reject' ? 'Reason (optional)' : 'Note (optional)'}
                aria-label={decision.action === 'reject' ? 'Reason (optional)' : 'Note (optional)'} className="resize-none"
                value={decisionNote} onChange={e => setDecisionNote(e.target.value)} />
            </div>
            <DialogFooter className="px-6 py-4 border-t bg-muted/50">
              <Button variant="outline" onClick={() => { setDecision(null); setDecisionNote('') }}>Cancel</Button>
              <Button onClick={decide} loading={deciding}
                variant={decision.action === 'approve' ? 'success' : 'destructive'}>
                {deciding ? 'Saving…' : decision.action === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
