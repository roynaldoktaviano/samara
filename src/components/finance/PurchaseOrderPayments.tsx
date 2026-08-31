'use client'

import { useState, useEffect, useCallback } from 'react'
import { Wallet, X, Upload, MapPin, ArrowLeft } from 'lucide-react'
import { isPdfDataUrl } from '@/lib/fileUpload'
import { FilePreview, MultiFilePicker } from '@/components/ui/file-preview'

interface PaymentRequest {
  id: string
  amount: number
  notePhotoKeys: string[]
  notes: string | null
  notaDate: string | null
  status: string
  poPaymentStatus: string // the PO's overall progress (UNPAID/PARTIALLY_PAID/PAID) — distinct from this request's own status, since a PO can be paid in installments
  paymentMethod: string
  createdAt: string
  paidAt: string | null
  transferProofKeys: string[]
  requestedBy: { name: string } | null
  paidBy: { name: string } | null
  // Earlier installments (DP/top-ups) for the same PO, this request's own installment
  // label, and what's still owed on the PO after this one — lets a Balance/Final
  // payment show its DP context plus its own settled amount and date.
  installmentLabel: string | null
  remainingBalance: number
  priorInstallments: { label: string; amount: number; date: string; status: string; kind: 'payment' | 'reimbursement' }[]
  order: {
    poNumber: string; supplierName: string | null; createdAt: string; deliveryLocation: { name: string } | null
    requestedByName: string | null; requestedByOffice: string | null; requestedByDepartment: string | null; requestedByRole: string | null
    discountType: string | null; discountValue: number | null
    extraCharges: { label: string; amount: number }[] | null
    items: { id: string; itemName: string; unit: string | null; orderedQty: number; receivedQty: number; unitCost: number }[]
  }
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

// A request that's individually PAID can still just be a DP — show the PO's
// overall progress instead of a flat "Paid" so Finance knows a final
// settlement request may still be coming for the same PO.
function statusBadge(status: string, poPaymentStatus: string): { label: string; className: string } {
  if (status !== 'PAID') return { label: 'Waiting for Payment', className: 'bg-amber-100 text-amber-700' }
  if (poPaymentStatus === 'PARTIALLY_PAID') return { label: 'Partially Paid', className: 'bg-orange-100 text-orange-700' }
  return { label: 'Paid', className: 'bg-green-100 text-green-700' }
}
const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)

