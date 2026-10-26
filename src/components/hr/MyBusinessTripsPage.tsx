'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Plane, ClipboardList, ShieldAlert, ArrowLeft, Banknote, FileText, CheckCircle2, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { MultiFilePicker } from '@/components/ui/file-preview'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { formatDate, formatDateRange, formatMoney } from '@/lib/format'

interface Reimbursement {
  id: string
  amount: number
  status: 'PENDING' | 'PAID'
  notePhotoKeys: string[]
  notes: string | null
  notaDate: string | null
  createdAt: string
  paidAt: string | null
  transferProofKeys: string[]
}

interface BusinessTrip {
  id: string
  destination: string
  purpose: string
  remark: string | null
  startDate: string; endDate: string
  status: 'PENDING' | 'PENDING_HR_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CLOSED'
  requestedAt: string
  requiresManagerApproval: boolean
  managerApprovedBy: { id: string; name: string | null } | null
  managerApprovedAt: string | null
  managerDecisionNote: string | null
  decidedBy: { id: string; name: string | null } | null
  decidedAt: string | null
  decisionNote: string | null
  report: string | null
  reportFileKeys: string[]
  reportSubmittedAt: string | null
  closedAt: string | null
  reimbursements: Reimbursement[]
}

const STATUS_TONE: Record<string, StatusTone> = {
  PENDING: 'warning',
  PENDING_HR_APPROVAL: 'info',
  APPROVED: 'success',
  REJECTED: 'destructive',
  CLOSED: 'neutral',
}

function statusLabel(t: BusinessTrip): string {
  if (t.status === 'PENDING') return t.requiresManagerApproval ? 'Awaiting Manager' : 'Pending'
  if (t.status === 'PENDING_HR_APPROVAL') return 'Awaiting HR'
  return t.status.charAt(0) + t.status.slice(1).toLowerCase()
}


