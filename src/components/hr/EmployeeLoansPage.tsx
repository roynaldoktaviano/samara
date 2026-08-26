'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, X, Search, ThumbsUp, ThumbsDown, HandCoins, Loader2, CheckCircle2 } from 'lucide-react'
import { roleMatches } from '@/lib/role-utils'
import { RupiahInput } from '@/components/ui/rupiah-input'

interface EmployeeLite { id: string; fullName: string; employeeNumber: string; isActive: boolean }
type ActorLite = { id: string; name: string | null } | null

type LoanStatus = 'PENDING_HR' | 'PENDING_FINANCE' | 'PENDING_SPECIAL' | 'APPROVED' | 'REJECTED'

interface LoanListItem {
  id: string
  employee: { id: string; fullName: string; employeeNumber: string }
  amount: number
  termMonths: number
  status: LoanStatus
  requestedAt: string
}

interface Installment {
  id: string
  installmentNumber: number
  dueYear: number
  dueMonth: number
  amount: number
  status: 'PENDING' | 'PAID'
  paidAt: string | null
  paidAmount: number | null
}

interface LoanDetail extends LoanListItem {
  reason: string | null
  requestedBy: ActorLite
  firstDeductionYear: number | null
  firstDeductionMonth: number | null
  employee: { id: string; fullName: string; employeeNumber: string; managerId: string | null }
  hrDecidedBy: ActorLite; hrApproved: boolean | null; hrNote: string | null; hrDecidedAt: string | null
  financeDecidedBy: ActorLite; financeApproved: boolean | null; financeNote: string | null; financeDecidedAt: string | null
  specialDecidedBy: ActorLite; specialApproved: boolean | null; specialNote: string | null; specialDecidedAt: string | null
  installments: Installment[]
}

const STATUS_LABEL: Record<LoanStatus, string> = {
  PENDING_HR: 'Pending HR', PENDING_FINANCE: 'Pending Finance',
  PENDING_SPECIAL: 'Pending Final Approval', APPROVED: 'Approved', REJECTED: 'Rejected',
}
const STATUS_COLOR: Record<LoanStatus, string> = {
  PENDING_HR: 'bg-blue-100 text-blue-700',
  PENDING_FINANCE: 'bg-purple-100 text-purple-700', PENDING_SPECIAL: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700',
}
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n))
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

