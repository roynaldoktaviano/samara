'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plane, X, Check, ThumbsUp, ThumbsDown, ClipboardList, ArrowLeft, FileText, Printer } from 'lucide-react'
import { FilePreview } from '@/components/ui/file-preview'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatDateRange, formatMoney } from '@/lib/format'

interface EmployeeLite { id: string; fullName: string; employeeNumber: string }
interface BusinessTrip {
  id: string
  employee: EmployeeLite
  destination: string
  purpose: string
  remark: string | null
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
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="-ml-2.5 text-muted-foreground">
            <ArrowLeft /> Back to Business Trips
          </Button>

          <div className="rounded-2xl border bg-card max-w-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="text-xl font-bold tracking-tight">{selected.employee.fullName}</h2>
                <p className="text-sm text-muted-foreground mt-0.5 font-mono">{selected.employee.employeeNumber}</p>
              </div>
              <StatusBadge tone={STATUS_TONE[selected.status]} className="px-2.5 py-1">{statusLabel(selected)}</StatusBadge>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Destination</p>
                  <p className="text-sm font-medium mt-0.5">{selected.destination}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Dates</p>
                  <p className="text-sm font-medium mt-0.5">{formatDateRange(selected.startDate, selected.endDate)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Purpose</p>
                <p className="text-sm">{selected.purpose}</p>
              </div>

              {selected.remark && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Remark</p>
                  <p className="text-sm">{selected.remark}</p>
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
                    <p className="text-warning">Waiting on the employee&apos;s manager to approve first.</p>
                  )}
                </div>
              )}

              <div className="text-xs text-muted-foreground border-t pt-3">
                Requested {formatDate(selected.requestedAt)}{selected.requestedBy?.name && ` by ${selected.requestedBy.name}`}
              </div>

              {(selected.status === 'APPROVED' || selected.status === 'REJECTED' || selected.status === 'CLOSED') && (
                <div className="text-xs text-muted-foreground">
                  {selected.status === 'REJECTED' ? 'Rejected' : 'Approved'}{selected.decidedAt && ` ${formatDate(selected.decidedAt)}`}{selected.decidedBy?.name && ` by ${selected.decidedBy.name}`}
                  {selected.decisionNote && <p className="mt-1.5 rounded-lg bg-muted/40 px-3 py-2 text-foreground">{selected.decisionNote}</p>}
                </div>
              )}

              {selected.status === 'CLOSED' && selected.closedAt && (
                <div className="text-xs text-muted-foreground">Closed by requester {formatDate(selected.closedAt)}</div>
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
                  <p className="text-muted-foreground uppercase tracking-wide font-semibold mb-1.5">Business Claims</p>
                  <div className="space-y-1">
                    {selected.reimbursements.map(r => (
                      <p key={r.id} className="text-sm flex items-center justify-between">
                        <span>{formatMoney(r.amount)}</span>
                        <StatusBadge tone={r.status === 'PAID' ? 'success' : 'warning'}>
                          {r.status === 'PAID' ? 'Paid' : 'Waiting for Payment'}
                        </StatusBadge>
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {(selected.status === 'PENDING_HR_APPROVAL' || (selected.status === 'PENDING' && !selected.requiresManagerApproval)) && (
              <div className="flex justify-end gap-2 px-5 py-4 border-t">
                <Button variant="outline" onClick={() => setDecision({ trip: selected, action: 'reject' })}
                  className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30">
                  <ThumbsDown className="size-3.5" /> Reject
                </Button>
                <Button variant="success" onClick={() => setDecision({ trip: selected, action: 'approve' })} className="font-semibold">
                  <ThumbsUp className="size-3.5" /> Approve
                </Button>
              </div>
            )}

            {(selected.status === 'APPROVED' || selected.status === 'CLOSED') && (
              <div className="flex justify-end px-5 py-4 border-t">
                <Button variant="outline" onClick={() => window.open(`/print/business-trip-assignment/${selected.id}`, '_blank')}>
                  <Printer className="size-3.5" /> Print Assignment Letter
                </Button>
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
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDateRange(t.startDate, t.endDate)}</td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge tone={STATUS_TONE[t.status]}>{statusLabel(t)}</StatusBadge>
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
      <Dialog open={!!decision} onOpenChange={o => { if (!o) { setDecision(null); setDecisionNote('') } }}>
        <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden" onInteractOutside={e => e.preventDefault()}>
          {decision && (
            <>
              <div className="px-6 py-5 space-y-3">
                <DialogTitle className="font-bold text-sm flex items-center gap-2 pr-6">
                  {decision.action === 'approve' ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-destructive" />}
                  {decision.action === 'approve' ? 'Approve' : 'Reject'} business trip
                </DialogTitle>
                <DialogDescription>
                  {decision.trip.employee.fullName} — {decision.trip.destination} ({formatDateRange(decision.trip.startDate, decision.trip.endDate)})
                </DialogDescription>
                <Textarea rows={2} placeholder={decision.action === 'reject' ? 'Reason (optional)' : 'Note (optional)'}
                  aria-label={decision.action === 'reject' ? 'Reason (optional)' : 'Note (optional)'}
                  className="resize-none"
                  value={decisionNote} onChange={e => setDecisionNote(e.target.value)} />
              </div>
              <DialogFooter className="px-6 py-4 border-t bg-muted/50">
                <Button variant="outline" onClick={() => { setDecision(null); setDecisionNote('') }}>Cancel</Button>
                <Button onClick={decide} loading={deciding}
                  variant={decision.action === 'approve' ? 'success' : 'destructive'} className="font-semibold">
                  {deciding ? 'Saving…' : decision.action === 'approve' ? 'Approve' : 'Reject'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
