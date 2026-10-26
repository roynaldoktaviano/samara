'use client'

import { useState, useEffect, useCallback } from 'react'
import { Banknote, Upload, MapPin } from 'lucide-react'
import { FilePreview, MultiFilePicker } from '@/components/ui/file-preview'
import { PhotoLightbox } from '@/components/purchasing/PhotoLightbox'
import { formatDate, formatMoney } from '@/lib/format'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Reimbursement {
  id: string
  amount: number
  notePhotoKeys: string[]
  notes: string | null
  notaDate: string | null
  status: string
  requesterName: string
  bankName: string
  accountNumber: string
  accountHolderName: string
  createdAt: string
  paidAt: string | null
  paidNotes: string | null
  transferProofKeys: string[]
  requestedBy: { name: string } | null
  paidBy: { name: string } | null
  deliveryFee: {
    feeNumber: string
    notes: string | null
    purchaseOrder: { poNumber: string; supplierName: string | null; createdAt: string; deliveryLocation: { name: string } | null } | null
  }
}

export default function DeliveryFeeReimbursements({ deepLinkId, onDeepLinkHandled }: { deepLinkId?: string | null; onDeepLinkHandled?: () => void } = {}) {
  const [requests, setRequests] = useState<Reimbursement[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'PAID'>('PENDING')
  const [selected, setSelected] = useState<Reimbursement | null>(null)
  const [viewPhoto, setViewPhoto] = useState<string | null>(null)

  // Deep-link from a notification click — the notification only carries the underlying
  // PO's id (or the DeliveryFee's own id, as a fallback), not this reimbursement's own id,
  // so resolve it server-side (?orderId=).
  useEffect(() => {
    if (!deepLinkId) return
    fetch(`/api/finance/delivery-fee-reimbursements?orderId=${deepLinkId}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: Reimbursement[]) => { if (rows[0]) setSelected(rows[0]) })
      .finally(() => onDeepLinkHandled?.())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId])

  // pay modal
  const [payModal, setPayModal] = useState(false)
  const [transferProofs, setTransferProofs] = useState<string[]>([])
  const [payNotes, setPayNotes] = useState('')
  const [paySaving, setPaySaving] = useState(false)
  const [payError, setPayError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/finance/delivery-fee-reimbursements')
    const data = await res.json()
    const list: Reimbursement[] = Array.isArray(data) ? data : []
    setRequests(list)
    setLoading(false)
    return list
  }, [])

  useEffect(() => { load() }, [load])

  async function confirmPaid() {
    if (!selected || transferProofs.length === 0) { setPayError('At least one transfer proof photo is required'); return }
    setPaySaving(true); setPayError('')
    const res = await fetch(`/api/finance/delivery-fee-reimbursements/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transferProofKeys: transferProofs, paidNotes: payNotes || undefined }),
    })
    const data = await res.json()
    if (!res.ok) { setPayError(data.error ?? 'Failed'); setPaySaving(false); return }
    setPaySaving(false); setPayModal(false); setTransferProofs([]); setPayNotes('')
    const list = await load()
    setSelected(prev => (prev && list.find(r => r.id === prev.id)) ?? null)
  }

  const filtered = filterStatus === 'ALL' ? requests : requests.filter(r => r.status === filterStatus)
  const pendingCount = requests.filter(r => r.status === 'PENDING').length

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Delivery Fee Reimbursements</h2>
        <p className="text-muted-foreground text-sm mt-0.5">Review delivery fee reimbursement requests from the purchasing team and confirm transfers.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {([
          ['PENDING', `Waiting for Payment${pendingCount ? ` (${pendingCount})` : ''}`],
          ['PAID', 'Paid'],
          ['ALL', 'All'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilterStatus(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStatus === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border overflow-hidden bg-card">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Fee No.</th>
              <th className="text-left px-4 py-3 font-medium">PO / Supplier</th>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Bank</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
              <th className="text-left px-4 py-3 font-medium">Receipt Date</th>
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
                <Banknote className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No delivery fee reimbursement requests{filterStatus !== 'ALL' ? ` with status "${filterStatus.toLowerCase()}"` : ''}.
              </td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelected(r)}>
                <td className="px-4 py-3 font-mono text-sm font-medium">{r.deliveryFee.feeNumber}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {r.deliveryFee.purchaseOrder ? (
                    <>
                      {r.deliveryFee.purchaseOrder.poNumber}{r.deliveryFee.purchaseOrder.supplierName ? ` · ${r.deliveryFee.purchaseOrder.supplierName}` : ''}
                      <span className="block text-[10px] text-muted-foreground mt-0.5">Created {formatDate(r.deliveryFee.purchaseOrder.createdAt)}</span>
                      {r.deliveryFee.purchaseOrder.deliveryLocation && (
                        <span className="flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3 shrink-0" />{r.deliveryFee.purchaseOrder.deliveryLocation.name}</span>
                      )}
                    </>
                  ) : <span className="italic">No PO — {r.deliveryFee.notes || 'consolidated/cargo'}</span>}
                </td>
                <td className="px-4 py-3">{r.requesterName}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{r.bankName} · {r.accountNumber}</td>
                <td className="px-4 py-3 text-right font-medium">{formatMoney(r.amount)}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(r.notaDate)}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={r.status === 'PAID' ? 'success' : 'warning'}>
                    {r.status === 'PAID' ? 'Paid' : 'Waiting for Payment'}
                  </StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {/* Detail modal */}
      <Dialog open={!!selected} onOpenChange={o => { if (!o) setSelected(null) }}>
        {selected && (
          <DialogContent className="sm:max-w-lg p-0 gap-0 max-h-[88vh] overflow-y-auto"
            onInteractOutside={e => { if (viewPhoto) e.preventDefault() }}>
            <div className="px-5 py-4 pr-12 border-b">
              <DialogTitle className="text-base leading-normal">{selected.deliveryFee.feeNumber}</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {selected.deliveryFee.purchaseOrder
                  ? `${selected.deliveryFee.purchaseOrder.poNumber}${selected.deliveryFee.purchaseOrder.supplierName ? ` · ${selected.deliveryFee.purchaseOrder.supplierName}` : ''}`
                  : <span className="italic">No PO — {selected.deliveryFee.notes || 'consolidated/cargo'}</span>}
              </DialogDescription>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Amount</p>
                  <p className="text-2xl font-bold mt-0.5">{formatMoney(selected.amount)}</p>
                </div>
                <StatusBadge tone={selected.status === 'PAID' ? 'success' : 'warning'} className="px-2.5 py-1">
                  {selected.status === 'PAID' ? 'Paid' : 'Waiting for Payment'}
                </StatusBadge>
              </div>

              <div className="text-sm text-muted-foreground">
                Requested {formatDate(selected.createdAt)}{selected.requestedBy?.name && ` · by ${selected.requestedBy.name}`}
              </div>

              <div className="rounded-lg bg-muted/40 p-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div><p className="text-xs text-muted-foreground">Name</p><p className="font-medium break-words">{selected.requesterName}</p></div>
                <div><p className="text-xs text-muted-foreground">Bank Name</p><p className="font-medium break-words">{selected.bankName}</p></div>
                <div><p className="text-xs text-muted-foreground">Account Number</p><p className="font-medium font-mono break-all">{selected.accountNumber}</p></div>
                <div><p className="text-xs text-muted-foreground">Account Holder Name</p><p className="font-medium break-words">{selected.accountHolderName}</p></div>
              </div>

              {selected.notes && (
                <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm">{selected.notes}</div>
              )}

              <div className={selected.status === 'PAID' && selected.transferProofKeys.length > 0 ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : ''}>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Receipt{selected.notePhotoKeys.length > 1 ? ` (${selected.notePhotoKeys.length})` : ''}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {selected.notePhotoKeys.map((k, i) => (
                      <FilePreview key={i} src={k} alt={`Receipt ${i + 1}`} onClick={() => setViewPhoto(k)}
                        className="w-full h-32 rounded-lg object-contain bg-muted/20 border cursor-zoom-in hover:opacity-90 transition-opacity" />
                    ))}
                  </div>
                </div>

                {selected.status === 'PAID' && selected.transferProofKeys.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-success uppercase tracking-wide mb-1.5">Transfer Proof{selected.transferProofKeys.length > 1 ? ` (${selected.transferProofKeys.length})` : ''}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {selected.transferProofKeys.map((k, i) => (
                        <FilePreview key={i} src={k} alt={`Transfer proof ${i + 1}`} onClick={() => setViewPhoto(k)}
                          className="w-full h-32 rounded-lg object-contain bg-muted/20 border cursor-zoom-in hover:opacity-90 transition-opacity" />
                      ))}
                    </div>
                    <p className="text-xs text-success mt-1.5">
                      Paid {selected.paidAt && formatDate(selected.paidAt)}{selected.paidBy?.name && ` · by ${selected.paidBy.name}`}
                    </p>
                    {selected.paidNotes && (
                      <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap">{selected.paidNotes}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="px-5 py-4 border-t">
              <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
              {selected.status === 'PENDING' && (
                <Button variant="success" onClick={() => { setTransferProofs([]); setPayNotes(''); setPayError(''); setPayModal(true) }}>
                  <Upload /> Upload Transfer Proof
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Mark as paid modal */}
      <Dialog open={payModal && !!selected} onOpenChange={o => { if (!o) setPayModal(false) }}>
        {selected && (
          <DialogContent className="sm:max-w-md p-0 gap-0 max-h-[90vh] overflow-y-auto" onInteractOutside={e => e.preventDefault()}>
            <div className="px-5 py-4 pr-12 border-b">
              <DialogTitle className="text-base leading-normal">Confirm Payment</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">{selected.deliveryFee.feeNumber} · {selected.requesterName} · {formatMoney(selected.amount)}</DialogDescription>
            </div>
            <div className="p-5 space-y-4">
              {payError && <div className="rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm px-3 py-2">{payError}</div>}
              <div className="rounded-lg bg-muted/40 p-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div><p className="text-xs text-muted-foreground">Bank Name</p><p className="font-medium break-words">{selected.bankName}</p></div>
                <div><p className="text-xs text-muted-foreground">Account Number</p><p className="font-medium font-mono break-all">{selected.accountNumber}</p></div>
                <div className="col-span-2"><p className="text-xs text-muted-foreground">Account Holder Name</p><p className="font-medium break-words">{selected.accountHolderName}</p></div>
              </div>
              <p className="text-xs text-muted-foreground">JPG, PNG, or PDF — you can attach more than one file (e.g. multiple transfer receipts)</p>
              <MultiFilePicker files={transferProofs} onChange={setTransferProofs} />
              <div>
                <Label htmlFor="df-reimb-pay-notes" className="text-xs text-muted-foreground mb-1.5">Notes (optional)</Label>
                <Textarea id="df-reimb-pay-notes" value={payNotes} onChange={e => setPayNotes(e.target.value)} rows={2}
                  className="resize-none" placeholder="Add a note for this payment…" />
              </div>
            </div>
            <DialogFooter className="px-5 py-4 border-t">
              <Button variant="outline" onClick={() => setPayModal(false)}>Cancel</Button>
              <Button variant="success" onClick={confirmPaid} disabled={transferProofs.length === 0} loading={paySaving}>
                {paySaving ? 'Saving…' : 'Mark as Paid'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {viewPhoto && <PhotoLightbox photoKey={viewPhoto} onClose={() => setViewPhoto(null)} />}
    </div>
  )
}
