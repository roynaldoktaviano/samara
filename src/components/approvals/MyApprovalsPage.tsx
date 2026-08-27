'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, MapPin, FileText, ClipboardCheck, X, Download } from 'lucide-react'
import { FilePreview } from '@/components/ui/file-preview'
import { isPdfDataUrl, downloadDataUrl, extFromDataUrl } from '@/lib/fileUpload'

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

interface RequestDetailItem {
  id: string
  itemName: string
  quantity: number
  unit: string
  estimatedCost: number
  supplierName: string | null
  notes: string | null
}

interface RequestDetail extends ApprovalRequest {
  purpose: 'STOCK_INVENTORY' | 'TRIP'
  tripBooking: { id: string; bookingCode: string; yacht: { name: string } | null } | null
  items: RequestDetailItem[]
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
  quotations: { id: string; supplierId: string | null; supplierName: string; price: number; submittedAt: string; fileKey: string | null }[]
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
  const [detailModal, setDetailModal] = useState<ApprovalRequest | null>(null)
  const [detail, setDetail] = useState<RequestDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [quoteRejectModal, setQuoteRejectModal] = useState<QuotationApprovalItem | null>(null)
  const [quoteRejectReason, setQuoteRejectReason] = useState('')
  // Which quotation the approver has picked for each pending item — this is the approver's
  // own decision, not something Purchasing set; nothing is pre-selected.
  const [chosenQuotation, setChosenQuotation] = useState<Record<string, string>>({})
  const [fileLightbox, setFileLightbox] = useState<string | null>(null)

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

