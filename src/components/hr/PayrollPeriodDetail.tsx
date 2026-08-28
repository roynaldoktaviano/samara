'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import {
  ChevronLeft, Loader2, Pencil, Printer, Trash2, Send, ThumbsUp, ThumbsDown, RotateCcw, Wallet, X,
} from 'lucide-react'
import { roleMatches } from '@/lib/role-utils'
import { RupiahInput } from '@/components/ui/rupiah-input'
import type { OtherIncomeItem } from '@/lib/payroll'

interface PayslipEntry {
  id: string
  employeeId: string
  employeeNumberSnap: string
  fullNameSnap: string
  positionSnap: string | null
  workLocationSnap: string | null
  basicSalary: number
  functionAllowance: number
  mealAllowance: number
  uangLayar: number
  uangLayarTripDays: number | null
  commission: number
  thr: number
  otherIncomeSnap: OtherIncomeItem[]
  otherIncomeTotal: number
  bpjsJkkCompany: number
  bpjsJkmCompany: number
  bpjsJhtCompany: number
  bpjsJpCompany: number
  bpjsKesehatanCompany: number
  bpjsJhtEmployee: number
  bpjsJpEmployee: number
  bpjsKesehatanEmployee: number
  pph21: number
  loanDeduction: number
  grossEarnings: number
  totalDeductions: number
  takeHomePay: number
  isManuallyEdited: boolean
}

interface Period {
  id: string
  year: number
  month: number
  status: 'OPEN' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID'
  cutoffDate: string | null
  payDate: string | null
  notes: string | null
  submittedBy: { id: string; name: string | null } | null
  submittedAt: string | null
  approvedBy: { id: string; name: string | null } | null
  approvedAt: string | null
  approvalNote: string | null
  rejectedBy: { id: string; name: string | null } | null
  rejectedAt: string | null
  rejectionNote: string | null
  paidBy: { id: string; name: string | null } | null
  paidAt: string | null
  entries: PayslipEntry[]
}

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open', SUBMITTED: 'Submitted', APPROVED: 'Approved', REJECTED: 'Rejected', PAID: 'Paid',
}
const STATUS_COLOR: Record<string, string> = {
  OPEN: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  PAID: 'bg-purple-100 text-purple-700',
}
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n))

const EDIT_FIELDS = [
  { key: 'basicSalary', label: 'Basic Salary', group: 'earning' },
  { key: 'functionAllowance', label: 'Function Allowance', group: 'earning' },
  { key: 'mealAllowance', label: 'Meal Allowance', group: 'earning' },
  { key: 'uangLayar', label: 'Uang Layar', group: 'earning' },
  { key: 'commission', label: 'Commission', group: 'earning' },
  { key: 'thr', label: 'THR', group: 'earning' },
  { key: 'bpjsJkkCompany', label: 'BPJS JKK (Company)', group: 'employerBpjs' },
  { key: 'bpjsJkmCompany', label: 'BPJS JKM (Company)', group: 'employerBpjs' },
  { key: 'bpjsJhtCompany', label: 'BPJS JHT (Company)', group: 'employerBpjs' },
  { key: 'bpjsJpCompany', label: 'BPJS JP (Company)', group: 'employerBpjs' },
  { key: 'bpjsKesehatanCompany', label: 'BPJS Kesehatan (Company)', group: 'employerBpjs' },
  { key: 'bpjsJhtEmployee', label: 'BPJS JHT (Employee)', group: 'deduction' },
  { key: 'bpjsJpEmployee', label: 'BPJS JP (Employee)', group: 'deduction' },
  { key: 'bpjsKesehatanEmployee', label: 'BPJS Kesehatan (Employee)', group: 'deduction' },
  { key: 'pph21', label: 'PPh21 (Tax)', group: 'deduction' },
  { key: 'loanDeduction', label: 'Loan', group: 'deduction' },
] as const