function PhotoLightbox({ photoKey, onClose }: { photoKey: string; onClose: () => void }) {
  const isPdf = isPdfDataUrl(photoKey)
  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        {isPdf ? (
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
            <embed src={photoKey} type="application/pdf" className="w-full h-[75vh]" />
            <div className="p-3 flex justify-center">
              <a href={photoKey} target="_blank" rel="noopener noreferrer" className="text-sm text-amber-700 hover:text-amber-900 font-medium underline underline-offset-2">
                Open PDF in new tab
              </a>
            </div>
          </div>
        ) : (
          <img src={photoKey} alt="Proof" className="w-full rounded-xl shadow-2xl object-contain max-h-[80vh]" />
        )}
        <button onClick={onClose} className="absolute top-3 right-3 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default function PurchaseOrderPayments({ deepLinkId, onDeepLinkHandled }: { deepLinkId?: string | null; onDeepLinkHandled?: () => void } = {}) {
  const [requests, setRequests] = useState<PaymentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'PAID'>('PENDING')
  const [selected, setSelected] = useState<PaymentRequest | null>(null)
  const [viewPhoto, setViewPhoto] = useState<string | null>(null)

  // Deep-link from a notification click — the notification only carries the PO's id, not
  // this specific payment request's own id, so resolve it server-side (?orderId=) rather
  // than assuming the right row is already in the loaded/filtered `requests` list.
  useEffect(() => {
    if (!deepLinkId) return
    fetch(`/api/finance/purchase-order-payments?orderId=${deepLinkId}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: PaymentRequest[]) => { if (rows[0]) setSelected(rows[0]) })
      .finally(() => onDeepLinkHandled?.())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId])

  // pay modal
  const [payModal, setPayModal] = useState(false)
  const [transferProofs, setTransferProofs] = useState<string[]>([])
  const [paySaving, setPaySaving] = useState(false)
  const [payError, setPayError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/finance/purchase-order-payments')
    const data = await res.json()
    const list: PaymentRequest[] = Array.isArray(data) ? data : []
    setRequests(list)
    setLoading(false)
    return list
  }, [])

  useEffect(() => { load() }, [load])

  async function confirmPaid() {
    if (!selected || transferProofs.length === 0) { setPayError('At least one transfer proof photo is required'); return }
    setPaySaving(true); setPayError('')
    const res = await fetch(`/api/finance/purchase-order-payments/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transferProofKeys: transferProofs }),
    })
    const data = await res.json()
    if (!res.ok) { setPayError(data.error ?? 'Failed'); setPaySaving(false); return }
    setPaySaving(false); setPayModal(false); setTransferProofs([])
    const list = await load()
    setSelected(prev => (prev && list.find(r => r.id === prev.id)) ?? null)
  }

  const filtered = filterStatus === 'ALL' ? requests : requests.filter(r => r.status === filterStatus)
  const pendingCount = requests.filter(r => r.status === 'PENDING').length

  /* ── Detail page ─────────────────────────────────────────────────────── */
  if (selected) {
    return (
      <div className="space-y-5">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to PO Payments
        </button>

        <div className="rounded-2xl border bg-card max-w-3xl">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <h2 className="text-xl font-bold tracking-tight">{selected.order.poNumber}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{selected.order.supplierName ?? 'No supplier'}</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Amount</p>
                <p className="text-2xl font-bold mt-0.5">{fmtMoney(selected.amount)}</p>
              </div>
              <div className="text-right">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusBadge(selected.status, selected.poPaymentStatus).className}`}>
                  {statusBadge(selected.status, selected.poPaymentStatus).label}
                </span>
                {selected.paymentMethod === 'CARD' && (
                  <p className="text-[10px] text-muted-foreground mt-1">Debit Paid · no action needed</p>
                )}
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              {selected.paymentMethod === 'CARD' ? 'Paid' : 'Requested'} {fmtDate(selected.createdAt)}{selected.requestedBy?.name && ` · by ${selected.requestedBy.name}`}
            </div>

            {selected.order.requestedByName && (
              <div className="text-sm text-muted-foreground">
                PO Requested By <span className="font-medium text-foreground">{selected.order.requestedByName}</span>
                {(selected.order.requestedByOffice || selected.order.requestedByDepartment) && (
                  <span> — {[selected.order.requestedByOffice, selected.order.requestedByDepartment, selected.order.requestedByRole].filter(Boolean).join(' · ')}</span>
                )}
              </div>
            )}

            {selected.order.items.length > 0 && (() => {
              const itemsSubtotal = selected.order.items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0)
              const discountAmount = selected.order.discountType
                ? Math.min(itemsSubtotal, selected.order.discountType === 'PERCENT' ? itemsSubtotal * ((selected.order.discountValue ?? 0) / 100) : (selected.order.discountValue ?? 0))
                : 0
              const chargesTotal = selected.order.extraCharges?.reduce((s, c) => s + c.amount, 0) ?? 0
              const hasBreakdown = discountAmount > 0 || (selected.order.extraCharges && selected.order.extraCharges.length > 0)
              return (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Items ({selected.order.items.length})</p>
                  <div className="rounded-lg border overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Item</th>
                          <th className="text-right px-3 py-2 font-medium">Qty</th>
                          <th className="text-right px-3 py-2 font-medium">Unit Cost</th>
                          <th className="text-right px-3 py-2 font-medium">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selected.order.items.map(it => (
                          <tr key={it.id}>
                            <td className="px-3 py-2 font-medium">{it.itemName}</td>
                            <td className="px-3 py-2 text-right">{it.orderedQty} <span className="text-muted-foreground text-xs">{it.unit ?? ''}</span></td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{fmtMoney(it.unitCost)}</td>
                            <td className="px-3 py-2 text-right font-medium">{fmtMoney(it.orderedQty * it.unitCost)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/30 border-t">
                        {hasBreakdown && (
                          <>
                            <tr>
                              <td colSpan={3} className="px-3 py-1.5 text-xs text-muted-foreground text-right">Subtotal</td>
                              <td className="px-3 py-1.5 text-right text-muted-foreground text-xs">{fmtMoney(itemsSubtotal)}</td>
                            </tr>
                            {discountAmount > 0 && (
                              <tr>
                                <td colSpan={3} className="px-3 py-1.5 text-xs text-muted-foreground text-right">
                                  Discount{selected.order.discountType === 'PERCENT' ? ` (${selected.order.discountValue}%)` : ''}
                                </td>
                                <td className="px-3 py-1.5 text-right text-muted-foreground text-xs">-{fmtMoney(discountAmount)}</td>
                              </tr>
                            )}
                            {selected.order.extraCharges?.map((c, i) => (
                              <tr key={i}>
                                <td colSpan={3} className="px-3 py-1.5 text-xs text-muted-foreground text-right">{c.label || 'Additional charge'}</td>
                                <td className="px-3 py-1.5 text-right text-muted-foreground text-xs">{fmtMoney(c.amount)}</td>
                              </tr>
                            ))}
                          </>
                        )}
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-sm font-semibold text-right">PO Total</td>
                          <td className="px-3 py-2 text-right font-bold">{fmtMoney(itemsSubtotal - discountAmount + chargesTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                    </div>
                  </div>
                </div>
              )
            })()}

            {selected.priorInstallments.length > 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5 text-sm space-y-1.5">
                {selected.priorInstallments.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-blue-900">
                    <span>{p.label}{p.kind === 'reimbursement' ? ' (Reimbursement)' : ''}</span>
                    <span className="font-medium">
                      {fmtMoney(p.amount)}
                      <span className="text-blue-700 font-normal"> — {p.status === 'PAID' ? 'Paid' : 'Requested'} {fmtDate(p.date)}</span>
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-blue-900">
                  <span>{selected.installmentLabel ?? 'This Payment'}</span>
                  <span className="font-medium">
                    {fmtMoney(selected.amount)}
                    <span className="text-blue-700 font-normal">
                      {' — '}{selected.status === 'PAID' ? 'Paid' : 'Requested'} {fmtDate(selected.status === 'PAID' && selected.paidAt ? selected.paidAt : selected.createdAt)}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-blue-200 font-semibold text-blue-900">
                  <span>Remaining Balance</span>
                  <span>{fmtMoney(selected.remainingBalance)}</span>
                </div>
              </div>
            )}

            {selected.paymentMethod === 'CARD' && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-sm text-green-800">
                Debit Paid directly by the purchasing team. No transfer or approval needed — this is for your records.
              </div>
            )}

            {selected.notes && (
              <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm">{selected.notes}</div>
            )}

            <div className={selected.status === 'PAID' && selected.transferProofKeys.length > 0 ? 'grid grid-cols-2 gap-4' : ''}>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Receipt / Nota{selected.notePhotoKeys.length > 1 ? ` (${selected.notePhotoKeys.length})` : ''}</p>
                <div className="grid grid-cols-2 gap-2">
                  {selected.notePhotoKeys.map((k, i) => (
                    <FilePreview key={i} src={k} alt={`Nota ${i + 1}`} onClick={() => setViewPhoto(k)}
                      className="w-full h-32 rounded-lg object-contain bg-muted/20 border cursor-zoom-in hover:opacity-90 transition-opacity" />
                  ))}
                </div>
              </div>

              {selected.status === 'PAID' && selected.transferProofKeys.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1.5">Transfer Proof{selected.transferProofKeys.length > 1 ? ` (${selected.transferProofKeys.length})` : ''}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {selected.transferProofKeys.map((k, i) => (
                      <FilePreview key={i} src={k} alt={`Transfer proof ${i + 1}`} onClick={() => setViewPhoto(k)}
                        className="w-full h-32 rounded-lg object-contain bg-muted/20 border cursor-zoom-in hover:opacity-90 transition-opacity" />
                    ))}
                  </div>
                  <p className="text-xs text-green-700 mt-1.5">
                    Paid {selected.paidAt && fmtDate(selected.paidAt)}{selected.paidBy?.name && ` · by ${selected.paidBy.name}`}
                  </p>
                </div>
              )}
            </div>
          </div>

          {selected.status === 'PENDING' && (
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => { setTransferProofs([]); setPayError(''); setPayModal(true) }}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition-colors">
                <Upload className="h-3.5 w-3.5" /> Upload Transfer Proof
              </button>
            </div>
          )}
        </div>

        {/* Mark as paid modal */}
        {payModal && (
          <>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[55]" onClick={() => setPayModal(false)} />
            <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 pointer-events-none">
              <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                  <div>
                    <h3 className="font-semibold">Confirm Payment</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{selected.order.poNumber} · {fmtMoney(selected.amount)}</p>
                  </div>
                  <button onClick={() => setPayModal(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
                </div>
                <div className="p-5 space-y-4">
                  {payError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{payError}</div>}
                  <p className="text-xs text-muted-foreground">JPG, PNG, or PDF — you can attach more than one file (e.g. multiple transfer receipts)</p>
                  <MultiFilePicker files={transferProofs} onChange={setTransferProofs} />
                </div>
                <div className="flex justify-end gap-2 px-5 py-4 border-t">
                  <button onClick={() => setPayModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                  <button onClick={confirmPaid} disabled={transferProofs.length === 0 || paySaving}
                    className="flex items-center gap-2 px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 font-semibold transition-colors">
                    {paySaving ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</> : 'Mark as Paid'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {viewPhoto && <PhotoLightbox photoKey={viewPhoto} onClose={() => setViewPhoto(null)} />}
      </div>
    )
  }

  /* ── List page ────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Purchase Order Payments</h2>
        <p className="text-muted-foreground text-sm mt-0.5">Review payment requests from the purchasing team and confirm transfers.</p>
      </div>

      <div className="flex gap-1.5">
        {([
          ['PENDING', `Waiting for Payment${pendingCount ? ` (${pendingCount})` : ''}`],
          ['PAID', 'Paid'],
          ['ALL', 'All'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilterStatus(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStatus === key ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border overflow-hidden bg-card">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">PO No.</th>
              <th className="text-left px-4 py-3 font-medium">Supplier</th>
              <th className="text-left px-4 py-3 font-medium">Destination</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
              <th className="text-left px-4 py-3 font-medium">Nota Date</th>
              <th className="text-left px-4 py-3 font-medium">Requested By</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3.5"><div className="h-3.5 w-full rounded bg-muted animate-pulse" /></td></tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                <Wallet className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No payment requests{filterStatus !== 'ALL' ? ` with status "${filterStatus.toLowerCase()}"` : ''}.
              </td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelected(r)}>
                <td className="px-4 py-3 font-mono text-sm font-medium">
                  {r.order.poNumber}
                  <span className="block font-sans text-[10px] text-muted-foreground mt-0.5">Created {fmtDate(r.order.createdAt)}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.order.supplierName ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {r.order.deliveryLocation ? <span className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{r.order.deliveryLocation.name}</span> : '—'}
                </td>
                <td className="px-4 py-3 text-right font-medium">{fmtMoney(r.amount)}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.notaDate ? fmtDate(r.notaDate) : '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.requestedBy?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(r.status, r.poPaymentStatus).className}`}>
                    {statusBadge(r.status, r.poPaymentStatus).label}
                  </span>
                  {r.paymentMethod === 'CARD' && (
                    <span className="block text-[10px] text-muted-foreground mt-0.5">Debit Paid · no action needed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  )
}
