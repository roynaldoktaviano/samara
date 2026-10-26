'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Search, ThumbsUp, ThumbsDown, HandCoins, CheckCircle2 } from 'lucide-react'
import { roleMatches } from '@/lib/role-utils'
import { RupiahInput } from '@/components/ui/rupiah-input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { formatDate, formatMoney } from '@/lib/format'

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
  approvedAmount: number | null
  approvedTermMonths: number | null
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
const STATUS_TONE: Record<LoanStatus, StatusTone> = {
  PENDING_HR: 'info',
  PENDING_FINANCE: 'info', PENDING_SPECIAL: 'warning',
  APPROVED: 'success', REJECTED: 'destructive',
}
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// `id` goes on the trigger; the field's <Label> must use `${id}-label` as its id so the
// trigger is announced as "<label> <selected employee>".
function EmployeeCombobox({ id, value, options, onChange }: { id: string; value: string; options: EmployeeLite[]; onChange: (id: string) => void }) {
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

export default function EmployeeLoansPage() {
  const confirm = useConfirm()
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
  const [approvedAmount, setApprovedAmount] = useState('')
  const [approvedTermMonths, setApprovedTermMonths] = useState('')
  const [deciding, setDeciding] = useState(false)

  const [editModal, setEditModal] = useState(false)
  const [editForm, setEditForm] = useState({ amount: '', termMonths: '', reason: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

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
    setApprovedAmount(detail ? String(detail.amount) : '')
    setApprovedTermMonths(detail ? String(detail.termMonths) : '')
    setDecision({ action, approved })
  }

  async function decide() {
    if (!decision || !detailId) return
    setDeciding(true)
    const body: Record<string, unknown> = { action: decision.action, approved: decision.approved, note: decisionNote }
    if (decision.action === 'special-decide' && decision.approved) {
      body.firstDeductionYear = deductionYear
      body.firstDeductionMonth = deductionMonth
      body.approvedAmount = Number(approvedAmount)
      body.approvedTermMonths = Number(approvedTermMonths)
    }
    const res = await fetch(`/api/hr/loans/${detailId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setDeciding(false)
    if (res.ok) { setDecision(null); loadDetail(detailId); load() }
  }

  function openEdit() {
    if (!detail) return
    setEditForm({ amount: String(detail.amount), termMonths: String(detail.termMonths), reason: detail.reason ?? '' })
    setEditError('')
    setEditModal(true)
  }

  async function saveEdit() {
    if (!detailId) return
    if (!editForm.amount || Number(editForm.amount) <= 0) { setEditError('Amount must be greater than 0'); return }
    if (!editForm.termMonths || Number(editForm.termMonths) <= 0) { setEditError('Term must be greater than 0'); return }
    setEditSaving(true); setEditError('')
    const res = await fetch(`/api/hr/loans/${detailId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'edit', amount: editForm.amount, termMonths: editForm.termMonths, reason: editForm.reason }),
    })
    const data = await res.json()
    setEditSaving(false)
    if (!res.ok) { setEditError(data.error ?? 'An error occurred'); return }
    setEditModal(false); loadDetail(detailId); load()
  }

  async function markInstallmentPaid(installmentId: string) {
    setMarkingPaidId(installmentId)
    await fetch(`/api/hr/loans/installments/${installmentId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    setMarkingPaidId(null)
    if (detailId) loadDetail(detailId)
  }

  async function payOffEarly() {
    if (!detailId) return
    const ok = await confirm({
      title: 'Pay off remaining balance now?',
      description: 'Every remaining installment will be marked paid immediately, outside the normal payroll schedule.',
      confirmLabel: 'Yes, Pay Off',
    })
    if (!ok) return
    setPayingOff(true)
    await fetch(`/api/hr/loans/${detailId}/payoff`, { method: 'POST' })
    setPayingOff(false)
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
        <Button onClick={openAdd}>
          <Plus /> New Loan Request
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Total Outstanding</p>
          <p className="text-xl font-bold mt-1">{formatMoney(stats.totalOutstanding)}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Pending Requests</p>
          <p className="text-xl font-bold mt-1">{stats.pendingRequestsCount}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Due This Payroll Run</p>
          <p className="text-xl font-bold mt-1">{formatMoney(stats.dueThisPayrollRun)}</p>
        </div>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {stages.map(s => {
          const count = s === 'All' ? loans.length : loans.filter(l => l.status === s).length
          return (
            <button key={s} onClick={() => setStageFilter(s)}
              className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                stageFilter === s ? 'border-primary text-primary-strong' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {s === 'All' ? 'All' : STATUS_LABEL[s]}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${stageFilter === s ? 'bg-primary/15 text-primary-strong' : 'bg-muted text-muted-foreground'}`}>
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
                  <td className="px-4 py-2.5 text-right font-medium">{formatMoney(l.amount)}</td>
                  <td className="px-4 py-2.5 text-center text-muted-foreground">{l.termMonths} mo</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(l.requestedAt)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <StatusBadge tone={STATUS_TONE[l.status]} className="px-2.5 py-1 font-semibold">{STATUS_LABEL[l.status]}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Loan Request modal */}
      <Dialog open={modal} onOpenChange={o => { if (!o) setModal(false) }}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden" aria-describedby={undefined} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="px-6 py-4 pr-12 border-b text-left">
            <DialogTitle className="text-sm font-bold">New Loan Request</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {formError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{formError}</p>}
            <div className="space-y-1.5">
              <Label id="loan-employee-label" htmlFor="loan-employee" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee</Label>
              <EmployeeCombobox id="loan-employee" value={form.employeeId} options={employees} onChange={id => setForm(f => ({ ...f, employeeId: id }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* RupiahInput takes no id, so the label wraps the control instead of using htmlFor */}
              <label className="block space-y-1.5">
                <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</span>
                <RupiahInput value={form.amount} onChange={digits => setForm(f => ({ ...f, amount: digits }))} />
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="loan-term" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Term (months)</Label>
                <Input id="loan-term" type="number" min={1} value={form.termMonths} onChange={e => setForm(f => ({ ...f, termMonths: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-reason" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason (optional)</Label>
              <Textarea id="loan-reason" rows={2} className="resize-none"
                value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/50">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>
              {saving ? 'Submitting…' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail modal */}
      <Dialog open={!!detailId} onOpenChange={o => { if (!o) { setDetailId(null); setDetail(null) } }}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden max-h-[85vh] flex flex-col" aria-describedby={undefined} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="px-6 py-4 pr-12 border-b shrink-0 text-left">
            <DialogTitle className="text-sm font-bold">{detail?.employee.fullName ?? 'Loading…'}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4 overflow-y-auto">
            {detailLoading || !detail ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-4 w-full rounded bg-muted animate-pulse" />)}</div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold">{formatMoney(detail.amount)}</p>
                    <p className="text-xs text-muted-foreground">{detail.termMonths} months{detail.reason ? ` · ${detail.reason}` : ''}</p>
                    {detail.status === 'APPROVED' && detail.approvedAmount != null && detail.approvedTermMonths != null &&
                      (detail.approvedAmount !== detail.amount || detail.approvedTermMonths !== detail.termMonths) && (
                      <p className="text-xs text-warning font-medium mt-0.5">Approved for {formatMoney(detail.approvedAmount)} over {detail.approvedTermMonths} months instead</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(canHr || canFinance) && detail.status !== 'APPROVED' && detail.status !== 'REJECTED' && (
                      <Button variant="outline" size="sm" onClick={openEdit}>Edit</Button>
                    )}
                    <StatusBadge tone={STATUS_TONE[detail.status]} className="px-2.5 py-1 font-semibold">{STATUS_LABEL[detail.status]}</StatusBadge>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Requested by {detail.requestedBy?.name ?? '—'} on {formatDate(detail.requestedAt)}</p>
                  {detail.hrDecidedBy && <p>HR ({detail.hrDecidedBy.name}): {detail.hrApproved ? 'Approved' : 'Rejected'}{detail.hrNote ? ` — "${detail.hrNote}"` : ''}</p>}
                  {detail.financeDecidedBy && <p>Finance ({detail.financeDecidedBy.name}): {detail.financeApproved ? 'Approved' : 'Rejected'}{detail.financeNote ? ` — "${detail.financeNote}"` : ''}</p>}
                  {detail.specialDecidedBy && <p>Final ({detail.specialDecidedBy.name}): {detail.specialApproved ? 'Approved' : 'Rejected'}{detail.specialNote ? ` — "${detail.specialNote}"` : ''}</p>}
                </div>

                {detail.status === 'PENDING_HR' && (
                  canHr ? (
                    <div className="flex items-center gap-2">
                      <Button variant="success-soft" size="sm" onClick={() => openDecision('hr-decide', true)}>
                        <ThumbsUp /> HR Approve
                      </Button>
                      <Button variant="destructive-soft" size="sm" onClick={() => openDecision('hr-decide', false)}>
                        <ThumbsDown /> HR Reject
                      </Button>
                    </div>
                  ) : <p className="text-xs text-muted-foreground">Waiting for HR review.</p>
                )}

                {detail.status === 'PENDING_FINANCE' && (
                  canFinance ? (
                    <div className="flex items-center gap-2">
                      <Button variant="success-soft" size="sm" onClick={() => openDecision('finance-decide', true)}>
                        <ThumbsUp /> Finance Approve
                      </Button>
                      <Button variant="destructive-soft" size="sm" onClick={() => openDecision('finance-decide', false)}>
                        <ThumbsDown /> Finance Reject
                      </Button>
                    </div>
                  ) : <p className="text-xs text-muted-foreground">Waiting for Finance review.</p>
                )}

                {detail.status === 'PENDING_SPECIAL' && (
                  canSpecial ? (
                    <div className="flex items-center gap-2">
                      <Button variant="success-soft" size="sm" onClick={() => openDecision('special-decide', true)}>
                        <ThumbsUp /> Final Approve
                      </Button>
                      <Button variant="destructive-soft" size="sm" onClick={() => openDecision('special-decide', false)}>
                        <ThumbsDown /> Reject
                      </Button>
                    </div>
                  ) : <p className="text-xs text-muted-foreground">Waiting for final approval (Admin/Super Admin).</p>
                )}

                {detail.status === 'APPROVED' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Repayment Schedule</p>
                      {detail.installments.some(i => i.status === 'PENDING') && (
                        <Button variant="outline" size="sm" onClick={payOffEarly} loading={payingOff}>
                          Early Payoff
                        </Button>
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
                              <td className="px-3 py-2 text-right">{formatMoney(inst.amount)}</td>
                              <td className="px-3 py-2 text-center">
                                {inst.status === 'PAID' ? (
                                  <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3 w-3" /> Paid</span>
                                ) : <span className="text-muted-foreground">Pending</span>}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {inst.status === 'PENDING' && (
                                  <Button variant="link" size="sm" onClick={() => markInstallmentPaid(inst.id)} disabled={markingPaidId === inst.id}
                                    className="h-auto p-0 text-xs font-normal text-primary-strong">
                                    Mark Paid
                                  </Button>
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
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      <Dialog open={editModal} onOpenChange={o => { if (!o) setEditModal(false) }}>
        <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden" aria-describedby={undefined} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="px-6 py-4 pr-12 border-b text-left">
            <DialogTitle className="text-sm font-bold">Edit Loan Request</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {editError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{editError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</span>
                <RupiahInput value={editForm.amount} onChange={digits => setEditForm(f => ({ ...f, amount: digits }))} />
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="loan-edit-term" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Term (months)</Label>
                <Input id="loan-edit-term" type="number" min={1} value={editForm.termMonths} onChange={e => setEditForm(f => ({ ...f, termMonths: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-edit-reason" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason (optional)</Label>
              <Textarea id="loan-edit-reason" rows={2} className="resize-none"
                value={editForm.reason} onChange={e => setEditForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/50">
            <Button variant="outline" onClick={() => setEditModal(false)}>Cancel</Button>
            <Button onClick={saveEdit} loading={editSaving}>
              {editSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decision modal */}
      <Dialog open={!!decision} onOpenChange={o => { if (!o) setDecision(null) }}>
        {decision && (
          <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden" aria-describedby={undefined} showCloseButton={false} onInteractOutside={e => e.preventDefault()}>
            <div className="px-6 py-5 space-y-3">
              <DialogTitle className="text-sm font-bold">{decision.approved ? 'Approve' : 'Reject'} — {detail?.employee.fullName}</DialogTitle>
              {decision.action === 'special-decide' && decision.approved && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1">
                      <span className="block text-[11px] text-muted-foreground">Approved Amount</span>
                      <RupiahInput value={approvedAmount} onChange={setApprovedAmount} />
                    </label>
                    <div className="space-y-1">
                      <Label htmlFor="loan-approved-term" className="text-[11px] font-normal text-muted-foreground">Approved Term (months)</Label>
                      <Input id="loan-approved-term" type="number" min={1} value={approvedTermMonths} onChange={e => setApprovedTermMonths(e.target.value)} />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Prefilled with what was requested — change either if you&apos;re approving a different amount or tenor.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="loan-deduction-month" className="text-[11px] font-normal text-muted-foreground">First Deduction Month</Label>
                      <NativeSelect id="loan-deduction-month" value={deductionMonth} onChange={e => setDeductionMonth(Number(e.target.value))}>
                        {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                      </NativeSelect>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="loan-deduction-year" className="text-[11px] font-normal text-muted-foreground">Year</Label>
                      <Input id="loan-deduction-year" type="number" value={deductionYear} onChange={e => setDeductionYear(Number(e.target.value))} />
                    </div>
                  </div>
                </>
              )}
              <Textarea rows={2} placeholder="Note (optional)" aria-label="Note (optional)" className="resize-none"
                value={decisionNote} onChange={e => setDecisionNote(e.target.value)} />
            </div>
            <DialogFooter className="px-6 py-4 border-t bg-muted/50">
              <Button variant="outline" onClick={() => setDecision(null)}>Cancel</Button>
              <Button onClick={decide} loading={deciding}
                variant={decision.approved ? 'success' : 'destructive'}>
                {decision.approved ? 'Approve' : 'Reject'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
