'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Search, ClipboardCheck, Star, PenLine } from 'lucide-react'

interface EmployeeLite { id: string; fullName: string; employeeNumber: string; department: string | null; employmentStatus: string | null }

type Rating = 'NEEDS_IMPROVEMENT' | 'GOOD' | 'VERY_GOOD' | 'EXCELLENT'
type Decision = 'CONFIRM_PERMANENT' | 'EXTEND_PROBATION' | 'END_EMPLOYMENT'

interface PerformanceReview {
  id: string
  employee: EmployeeLite
  status: 'REQUESTED' | 'COMPLETED'
  requestedBy: { id: string; name: string | null } | null
  requestedAt: string
  requestNote: string | null
  reviewedBy: { id: string; name: string | null } | null
  reviewedAt: string | null
  reviewDate: string | null
  attendanceDiscipline: Rating | null
  workPerformance: Rating | null
  communicationTeamwork: Rating | null
  attitudeResponsibility: Rating | null
  initiativeProblemSolving: Rating | null
  adaptabilityLearning: Rating | null
  managerComments: string | null
  decision: Decision | null
  salaryIncrementApproved: boolean
  currentSalary: number | null
  newSalary: number | null
  effectiveDate: string | null
  reasonNotes: string | null
}

const CRITERIA: { key: keyof Pick<PerformanceReview,
  'attendanceDiscipline' | 'workPerformance' | 'communicationTeamwork' | 'attitudeResponsibility' | 'initiativeProblemSolving' | 'adaptabilityLearning'>; label: string }[] = [
  { key: 'attendanceDiscipline', label: 'Attendance & Discipline' },
  { key: 'workPerformance', label: 'Work Performance' },
  { key: 'communicationTeamwork', label: 'Communication & Teamwork' },
  { key: 'attitudeResponsibility', label: 'Attitude & Responsibility' },
  { key: 'initiativeProblemSolving', label: 'Initiative & Problem Solving' },
  { key: 'adaptabilityLearning', label: 'Adaptability & Learning' },
]

const RATING_OPTIONS: { value: Rating; label: string }[] = [
  { value: 'NEEDS_IMPROVEMENT', label: 'Needs Improvement' },
  { value: 'GOOD', label: 'Good' },
  { value: 'VERY_GOOD', label: 'Very Good' },
  { value: 'EXCELLENT', label: 'Excellent' },
]

const DECISION_OPTIONS: { value: Decision; label: string }[] = [
  { value: 'CONFIRM_PERMANENT', label: 'Confirm as Permanent Employee' },
  { value: 'EXTEND_PROBATION', label: 'Extend Probation' },
  { value: 'END_EMPLOYMENT', label: 'End Employment' },
]

