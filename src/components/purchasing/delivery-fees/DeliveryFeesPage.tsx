'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, ChevronRight, Search, Package, Wallet, CheckCircle2, Banknote, Pencil, Truck } from 'lucide-react'
import { FilePreview, MultiFilePicker } from '@/components/ui/file-preview'

interface PaymentRequest {
  id: string; amount: number; notePhotoKeys: string[]; notes: string | null; status: string; paymentMethod: string
  createdAt: string; requestedBy: { name: string } | null
  paidAt: string | null; paidBy: { name: string } | null; transferProofKeys: string[]
}
interface Reimbursement {
  id: string; amount: number; notePhotoKeys: string[]; notes: string | null; status: string
  requesterName: string; bankName: string; accountNumber: string; accountHolderName: string
  createdAt: string; requestedBy: { name: string } | null
  paidAt: string | null; paidBy: { name: string } | null; transferProofKeys: string[]
}
interface DeliveryFee {
  id: string; feeNumber: string; notes: string | null; createdAt: string; createdByName: string | null
  purchaseOrder: { poNumber: string; supplierName: string | null }
  paymentStatus: string
}
interface OrderOption { id: string; poNumber: string; supplierName: string | null }
interface PoSummaryItem { id: string; itemName: string; orderedQty: number; unitCost: number; unit?: string | null }
interface PoSummary {
  poNumber: string; supplierName: string | null; status: string
  orderedAt: string; expectedAt: string | null; notes: string | null
  deliveryLocation: { name: string } | null
  items: PoSummaryItem[]
  extraCharges?: { label: string; amount: number }[] | null
  discountType?: 'PERCENT' | 'FIXED' | null
  discountValue?: number
}
interface DeliveryFeeDetail extends DeliveryFee {
  purchaseOrder: PoSummary
  paymentRequests: PaymentRequest[]
  reimbursements: Reimbursement[]
}

const PO_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', ORDERED: 'Ordered', IN_TRANSIT: 'In Transit', PARTIALLY_RECEIVED: 'Partially Received', RECEIVED: 'Received', CANCELLED: 'Cancelled',
}
const PO_STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground', ORDERED: 'bg-amber-100 text-amber-700', IN_TRANSIT: 'bg-blue-100 text-blue-700',
  PARTIALLY_RECEIVED: 'bg-amber-100 text-amber-700', RECEIVED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700',
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)
const PAYMENT_STATUS_LABEL: Record<string, string> = { UNPAID: 'Unpaid', PENDING: 'Waiting for Payment', PAID: 'Paid' }
const PAYMENT_STATUS_COLOR: Record<string, string> = { UNPAID: 'bg-muted text-muted-foreground', PENDING: 'bg-amber-100 text-amber-700', PAID: 'bg-green-100 text-green-700' }

