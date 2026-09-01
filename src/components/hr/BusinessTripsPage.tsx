'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plane, X, Check, ThumbsUp, ThumbsDown, ClipboardList, ArrowLeft, FileText } from 'lucide-react'
import { FilePreview } from '@/components/ui/file-preview'

interface EmployeeLite { id: string; fullName: string; employeeNumber: string }
interface BusinessTrip {
  id: string
  employee: EmployeeLite
  destination: string
  purpose: string
  startDate: string; endDate: string
  status: 'PENDING' | 'PENDING_HR_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CLOSED'
  requestedBy: { id: string; name: string | null } | null
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
  reimbursements: { id: string; amount: number; status: string }[]
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

export default function BusinessTripsPage() {
  const [trips, setTrips] = useState<BusinessTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'All' | 'PENDING' | 'APPROVED' | 'CLOSED' | 'REJECTED'>('All')

  const [decision, setDecision] = useState<{ trip: BusinessTrip; action: 'approve' | 'reject' } | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [deciding, setDeciding] = useState(false)

  const [selected, setSelected] = useState<BusinessTrip | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/hr/business-trips')
    const list: BusinessTrip[] = res.ok ? await res.json() : []
    setTrips(list)
    setLoading(false)
    return list
  }, [])

  useEffect(() => { load() }, [load])

  async function decide() {
    if (!decision) return
    setDeciding(true)
    await fetch(`/api/hr/business-trips/${decision.trip.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: decision.action, decisionNote }),
    })
    setDeciding(false); setDecision(null); setDecisionNote('')
    const list = await load()
    setSelected(prev => (prev && list.find(t => t.id === prev.id)) ?? null)
  }

  // "Pending" buckets both PENDING (still with the manager, if requiresManagerApproval)
  // and PENDING_HR_APPROVAL (that stage cleared, now with HR).
  const filtered = statusFilter === 'All' ? trips
    : statusFilter === 'PENDING' ? trips.filter(t => t.status === 'PENDING' || t.status === 'PENDING_HR_APPROVAL')
    : trips.filter(t => t.status === statusFilter)
  const counts = {
    All: trips.length,
    PENDING: trips.filter(t => t.status === 'PENDING' || t.status === 'PENDING_HR_APPROVAL').length,
    APPROVED: trips.filter(t => t.status === 'APPROVED').length,
    CLOSED: trips.filter(t => t.status === 'CLOSED').length,
    REJECTED: trips.filter(t => t.status === 'REJECTED').length,
  }

  return (
    <div className="space-y-6">
      {selected ? (
        <>
          <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Business Trips
          </button>

          <div className="rounded-2xl border bg-card max-w-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="text-xl font-bold tracking-tight">{selected.employee.fullName}</h2>
                <p className="text-sm text-muted-foreground mt-0.5 font-mono">{selected.employee.employeeNumber}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[selected.status]}`}>{statusLabel(selected)}</span>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Destination</p>
                  <p className="text-sm font-medium mt-0.5">{selected.destination}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Dates</p>
                  <p className="text-sm font-medium mt-0.5">{fmtDate(selected.startDate)} – {fmtDate(selected.endDate)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Purpose</p>
                <p className="text-sm">{selected.purpose}</p>
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
                    <p className="text-amber-700">Waiting on the employee&apos;s manager to approve first.</p>
                  )}
                </div>
              )}

              <div className="text-xs text-muted-foreground border-t pt-3">
                Requested {fmtDate(selected.requestedAt)}{selected.requestedBy?.name && ` by ${selected.requestedBy.name}`}
              </div>

              {(selected.status === 'APPROVED' || selected.status === 'REJECTED' || selected.status === 'CLOSED') && (
                <div className="text-xs text-muted-foreground">
                  {selected.status === 'REJECTED' ? 'Rejected' : 'Approved'}{selected.decidedAt && ` ${fmtDate(selected.decidedAt)}`}{selected.decidedBy?.name && ` by ${selected.decidedBy.name}`}
                  {selected.decisionNote && <p className="mt-1.5 rounded-lg bg-muted/40 px-3 py-2 text-foreground">{selected.decisionNote}</p>}
                </div>
              )}

              {selected.status === 'CLOSED' && selected.closedAt && (
                <div className="text-xs text-muted-foreground">Closed by requester {fmtDate(selected.closedAt)}</div>
              )}

              {selected.report && (
                <div className="text-xs border-t pt-3">
                  <p className="text-muted-foreground uppercase tracking-wide font-semibold mb-1 flex items-center gap-1"><FileText className="h-3 w-3" /> Trip Report</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{selected.report}</p>
                  {selected.reportFileKeys.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {selected.reportFileKeys.map((k, i) => (
                        <FilePreview key={i} src={k} alt={`Report attachment ${i + 1}`} className="w-full h-24 rounded-lg object-cover border" />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selected.reimbursements.length > 0 && (
                <div className="text-xs border-t pt-3">
                  <p className="text-muted-foreground uppercase tracking-wide font-semibold mb-1.5">Reimbursements</p>
                  <div className="space-y-1">
                    {selected.reimbursements.map(r => (
                      <p key={r.id} className="text-sm flex items-center justify-between">
                        <span>{fmtMoney(r.amount)}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {r.status === 'PAID' ? 'Paid' : 'Waiting for Payment'}
                        </span>
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {(selected.status === 'PENDING_HR_APPROVAL' || (selected.status === 'PENDING' && !selected.requiresManagerApproval)) && (
              <div className="flex justify-end gap-2 px-5 py-4 border-t">
                <button onClick={() => setDecision({ trip: selected, action: 'reject' })}
                  className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-red-50 hover:text-destructive hover:border-red-200 font-medium transition-colors">
                  <ThumbsDown className="h-3.5 w-3.5" /> Reject
                </button>
                <button onClick={() => setDecision({ trip: selected, action: 'approve' })}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition-colors">
                  <ThumbsUp className="h-3.5 w-3.5" /> Approve
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Business Trips</h2>
            <p className="text-muted-foreground text-sm mt-1">Employee business trip requests and approvals</p>
          </div>

          <div className="flex gap-1 border-b overflow-x-auto">
            {(['All', 'PENDING', 'APPROVED', 'CLOSED', 'REJECTED'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                  statusFilter === s ? 'border-amber-500 text-amber-700' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                {s === 'All' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                {counts[s] > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusFilter === s ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
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
                    <th className="text-left px-4 py-3 font-medium">Destination</th>
                    <th className="text-left px-4 py-3 font-medium">Dates</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Requested By</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                      <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      No business trips {statusFilter !== 'All' ? `with status "${statusFilter}"` : 'yet'}.
                    </td></tr>
                  ) : filtered.map(t => (
                    <tr key={t.id} className="hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelected(t)}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{t.employee.fullName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{t.employee.employeeNumber}</p>
                      </td>
                      <td className="px-4 py-3 flex items-center gap-1.5"><Plane className="h-3.5 w-3.5 text-muted-foreground shrink-0" />{t.destination}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(t.startDate)} – {fmtDate(t.endDate)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[t.status]}`}>{statusLabel(t)}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{t.requestedBy?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </>
      )}

      {/* ── Approve/Reject Modal ── */}
      {decision && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                {decision.action === 'approve' ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-red-600" />}
                {decision.action === 'approve' ? 'Approve' : 'Reject'} business trip
              </h3>
              <p className="text-sm text-muted-foreground">
                {decision.trip.employee.fullName} — {decision.trip.destination} ({fmtDate(decision.trip.startDate)} – {fmtDate(decision.trip.endDate)})
              </p>
              <textarea rows={2} placeholder={decision.action === 'reject' ? 'Reason (optional)' : 'Note (optional)'}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                value={decisionNote} onChange={e => setDecisionNote(e.target.value)} />
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => { setDecision(null); setDecisionNote('') }} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={decide} disabled={deciding}
                className={`px-5 py-2 text-sm text-white rounded-lg font-semibold disabled:opacity-50 transition-colors ${decision.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-destructive hover:bg-destructive/90'}`}>
                {deciding ? 'Saving...' : decision.action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
