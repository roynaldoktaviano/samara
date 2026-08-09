'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, MapPin, FileText, ClipboardCheck } from 'lucide-react'

interface ApprovalRequest {
  id: string
  prNumber: string
  createdAt: string
  itemCount: number
  totalBudget: number
  notes: string | null
  neededByDate: string | null
  isUrgent: boolean
  urgentReason: string | null
  deliveryLocation: { id: string; name: string } | null
  requestedByEmployee: { id: string; fullName: string; employeeNumber: string; department: string | null } | null
}

interface QuotationApprovalItem {
  id: string
  requestId: string
  itemName: string
  quantity: number
  unit: string
  estimatedCost: number
  supplierName: string | null
  selectionJustification: string | null
  quotationSubmittedAt: string
  request: { id: string; prNumber: string }
  quotationSubmittedBy: { name: string | null } | null
  quotations: { id: string; supplierName: string; price: number; submittedAt: string }[]
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function UrgentBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white animate-pulse">
      <AlertTriangle className="h-3 w-3" /> URGENT
    </span>
  )
}

export default function MyApprovalsPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [quotationItems, setQuotationItems] = useState<QuotationApprovalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<ApprovalRequest | null>(null)
  const [quoteRejectModal, setQuoteRejectModal] = useState<QuotationApprovalItem | null>(null)
  const [quoteRejectReason, setQuoteRejectReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/purchasing/my-approvals')
    if (res.ok) {
      const data = await res.json()
      setRequests(data.prApprovals ?? [])
      setQuotationItems(data.quotationApprovals ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function act(id: string, action: 'approve' | 'reject') {
    setActingId(id)
    const res = await fetch(`/api/purchasing/requests/${id}/approval`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const data = await res.json()
    setActingId(null)
    if (!res.ok) { alert(data.error ?? 'Failed to update'); return }
    setRejectModal(null)
    setRequests(prev => prev.filter(r => r.id !== id))
  }

  async function actOnQuotation(item: QuotationApprovalItem, action: 'approve' | 'reject', reason?: string) {
    setActingId(item.id)
    const res = await fetch(`/api/purchasing/requests/${item.requestId}/items/${item.id}/quotations/approval`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    })
    const data = await res.json()
    setActingId(null)
    if (!res.ok) { alert(data.error ?? 'Failed to update'); return }
    setQuoteRejectModal(null)
    setQuoteRejectReason('')
    setQuotationItems(prev => prev.filter(q => q.id !== item.id))
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">My Approvals</h2>
        <p className="text-muted-foreground text-sm mt-1">Purchase requests and supplier selections awaiting your approval</p>
      </div>

      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Purchase Requests</h3>
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">PR No.</th>
              <th className="text-left px-4 py-3 font-medium">Requester</th>
              <th className="text-left px-4 py-3 font-medium">Destination</th>
              <th className="text-center px-4 py-3 font-medium">Items</th>
              <th className="text-right px-4 py-3 font-medium">Est. Budget</th>
              <th className="text-left px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3.5" colSpan={7}><div className="h-3.5 w-full rounded bg-muted animate-pulse" /></td>
                </tr>
              ))
            ) : requests.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No PRs waiting for your approval.
              </td></tr>
            ) : requests.map(r => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-sm font-medium">
                  <span className="flex items-center gap-1.5">
                    {r.prNumber}
                    {r.isUrgent && <UrgentBadge />}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.requestedByEmployee ? `${r.requestedByEmployee.fullName}${r.requestedByEmployee.department ? ` · ${r.requestedByEmployee.department}` : ''}` : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {r.deliveryLocation ? (
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{r.deliveryLocation.name}</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-center text-muted-foreground">{r.itemCount}</td>
                <td className="px-4 py-3 text-right tabular-nums text-sm">
                  {r.totalBudget > 0 ? <span className="font-medium">Rp {new Intl.NumberFormat('id-ID').format(r.totalBudget)}</span> : <span className="text-muted-foreground/40">—</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      disabled={actingId === r.id}
                      onClick={() => act(r.id, 'approve')}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-md transition-colors whitespace-nowrap">
                      <CheckCircle2 className="h-3 w-3" /> Approve
                    </button>
                    <button
                      disabled={actingId === r.id}
                      onClick={() => setRejectModal(r)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium border rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors whitespace-nowrap">
                      <XCircle className="h-3 w-3" /> Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pt-2">Supplier Selections</h3>
      {quotationItems.length === 0 ? (
        <div className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
          <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No supplier selections waiting for your approval.
        </div>
      ) : (
        <div className="space-y-3">
          {quotationItems.map(q => {
            const cheapest = q.quotations.length ? q.quotations.reduce((a, b) => (a.price < b.price ? a : b)) : null
            return (
              <div key={q.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{q.request.prNumber}</p>
                    <p className="font-semibold text-sm mt-0.5">{q.itemName} <span className="text-muted-foreground font-normal">· {q.quantity} {q.unit}</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Submitted by {q.quotationSubmittedBy?.name ?? '—'} · {fmtDate(q.quotationSubmittedAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Chosen Supplier</p>
                    <p className="font-semibold text-sm">{q.supplierName ?? '—'}</p>
                    <p className="text-sm font-medium">Rp {new Intl.NumberFormat('id-ID').format(q.estimatedCost)}</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Quotations on file</p>
                  {q.quotations.map(quote => (
                    <div key={quote.id} className="flex items-center justify-between text-xs border rounded-md px-2.5 py-1.5">
                      <span className={quote.supplierName === q.supplierName ? 'font-semibold' : ''}>
                        {quote.supplierName}{quote.id === cheapest?.id && <span className="ml-1.5 text-green-600 font-medium">(cheapest)</span>}
                      </span>
                      <span className="font-medium">Rp {new Intl.NumberFormat('id-ID').format(quote.price)}</span>
                    </div>
                  ))}
                </div>

                {q.selectionJustification && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                    <span className="font-semibold">Reason: </span>{q.selectionJustification}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    disabled={actingId === q.id}
                    onClick={() => actOnQuotation(q, 'approve')}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-md transition-colors">
                    <CheckCircle2 className="h-3 w-3" /> Approve
                  </button>
                  <button
                    disabled={actingId === q.id}
                    onClick={() => { setQuoteRejectModal(q); setQuoteRejectReason('') }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors">
                    <XCircle className="h-3 w-3" /> Reject
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {quoteRejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h3 className="font-semibold text-base">Reject supplier for &quot;{quoteRejectModal.itemName}&quot;?</h3>
            </div>
            <div className="px-6 py-4 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Reason (required)</label>
              <textarea
                rows={3}
                autoFocus
                value={quoteRejectReason}
                onChange={e => setQuoteRejectReason(e.target.value)}
                placeholder="Why is this supplier selection being rejected?"
                className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setQuoteRejectModal(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
              <button
                disabled={actingId === quoteRejectModal.id || !quoteRejectReason.trim()}
                onClick={() => actOnQuotation(quoteRejectModal, 'reject', quoteRejectReason)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                Yes, Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h3 className="font-semibold text-base">Reject {rejectModal.prNumber}?</h3>
            </div>
            <div className="px-6 py-5 text-sm text-muted-foreground">
              The requester will be notified that this request was rejected. If it's still needed, they'll need to submit a new PR.
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setRejectModal(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
              <button
                disabled={actingId === rejectModal.id}
                onClick={() => act(rejectModal.id, 'reject')}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                Yes, Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
