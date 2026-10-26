'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import {
  ChevronLeft, Pencil, Printer, Trash2, Send, ThumbsUp, ThumbsDown, RotateCcw, Wallet, X,
} from 'lucide-react'
import { roleMatches } from '@/lib/role-utils'
import { RupiahInput } from '@/components/ui/rupiah-input'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { formatDate, formatMoney } from '@/lib/format'
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
const STATUS_TONE: Record<string, StatusTone> = {
  OPEN: 'neutral',
  SUBMITTED: 'info',
  APPROVED: 'success',
  REJECTED: 'destructive',
  PAID: 'success',
}
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

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

  const confirm = useConfirm()

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

  async function removeEntry(entry: PayslipEntry) {
    if (!(await confirm({
      title: `Remove ${entry.fullNameSnap} from this payroll?`,
      description: 'This only removes their entry from this period — e.g. if they resigned mid-period.',
      confirmLabel: 'Remove',
      destructive: true,
    }))) return
    const res = await fetch(`/api/hr/payroll/entries/${entry.id}`, { method: 'DELETE' })
    if (res.ok) load()
    else toast.error((await res.json().catch(() => null))?.error ?? 'Failed to remove entry')
  }

  if (loading || !period) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2.5 text-muted-foreground">
          <ChevronLeft /> Back to Payroll
        </Button>
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
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2.5 text-muted-foreground">
        <ChevronLeft /> Back to Payroll
      </Button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold tracking-tight">{MONTH_NAMES[period.month - 1]} {period.year}</h2>
            <StatusBadge tone={STATUS_TONE[period.status]} className="px-2.5 py-1 font-semibold">{STATUS_LABEL[period.status]}</StatusBadge>
          </div>
          <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
            <p>
              {filteredEntries.length}{filteredEntries.length !== period.entries.length ? ` of ${period.entries.length}` : ''} {filteredEntries.length === 1 ? 'employee' : 'employees'} · Total take-home {formatMoney(totalTakeHome)}
              {period.payDate ? ` · Pay date ${formatDate(period.payDate)}` : ''}
            </p>
            {period.submittedBy && <p>Submitted by {period.submittedBy.name ?? '—'}{period.submittedAt ? ` on ${formatDate(period.submittedAt)}` : ''}</p>}
            {period.approvedBy && <p>Approved by {period.approvedBy.name ?? '—'}{period.approvalNote ? ` — "${period.approvalNote}"` : ''}</p>}
            {period.rejectedBy && <p>Rejected by {period.rejectedBy.name ?? '—'}{period.rejectionNote ? ` — "${period.rejectionNote}"` : ''}</p>}
            {period.paidBy && <p>Marked paid by {period.paidBy.name ?? '—'}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isOpen && canManage && (
            <Button variant="outline" onClick={() => runAction('generate-entries')} disabled={busy}>
              Generate Entries
            </Button>
          )}
          {isOpen && canManage && period.entries.length > 0 && (
            <Button onClick={() => runAction('submit')} disabled={busy} className="gap-1.5">
              <Send className="size-3.5" /> Submit for Approval
            </Button>
          )}
          {period.status === 'SUBMITTED' && isApprover && (
            <>
              <Button variant="success-soft" onClick={() => setDecision('approve')} disabled={busy} className="gap-1.5">
                <ThumbsUp className="size-3.5" /> Approve
              </Button>
              <Button variant="destructive-soft" onClick={() => setDecision('reject')} disabled={busy} className="gap-1.5">
                <ThumbsDown className="size-3.5" /> Reject
              </Button>
            </>
          )}
          {period.status === 'SUBMITTED' && !isApprover && (
            <span className="text-xs text-muted-foreground">Waiting for Head of Finance approval.</span>
          )}
          {period.status === 'REJECTED' && canManage && (
            <Button variant="outline" onClick={() => runAction('reopen')} disabled={busy} className="gap-1.5">
              <RotateCcw className="size-3.5" /> Reopen
            </Button>
          )}
          {period.status === 'APPROVED' && canPay && (
            <Button variant="success" onClick={() => runAction('mark-paid')} disabled={busy} className="gap-1.5">
              <Wallet className="size-3.5" /> Mark Paid
            </Button>
          )}
        </div>
      </div>

      {actionError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{actionError}</p>}

      {period.entries.length > 0 && locationOptions.length > 0 && (
        <div className="flex items-center gap-2">
          <Label htmlFor="payroll-location-filter" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Work Location</Label>
          <NativeSelect id="payroll-location-filter" value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
            className="h-8 w-auto">
            <option value="All">All locations</option>
            {locationOptions.map(l => <option key={l} value={l}>{l}</option>)}
          </NativeSelect>
        </div>
      )}

      {period.entries.length === 0 ? (
        <div className="rounded-xl border py-12 text-center text-muted-foreground text-sm">
          No entries yet. {isOpen && canManage ? 'Click "Generate Entries" to add every active employee.' : ''}
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-xl border py-12 text-center text-muted-foreground text-sm">
          No entries for &quot;{locationFilter}&quot;. <Button variant="link" onClick={() => setLocationFilter('All')} className="h-auto p-0 text-primary-strong">Show all locations</Button>
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
                  <td className="px-4 py-2.5 text-right">{formatMoney(e.basicSalary)}</td>
                  <td className="px-4 py-2.5 text-right">{formatMoney(e.grossEarnings)}</td>
                  <td className="px-4 py-2.5 text-right text-destructive">-{formatMoney(e.totalDeductions)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{formatMoney(e.takeHomePay)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-0.5 justify-end">
                      {isOpen && canManage && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(e)} className="size-7 text-muted-foreground" title="Edit" aria-label="Edit">
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      <Button asChild variant="ghost" size="icon" className="size-7 text-muted-foreground">
                        <a href={`/print/payslip/${e.id}`} target="_blank" rel="noopener noreferrer" title="Print payslip" aria-label="Print payslip">
                          <Printer className="size-3.5" />
                        </a>
                      </Button>
                      {isOpen && canManage && (
                        <Button variant="ghost" size="icon" onClick={() => removeEntry(e)} className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Remove entry" aria-label="Remove entry">
                          <Trash2 className="size-3.5" />
                        </Button>
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
      <Dialog open={!!editEntry} onOpenChange={o => { if (!o) setEditEntry(null) }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-lg p-0 gap-0 overflow-hidden max-h-[85vh] flex flex-col" onInteractOutside={e => e.preventDefault()}>
          {editEntry && (
            <>
              <DialogHeader className="px-6 py-4 border-b shrink-0">
                <DialogTitle className="font-bold text-sm pr-6">{editEntry.fullNameSnap}</DialogTitle>
              </DialogHeader>
              <div className="px-6 py-5 space-y-5 overflow-y-auto">
                {(['earning', 'employerBpjs', 'deduction'] as const).map(group => (
                  <div key={group} className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {group === 'earning' ? 'Earnings' : group === 'employerBpjs' ? 'Employer BPJS Contributions' : 'Deductions'}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {EDIT_FIELDS.filter(f => f.group === group).map(f => (
                        <div key={f.key} className="space-y-1">
                          {/* RupiahInput takes no id, so the label wraps the control to link them. */}
                          <label className="block space-y-1">
                            <span className="text-[11px] text-muted-foreground">{f.label}</span>
                            <RupiahInput value={editForm[f.key] ?? ''} onChange={digits => setEditForm(v => ({ ...v, [f.key]: digits }))} />
                          </label>
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
                          <Input value={item.name} onChange={e => updateOtherIncomeRow(item.id, { name: e.target.value })} placeholder="Name"
                            aria-label="Other income name" className="h-8 font-medium" />
                          <Input value={item.description} onChange={e => updateOtherIncomeRow(item.id, { description: e.target.value })} placeholder="Description (optional)"
                            aria-label="Other income description" className="h-8 text-xs md:text-xs" />
                        </div>
                        <div className="w-32 shrink-0">
                          <RupiahInput title="Amount" value={String(item.amount)} onChange={digits => updateOtherIncomeRow(item.id, { amount: Number(digits) || 0 })} />
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeOtherIncomeRow(item.id)}
                          className="size-7 shrink-0 text-muted-foreground hover:text-destructive" aria-label="Remove other income">
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" onClick={addOtherIncomeRow}
                      className="w-full border-dashed text-muted-foreground">
                      + Add Other Income
                    </Button>
                  </div>
                </div>
              </div>
              <DialogFooter className="px-6 py-4 border-t bg-muted/50 shrink-0">
                <Button variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
                <Button onClick={saveEntry} loading={savingEntry} className="font-semibold">
                  Save
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Approve / Reject decision modal ── */}
      <Dialog open={!!decision} onOpenChange={o => { if (!o) { setDecision(null); setDecisionNote('') } }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm p-0 gap-0 overflow-hidden" onInteractOutside={e => e.preventDefault()}>
          <div className="px-6 py-5 space-y-3">
            <DialogTitle className="font-bold text-sm pr-6">{decision === 'approve' ? 'Approve' : 'Reject'} Payroll — {MONTH_NAMES[period.month - 1]} {period.year}</DialogTitle>
            <Textarea rows={2} placeholder="Note (optional)" aria-label="Note (optional)"
              className="resize-none"
              value={decisionNote} onChange={e => setDecisionNote(e.target.value)} />
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/50">
            <Button variant="outline" onClick={() => { setDecision(null); setDecisionNote('') }}>Cancel</Button>
            <Button onClick={decide} loading={deciding}
              variant={decision === 'approve' ? 'success' : 'destructive'} className="font-semibold">
              {deciding ? 'Saving…' : decision === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