function PoSummaryCard({ po }: { po: PoSummary }) {
  const itemsSubtotal = po.items.reduce((s, it) => s + it.orderedQty * it.unitCost, 0)
  const discountAmount = po.discountType
    ? Math.min(itemsSubtotal, po.discountType === 'PERCENT' ? itemsSubtotal * ((po.discountValue ?? 0) / 100) : (po.discountValue ?? 0))
    : 0
  const chargesTotal = po.extraCharges?.reduce((s, c) => s + c.amount, 0) ?? 0
  const grandTotal = itemsSubtotal - discountAmount + chargesTotal
  const hasBreakdown = discountAmount > 0 || (po.extraCharges && po.extraCharges.length > 0)

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{po.poNumber}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {po.supplierName ?? 'No supplier'}{po.deliveryLocation ? ` · ${po.deliveryLocation.name}` : ''}
          </p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${PO_STATUS_COLOR[po.status] ?? ''}`}>
          {PO_STATUS_LABEL[po.status] ?? po.status}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Ordered {fmtDate(po.orderedAt)}{po.expectedAt ? ` · Expected ${fmtDate(po.expectedAt)}` : ''}
      </p>

      <div className="rounded-md border overflow-hidden bg-white">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium">Item</th>
              <th className="text-right px-3 py-1.5 font-medium">Qty</th>
              <th className="text-right px-3 py-1.5 font-medium">Unit Price</th>
              <th className="text-right px-3 py-1.5 font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {po.items.map(it => (
              <tr key={it.id}>
                <td className="px-3 py-1.5">{it.itemName}</td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{it.orderedQty}{it.unit ? ` ${it.unit}` : ''}</td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{fmtMoney(it.unitCost)}</td>
                <td className="px-3 py-1.5 text-right font-medium">{fmtMoney(it.orderedQty * it.unitCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1 pt-1">
        {hasBreakdown && (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Subtotal</span><span>{fmtMoney(itemsSubtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Discount{po.discountType === 'PERCENT' ? ` (${po.discountValue}%)` : ''}</span><span>-{fmtMoney(discountAmount)}</span>
              </div>
            )}
            {po.extraCharges?.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{c.label || 'Additional charge'}</span><span>{fmtMoney(c.amount)}</span>
              </div>
            ))}
          </>
        )}
        <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t">
          <span>PO Total</span><span>{fmtMoney(grandTotal)}</span>
        </div>
      </div>

      {po.notes && <p className="text-xs text-muted-foreground italic">{po.notes}</p>}
    </div>
  )
}

export default function DeliveryFeesPage() {
  const { data: session } = useSession()
  const [fees, setFees] = useState<DeliveryFee[]>([])
  const [orders, setOrders] = useState<OrderOption[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [detail, setDetail] = useState<DeliveryFeeDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // create form
  const [poId, setPoId] = useState('')
  const [poLabel, setPoLabel] = useState('')
  const [poSearch, setPoSearch] = useState('')
  const [poPickerOpen, setPoPickerOpen] = useState(false)
  const [poPreview, setPoPreview] = useState<PoSummary | null>(null)
  const [poPreviewLoading, setPoPreviewLoading] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // payment modal
  const [paymentModal, setPaymentModal] = useState(false)
  const [paymentEditId, setPaymentEditId] = useState<string | null>(null)
  const [paymentMode, setPaymentMode] = useState<'REQUEST' | 'DIRECT'>('REQUEST')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentPhotos, setPaymentPhotos] = useState<string[]>([])
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [paymentPhotoView, setPaymentPhotoView] = useState<string | null>(null)

  // reimburse modal
  const [reimburseModal, setReimburseModal] = useState(false)
  const [reimburseEditId, setReimburseEditId] = useState<string | null>(null)
  const [reimburseAmount, setReimburseAmount] = useState('')
  const [reimbursePhotos, setReimbursePhotos] = useState<string[]>([])
  const [reimburseNotes, setReimburseNotes] = useState('')
  const [reimburseRequesterName, setReimburseRequesterName] = useState('')
  const [reimburseBankName, setReimburseBankName] = useState('')
  const [reimburseAccountNumber, setReimburseAccountNumber] = useState('')
  const [reimburseAccountHolderName, setReimburseAccountHolderName] = useState('')
  const [reimburseSaving, setReimburseSaving] = useState(false)
  const [reimburseError, setReimburseError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [fRes, oRes] = await Promise.all([fetch('/api/purchasing/delivery-fees'), fetch('/api/purchasing/orders')])
    if (fRes.ok) setFees(await fRes.json())
    if (oRes.ok) setOrders(await oRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openNew() {
    setPoId(''); setPoLabel(''); setPoSearch(''); setPoPickerOpen(false); setNotes(''); setSaveError('')
    setPoPreview(null)
    setView('create')
  }

  async function selectPo(o: OrderOption) {
    setPoId(o.id); setPoLabel(`${o.poNumber}${o.supplierName ? ` — ${o.supplierName}` : ''}`); setPoPickerOpen(false); setPoSearch('')
    setPoPreview(null); setPoPreviewLoading(true)
    const res = await fetch(`/api/purchasing/orders/${o.id}`)
    if (res.ok) setPoPreview(await res.json())
    setPoPreviewLoading(false)
  }

  async function openDetail(f: DeliveryFee) {
    setView('detail'); setDetailLoading(true)
    const res = await fetch(`/api/purchasing/delivery-fees/${f.id}`)
    if (res.ok) setDetail(await res.json())
    setDetailLoading(false)
  }

  async function submit() {
    setSaving(true); setSaveError('')
    if (!poId) { setSaveError('Please select a purchase order'); setSaving(false); return }
    const res = await fetch('/api/purchasing/delivery-fees', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchaseOrderId: poId, notes }),
    })
    const data = await res.json()
    if (!res.ok) { setSaveError(data.error ?? 'An error occurred'); setSaving(false); return }
    setSaving(false); setView('list')
    load()
  }

  async function submitPaymentRequest() {
    if (!detail) return
    if (!paymentAmount || Number(paymentAmount) <= 0) { setPaymentError('Amount must be greater than 0'); return }
    if (paymentPhotos.length === 0) { setPaymentError('At least one receipt/nota photo is required'); return }
    setPaymentSaving(true); setPaymentError('')
    const url = paymentEditId
      ? `/api/purchasing/delivery-fees/${detail.id}/payment-request/${paymentEditId}`
      : `/api/purchasing/delivery-fees/${detail.id}/payment-request`
    const res = await fetch(url, {
      method: paymentEditId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(paymentAmount), notePhotoKeys: paymentPhotos, notes: paymentNotes || undefined, paidByPurchasing: paymentMode === 'DIRECT' }),
    })
    const data = await res.json()
    if (!res.ok) { setPaymentError(data.error ?? 'Failed'); setPaymentSaving(false); return }
    setPaymentSaving(false); setPaymentModal(false)
    setPaymentAmount(''); setPaymentPhotos([]); setPaymentNotes(''); setPaymentEditId(null)
    openDetail(detail); load()
  }

  async function submitReimbursement() {
    if (!detail) return
    if (!reimburseAmount || Number(reimburseAmount) <= 0) { setReimburseError('Amount must be greater than 0'); return }
    if (reimbursePhotos.length === 0) { setReimburseError('At least one receipt/nota photo is required'); return }
    if (!reimburseRequesterName.trim()) { setReimburseError('Name is required'); return }
    if (!reimburseBankName.trim()) { setReimburseError('Bank name is required'); return }
    if (!reimburseAccountNumber.trim()) { setReimburseError('Account number is required'); return }
    if (!reimburseAccountHolderName.trim()) { setReimburseError('Account holder name is required'); return }
    setReimburseSaving(true); setReimburseError('')
    const url = reimburseEditId
      ? `/api/purchasing/delivery-fees/${detail.id}/reimbursement/${reimburseEditId}`
      : `/api/purchasing/delivery-fees/${detail.id}/reimbursement`
    const res = await fetch(url, {
      method: reimburseEditId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Number(reimburseAmount), notePhotoKeys: reimbursePhotos, notes: reimburseNotes || undefined,
        requesterName: reimburseRequesterName, bankName: reimburseBankName,
        accountNumber: reimburseAccountNumber, accountHolderName: reimburseAccountHolderName,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setReimburseError(data.error ?? 'Failed'); setReimburseSaving(false); return }
    setReimburseSaving(false); setReimburseModal(false)
    setReimburseAmount(''); setReimbursePhotos([]); setReimburseNotes('')
    setReimburseRequesterName(''); setReimburseBankName(''); setReimburseAccountNumber(''); setReimburseAccountHolderName(''); setReimburseEditId(null)
    openDetail(detail); load()
  }

  const actionTaken = !!detail && (detail.paymentRequests.length > 0 || detail.reimbursements.length > 0)

  function openEditAction() {
    if (!detail) return
    if (detail.paymentRequests.length > 0) {
      const p = detail.paymentRequests[0]
      setPaymentMode(p.paymentMethod === 'CARD' ? 'DIRECT' : 'REQUEST')
      setPaymentAmount(String(p.amount)); setPaymentPhotos(p.notePhotoKeys); setPaymentNotes(p.notes ?? '')
      setPaymentError(''); setPaymentEditId(p.id); setPaymentModal(true)
      return
    }
    if (detail.reimbursements.length > 0) {
      const r = detail.reimbursements[0]
      setReimburseAmount(String(r.amount)); setReimbursePhotos(r.notePhotoKeys); setReimburseNotes(r.notes ?? '')
      setReimburseRequesterName(r.requesterName); setReimburseBankName(r.bankName)
      setReimburseAccountNumber(r.accountNumber); setReimburseAccountHolderName(r.accountHolderName)
      setReimburseError(''); setReimburseEditId(r.id); setReimburseModal(true)
    }
  }

  const inp = 'w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white transition-colors'

  // ── List ──
  if (view === 'list') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Delivery Fees</h2>
            <p className="text-muted-foreground text-sm mt-1">Shipping/delivery charges tied to a purchase order.</p>
          </div>
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold transition-colors">
            <Plus className="h-4 w-4" /> New Delivery Fee
          </button>
        </div>

        <div className="rounded-xl border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Fee No.</th>
                <th className="text-left px-4 py-3 font-medium">PO / Supplier</th>
                <th className="text-left px-4 py-3 font-medium">Created By</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Payment Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-4 py-3.5"><div className="h-3.5 w-full rounded bg-muted animate-pulse" /></td></tr>
                ))
              ) : fees.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                  <Truck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No delivery fees yet.
                </td></tr>
              ) : fees.map(f => (
                <tr key={f.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(f)}>
                  <td className="px-4 py-3 font-mono text-sm font-medium">{f.feeNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground">{f.purchaseOrder.poNumber}{f.purchaseOrder.supplierName ? ` · ${f.purchaseOrder.supplierName}` : ''}</td>
                  <td className="px-4 py-3 text-muted-foreground">{f.createdByName ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(f.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${PAYMENT_STATUS_COLOR[f.paymentStatus] ?? ''}`}>{PAYMENT_STATUS_LABEL[f.paymentStatus] ?? f.paymentStatus}</span>
                  </td>
                  <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ── Create ──
  if (view === 'create') {
    const filteredOrders = poSearch.length >= 1
      ? orders.filter(o => o.poNumber.toLowerCase().includes(poSearch.toLowerCase()) || (o.supplierName ?? '').toLowerCase().includes(poSearch.toLowerCase())).slice(0, 8)
      : orders.slice(0, 8)
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Back</button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">New Delivery Fee</span>
        </div>

        {saveError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{saveError}</div>}

        <div className="rounded-xl border bg-white">
          <div className="px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">Delivery Info</h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-1.5 relative">
              <label className="text-sm font-medium">Purchase Order <span className="text-red-500">*</span></label>
              {poPickerOpen ? (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setPoPickerOpen(false)} />
                  <div className="relative z-50">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <input autoFocus className={`${inp} pl-8`} placeholder="Search PO number or supplier..."
                        value={poSearch} onChange={e => setPoSearch(e.target.value)} />
                    </div>
                    <div className="absolute left-0 right-0 top-full mt-0.5 bg-white border rounded-lg shadow-xl max-h-52 overflow-y-auto">
                      {filteredOrders.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-muted-foreground">No purchase orders found</p>
                      ) : filteredOrders.map(o => (
                        <button key={o.id} onClick={() => selectPo(o)}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-amber-50 flex items-center gap-2.5 border-b last:border-0 transition-colors">
                          <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium flex-1">{o.poNumber}</span>
                          <span className="text-muted-foreground text-xs">{o.supplierName ?? '—'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <button onClick={() => { setPoPickerOpen(true); setPoSearch('') }}
                  className={`${inp} text-left flex items-center gap-2 ${!poLabel ? 'text-muted-foreground' : ''}`}>
                  {poLabel
                    ? <><Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="flex-1 truncate">{poLabel}</span></>
                    : <><Search className="h-3.5 w-3.5 shrink-0" /><span>Select purchase order...</span></>
                  }
                </button>
              )}
              <p className="text-[11px] text-muted-foreground">Which PO's goods this shipment/delivery cost is for.</p>
            </div>

            {poPreviewLoading ? (
              <div className="rounded-lg border bg-muted/20 p-4 animate-pulse h-24" />
            ) : poPreview && <PoSummaryCard po={poPreview} />}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <textarea className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white resize-none"
                rows={2} placeholder="Courier, shipment details, etc. (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pb-4">
          <button onClick={() => setView('list')} className="px-5 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex items-center gap-2 px-6 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 font-semibold transition-colors">
            {saving ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</> : 'Create Delivery Fee'}
          </button>
        </div>
      </div>
    )
  }

  // ── Detail ──
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => { setView('list'); setDetail(null) }} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Back</button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{detail?.feeNumber ?? 'Loading...'}</span>
      </div>

      {detailLoading || !detail ? (
        <div className="space-y-4 animate-pulse">
          <div className="rounded-lg border overflow-hidden"><div className="h-24 bg-muted/50" /></div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">{detail.feeNumber}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                For {detail.purchaseOrder.poNumber}{detail.purchaseOrder.supplierName ? ` · ${detail.purchaseOrder.supplierName}` : ''}
                {detail.purchaseOrder.deliveryLocation && ` · ${detail.purchaseOrder.deliveryLocation.name}`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Created {fmtDate(detail.createdAt)}{detail.createdByName && ` · by ${detail.createdByName}`}
              </p>
              {detail.notes && <p className="text-sm text-muted-foreground mt-2 bg-muted/40 rounded-lg px-3 py-2">{detail.notes}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0 pt-1">
              {!actionTaken ? (
                <>
                  <button onClick={() => { setPaymentMode('REQUEST'); setPaymentAmount(''); setPaymentPhotos([]); setPaymentNotes(''); setPaymentError(''); setPaymentEditId(null); setPaymentModal(true) }}
                    className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                    <Wallet className="h-3.5 w-3.5" /> Request Payment
                  </button>
                  <button onClick={() => { setPaymentMode('DIRECT'); setPaymentAmount(''); setPaymentPhotos([]); setPaymentNotes(''); setPaymentError(''); setPaymentEditId(null); setPaymentModal(true) }}
                    className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Debit Paid
                  </button>
                  <button onClick={() => {
                    setReimburseAmount(''); setReimbursePhotos([]); setReimburseNotes('')
                    setReimburseRequesterName((session?.user as { name?: string })?.name ?? '')
                    setReimburseBankName(''); setReimburseAccountNumber(''); setReimburseAccountHolderName('')
                    setReimburseError(''); setReimburseEditId(null); setReimburseModal(true)
                  }}
                    className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                    <Banknote className="h-3.5 w-3.5" /> Reimburse
                  </button>
                </>
              ) : (
                <button onClick={openEditAction} className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                  {detail.paymentRequests.length > 0 ? 'Edit Payment' : 'Edit Reimbursement'}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Purchase Order</h3>
            <PoSummaryCard po={detail.purchaseOrder} />
          </div>

          {detail.paymentRequests.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Payment Requests</h3>
              {detail.paymentRequests.map(p => {
                const isCard = p.paymentMethod === 'CARD'
                return (
                  <div key={p.id} className="rounded-xl border overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
                      <div>
                        <p className="font-semibold text-base">{fmtMoney(p.amount)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isCard ? 'Paid' : 'Requested'} {fmtDate(p.createdAt)}{p.requestedBy?.name && ` · by ${p.requestedBy.name}`}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${PAYMENT_STATUS_COLOR[p.status === 'PAID' ? 'PAID' : 'PENDING']}`}>
                          {PAYMENT_STATUS_LABEL[p.status === 'PAID' ? 'PAID' : 'PENDING']}
                        </span>
                        {isCard && <span className="text-[10px] text-muted-foreground">Debit Paid</span>}
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      {p.notes && <p className="text-sm text-muted-foreground">{p.notes}</p>}
                      <div className={p.status === 'PAID' && p.transferProofKeys.length > 0 ? 'grid grid-cols-2 gap-4' : ''}>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Receipt / Nota{p.notePhotoKeys.length > 1 ? ` (${p.notePhotoKeys.length})` : ''}</p>
                          <div className="grid grid-cols-2 gap-2">
                            {p.notePhotoKeys.map((k, i) => (
                              <FilePreview key={i} src={k} alt={`Nota ${i + 1}`} onClick={() => setPaymentPhotoView(k)}
                                className="w-full h-28 rounded-lg object-contain bg-muted/20 border cursor-zoom-in hover:opacity-90 transition-opacity" />
                            ))}
                          </div>
                        </div>
                        {p.status === 'PAID' && p.transferProofKeys.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1.5">Transfer Proof{p.transferProofKeys.length > 1 ? ` (${p.transferProofKeys.length})` : ''}</p>
                            <div className="grid grid-cols-2 gap-2">
                              {p.transferProofKeys.map((k, i) => (
                                <FilePreview key={i} src={k} alt={`Transfer proof ${i + 1}`} onClick={() => setPaymentPhotoView(k)}
                                  className="w-full h-28 rounded-lg object-contain bg-muted/20 border cursor-zoom-in hover:opacity-90 transition-opacity" />
                              ))}
                            </div>
                            <p className="text-xs text-green-700 mt-1.5">
                              Paid {p.paidAt && fmtDate(p.paidAt)}{p.paidBy?.name && ` · by ${p.paidBy.name}`}
                            </p>
                          </div>
                        )}
                        {isCard && p.status === 'PAID' && (
                          <p className="text-xs text-green-700">
                            Debit Paid directly by {p.paidBy?.name ?? p.requestedBy?.name ?? 'purchasing'} — no bank transfer needed.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {detail.reimbursements.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Reimbursements</h3>
              {detail.reimbursements.map(r => (
                <div key={r.id} className="rounded-xl border overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
                    <div>
                      <p className="font-semibold text-base">{fmtMoney(r.amount)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Requested {fmtDate(r.createdAt)}{r.requestedBy?.name && ` · by ${r.requestedBy.name}`}
                      </p>
                    </div>
                    <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${PAYMENT_STATUS_COLOR[r.status === 'PAID' ? 'PAID' : 'PENDING']}`}>
                      {PAYMENT_STATUS_LABEL[r.status === 'PAID' ? 'PAID' : 'PENDING']}
                    </span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div><p className="text-xs text-muted-foreground">Name</p><p className="font-medium">{r.requesterName}</p></div>
                      <div><p className="text-xs text-muted-foreground">Bank Name</p><p className="font-medium">{r.bankName}</p></div>
                      <div><p className="text-xs text-muted-foreground">Account Number</p><p className="font-medium font-mono">{r.accountNumber}</p></div>
                      <div><p className="text-xs text-muted-foreground">Account Holder Name</p><p className="font-medium">{r.accountHolderName}</p></div>
                    </div>
                    {r.notes && <p className="text-sm text-muted-foreground">{r.notes}</p>}
                    <div className={r.status === 'PAID' && r.transferProofKeys.length > 0 ? 'grid grid-cols-2 gap-4' : ''}>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Receipt / Nota{r.notePhotoKeys.length > 1 ? ` (${r.notePhotoKeys.length})` : ''}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {r.notePhotoKeys.map((k, i) => (
                            <FilePreview key={i} src={k} alt={`Nota ${i + 1}`} onClick={() => setPaymentPhotoView(k)}
                              className="w-full h-28 rounded-lg object-contain bg-muted/20 border cursor-zoom-in hover:opacity-90 transition-opacity" />
                          ))}
                        </div>
                      </div>
                      {r.status === 'PAID' && r.transferProofKeys.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1.5">Transfer Proof{r.transferProofKeys.length > 1 ? ` (${r.transferProofKeys.length})` : ''}</p>
                          <div className="grid grid-cols-2 gap-2">
                            {r.transferProofKeys.map((k, i) => (
                              <FilePreview key={i} src={k} alt={`Transfer proof ${i + 1}`} onClick={() => setPaymentPhotoView(k)}
                                className="w-full h-28 rounded-lg object-contain bg-muted/20 border cursor-zoom-in hover:opacity-90 transition-opacity" />
                            ))}
                          </div>
                          <p className="text-xs text-green-700 mt-1.5">
                            Paid {r.paidAt && fmtDate(r.paidAt)}{r.paidBy?.name && ` · by ${r.paidBy.name}`}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Request Payment / Debit Paid Modal */}
      {paymentModal && detail && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setPaymentModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div>
                  <h3 className="font-semibold">{paymentEditId ? 'Edit ' : ''}{paymentMode === 'DIRECT' ? 'Debit Paid' : 'Request Payment'}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{detail.feeNumber} · {detail.purchaseOrder.poNumber}</p>
                </div>
                <button onClick={() => setPaymentModal(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-4">
                {paymentMode === 'DIRECT' && (
                  <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-sm text-green-800">
                    Use this when purchasing already paid via debit. This will be recorded as paid immediately — finance is just notified, no approval needed.
                  </div>
                )}
                {paymentError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{paymentError}</div>}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Amount <span className="text-red-500">*</span></label>
                  <input type="number" min={0} autoFocus
                    className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="e.g. 150000"
                    value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Receipt / Nota <span className="text-red-500">*</span></label>
                  <p className="text-xs text-muted-foreground">JPG, PNG, or PDF — you can attach more than one file</p>
                  <MultiFilePicker files={paymentPhotos} onChange={setPaymentPhotos} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Notes</label>
                  <textarea rows={2}
                    className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Courier, urgency, etc. (optional)"
                    value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} />
                </div>

                <p className="text-xs text-muted-foreground">
                  {paymentMode === 'DIRECT' ? 'Paid by' : 'Requested by'} <span className="font-medium text-foreground">{session?.user?.name ?? 'You'}</span>
                </p>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t">
                <button onClick={() => setPaymentModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                <button onClick={submitPaymentRequest} disabled={!paymentAmount || paymentPhotos.length === 0 || paymentSaving}
                  className={`flex items-center gap-2 px-5 py-2 text-sm text-white rounded-lg disabled:opacity-40 font-semibold transition-colors ${paymentMode === 'DIRECT' ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
                  {paymentSaving
                    ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</>
                    : paymentMode === 'DIRECT' ? <><CheckCircle2 className="h-3.5 w-3.5" />Mark as Paid</> : <><Wallet className="h-3.5 w-3.5" />Send to Finance</>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {paymentPhotoView && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={() => setPaymentPhotoView(null)}>
          <img src={paymentPhotoView} alt="Proof" className="max-w-2xl w-full rounded-xl shadow-2xl object-contain max-h-[80vh]" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Reimbursement Modal */}
      {reimburseModal && detail && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setReimburseModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div>
                  <h3 className="font-semibold">{reimburseEditId ? 'Edit Reimbursement' : 'Reimburse'}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{detail.feeNumber} · {detail.purchaseOrder.poNumber}</p>
                </div>
                <button onClick={() => setReimburseModal(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-4">
                {reimburseError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{reimburseError}</div>}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Amount <span className="text-red-500">*</span></label>
                  <input type="number" min={0} autoFocus
                    className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="e.g. 150000"
                    value={reimburseAmount} onChange={e => setReimburseAmount(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Name <span className="text-red-500">*</span></label>
                  <input
                    className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Requester's full name"
                    value={reimburseRequesterName} onChange={e => setReimburseRequesterName(e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Bank Name <span className="text-red-500">*</span></label>
                    <input
                      className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="e.g. BCA, Mandiri"
                      value={reimburseBankName} onChange={e => setReimburseBankName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Account Number <span className="text-red-500">*</span></label>
                    <input
                      className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="e.g. 1234567890"
                      value={reimburseAccountNumber} onChange={e => setReimburseAccountNumber(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Account Holder Name <span className="text-red-500">*</span></label>
                  <input
                    className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Name on the bank account"
                    value={reimburseAccountHolderName} onChange={e => setReimburseAccountHolderName(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Receipt / Nota <span className="text-red-500">*</span></label>
                  <p className="text-xs text-muted-foreground">JPG, PNG, or PDF — you can attach more than one file</p>
                  <MultiFilePicker files={reimbursePhotos} onChange={setReimbursePhotos} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Notes</label>
                  <textarea rows={2}
                    className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="What is this reimbursement for? (optional)"
                    value={reimburseNotes} onChange={e => setReimburseNotes(e.target.value)} />
                </div>

                <p className="text-xs text-muted-foreground">
                  Requested by <span className="font-medium text-foreground">{session?.user?.name ?? 'You'}</span>
                </p>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t">
                <button onClick={() => setReimburseModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                <button onClick={submitReimbursement}
                  disabled={!reimburseAmount || reimbursePhotos.length === 0 || !reimburseRequesterName.trim() || !reimburseBankName.trim() || !reimburseAccountNumber.trim() || !reimburseAccountHolderName.trim() || reimburseSaving}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 font-semibold transition-colors">
                  {reimburseSaving
                    ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</>
                    : <><Banknote className="h-3.5 w-3.5" />Send to Finance</>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