export default function PayrollPeriodDetail({ periodId, onBack }: { periodId: string; onBack: () => void }) {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role ?? ''
  const canManage = roleMatches(role, ['ADMIN', 'SUPER_ADMIN', 'HR', 'FINANCE'])
  const isApprover = roleMatches(role, ['FINANCE_DIRECTOR', 'ADMIN', 'SUPER_ADMIN'])
  const canPay = roleMatches(role, ['FINANCE', 'FINANCE_DIRECTOR', 'ADMIN', 'SUPER_ADMIN'])

  const [period, setPeriod] = useState<Period | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [editEntry, setEditEntry] = useState<PayslipEntry | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [editOtherIncome, setEditOtherIncome] = useState<OtherIncomeItem[]>([])
  const [savingEntry, setSavingEntry] = useState(false)

  const [deleteEntry, setDeleteEntry] = useState<PayslipEntry | null>(null)
  const [deletingEntry, setDeletingEntry] = useState(false)

  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [deciding, setDeciding] = useState(false)

  const [actionError, setActionError] = useState('')

  const [locationFilter, setLocationFilter] = useState('Bali')
  const locationOptions = useMemo(
    () => [...new Set((period?.entries ?? []).map(e => e.workLocationSnap).filter((l): l is string => !!l))].sort(),
    [period],
  )
  // If this period turns out to have no Bali entries, fall back to showing everyone
  // rather than silently rendering an empty table under the "Bali" default.
  useEffect(() => {
    if (period && locationFilter === 'Bali' && !locationOptions.includes('Bali')) setLocationFilter('All')
  }, [period, locationOptions, locationFilter])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/hr/payroll/periods/${periodId}`)
    if (res.ok) setPeriod(await res.json())
    setLoading(false)
  }, [periodId])

  useEffect(() => { load() }, [load])

  async function runAction(action: string, extra?: Record<string, unknown>) {
    setBusy(true); setActionError('')
    const res = await fetch(`/api/hr/payroll/periods/${periodId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    const data = await res.json()
    if (!res.ok) { setActionError(data.error ?? 'An error occurred'); setBusy(false); return }
    setBusy(false)
    load()
  }

  async function decide() {
    if (!decision) return
    setDeciding(true)
    await runAction(decision, decision === 'approve' ? { approvalNote: decisionNote } : { rejectionNote: decisionNote })
    setDeciding(false); setDecision(null); setDecisionNote('')
  }

  function openEdit(entry: PayslipEntry) {
    const form: Record<string, string> = {}
    // Rounded to whole Rupiah — RupiahInput strips non-digits (including decimal
    // separators) as the user types, so a fractional starting value (e.g. a BPJS rate
    // multiplication landing on cents) would otherwise get mangled on first edit.
    for (const f of EDIT_FIELDS) form[f.key] = String(Math.round(Number(entry[f.key as keyof PayslipEntry]) || 0))
    setEditForm(form)
    setEditOtherIncome(entry.otherIncomeSnap ?? [])
    setEditEntry(entry)
  }

  function addOtherIncomeRow() {
    setEditOtherIncome(rows => [...rows, { id: crypto.randomUUID(), name: '', description: '', amount: 0 }])
  }
  function updateOtherIncomeRow(id: string, patch: Partial<OtherIncomeItem>) {
    setEditOtherIncome(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r))
  }
  function removeOtherIncomeRow(id: string) {
    setEditOtherIncome(rows => rows.filter(r => r.id !== id))
  }

  async function saveEntry() {
    if (!editEntry) return
    setSavingEntry(true)
    const body: Record<string, unknown> = {}
    for (const f of EDIT_FIELDS) body[f.key] = Number(editForm[f.key]) || 0
    body.otherIncomeSnap = editOtherIncome.filter(r => r.name.trim())
    const res = await fetch(`/api/hr/payroll/entries/${editEntry.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setSavingEntry(false)
    if (res.ok) { setEditEntry(null); load() }
  }

  async function confirmDeleteEntry() {
    if (!deleteEntry) return
    setDeletingEntry(true)
    const res = await fetch(`/api/hr/payroll/entries/${deleteEntry.id}`, { method: 'DELETE' })
    setDeletingEntry(false)
    if (res.ok) { setDeleteEntry(null); load() }
  }

  if (loading || !period) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" /> Back to Payroll
        </button>
        <div className="rounded-lg border h-40 bg-muted/30 animate-pulse" />
      </div>
    )
  }

  const isOpen = period.status === 'OPEN'
  // Defaults to "Bali" (the shore office) when this period actually has Bali entries —
  // falls back to showing everyone otherwise rather than silently showing zero rows.
  const filteredEntries = locationFilter === 'All' ? period.entries : period.entries.filter(e => e.workLocationSnap === locationFilter)
  const totalTakeHome = filteredEntries.reduce((s, e) => s + e.takeHomePay, 0)

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="h-4 w-4" /> Back to Payroll
      </button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold tracking-tight">{MONTH_NAMES[period.month - 1]} {period.year}</h2>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR[period.status]}`}>{STATUS_LABEL[period.status]}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
            <p>
              {filteredEntries.length}{filteredEntries.length !== period.entries.length ? ` of ${period.entries.length}` : ''} {filteredEntries.length === 1 ? 'employee' : 'employees'} · Total take-home {fmtMoney(totalTakeHome)}
              {period.payDate ? ` · Pay date ${new Date(period.payDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
            </p>
            {period.submittedBy && <p>Submitted by {period.submittedBy.name ?? '—'}{period.submittedAt ? ` on ${new Date(period.submittedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}</p>}
            {period.approvedBy && <p>Approved by {period.approvedBy.name ?? '—'}{period.approvalNote ? ` — "${period.approvalNote}"` : ''}</p>}
            {period.rejectedBy && <p>Rejected by {period.rejectedBy.name ?? '—'}{period.rejectionNote ? ` — "${period.rejectionNote}"` : ''}</p>}
            {period.paidBy && <p>Marked paid by {period.paidBy.name ?? '—'}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isOpen && canManage && (
            <button onClick={() => runAction('generate-entries')} disabled={busy}
              className="px-3 py-2 text-sm font-medium rounded-md border hover:bg-muted transition-colors disabled:opacity-50">
              Generate Entries
            </button>
          )}
          {isOpen && canManage && period.entries.length > 0 && (
            <button onClick={() => runAction('submit')} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50">
              <Send className="h-3.5 w-3.5" /> Submit for Approval
            </button>
          )}
          {period.status === 'SUBMITTED' && isApprover && (
            <>
              <button onClick={() => setDecision('approve')} disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                <ThumbsUp className="h-3.5 w-3.5" /> Approve
              </button>
              <button onClick={() => setDecision('reject')} disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
                <ThumbsDown className="h-3.5 w-3.5" /> Reject
              </button>
            </>
          )}
          {period.status === 'SUBMITTED' && !isApprover && (
            <span className="text-xs text-muted-foreground">Waiting for Head of Finance approval.</span>
          )}
          {period.status === 'REJECTED' && canManage && (
            <button onClick={() => runAction('reopen')} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border hover:bg-muted transition-colors disabled:opacity-50">
              <RotateCcw className="h-3.5 w-3.5" /> Reopen
            </button>
          )}
          {period.status === 'APPROVED' && canPay && (
            <button onClick={() => runAction('mark-paid')} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50">
              <Wallet className="h-3.5 w-3.5" /> Mark Paid
            </button>
          )}
        </div>
      </div>

      {actionError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionError}</p>}

      {period.entries.length > 0 && locationOptions.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Work Location</label>
          <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
            className="h-8 border rounded-md px-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500">
            <option value="All">All locations</option>
            {locationOptions.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      )}

      {period.entries.length === 0 ? (
        <div className="rounded-xl border py-12 text-center text-muted-foreground text-sm">
          No entries yet. {isOpen && canManage ? 'Click "Generate Entries" to add every active employee.' : ''}
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-xl border py-12 text-center text-muted-foreground text-sm">
          No entries for &quot;{locationFilter}&quot;. <button onClick={() => setLocationFilter('All')} className="text-amber-700 hover:underline">Show all locations</button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left">
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-xs">Employee</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-xs text-right">Basic Salary</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-xs text-right">Gross Earnings</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-xs text-right">Deductions</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-xs text-right">Take-Home</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-xs text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredEntries.map(e => (
                <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{e.fullNameSnap}</p>
                    <p className="text-xs text-muted-foreground font-mono">{e.employeeNumberSnap}{e.positionSnap ? ` · ${e.positionSnap}` : ''}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right">{fmtMoney(e.basicSalary)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtMoney(e.grossEarnings)}</td>
                  <td className="px-4 py-2.5 text-right text-red-600">-{fmtMoney(e.totalDeductions)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{fmtMoney(e.takeHomePay)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-0.5 justify-end">
                      {isOpen && canManage && (
                        <button onClick={() => openEdit(e)} className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <a href={`/print/payslip/${e.id}`} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors inline-flex" title="Print payslip">
                        <Printer className="h-3.5 w-3.5" />
                      </a>
                      {isOpen && canManage && (
                        <button onClick={() => setDeleteEntry(e)} className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors" title="Remove entry">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit entry modal ── */}
      {editEntry && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <h3 className="font-bold text-sm">{editEntry.fullNameSnap}</h3>
              <button onClick={() => setEditEntry(null)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-5 overflow-y-auto">
              {(['earning', 'employerBpjs', 'deduction'] as const).map(group => (
                <div key={group} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {group === 'earning' ? 'Earnings' : group === 'employerBpjs' ? 'Employer BPJS Contributions' : 'Deductions'}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {EDIT_FIELDS.filter(f => f.group === group).map(f => (
                      <div key={f.key} className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">{f.label}</label>
                        <RupiahInput value={editForm[f.key] ?? ''} onChange={digits => setEditForm(v => ({ ...v, [f.key]: digits }))} />
                        {f.key === 'uangLayar' && editEntry.uangLayarTripDays != null && (
                          <p className="text-[10px] text-muted-foreground">Auto-calculated from {editEntry.uangLayarTripDays} trip day{editEntry.uangLayarTripDays === 1 ? '' : 's'} this period.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Other Income</p>
                <div className="space-y-2">
                  {editOtherIncome.map(item => (
                    <div key={item.id} className="flex items-start gap-2 border rounded-lg p-2">
                      <div className="flex-1 space-y-1 min-w-0">
                        <input value={item.name} onChange={e => updateOtherIncomeRow(item.id, { name: e.target.value })} placeholder="Name"
                          className="w-full h-8 text-sm font-medium bg-transparent focus:outline-none" />
                        <input value={item.description} onChange={e => updateOtherIncomeRow(item.id, { description: e.target.value })} placeholder="Description (optional)"
                          className="w-full h-6 text-xs text-muted-foreground bg-transparent focus:outline-none" />
                      </div>
                      <div className="w-32 shrink-0">
                        <RupiahInput value={String(item.amount)} onChange={digits => updateOtherIncomeRow(item.id, { amount: Number(digits) || 0 })} />
                      </div>
                      <button type="button" onClick={() => removeOtherIncomeRow(item.id)} className="p-1.5 text-muted-foreground hover:text-destructive shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={addOtherIncomeRow}
                    className="w-full flex items-center justify-center gap-1.5 border-2 border-dashed rounded-lg py-2 text-sm text-muted-foreground hover:border-amber-400 hover:text-amber-700 transition-colors">
                    + Add Other Income
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80 shrink-0">
              <button onClick={() => setEditEntry(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={saveEntry} disabled={savingEntry}
                className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                {savingEntry && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete entry confirm ── */}
      {deleteEntry && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 space-y-2">
              <h3 className="font-bold text-sm">Remove {deleteEntry.fullNameSnap} from this payroll?</h3>
              <p className="text-xs text-muted-foreground">This only removes their entry from this period — e.g. if they resigned mid-period.</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => setDeleteEntry(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={confirmDeleteEntry} disabled={deletingEntry}
                className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-destructive hover:bg-destructive/90 disabled:opacity-50 transition-colors flex items-center gap-2">
                {deletingEntry && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Approve / Reject decision modal ── */}
      {decision && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 space-y-3">
              <h3 className="font-bold text-sm">{decision === 'approve' ? 'Approve' : 'Reject'} Payroll — {MONTH_NAMES[period.month - 1]} {period.year}</h3>
              <textarea rows={2} placeholder="Note (optional)"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                value={decisionNote} onChange={e => setDecisionNote(e.target.value)} />
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => { setDecision(null); setDecisionNote('') }} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={decide} disabled={deciding}
                className={`px-5 py-2 text-sm text-white rounded-lg font-semibold disabled:opacity-50 transition-colors ${decision === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-destructive hover:bg-destructive/90'}`}>
                {deciding ? 'Saving...' : decision === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