function EmployeeCombobox({ value, options, onChange }: { value: string; options: EmployeeLite[]; onChange: (id: string) => void }) {
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

export default function EmployeeLoansPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role ?? ''
  const canHr = roleMatches(role, ['ADMIN', 'SUPER_ADMIN', 'HR'])
  const canFinance = roleMatches(role, ['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'FINANCE_DIRECTOR'])
  const canSpecial = roleMatches(role, ['ADMIN', 'SUPER_ADMIN'])

  const [loans, setLoans] = useState<LoanListItem[]>([])
  const [stats, setStats] = useState({ totalOutstanding: 0, pendingRequestsCount: 0, dueThisPayrollRun: 0 })
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [loading, setLoading] = useState(true)
  const [stageFilter, setStageFilter] = useState<'All' | LoanStatus>('All')

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ employeeId: '', amount: '', termMonths: '12', reason: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<LoanDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [decision, setDecision] = useState<{ action: 'hr-decide' | 'finance-decide' | 'special-decide'; approved: boolean } | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [deductionYear, setDeductionYear] = useState(new Date().getFullYear())
  const [deductionMonth, setDeductionMonth] = useState(new Date().getMonth() + 1)
  const [deciding, setDeciding] = useState(false)

  const [payoffConfirm, setPayoffConfirm] = useState(false)
  const [payingOff, setPayingOff] = useState(false)
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/hr/loans')
    if (res.ok) { const data = await res.json(); setLoans(data.loans); setStats(data.stats) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/hr/employees').then(r => r.ok ? r.json() : []).then((emps: EmployeeLite[]) => setEmployees(emps.filter(e => e.isActive))).catch(() => {})
  }, [])

  async function loadDetail(id: string) {
    setDetailId(id); setDetail(null); setDetailLoading(true)
    const res = await fetch(`/api/hr/loans/${id}`)
    if (res.ok) setDetail(await res.json())
    setDetailLoading(false)
  }

  function openAdd() { setForm({ employeeId: '', amount: '', termMonths: '12', reason: '' }); setFormError(''); setModal(true) }

  async function save() {
    if (!form.employeeId) { setFormError('Please select an employee'); return }
    if (!form.amount || Number(form.amount) <= 0) { setFormError('Amount must be greater than 0'); return }
    if (!form.termMonths || Number(form.termMonths) <= 0) { setFormError('Term must be greater than 0'); return }
    setSaving(true); setFormError('')
    const res = await fetch('/api/hr/loans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: form.employeeId, amount: form.amount, termMonths: form.termMonths, reason: form.reason }),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setModal(false); setSaving(false); load()
  }

  function openDecision(action: 'hr-decide' | 'finance-decide' | 'special-decide', approved: boolean) {
    setDecisionNote('')
    if (detail?.firstDeductionYear) setDeductionYear(detail.firstDeductionYear)
    if (detail?.firstDeductionMonth) setDeductionMonth(detail.firstDeductionMonth)
    setDecision({ action, approved })
  }

  async function decide() {
    if (!decision || !detailId) return
    setDeciding(true)
    const body: Record<string, unknown> = { action: decision.action, approved: decision.approved, note: decisionNote }
    if (decision.action === 'special-decide' && decision.approved) {
      body.firstDeductionYear = deductionYear
      body.firstDeductionMonth = deductionMonth
    }
    const res = await fetch(`/api/hr/loans/${detailId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setDeciding(false)
    if (res.ok) { setDecision(null); loadDetail(detailId); load() }
  }

  async function markInstallmentPaid(installmentId: string) {
    setMarkingPaidId(installmentId)
    await fetch(`/api/hr/loans/installments/${installmentId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    setMarkingPaidId(null)
    if (detailId) loadDetail(detailId)
  }

  async function payOffEarly() {
    if (!detailId) return
    setPayingOff(true)
    await fetch(`/api/hr/loans/${detailId}/payoff`, { method: 'POST' })
    setPayingOff(false); setPayoffConfirm(false)
    loadDetail(detailId); load()
  }

  const filtered = stageFilter === 'All' ? loans : loans.filter(l => l.status === stageFilter)
  const stages: ('All' | LoanStatus)[] = ['All', 'PENDING_HR', 'PENDING_FINANCE', 'PENDING_SPECIAL', 'APPROVED', 'REJECTED']

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Employee Loans & Cash Bon</h2>
          <p className="text-muted-foreground text-sm mt-1">HR → Finance → Final Approval, then repaid via Payroll deductions</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> New Loan Request
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Total Outstanding</p>
          <p className="text-xl font-bold mt-1">{fmtMoney(stats.totalOutstanding)}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Pending Requests</p>
          <p className="text-xl font-bold mt-1">{stats.pendingRequestsCount}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Due This Payroll Run</p>
          <p className="text-xl font-bold mt-1">{fmtMoney(stats.dueThisPayrollRun)}</p>
        </div>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {stages.map(s => {
          const count = s === 'All' ? loans.length : loans.filter(l => l.status === s).length
          return (
            <button key={s} onClick={() => setStageFilter(s)}
              className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                stageFilter === s ? 'border-amber-500 text-amber-700' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {s === 'All' ? 'All' : STATUS_LABEL[s]}
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
          {[...Array(3)].map((_, i) => <div key={i} className="px-5 py-4 border-t flex gap-4"><div className="h-4 w-40 rounded bg-muted" /></div>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border py-12 text-center text-muted-foreground text-sm">
          <HandCoins className="h-8 w-8 mx-auto mb-2 opacity-20" />
          No loan requests {stageFilter !== 'All' ? `at "${STATUS_LABEL[stageFilter]}"` : 'yet'}.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left">
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-xs">Employee</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-xs text-right">Amount</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-xs text-center">Term</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-xs">Requested</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-xs text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(l => (
                <tr key={l.id} onClick={() => loadDetail(l.id)} className="hover:bg-muted/20 transition-colors cursor-pointer">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{l.employee.fullName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{l.employee.employeeNumber}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{fmtMoney(l.amount)}</td>
                  <td className="px-4 py-2.5 text-center text-muted-foreground">{l.termMonths} mo</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(l.requestedAt)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Loan Request modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-sm">New Loan Request</h3>
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
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</label>
                  <RupiahInput value={form.amount} onChange={digits => setForm(f => ({ ...f, amount: digits }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Term (months)</label>
                  <input type="number" min={1} value={form.termMonths} onChange={e => setForm(f => ({ ...f, termMonths: e.target.value }))}
                    className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason (optional)</label>
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

      {/* Detail modal */}
      {detailId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <h3 className="font-bold text-sm">{detail?.employee.fullName ?? 'Loading...'}</h3>
              <button onClick={() => { setDetailId(null); setDetail(null) }} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              {detailLoading || !detail ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-4 w-full rounded bg-muted animate-pulse" />)}</div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-bold">{fmtMoney(detail.amount)}</p>
                      <p className="text-xs text-muted-foreground">{detail.termMonths} months{detail.reason ? ` · ${detail.reason}` : ''}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR[detail.status]}`}>{STATUS_LABEL[detail.status]}</span>
                  </div>

                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Requested by {detail.requestedBy?.name ?? '—'} on {fmtDate(detail.requestedAt)}</p>
                    {detail.hrDecidedBy && <p>HR ({detail.hrDecidedBy.name}): {detail.hrApproved ? 'Approved' : 'Rejected'}{detail.hrNote ? ` — "${detail.hrNote}"` : ''}</p>}
                    {detail.financeDecidedBy && <p>Finance ({detail.financeDecidedBy.name}): {detail.financeApproved ? 'Approved' : 'Rejected'}{detail.financeNote ? ` — "${detail.financeNote}"` : ''}</p>}
                    {detail.specialDecidedBy && <p>Final ({detail.specialDecidedBy.name}): {detail.specialApproved ? 'Approved' : 'Rejected'}{detail.specialNote ? ` — "${detail.specialNote}"` : ''}</p>}
                  </div>

                  {detail.status === 'PENDING_HR' && (
                    canHr ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => openDecision('hr-decide', true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                          <ThumbsUp className="h-3.5 w-3.5" /> HR Approve
                        </button>
                        <button onClick={() => openDecision('hr-decide', false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
                          <ThumbsDown className="h-3.5 w-3.5" /> HR Reject
                        </button>
                      </div>
                    ) : <p className="text-xs text-muted-foreground">Waiting for HR review.</p>
                  )}

                  {detail.status === 'PENDING_FINANCE' && (
                    canFinance ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => openDecision('finance-decide', true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                          <ThumbsUp className="h-3.5 w-3.5" /> Finance Approve
                        </button>
                        <button onClick={() => openDecision('finance-decide', false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
                          <ThumbsDown className="h-3.5 w-3.5" /> Finance Reject
                        </button>
                      </div>
                    ) : <p className="text-xs text-muted-foreground">Waiting for Finance review.</p>
                  )}

                  {detail.status === 'PENDING_SPECIAL' && (
                    canSpecial ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => openDecision('special-decide', true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                          <ThumbsUp className="h-3.5 w-3.5" /> Final Approve
                        </button>
                        <button onClick={() => openDecision('special-decide', false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
                          <ThumbsDown className="h-3.5 w-3.5" /> Reject
                        </button>
                      </div>
                    ) : <p className="text-xs text-muted-foreground">Waiting for final approval (Admin/Super Admin).</p>
                  )}

                  {detail.status === 'APPROVED' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Repayment Schedule</p>
                        {detail.installments.some(i => i.status === 'PENDING') && (
                          <button onClick={() => setPayoffConfirm(true)}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border hover:bg-muted transition-colors">
                            Early Payoff
                          </button>
                        )}
                      </div>
                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-muted/30 text-left">
                              <th className="px-3 py-2 font-medium text-muted-foreground">#</th>
                              <th className="px-3 py-2 font-medium text-muted-foreground">Due</th>
                              <th className="px-3 py-2 font-medium text-muted-foreground text-right">Amount</th>
                              <th className="px-3 py-2 font-medium text-muted-foreground text-center">Status</th>
                              <th className="px-3 py-2" />
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {detail.installments.map(inst => (
                              <tr key={inst.id}>
                                <td className="px-3 py-2">{inst.installmentNumber}</td>
                                <td className="px-3 py-2">{MONTH_NAMES[inst.dueMonth - 1]} {inst.dueYear}</td>
                                <td className="px-3 py-2 text-right">{fmtMoney(inst.amount)}</td>
                                <td className="px-3 py-2 text-center">
                                  {inst.status === 'PAID' ? (
                                    <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-3 w-3" /> Paid</span>
                                  ) : <span className="text-muted-foreground">Pending</span>}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {inst.status === 'PENDING' && (
                                    <button onClick={() => markInstallmentPaid(inst.id)} disabled={markingPaidId === inst.id}
                                      className="text-amber-700 hover:underline disabled:opacity-50">
                                      Mark Paid
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Decision modal */}
      {decision && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 space-y-3">
              <h3 className="font-bold text-sm">{decision.approved ? 'Approve' : 'Reject'} — {detail?.employee.fullName}</h3>
              {decision.action === 'special-decide' && decision.approved && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">First Deduction Month</label>
                    <select value={deductionMonth} onChange={e => setDeductionMonth(Number(e.target.value))}
                      className="w-full h-9 border rounded-md px-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500">
                      {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Year</label>
                    <input type="number" value={deductionYear} onChange={e => setDeductionYear(Number(e.target.value))}
                      className="w-full h-9 border rounded-md px-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
                  </div>
                </div>
              )}
              <textarea rows={2} placeholder="Note (optional)"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                value={decisionNote} onChange={e => setDecisionNote(e.target.value)} />
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => setDecision(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={decide} disabled={deciding}
                className={`px-5 py-2 text-sm text-white rounded-lg font-semibold disabled:opacity-50 transition-colors ${decision.approved ? 'bg-green-600 hover:bg-green-700' : 'bg-destructive hover:bg-destructive/90'}`}>
                {deciding && <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" />}
                {decision.approved ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Early payoff confirm */}
      {payoffConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5">
              <h3 className="font-bold text-sm">Pay off remaining balance now?</h3>
              <p className="text-xs text-muted-foreground mt-1">Every remaining installment will be marked paid immediately, outside the normal payroll schedule.</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => setPayoffConfirm(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={payOffEarly} disabled={payingOff}
                className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {payingOff ? 'Processing...' : 'Yes, Pay Off'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