export default function MyBusinessTripsPage() {
  const confirm = useConfirm()
  const [loading, setLoading] = useState(true)
  const [linked, setLinked] = useState(true)
  const [trips, setTrips] = useState<BusinessTrip[]>([])
  const [selected, setSelected] = useState<BusinessTrip | null>(null)

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ destination: '', purpose: '', remark: '', startDate: '', endDate: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [reportDraft, setReportDraft] = useState({ report: '', reportFileKeys: [] as string[] })
  const [reportSaving, setReportSaving] = useState(false)
  const [reportError, setReportError] = useState('')

  const [reimburseModal, setReimburseModal] = useState(false)
  const [reimburseAmount, setReimburseAmount] = useState('')
  const [reimbursePhotos, setReimbursePhotos] = useState<string[]>([])
  const [reimburseNotes, setReimburseNotes] = useState('')
  const [reimburseNotaDate, setReimburseNotaDate] = useState('')
  const [reimburseRequesterName, setReimburseRequesterName] = useState('')
  const [reimburseBankName, setReimburseBankName] = useState('')
  const [reimburseAccountNumber, setReimburseAccountNumber] = useState('')
  const [reimburseAccountHolderName, setReimburseAccountHolderName] = useState('')
  const [reimburseSaving, setReimburseSaving] = useState(false)
  const [reimburseError, setReimburseError] = useState('')

  const [closeSaving, setCloseSaving] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/hr/business-trips/mine')
    let list: BusinessTrip[] = []
    if (res.ok) {
      const data = await res.json()
      setLinked(data.linked)
      list = data.trips ?? []
      setTrips(list)
    }
    setLoading(false)
    return list
  }, [])

  useEffect(() => { reload() }, [reload])

  function openAdd() { setForm({ destination: '', purpose: '', remark: '', startDate: '', endDate: '' }); setFormError(''); setModal(true) }

  async function save() {
    if (!form.destination.trim()) { setFormError('Please enter a destination'); return }
    if (!form.purpose.trim()) { setFormError('Please enter a purpose'); return }
    if (!form.startDate || !form.endDate) { setFormError('Please select a date range'); return }
    setSaving(true); setFormError('')
    const res = await fetch('/api/hr/business-trips/mine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setModal(false); setSaving(false); reload()
  }

  function openDetail(t: BusinessTrip) {
    setSelected(t)
    setReportDraft({ report: t.report ?? '', reportFileKeys: t.reportFileKeys })
    setReportError('')
  }

  async function saveReport() {
    if (!selected) return
    setReportSaving(true); setReportError('')
    const res = await fetch(`/api/hr/business-trips/${selected.id}/report`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reportDraft),
    })
    const data = await res.json()
    if (!res.ok) { setReportError(data.error ?? 'Failed to save report'); setReportSaving(false); return }
    setReportSaving(false)
    const list = await reload()
    setSelected(prev => (prev && list.find(t => t.id === prev.id)) ?? null)
  }

  function openReimburse() {
    setReimburseAmount(''); setReimbursePhotos([]); setReimburseNotes(''); setReimburseNotaDate('')
    setReimburseRequesterName(''); setReimburseBankName(''); setReimburseAccountNumber(''); setReimburseAccountHolderName('')
    setReimburseError(''); setReimburseModal(true)
  }

  async function submitReimburse() {
    if (!selected) return
    if (!reimburseAmount || Number(reimburseAmount) <= 0) { setReimburseError('Amount must be greater than 0'); return }
    if (reimbursePhotos.length === 0) { setReimburseError('At least one receipt photo is required'); return }
    if (!reimburseRequesterName.trim() || !reimburseBankName.trim() || !reimburseAccountNumber.trim() || !reimburseAccountHolderName.trim()) {
      setReimburseError('Please fill in your name and bank details'); return
    }
    setReimburseSaving(true); setReimburseError('')
    const res = await fetch(`/api/hr/business-trips/${selected.id}/reimbursement`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Number(reimburseAmount), notePhotoKeys: reimbursePhotos, notes: reimburseNotes || undefined, notaDate: reimburseNotaDate || undefined,
        requesterName: reimburseRequesterName, bankName: reimburseBankName, accountNumber: reimburseAccountNumber, accountHolderName: reimburseAccountHolderName,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setReimburseError(data.error ?? 'Failed to submit'); setReimburseSaving(false); return }
    setReimburseSaving(false); setReimburseModal(false)
    const list = await reload()
    setSelected(prev => (prev && list.find(t => t.id === prev.id)) ?? null)
  }

  async function closeTrip() {
    if (!selected) return
    const ok = await confirm({
      title: <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> Close this trip?</span>,
      description: `You won't be able to request another business claim for ${selected.destination} after this.`,
      confirmLabel: 'Yes, Close Trip',
    })
    if (!ok) return
    setCloseSaving(true)
    const res = await fetch(`/api/hr/business-trips/${selected.id}/close`, { method: 'PATCH' })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Failed to close'); setCloseSaving(false); return }
    setCloseSaving(false)
    const list = await reload()
    setSelected(prev => (prev && list.find(t => t.id === prev.id)) ?? null)
  }

  const days = form.startDate && form.endDate
    ? Math.max(0, Math.round((new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) / 86400000) + 1)
    : 0

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
          <h2 className="text-2xl font-bold tracking-tight">Business Trip</h2>
          <p className="text-muted-foreground text-sm mt-1">Request a business trip and track your approval status</p>
        </div>
        <div className="rounded-xl border bg-warning/10 border-warning/30 px-6 py-10 text-center">
          <ShieldAlert className="h-8 w-8 mx-auto mb-3 text-warning" />
          <p className="font-medium text-sm">Your account isn&apos;t linked to an HR employee profile yet</p>
          <p className="text-muted-foreground text-sm mt-1">Ask an Admin to link your login to an employee record under Team, then you&apos;ll be able to request a business trip here.</p>
        </div>
      </div>
    )
  }

  if (selected) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setSelected(null)} className="-ml-3 gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft /> Back to Business Trips
        </Button>

        <div className="rounded-2xl border bg-card max-w-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <h2 className="text-xl font-bold tracking-tight">{selected.destination}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{selected.purpose}</p>
            </div>
            <StatusBadge tone={STATUS_TONE[selected.status]} className="px-2.5 py-1">{statusLabel(selected)}</StatusBadge>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Dates</p>
              <p className="text-sm font-medium mt-0.5">{formatDateRange(selected.startDate, selected.endDate)}</p>
            </div>

            {selected.remark && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Remark</p>
                <p className="text-sm mt-0.5">{selected.remark}</p>
              </div>
            )}

            {selected.requiresManagerApproval && (
              <div className="text-xs">
                <p className="text-muted-foreground uppercase tracking-wide font-semibold mb-1">Manager Approval</p>
                {selected.managerApprovedAt ? (
                  <div className="text-muted-foreground">
                    Approved {formatDate(selected.managerApprovedAt)}{selected.managerApprovedBy?.name && ` by ${selected.managerApprovedBy.name}`}
                    {selected.managerDecisionNote && <p className="mt-1.5 rounded-lg bg-muted/40 px-3 py-2 text-foreground">{selected.managerDecisionNote}</p>}
                  </div>
                ) : selected.status === 'REJECTED' ? (
                  <p className="text-muted-foreground">Rejected before reaching HR.</p>
                ) : (
                  <p className="text-warning">Waiting on your manager to approve first.</p>
                )}
              </div>
            )}

            <div className="text-xs text-muted-foreground border-t pt-3">
              Requested {formatDate(selected.requestedAt)}
            </div>

            {(selected.status === 'APPROVED' || selected.status === 'REJECTED' || selected.status === 'CLOSED') && (
              <div className="text-xs text-muted-foreground">
                {selected.status === 'REJECTED' ? 'Rejected' : 'Approved'}{selected.decidedAt && ` ${formatDate(selected.decidedAt)}`}{selected.decidedBy?.name && ` by ${selected.decidedBy.name}`}
                {selected.decisionNote && <p className="mt-1.5 rounded-lg bg-muted/40 px-3 py-2 text-foreground">{selected.decisionNote}</p>}
              </div>
            )}

            {selected.status === 'CLOSED' && selected.closedAt && (
              <div className="text-xs text-muted-foreground">Closed {formatDate(selected.closedAt)}</div>
            )}
          </div>

          {(selected.status === 'APPROVED' || selected.status === 'CLOSED') && (
            <div className="border-t p-5">
              <Button variant="outline" onClick={() => window.open(`/print/business-trip-assignment/${selected.id}`, '_blank')}>
                <Printer /> Print Assignment Letter
              </Button>
            </div>
          )}

          {(selected.status === 'APPROVED' || selected.status === 'CLOSED') && (
            <div className="border-t p-5 space-y-3">
              <p id="trip-report-label" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Trip Report <span className="normal-case font-normal">(optional)</span></p>
              {reportError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{reportError}</p>}
              <Textarea rows={3} placeholder="What happened on this trip? (optional)" aria-labelledby="trip-report-label" className="resize-none"
                value={reportDraft.report} onChange={e => setReportDraft(d => ({ ...d, report: e.target.value }))} />
              <MultiFilePicker files={reportDraft.reportFileKeys} onChange={v => setReportDraft(d => ({ ...d, reportFileKeys: v }))} />
              <div className="flex justify-end">
                <Button onClick={saveReport} loading={reportSaving}>
                  {reportSaving ? 'Saving…' : 'Save Report'}
                </Button>
              </div>
            </div>
          )}

          {(selected.status === 'APPROVED' || selected.status === 'CLOSED') && (
            <div className="border-t p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Business Claims</p>
                {selected.status === 'APPROVED' && (
                  <Button size="sm" onClick={openReimburse}>
                    <Banknote /> Request Business Claim
                  </Button>
                )}
              </div>
              {selected.reimbursements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No business claims yet.</p>
              ) : (
                <div className="space-y-2">
                  {selected.reimbursements.map(r => (
                    <div key={r.id} className="rounded-lg border px-3 py-2.5 flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{formatMoney(r.amount)}</p>
                        <p className="text-xs text-muted-foreground">Requested {formatDate(r.createdAt)}{r.notaDate && ` · Receipt ${formatDate(r.notaDate)}`}</p>
                      </div>
                      <StatusBadge tone={r.status === 'PAID' ? 'success' : 'warning'}>
                        {r.status === 'PAID' ? 'Paid' : 'Waiting for Payment'}
                      </StatusBadge>
                    </div>
                  ))}
                </div>
              )}

              {selected.status === 'APPROVED' && (() => {
                const hasUnpaid = selected.reimbursements.some(r => r.status !== 'PAID')
                return (
                  <div className="flex items-center justify-between pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      {hasUnpaid ? 'Close this trip once every business claim is paid.' : 'Done with this trip?'}
                    </p>
                    {/* Disabled buttons get pointer-events: none, so the "why" tooltip lives on a wrapper */}
                    <span title={hasUnpaid ? 'You still have a business claim waiting for payment' : undefined} className="inline-flex shrink-0">
                      <Button variant="outline" size="sm" onClick={closeTrip} disabled={hasUnpaid} loading={closeSaving}
                        className="text-muted-foreground hover:bg-success/10 hover:text-success hover:border-success/30 dark:hover:bg-success/10">
                        <CheckCircle2 /> Close Trip
                      </Button>
                    </span>
                  </div>
                )
              })()}
            </div>
          )}
        </div>

        <Dialog open={reimburseModal} onOpenChange={o => { if (!o) setReimburseModal(false) }}>
          <DialogContent className="sm:max-w-md p-0 gap-0 max-h-[92vh] overflow-y-auto">
            <DialogHeader className="gap-0.5 px-5 py-4 pr-12 border-b text-left">
              <DialogTitle className="text-base">Request Business Claim</DialogTitle>
              <DialogDescription className="text-xs">{selected.destination}</DialogDescription>
            </DialogHeader>
            <div className="p-5 space-y-4">
              {reimburseError && <div className="rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm px-3 py-2">{reimburseError}</div>}

              <div className="space-y-1.5">
                <Label htmlFor="trip-claim-amount" className="gap-1">Amount <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">Rp</span>
                  <Input id="trip-claim-amount" type="text" inputMode="numeric" autoFocus
                    className="pl-9"
                    placeholder="e.g. 1.500.000"
                    value={reimburseAmount ? new Intl.NumberFormat('id-ID').format(Number(reimburseAmount)) : ''}
                    onChange={e => setReimburseAmount(e.target.value.replace(/\D/g, ''))} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="trip-claim-name" className="gap-1">Name <span className="text-destructive">*</span></Label>
                <Input id="trip-claim-name"
                  placeholder="Your full name" value={reimburseRequesterName} onChange={e => setReimburseRequesterName(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="trip-claim-bank" className="gap-1">Bank Name <span className="text-destructive">*</span></Label>
                  <Input id="trip-claim-bank"
                    placeholder="e.g. BCA, Mandiri" value={reimburseBankName} onChange={e => setReimburseBankName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="trip-claim-account-number" className="gap-1">Account Number <span className="text-destructive">*</span></Label>
                  <Input id="trip-claim-account-number"
                    placeholder="e.g. 1234567890" value={reimburseAccountNumber} onChange={e => setReimburseAccountNumber(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="trip-claim-account-holder" className="gap-1">Account Holder Name <span className="text-destructive">*</span></Label>
                <Input id="trip-claim-account-holder"
                  placeholder="Name on the bank account" value={reimburseAccountHolderName} onChange={e => setReimburseAccountHolderName(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-medium">Receipt <span className="text-destructive">*</span></p>
                <p className="text-xs text-muted-foreground">JPG, PNG, or PDF — you can attach more than one file</p>
                <MultiFilePicker files={reimbursePhotos} onChange={setReimbursePhotos} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="trip-claim-receipt-date">Receipt Date</Label>
                <Input id="trip-claim-receipt-date" type="date"
                  value={reimburseNotaDate} onChange={e => setReimburseNotaDate(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="trip-claim-notes">Notes</Label>
                <Textarea id="trip-claim-notes" rows={2} className="resize-none"
                  placeholder="What is this business claim for? (optional)" value={reimburseNotes} onChange={e => setReimburseNotes(e.target.value)} />
              </div>
            </div>
            <DialogFooter className="px-5 py-4 border-t">
              <Button variant="outline" onClick={() => setReimburseModal(false)}>Cancel</Button>
              <Button onClick={submitReimburse} loading={reimburseSaving}
                disabled={!reimburseAmount || reimbursePhotos.length === 0 || !reimburseRequesterName.trim() || !reimburseBankName.trim() || !reimburseAccountNumber.trim() || !reimburseAccountHolderName.trim()}>
                {reimburseSaving ? 'Saving…' : <><Banknote />Send to Finance</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Business Trip</h2>
          <p className="text-muted-foreground text-sm mt-1">Request a business trip and track your approval status</p>
        </div>
        <Button onClick={openAdd}>
          <Plus /> Request Business Trip
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Dates</th>
              <th className="text-left px-4 py-3 font-medium">Destination</th>
              <th className="text-left px-4 py-3 font-medium">Purpose</th>
              <th className="text-left px-4 py-3 font-medium">Remark</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {trips.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-20" />
                You haven&apos;t requested a business trip yet.
              </td></tr>
            ) : trips.map(t => (
              <tr key={t.id} className="hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => openDetail(t)}>
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDateRange(t.startDate, t.endDate)}</td>
                <td className="px-4 py-3 font-medium flex items-center gap-1.5"><Plane className="h-3.5 w-3.5 text-muted-foreground shrink-0" />{t.destination}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs max-w-48 truncate" title={t.purpose}>{t.purpose}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs max-w-48 truncate" title={t.remark ?? undefined}>{t.remark || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge tone={STATUS_TONE[t.status]}>{statusLabel(t)}</StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <Dialog open={modal} onOpenChange={o => { if (!o) setModal(false) }}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden" aria-describedby={undefined} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="flex-row items-center gap-2 px-6 py-4 pr-12 border-b text-left">
            <Plane className="h-4 w-4 text-primary-strong" />
            <DialogTitle className="text-sm font-bold">Request Business Trip</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {formError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{formError}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="trip-destination" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Destination</Label>
              <Input id="trip-destination"
                placeholder="e.g. Jakarta" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trip-purpose" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Purpose</Label>
              <Textarea id="trip-purpose" rows={2} className="resize-none"
                placeholder="What is this trip for?" value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trip-remark" className="gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Remark <span className="normal-case font-normal text-muted-foreground/70">(optional)</span></Label>
              <Textarea id="trip-remark" rows={2} className="resize-none"
                placeholder="Any additional notes (optional)" value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="trip-start-date" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Start Date</Label>
                <Input id="trip-start-date" type="date"
                  value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trip-end-date" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">End Date</Label>
                <Input id="trip-end-date" type="date"
                  value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            {days > 0 && <p className="text-xs text-muted-foreground">{days} day{days !== 1 ? 's' : ''}</p>}
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/50">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>
              {saving ? 'Submitting…' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