  async function openDetail(r: ApprovalRequest) {
    setDetailModal(r)
    setDetail(null)
    setDetailLoading(true)
    const res = await fetch(`/api/purchasing/requests/${r.id}`)
    if (res.ok) setDetail(await res.json())
    setDetailLoading(false)
  }

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
    if (detailModal?.id === id) { setDetailModal(null); setDetail(null) }
    setRequests(prev => prev.filter(r => r.id !== id))
  }

  async function actOnQuotation(item: QuotationApprovalItem, action: 'approve' | 'reject', reason?: string) {
    setActingId(item.id)
    const res = await fetch(`/api/purchasing/requests/${item.requestId}/items/${item.id}/quotations/approval`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason, quotationId: action === 'approve' ? chosenQuotation[item.id] : undefined }),
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
      {/* Desktop table — full column set, only makes sense at desktop+ width */}
      <div className="hidden desktop:block rounded-lg border overflow-hidden">
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
              <tr key={r.id} onClick={() => openDetail(r)} className="hover:bg-muted/30 cursor-pointer">
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
                      onClick={e => { e.stopPropagation(); act(r.id, 'approve') }}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-md transition-colors whitespace-nowrap">
                      <CheckCircle2 className="h-3 w-3" /> Approve
                    </button>
                    <button
                      disabled={actingId === r.id}
                      onClick={e => { e.stopPropagation(); setRejectModal(r) }}
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

      {/* Tablet/mobile card layout — one PR per card, Approve/Reject inline */}
      <div className="desktop:hidden space-y-2">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2 animate-pulse">
              <div className="h-3.5 w-32 rounded bg-muted" />
              <div className="h-3.5 w-48 rounded bg-muted" />
            </div>
          ))
        ) : requests.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm border rounded-lg">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No PRs waiting for your approval.
          </div>
        ) : requests.map(r => (
          <div key={r.id} className="rounded-lg border p-3 space-y-2">
            <button onClick={() => openDetail(r)} className="w-full text-left space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold flex items-center gap-1.5">
                  {r.prNumber}
                  {r.isUrgent && <UrgentBadge />}
                </span>
                {r.totalBudget > 0 && (
                  <span className="text-xs font-medium tabular-nums shrink-0">Rp {new Intl.NumberFormat('id-ID').format(r.totalBudget)}</span>
                )}
              </div>
              <p className="text-sm text-foreground">
                {r.requestedByEmployee ? `${r.requestedByEmployee.fullName}${r.requestedByEmployee.department ? ` · ${r.requestedByEmployee.department}` : ''}` : '—'}
              </p>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                {r.deliveryLocation ? (
                  <span className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3 shrink-0" />{r.deliveryLocation.name}</span>
                ) : <span />}
                <span className="shrink-0">{r.itemCount} item{r.itemCount !== 1 ? 's' : ''} · {fmtDate(r.createdAt)}</span>
              </div>
            </button>
            <div className="flex items-center gap-2 pt-1">
              <button
                disabled={actingId === r.id}
                onClick={() => act(r.id, 'approve')}
                className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-md transition-colors">
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
              </button>
              <button
                disabled={actingId === r.id}
                onClick={() => setRejectModal(r)}
                className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium border rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors">
                <XCircle className="h-3.5 w-3.5" /> Reject
              </button>
            </div>
          </div>
        ))}
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
            const chosenId = chosenQuotation[q.id]
            return (
              <div key={q.id} className="rounded-lg border p-4 space-y-3">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{q.request.prNumber}</p>
                  <p className="font-semibold text-sm mt-0.5">{q.itemName} <span className="text-muted-foreground font-normal">· {q.quantity} {q.unit}</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Submitted by {q.quotationSubmittedBy?.name ?? '—'} · {fmtDate(q.quotationSubmittedAt)}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Pick which quotation to use</p>
                  <div className="grid grid-cols-5 gap-3">
                  {q.quotations.map(quote => {
                    const isChosen = quote.id === chosenId
                    return (
                      <div key={quote.id} className={`border rounded-md overflow-hidden text-xs ${isChosen ? 'border-green-400 bg-green-50' : ''}`}>
                        {quote.fileKey ? (
                          <div className="relative">
                            <FilePreview
                              src={quote.fileKey}
                              alt="Quotation document"
                              onClick={() => setFileLightbox(quote.fileKey)}
                              className="w-full h-20 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                            />
                            <button
                              onClick={() => downloadDataUrl(quote.fileKey!, `${quote.supplierName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-quotation.${extFromDataUrl(quote.fileKey!)}`)}
                              title="Download quotation document"
                              className="absolute top-1 right-1 bg-white/90 hover:bg-white text-foreground rounded-full p-1 shadow transition-colors"
                            >
                              <Download className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="w-full h-20 border-b border-dashed flex items-center justify-center text-[11px] text-muted-foreground/60 italic">No document</div>
                        )}
                        <div className="px-3 py-3 space-y-2.5">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className={`truncate ${isChosen ? 'font-semibold' : ''}`}>{quote.supplierName}</span>
                            <span className="font-medium shrink-0">Rp {new Intl.NumberFormat('id-ID').format(quote.price)}</span>
                          </div>
                          {isChosen ? (
                            <div className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-green-600 rounded-md py-2">
                              <CheckCircle2 className="h-4 w-4" /> Chosen
                            </div>
                          ) : (
                            <button onClick={() => setChosenQuotation(prev => ({ ...prev, [q.id]: quote.id }))}
                              className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md py-2 transition-colors shadow-sm">
                              Use this quote
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  {!chosenId && <p className="text-[11px] text-muted-foreground italic mr-auto">Pick a quotation above first.</p>}
                  <button
                    disabled={actingId === q.id || !chosenId}
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


      {detailModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b flex items-start justify-between shrink-0">
              <div>
                <h3 className="font-semibold text-base flex items-center gap-1.5">
                  {detailModal.prNumber}
                  {detailModal.isUrgent && <UrgentBadge />}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {detailModal.requestedByEmployee ? `${detailModal.requestedByEmployee.fullName}${detailModal.requestedByEmployee.department ? ` · ${detailModal.requestedByEmployee.department}` : ''}` : '—'}
                  {' · '}{fmtDate(detailModal.createdAt)}
                </p>
              </div>
              <button onClick={() => { setDetailModal(null); setDetail(null) }} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4 overflow-y-auto">
              {detailLoading || !detail ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-4 w-full rounded bg-muted animate-pulse" />)}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Destination</p>
                      <p className="mt-0.5 flex items-center gap-1">
                        {detail.deliveryLocation ? <><MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />{detail.deliveryLocation.name}</> : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Needed By</p>
                      <p className="mt-0.5">{detail.neededByDate ? fmtDate(detail.neededByDate) : '—'}</p>
                    </div>
                    {detail.purpose === 'TRIP' && detail.tripBooking && (
                      <div className="col-span-2">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Trip</p>
                        <p className="mt-0.5">{detail.tripBooking.bookingCode}{detail.tripBooking.yacht ? ` — ${detail.tripBooking.yacht.name}` : ''}</p>
                      </div>
                    )}
                  </div>

                  {detail.isUrgent && detail.urgentReason && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wide">Why urgent</p>
                      <p className="text-sm text-red-700 mt-0.5">{detail.urgentReason}</p>
                    </div>
                  )}

                  {detail.notes && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Notes</p>
                      <p className="text-sm mt-0.5 whitespace-pre-wrap">{detail.notes}</p>
                    </div>
                  )}

                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Items ({detail.items.length})</p>
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium">Item</th>
                            <th className="text-right px-3 py-2 font-medium">Qty</th>
                            <th className="text-right px-3 py-2 font-medium">Est. Cost</th>
                            <th className="text-left px-3 py-2 font-medium">Supplier</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {detail.items.map(item => (
                            <tr key={item.id}>
                              <td className="px-3 py-2">
                                <p>{item.itemName}</p>
                                {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">{item.quantity} {item.unit}</td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                {item.estimatedCost > 0 ? `Rp ${new Intl.NumberFormat('id-ID').format(item.estimatedCost)}` : <span className="text-muted-foreground/40">—</span>}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{item.supplierName ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                        {detail.totalBudget > 0 && (
                          <tfoot>
                            <tr className="border-t bg-muted/30 font-medium">
                              <td className="px-3 py-2" colSpan={2}>Total</td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">Rp {new Intl.NumberFormat('id-ID').format(detail.totalBudget)}</td>
                              <td />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-2 shrink-0">
              <button onClick={() => { setDetailModal(null); setDetail(null) }} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Close</button>
              <button
                disabled={actingId === detailModal.id}
                onClick={() => { setRejectModal(detailModal); setDetailModal(null) }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors">
                <XCircle className="h-3.5 w-3.5" /> Reject
              </button>
              <button
                disabled={actingId === detailModal.id}
                onClick={() => act(detailModal.id, 'approve')}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors">
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {fileLightbox && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={() => setFileLightbox(null)}>
          <div className="relative inline-block" onClick={e => e.stopPropagation()}>
            {isPdfDataUrl(fileLightbox) ? (
              <div className="bg-white rounded-xl shadow-2xl overflow-hidden w-[90vw] max-w-2xl">
                <embed src={fileLightbox} type="application/pdf" className="w-full h-[75vh]" />
                <div className="p-3 flex justify-center">
                  <a href={fileLightbox} target="_blank" rel="noopener noreferrer" className="text-sm text-amber-700 hover:text-amber-900 font-medium underline underline-offset-2">
                    Open PDF in new tab
                  </a>
                </div>
              </div>
            ) : (
              <img src={fileLightbox} alt="Quotation document" className="block max-w-[90vw] max-h-[85vh] w-auto h-auto rounded-xl shadow-2xl object-contain" />
            )}
            <button onClick={() => setFileLightbox(null)} className="absolute top-3 right-3 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