const STATUS_LABEL: Record<string, string> = { REQUESTED: 'Requested', COMPLETED: 'Completed' }
const STATUS_COLOR: Record<string, string> = {
  REQUESTED: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtMoney = (n: number) => `Rp ${new Intl.NumberFormat('id-ID').format(n)}`

function EmployeeCombobox({ value, options, onChange, disabled }: {
  value: string; options: EmployeeLite[]; onChange: (id: string) => void; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const opts = q ? options.filter(e => e.fullName.toLowerCase().includes(q) || e.employeeNumber.toLowerCase().includes(q)) : options
  const selected = options.find(e => e.id === value)
  return (
    <div className="relative">
      <button type="button" disabled={disabled} onClick={() => { setOpen(o => !o); setSearch('') }}
        className="w-full h-10 border rounded-lg px-3 text-sm text-left flex items-center justify-between bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
        <span className={selected ? '' : 'text-muted-foreground'}>{selected ? `${selected.fullName} (${selected.employeeNumber})` : '— Select employee —'}</span>
      </button>
      {open && !disabled && (
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

interface FormState {
  employeeId: string
  reviewDate: string
  ratings: Record<string, Rating | null>
  managerComments: string
  decision: Decision | null
  salaryIncrementApproved: boolean
  currentSalary: string
  newSalary: string
  effectiveDate: string
  reasonNotes: string
}

function emptyForm(employeeId = ''): FormState {
  return {
    employeeId,
    reviewDate: new Date().toISOString().slice(0, 10),
    ratings: {},
    managerComments: '',
    decision: null,
    salaryIncrementApproved: false,
    currentSalary: '',
    newSalary: '',
    effectiveDate: '',
    reasonNotes: '',
  }
}

function formFromReview(r: PerformanceReview): FormState {
  return {
    employeeId: r.employee.id,
    reviewDate: (r.reviewDate ?? new Date().toISOString()).slice(0, 10),
    ratings: Object.fromEntries(CRITERIA.map(c => [c.key, r[c.key]])),
    managerComments: r.managerComments ?? '',
    decision: r.decision,
    salaryIncrementApproved: r.salaryIncrementApproved,
    currentSalary: r.currentSalary != null ? String(r.currentSalary) : '',
    newSalary: r.newSalary != null ? String(r.newSalary) : '',
    effectiveDate: r.effectiveDate ? r.effectiveDate.slice(0, 10) : '',
    reasonNotes: r.reasonNotes ?? '',
  }
}

export default function PerformanceReviewsPage() {
  const [reviews, setReviews] = useState<PerformanceReview[]>([])
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'All' | PerformanceReview['status']>('All')

  const [formModal, setFormModal] = useState<{ mode: 'new' | 'fill' | 'edit'; review: PerformanceReview | null } | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [rRes, eRes] = await Promise.all([fetch('/api/hr/performance-reviews'), fetch('/api/hr/employees')])
    if (rRes.ok) setReviews(await rRes.json())
    if (eRes.ok) setEmployees((await eRes.json()).filter((e: EmployeeLite & { isActive: boolean }) => e.isActive))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openNew() { setForm(emptyForm()); setFormError(''); setFormModal({ mode: 'new', review: null }) }
  function openFill(r: PerformanceReview) { setForm(formFromReview(r)); setFormError(''); setFormModal({ mode: 'fill', review: r }) }
  function openEdit(r: PerformanceReview) { setForm(formFromReview(r)); setFormError(''); setFormModal({ mode: 'edit', review: r }) }

  async function save() {
    if (formModal?.mode === 'new' && !form.employeeId) { setFormError('Please select an employee'); return }
    setSaving(true); setFormError('')

    const payload = {
      employeeId: form.employeeId,
      reviewDate: form.reviewDate || null,
      ...form.ratings,
      managerComments: form.managerComments,
      decision: form.decision,
      salaryIncrementApproved: form.salaryIncrementApproved,
      currentSalary: form.currentSalary ? Number(form.currentSalary) : null,
      newSalary: form.newSalary ? Number(form.newSalary) : null,
      effectiveDate: form.effectiveDate || null,
      reasonNotes: form.reasonNotes,
    }

    const url = formModal?.mode === 'new' ? '/api/hr/performance-reviews' : `/api/hr/performance-reviews/${formModal?.review?.id}`
    const method = formModal?.mode === 'new' ? 'POST' : 'PATCH'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setFormModal(null); setSaving(false); load()
  }

  const filtered = statusFilter === 'All' ? reviews : reviews.filter(r => r.status === statusFilter)
  const statuses: (PerformanceReview['status'] | 'All')[] = ['All', 'REQUESTED', 'COMPLETED']

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Performance Reviews</h2>
          <p className="text-muted-foreground text-sm mt-1">HR can start a review directly, or fill in one a manager requested for their team.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> New Performance Review
        </button>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {statuses.map(s => {
          const count = s === 'All' ? reviews.length : reviews.filter(r => r.status === s).length
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
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border py-12 text-center text-muted-foreground text-sm">
          <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-20" />
          No performance reviews {statusFilter !== 'All' ? `at "${STATUS_LABEL[statusFilter]}"` : 'yet'}.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id} className="rounded-xl border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-muted/20 border-b">
                <div>
                  <p className="font-semibold text-sm">{r.employee.fullName}</p>
                  <p className="text-xs text-muted-foreground font-mono">{r.employee.employeeNumber} {r.employee.department ? `· ${r.employee.department}` : ''}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
              </div>
              <div className="px-5 py-3 text-xs text-muted-foreground space-y-1">
                {r.requestedBy && <p>Requested by {r.requestedBy.name ?? '—'} on {fmtDate(r.requestedAt)}{r.requestNote ? ` — "${r.requestNote}"` : ''}</p>}
                {r.status === 'COMPLETED' && (
                  <>
                    <p>Reviewed by {r.reviewedBy?.name ?? '—'} on {r.reviewedAt ? fmtDate(r.reviewedAt) : '—'}</p>
                    {r.decision && <p>Decision: <span className="font-medium text-foreground">{DECISION_OPTIONS.find(d => d.value === r.decision)?.label}</span>{r.salaryIncrementApproved ? ' · Salary Increment Approved' : ''}</p>}
                    {r.currentSalary != null && r.newSalary != null && <p>Salary: {fmtMoney(r.currentSalary)} → {fmtMoney(r.newSalary)}</p>}
                  </>
                )}
              </div>

              {r.status === 'COMPLETED' && (
                <div className="flex flex-wrap gap-1.5 px-5 pb-3">
                  {CRITERIA.map(c => r[c.key] && (
                    <span key={c.key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-muted text-muted-foreground">
                      <Star className="h-3 w-3" /> {c.label}: {RATING_OPTIONS.find(o => o.value === r[c.key])?.label}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t">
                <button onClick={() => r.status === 'REQUESTED' ? openFill(r) : openEdit(r)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">
                  <PenLine className="h-3.5 w-3.5" /> {r.status === 'REQUESTED' ? 'Fill In Review' : 'Edit'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <h3 className="font-bold text-sm">
                {formModal.mode === 'new' ? 'New Performance Review' : formModal.mode === 'fill' ? `Fill In Review — ${formModal.review?.employee.fullName}` : `Edit Review — ${formModal.review?.employee.fullName}`}
              </h3>
              <button onClick={() => setFormModal(null)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-5 overflow-y-auto">
              {formError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee</label>
                  <EmployeeCombobox value={form.employeeId} options={employees} disabled={formModal.mode !== 'new'}
                    onChange={id => setForm(f => ({ ...f, employeeId: id }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Review Date</label>
                  <input type="date" value={form.reviewDate} onChange={e => setForm(f => ({ ...f, reviewDate: e.target.value }))}
                    className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Criteria</label>
                <div className="rounded-lg border divide-y overflow-hidden">
                  {CRITERIA.map(c => (
                    <div key={c.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                      <span className="text-sm">{c.label}</span>
                      <div className="flex gap-1.5">
                        {RATING_OPTIONS.map(o => (
                          <button key={o.value} type="button"
                            onClick={() => setForm(f => ({ ...f, ratings: { ...f.ratings, [c.key]: f.ratings[c.key] === o.value ? null : o.value } }))}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                              form.ratings[c.key] === o.value ? 'bg-amber-600 border-amber-600 text-white' : 'text-muted-foreground hover:bg-muted'
                            }`}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Manager Comments</label>
                <textarea rows={3} value={form.managerComments} onChange={e => setForm(f => ({ ...f, managerComments: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Final Decision</label>
                <div className="flex flex-wrap gap-2">
                  {DECISION_OPTIONS.map(o => (
                    <button key={o.value} type="button"
                      onClick={() => setForm(f => ({ ...f, decision: f.decision === o.value ? null : o.value }))}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        form.decision === o.value ? 'bg-amber-600 border-amber-600 text-white' : 'text-muted-foreground hover:bg-muted'
                      }`}>
                      {o.label}
                    </button>
                  ))}
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, salaryIncrementApproved: !f.salaryIncrementApproved }))}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      form.salaryIncrementApproved ? 'bg-green-600 border-green-600 text-white' : 'text-muted-foreground hover:bg-muted'
                    }`}>
                    Salary Increment Approved
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current Salary</label>
                  <input type="number" value={form.currentSalary} onChange={e => setForm(f => ({ ...f, currentSalary: e.target.value }))}
                    className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Salary</label>
                  <input type="number" value={form.newSalary} onChange={e => setForm(f => ({ ...f, newSalary: e.target.value }))}
                    className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Effective Date</label>
                  <input type="date" value={form.effectiveDate} onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))}
                    className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason / Notes</label>
                <textarea rows={2} value={form.reasonNotes} onChange={e => setForm(f => ({ ...f, reasonNotes: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80 shrink-0">
              <button onClick={() => setFormModal(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : formModal.mode === 'new' ? 'Submit' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
