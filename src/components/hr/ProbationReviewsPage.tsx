'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, X, Search, ThumbsUp, ThumbsDown, ClipboardCheck, FileText, Anchor, ShieldCheck, HeartPulse } from 'lucide-react'

interface EmployeeLite { id: string; fullName: string; employeeNumber: string; department: string | null; employmentStatus: string | null }
interface ProbationReview {
  id: string
  employee: EmployeeLite
  stage: 'REQUESTED' | 'HR_REVIEW' | 'MANAGEMENT_APPROVAL' | 'APPROVED' | 'REJECTED'
  requestedBy: { id: string; name: string | null } | null
  requestedAt: string
  requestNote: string | null
  hrDecidedBy: { id: string; name: string | null } | null
  hrApproved: boolean | null
  hrNote: string | null
  managementDecidedBy: { id: string; name: string | null } | null
  managementApproved: boolean | null
  managementNote: string | null
  contractProcessedAt: string | null
  pklProcessedAt: string | null
  bpjsTkRegisteredAt: string | null
  bpjsKesRegisteredAt: string | null
}

const STAGE_LABEL: Record<string, string> = {
  REQUESTED: 'Requested', HR_REVIEW: 'HR Review', MANAGEMENT_APPROVAL: 'Management Approval', APPROVED: 'Approved', REJECTED: 'Rejected',
}
const STAGE_COLOR: Record<string, string> = {
  REQUESTED: 'bg-slate-100 text-slate-700',
  HR_REVIEW: 'bg-blue-100 text-blue-700',
  MANAGEMENT_APPROVAL: 'bg-purple-100 text-purple-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}
const CHECKLIST_ITEMS = [
  { key: 'contract', label: 'Contract', field: 'contractProcessedAt', icon: FileText },
  { key: 'pkl', label: 'PKL', field: 'pklProcessedAt', icon: Anchor },
  { key: 'bpjsTk', label: 'BPJS TK', field: 'bpjsTkRegisteredAt', icon: ShieldCheck },
  { key: 'bpjsKes', label: 'BPJS Kesehatan', field: 'bpjsKesRegisteredAt', icon: HeartPulse },
] as const

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

export default function ProbationReviewsPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role ?? ''
  const isManagement = ['ADMIN', 'SUPER_ADMIN'].includes(role)

  const [reviews, setReviews] = useState<ProbationReview[]>([])
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [loading, setLoading] = useState(true)
  const [stageFilter, setStageFilter] = useState<'All' | ProbationReview['stage']>('All')

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ employeeId: '', requestNote: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [decision, setDecision] = useState<{ review: ProbationReview; action: 'hr-decide' | 'management-decide'; approved: boolean } | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [deciding, setDeciding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [rRes, eRes] = await Promise.all([fetch('/api/hr/probation-reviews'), fetch('/api/hr/employees')])
    if (rRes.ok) setReviews(await rRes.json())
    if (eRes.ok) setEmployees((await eRes.json()).filter((e: EmployeeLite & { isActive: boolean }) => e.isActive))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() { setForm({ employeeId: '', requestNote: '' }); setFormError(''); setModal(true) }

  async function save() {
    if (!form.employeeId) { setFormError('Please select an employee'); return }
    setSaving(true); setFormError('')
    const res = await fetch('/api/hr/probation-reviews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setModal(false); setSaving(false); load()
  }

  async function decide() {
    if (!decision) return
    setDeciding(true)
    await fetch(`/api/hr/probation-reviews/${decision.review.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: decision.action, approved: decision.approved, note: decisionNote }),
    })
    setDeciding(false); setDecision(null); setDecisionNote(''); load()
  }

  async function toggleChecklist(review: ProbationReview, item: string) {
    await fetch(`/api/hr/probation-reviews/${review.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle-checklist', checklistItem: item }),
    })
    load()
  }

  const filtered = stageFilter === 'All' ? reviews : reviews.filter(r => r.stage === stageFilter)
  const stages: (ProbationReview['stage'] | 'All')[] = ['All', 'HR_REVIEW', 'MANAGEMENT_APPROVAL', 'APPROVED', 'REJECTED']

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Probation Reviews</h2>
          <p className="text-muted-foreground text-sm mt-1">Requested by Manager → reviewed by HR → approved by Management → Hiring</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> New Probation Review
        </button>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {stages.map(s => {
          const count = s === 'All' ? reviews.length : reviews.filter(r => r.stage === s).length
          return (
            <button key={s} onClick={() => setStageFilter(s)}
              className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                stageFilter === s ? 'border-amber-500 text-amber-700' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {s === 'All' ? 'All' : STAGE_LABEL[s]}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${stageFilter === s ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
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
          No probation reviews {stageFilter !== 'All' ? `at "${STAGE_LABEL[stageFilter]}"` : 'yet'}.
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
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STAGE_COLOR[r.stage]}`}>{STAGE_LABEL[r.stage]}</span>
              </div>
              <div className="px-5 py-3 text-xs text-muted-foreground space-y-1">
                <p>Requested by {r.requestedBy?.name ?? '—'} on {fmtDate(r.requestedAt)}{r.requestNote ? ` — "${r.requestNote}"` : ''}</p>
                {r.hrDecidedBy && <p>HR ({r.hrDecidedBy.name}): {r.hrApproved ? 'Approved' : 'Rejected'}{r.hrNote ? ` — "${r.hrNote}"` : ''}</p>}
                {r.managementDecidedBy && <p>Management ({r.managementDecidedBy.name}): {r.managementApproved ? 'Approved' : 'Rejected'}{r.managementNote ? ` — "${r.managementNote}"` : ''}</p>}
              </div>

              {r.stage === 'HR_REVIEW' && (
                <div className="flex items-center gap-2 px-5 py-3 border-t">
                  <button onClick={() => setDecision({ review: r, action: 'hr-decide', approved: true })}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                    <ThumbsUp className="h-3.5 w-3.5" /> HR Approve
                  </button>
                  <button onClick={() => setDecision({ review: r, action: 'hr-decide', approved: false })}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
                    <ThumbsDown className="h-3.5 w-3.5" /> HR Reject
                  </button>
                </div>
              )}

              {r.stage === 'MANAGEMENT_APPROVAL' && (
                isManagement ? (
                  <div className="flex items-center gap-2 px-5 py-3 border-t">
                    <button onClick={() => setDecision({ review: r, action: 'management-decide', approved: true })}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                      <ThumbsUp className="h-3.5 w-3.5" /> Management Approve
                    </button>
                    <button onClick={() => setDecision({ review: r, action: 'management-decide', approved: false })}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
                      <ThumbsDown className="h-3.5 w-3.5" /> Management Reject
                    </button>
                  </div>
                ) : (
                  <div className="px-5 py-3 border-t text-xs text-muted-foreground">Waiting for Admin/Super Admin to approve.</div>
                )
              )}

              {r.stage === 'APPROVED' && (
                <div className="flex items-center gap-2 px-5 py-3 border-t flex-wrap">
                  {CHECKLIST_ITEMS.map(item => {
                    const done = !!(r as unknown as Record<string, unknown>)[item.field]
                    return (
                      <button key={item.key} onClick={() => toggleChecklist(r, item.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                          done ? 'bg-green-50 border-green-200 text-green-700' : 'border-dashed text-muted-foreground hover:bg-muted'
                        }`}>
                        <item.icon className="h-3.5 w-3.5" /> {item.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── New Review Modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-sm">New Probation Review</h3>
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
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Note (optional)</label>
                <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                  value={form.requestNote} onChange={e => setForm(f => ({ ...f, requestNote: e.target.value }))} />
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

      {/* ── Decision Modal ── */}
      {decision && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 space-y-3">
              <h3 className="font-bold text-sm">{decision.approved ? 'Approve' : 'Reject'} — {decision.review.employee.fullName}</h3>
              <textarea rows={2} placeholder="Note (optional)"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                value={decisionNote} onChange={e => setDecisionNote(e.target.value)} />
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => { setDecision(null); setDecisionNote('') }} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={decide} disabled={deciding}
                className={`px-5 py-2 text-sm text-white rounded-lg font-semibold disabled:opacity-50 transition-colors ${decision.approved ? 'bg-green-600 hover:bg-green-700' : 'bg-destructive hover:bg-destructive/90'}`}>
                {deciding ? 'Saving...' : decision.approved ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
