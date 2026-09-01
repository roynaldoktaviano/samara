'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Plane, ClipboardList, ShieldAlert, ArrowLeft, Banknote, FileText, CheckCircle2 } from 'lucide-react'
import { MultiFilePicker } from '@/components/ui/file-preview'

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

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  PENDING_HR_APPROVAL: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CLOSED: 'bg-gray-200 text-gray-700',
}

function statusLabel(t: BusinessTrip): string {
  if (t.status === 'PENDING') return t.requiresManagerApproval ? 'Awaiting Manager' : 'Pending'
  if (t.status === 'PENDING_HR_APPROVAL') return 'Awaiting HR'
  return t.status.charAt(0) + t.status.slice(1).toLowerCase()
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)

export default function MyBusinessTripsPage() {
  const [loading, setLoading] = useState(true)
  const [linked, setLinked] = useState(true)
  const [trips, setTrips] = useState<BusinessTrip[]>([])
  const [selected, setSelected] = useState<BusinessTrip | null>(null)

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ destination: '', purpose: '', startDate: '', endDate: '' })
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

  const [closeModal, setCloseModal] = useState(false)
  const [closeSaving, setCloseSaving] = useState(false)
  const [closeError, setCloseError] = useState('')

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

  function openAdd() { setForm({ destination: '', purpose: '', startDate: '', endDate: '' }); setFormError(''); setModal(true) }

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
    if (reimbursePhotos.length === 0) { setReimburseError('At least one receipt/nota photo is required'); return }
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
    setCloseSaving(true); setCloseError('')
    const res = await fetch(`/api/hr/business-trips/${selected.id}/close`, { method: 'PATCH' })
    const data = await res.json()
    if (!res.ok) { setCloseError(data.error ?? 'Failed to close'); setCloseSaving(false); return }
    setCloseSaving(false); setCloseModal(false)
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
        <div className="rounded-xl border bg-amber-50 border-amber-200 px-6 py-10 text-center">
          <ShieldAlert className="h-8 w-8 mx-auto mb-3 text-amber-600" />
          <p className="font-medium text-sm">Your account isn&apos;t linked to an HR employee profile yet</p>
          <p className="text-muted-foreground text-sm mt-1">Ask an Admin to link your login to an employee record under Team, then you&apos;ll be able to request a business trip here.</p>
        </div>
      </div>
    )
  }

  if (selected) {
    return (
      <div className="space-y-6">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Business Trips
        </button>

        <div className="rounded-2xl border bg-card max-w-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <h2 className="text-xl font-bold tracking-tight">{selected.destination}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{selected.purpose}</p>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[selected.status]}`}>{statusLabel(selected)}</span>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Dates</p>
              <p className="text-sm font-medium mt-0.5">{fmtDate(selected.startDate)} – {fmtDate(selected.endDate)}</p>
            </div>

            {selected.requiresManagerApproval && (
              <div className="text-xs">
                <p className="text-muted-foreground uppercase tracking-wide font-semibold mb-1">Manager Approval</p>
                {selected.managerApprovedAt ? (
                  <div className="text-muted-foreground">
                    Approved {fmtDate(selected.managerApprovedAt)}{selected.managerApprovedBy?.name && ` by ${selected.managerApprovedBy.name}`}
                    {selected.managerDecisionNote && <p className="mt-1.5 rounded-lg bg-muted/40 px-3 py-2 text-foreground">{selected.managerDecisionNote}</p>}
                  </div>
                ) : selected.status === 'REJECTED' ? (
                  <p className="text-muted-foreground">Rejected before reaching HR.</p>
                ) : (
                  <p className="text-amber-700">Waiting on your manager to approve first.</p>
                )}
              </div>
            )}

            <div className="text-xs text-muted-foreground border-t pt-3">
              Requested {fmtDate(selected.requestedAt)}
            </div>

            {(selected.status === 'APPROVED' || selected.status === 'REJECTED' || selected.status === 'CLOSED') && (
              <div className="text-xs text-muted-foreground">
                {selected.status === 'REJECTED' ? 'Rejected' : 'Approved'}{selected.decidedAt && ` ${fmtDate(selected.decidedAt)}`}{selected.decidedBy?.name && ` by ${selected.decidedBy.name}`}
                {selected.decisionNote && <p className="mt-1.5 rounded-lg bg-muted/40 px-3 py-2 text-foreground">{selected.decisionNote}</p>}
              </div>
            )}

            {selected.status === 'CLOSED' && selected.closedAt && (
              <div className="text-xs text-muted-foreground">Closed {fmtDate(selected.closedAt)}</div>
            )}
          </div>

          {(selected.status === 'APPROVED' || selected.status === 'CLOSED') && (
            <div className="border-t p-5 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Trip Report <span className="normal-case font-normal">(optional)</span></p>
              {reportError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{reportError}</p>}
              <textarea rows={3} placeholder="What happened on this trip? (optional)"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                value={reportDraft.report} onChange={e => setReportDraft(d => ({ ...d, report: e.target.value }))} />
              <MultiFilePicker files={reportDraft.reportFileKeys} onChange={v => setReportDraft(d => ({ ...d, reportFileKeys: v }))} />
              <div className="flex justify-end">
                <button onClick={saveReport} disabled={reportSaving} className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
                  {reportSaving ? 'Saving...' : 'Save Report'}
                </button>
              </div>
            </div>
          )}

          {(selected.status === 'APPROVED' || selected.status === 'CLOSED') && (
            <div className="border-t p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reimbursements</p>
                {selected.status === 'APPROVED' && (
                  <button onClick={openReimburse} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-md transition-colors">
                    <Banknote className="h-3.5 w-3.5" /> Request Reimbursement
                  </button>
                )}
              </div>
              {selected.reimbursements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reimbursement claims yet.</p>
              ) : (
                <div className="space-y-2">
                  {selected.reimbursements.map(r => (
                    <div key={r.id} className="rounded-lg border px-3 py-2.5 flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{fmtMoney(r.amount)}</p>
                        <p className="text-xs text-muted-foreground">Requested {fmtDate(r.createdAt)}{r.notaDate && ` · Nota ${fmtDate(r.notaDate)}`}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.status === 'PAID' ? 'Paid' : 'Waiting for Payment'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {selected.status === 'APPROVED' && (() => {
                const hasUnpaid = selected.reimbursements.some(r => r.status !== 'PAID')
                return (
                  <div className="flex items-center justify-between pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      {hasUnpaid ? 'Close this trip once every reimbursement is paid.' : 'Done with this trip?'}
                    </p>
                    <button onClick={() => { setCloseError(''); setCloseModal(true) }} disabled={hasUnpaid}
                      title={hasUnpaid ? 'You still have a reimbursement waiting for payment' : undefined}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md text-muted-foreground hover:bg-green-50 hover:text-green-700 hover:border-green-200 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:hover:border-border transition-colors">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Close Trip
                    </button>
                  </div>
                )
              })()}
            </div>
          )}
        </div>

        {reimburseModal && (
          <>
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setReimburseModal(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                  <div>
                    <h3 className="font-semibold">Request Reimbursement</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{selected.destination}</p>
                  </div>
                  <button onClick={() => setReimburseModal(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
                </div>
                <div className="p-5 space-y-4">
                  {reimburseError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{reimburseError}</div>}

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Amount <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
                      <input type="text" inputMode="numeric" autoFocus
                        className="w-full h-10 border rounded-lg pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="e.g. 1.500.000"
                        value={reimburseAmount ? new Intl.NumberFormat('id-ID').format(Number(reimburseAmount)) : ''}
                        onChange={e => setReimburseAmount(e.target.value.replace(/\D/g, ''))} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Name <span className="text-red-500">*</span></label>
                    <input className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="Your full name" value={reimburseRequesterName} onChange={e => setReimburseRequesterName(e.target.value)} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Bank Name <span className="text-red-500">*</span></label>
                      <input className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="e.g. BCA, Mandiri" value={reimburseBankName} onChange={e => setReimburseBankName(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Account Number <span className="text-red-500">*</span></label>
                      <input className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="e.g. 1234567890" value={reimburseAccountNumber} onChange={e => setReimburseAccountNumber(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Account Holder Name <span className="text-red-500">*</span></label>
                    <input className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="Name on the bank account" value={reimburseAccountHolderName} onChange={e => setReimburseAccountHolderName(e.target.value)} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Receipt / Nota <span className="text-red-500">*</span></label>
                    <p className="text-xs text-muted-foreground">JPG, PNG, or PDF — you can attach more than one file</p>
                    <MultiFilePicker files={reimbursePhotos} onChange={setReimbursePhotos} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Nota Date</label>
                    <input type="date" className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      value={reimburseNotaDate} onChange={e => setReimburseNotaDate(e.target.value)} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Notes</label>
                    <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="What is this reimbursement for? (optional)" value={reimburseNotes} onChange={e => setReimburseNotes(e.target.value)} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 px-5 py-4 border-t">
                  <button onClick={() => setReimburseModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                  <button onClick={submitReimburse}
                    disabled={!reimburseAmount || reimbursePhotos.length === 0 || !reimburseRequesterName.trim() || !reimburseBankName.trim() || !reimburseAccountNumber.trim() || !reimburseAccountHolderName.trim() || reimburseSaving}
                    className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 font-semibold transition-colors">
                    {reimburseSaving ? 'Saving...' : <><Banknote className="h-3.5 w-3.5" />Send to Finance</>}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {closeModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="px-6 py-5 space-y-2">
                <h3 className="font-bold text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /> Close this trip?</h3>
                <p className="text-sm text-muted-foreground">You won&apos;t be able to request another reimbursement for {selected.destination} after this.</p>
                {closeError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{closeError}</p>}
              </div>
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
                <button onClick={() => setCloseModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
                <button onClick={closeTrip} disabled={closeSaving}
                  className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {closeSaving ? 'Closing...' : 'Yes, Close Trip'}
                </button>
              </div>
            </div>
          </div>
        )}
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
        <button onClick={openAdd} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> Request Business Trip
        </button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Destination</th>
              <th className="text-left px-4 py-3 font-medium">Purpose</th>
              <th className="text-left px-4 py-3 font-medium">Dates</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Reimbursements</th>
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
                <td className="px-4 py-3 font-medium flex items-center gap-1.5"><Plane className="h-3.5 w-3.5 text-muted-foreground shrink-0" />{t.destination}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs max-w-48 truncate" title={t.purpose}>{t.purpose}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(t.startDate)} – {fmtDate(t.endDate)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[t.status]}`}>{statusLabel(t)}</span>
                </td>
                <td className="px-4 py-3 text-right text-xs text-muted-foreground">{t.reimbursements.length || '—'}</td>
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
                <Plane className="h-4 w-4 text-amber-600" />
                <h3 className="font-bold text-sm">Request Business Trip</h3>
              </div>
              <button onClick={() => setModal(false)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Destination</label>
                <input className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="e.g. Jakarta" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Purpose</label>
                <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                  placeholder="What is this trip for?" value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} />
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
              {days > 0 && <p className="text-xs text-muted-foreground">{days} day{days !== 1 ? 's' : ''}</p>}
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
    </div>
  )
}
