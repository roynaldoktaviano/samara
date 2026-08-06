'use client'

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import { Plus, ChevronRight, X, Search, Package, Trash2, Camera, Upload, MapPin, Building2, FileDown, Wallet, CheckCircle2, Banknote, Users, Pencil, AlertTriangle, Lock, Ship, FileText } from 'lucide-react'
import { isPdfDataUrl } from '@/lib/fileUpload'
import { FilePreview, MultiFilePicker, PhotoSourceMenu } from '@/components/ui/file-preview'
import { useFileDrop } from '@/hooks/useFileDrop'


interface PaymentRequest {
  id: string; amount: number; notePhotoKeys: string[]; notes: string | null; notaDate: string | null; status: string; paymentMethod: string
  createdAt: string; requestedBy: { name: string } | null
  paidAt: string | null; paidBy: { name: string } | null; transferProofKeys: string[]
}
interface Reimbursement {
  id: string; amount: number; notePhotoKeys: string[]; notes: string | null; notaDate: string | null; status: string
  requesterName: string; bankName: string; accountNumber: string; accountHolderName: string
  createdAt: string; requestedBy: { name: string } | null
  paidAt: string | null; paidBy: { name: string } | null; transferProofKeys: string[]
}
interface DeliveryLocation { id: string; name: string; type: string; managedBy: string; yachtId: string | null }
interface OrderItem { id: string; itemId: string; itemName: string; orderedQty: number; unitCost: number; receivedQty?: number; unit?: string | null }
interface TransitStop { locationId: string; sequence: number; location: { id: string; name: string; type: string } }
interface TransitLegItem { id: string; itemId: string | null; itemName: string; requestedQty: number; dispatchedQty: number; receivedQty: number }
interface TransitLeg {
  id: string; legSequence: number | null; status: string; dispatchedAt: string | null; receivedAt: string | null
  dispatchPhotoKey: string | null; receivePhotoKey: string | null; receivedByName: string | null
  dispatchedBy: { name: string | null } | null
  fromLocation: { name: string }; toLocation: { name: string }
  items: TransitLegItem[]
}
interface PurchaseOrder {
  id: string; poNumber: string; supplierId: string | null; supplierName: string | null; status: string
  deliveryLocationId: string | null; deliveryLocation: DeliveryLocation | null
  itemCount: number; totalOrdered: number; totalReceived: number; fullyReceivedCount: number
  items: OrderItem[]
  notes: string | null; orderedAt: string; expectedAt: string | null; dispatchedAt: string | null
  lastReceivedAt: string | null; lastReceivedBy: string | null
  createdByName: string | null
  requestedByEmployeeId: string | null
  requestedByName: string | null; requestedByOffice: string | null; requestedByDepartment: string | null; requestedByRole: string | null
  paymentStatus: string
  bookingId: string | null
  booking: { bookingCode: string; tripType: string; leadGuestName: string; yacht: { name: string } | null } | null
  transitStops?: TransitStop[]
  currentLegLabel?: string | null
}
interface SupplierOption { id: string; name: string }
interface TripOption {
  id: string; bookingCode: string; tripType: string; startDate: string; endDate: string
  destination: string | null; status: string
  yacht: { id: string; name: string } | null
  leadGuestName: string; guestNames: string[]
}
interface FollowUp {
  id: string; note: string; isEscalation: boolean; escalatedToId: string | null
  escalatedTo: { name: string | null } | null; createdBy: { name: string | null }; createdAt: string
}
interface EscalationTarget { id: string; name: string | null }
interface ReimburseAccountOption { id: string; accountHolderName: string; bankName: string; accountNumber: string }
interface EmployeeOption { id: string; fullName: string; employeeNumber: string; department: string | null; office: string | null; role: string | null }
interface PurchaseItem { id: string; name: string; sku: string; baseUnit: string; purchaseUnit: string; conversionFactor: number; avgPrice: number; isActive: boolean }
interface StockLocation { id: string; name: string; type: string; managedBy: string; isActive?: boolean }
interface OrderDetail extends PurchaseOrder {
  dispatchPhotoKey?: string | null
  dispatchedByName?: string | null
  confirmedByName?: string | null
  request?: { prNumber: string; createdAt: string } | null
  cancellationReason?: string | null
  cancelledAt?: string | null
  cancelledByName?: string | null
  items: OrderItem[]
  extraCharges?: { label: string; amount: number }[] | null
  discountType?: 'PERCENT' | 'FIXED' | null
  discountValue?: number
  receipts: { id: string; grNumber: string; receivedAt: string; receiverName?: string | null; receivePhotoKey?: string | null; items: { itemName: string; receivedQty: number; condition: string; outcome?: string; batch?: string | null }[] }[]
  paymentRequests: PaymentRequest[]
  reimbursements: Reimbursement[]
  followUps: FollowUp[]
  grandTotal: number
  paidTotal: number
  requestedTotal: number
  remaining: number
  transitTransfers: TransitLeg[]
}

function POTimeline({ detail }: { detail: OrderDetail }) {
  const [viewPhoto, setViewPhoto] = useState<string | null>(null)
  const fmt = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  type Step = { key: string; done: boolean; label: string; date: string | null; sub: (string | null | undefined)[]; photos?: string[]; photoLabel?: string; cancelled?: boolean }

  const steps: Step[] = [
    ...(detail.request ? [{
      key: 'pr',
      done: true,
      label: 'PR Submitted',
      date: fmt(detail.request.createdAt),
      sub: [
        detail.requestedByName,
        [detail.requestedByOffice, detail.requestedByDepartment, detail.requestedByRole].filter(Boolean).join(' · ') || null,
        detail.request.prNumber,
      ],
    }] : []),
    {
      key: 'ordered',
      done: !['DRAFT'].includes(detail.status),
      label: 'PO Confirmed',
      date: !['DRAFT'].includes(detail.status) && detail.orderedAt ? fmt(detail.orderedAt) : null,
      sub: !['DRAFT'].includes(detail.status)
        ? [detail.supplierName, detail.confirmedByName ? `by ${detail.confirmedByName}` : null]
        : [],
    },
    // Payment step(s) — a PO can be paid across multiple installments (DP +
    // final settlement), in any mix of Request Payment/Debit Paid
    // (POPaymentRequest) and Reimburse (POReimbursement). Every installment
    // gets its own Requested/Paid step-pair, in chronological order, labeled
    // Down Payment / Additional Payment / Final Payment based on how much of
    // the order total it and the installments before it add up to.
    ...(() => {
      const installments = [
        ...detail.paymentRequests.map(p => ({ ...p, kind: 'payment' as const })),
        ...detail.reimbursements.map(r => ({ ...r, kind: 'reimbursement' as const })),
      ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

      let cumulative = 0
      const paymentSteps: Step[] = []
      for (const inst of installments) {
        const label = describeInstallment(detail.grandTotal, cumulative, inst.amount)
        cumulative += inst.amount
        const paid = inst.status === 'PAID'
        const isReimbursement = inst.kind === 'reimbursement'
        const isCard = inst.kind === 'payment' && inst.paymentMethod === 'CARD'

        if (isCard) {
          paymentSteps.push({
            key: `payment-${inst.id}`,
            done: true,
            label: `${label} — Debit Paid`,
            date: inst.paidAt ? fmt(inst.paidAt) : fmt(inst.createdAt),
            sub: [fmtMoney(inst.amount), (inst.paidBy?.name ?? inst.requestedBy?.name) ? `by ${inst.paidBy?.name ?? inst.requestedBy?.name}` : null],
            photos: inst.notePhotoKeys,
            photoLabel: 'View nota',
          })
          continue
        }
        paymentSteps.push({
          key: `${inst.kind}-requested-${inst.id}`,
          done: true,
          label: isReimbursement ? `${label} (Reimbursement) Requested` : `${label} Requested`,
          date: fmt(inst.createdAt),
          sub: [fmtMoney(inst.amount), inst.requestedBy?.name ? `by ${inst.requestedBy.name}` : null],
          photos: inst.notePhotoKeys,
          photoLabel: 'View nota',
        })
        paymentSteps.push({
          key: `${inst.kind}-paid-${inst.id}`,
          done: paid,
          label: isReimbursement ? `${label} (Reimbursement) Paid` : `${label} Confirmed`,
          date: paid && inst.paidAt ? fmt(inst.paidAt) : null,
          sub: paid ? [inst.paidBy?.name ? `by ${inst.paidBy.name}` : null] : [],
          photos: paid ? inst.transferProofKeys : [],
          photoLabel: 'View transfer proof',
        })
      }
      return paymentSteps
    })(),
    // Routed POs (detail.transitStops.length > 0) ship Supplier -> first stop as the normal
    // dispatch+receipt flow below, then continue first stop -> ... -> deliveryLocationId as
    // one auto-chained StockTransfer leg per hop (detail.transitTransfers) — see
    // src/lib/purchasing/transitChain.ts.
    {
      key: 'transit',
      done: ['IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(detail.status),
      label: detail.transitStops && detail.transitStops.length > 0 ? `Dispatched — on deliver to ${detail.transitStops[0].location.name}` : 'In Transit',
      date: detail.dispatchedAt ? fmt(detail.dispatchedAt) : null,
      sub: [detail.dispatchedByName],
      photos: detail.dispatchPhotoKey ? [detail.dispatchPhotoKey] : [],
      photoLabel: 'View dispatch photo',
    },
    ...detail.receipts.map((r, i) => ({
      key: `gr-${r.id}`,
      done: true,
      label: detail.transitStops && detail.transitStops.length > 0
        ? `Arrived at ${detail.transitStops[0].location.name}`
        : (detail.receipts.length === 1 ? 'Received' : `Receipt ${i + 1}`),
      date: fmt(r.receivedAt),
      sub: [r.receiverName, `${r.items.length} item${r.items.length !== 1 ? 's' : ''}`],
      photos: r.receivePhotoKey ? [r.receivePhotoKey] : [],
      photoLabel: 'View receipt photo',
    })),
    // One Dispatched/Arrived step-pair per planned hop beyond the first stop (first stop ->
    // next stop -> ... -> final destination) — placeholders (done: false) until that leg
    // actually exists as a StockTransfer.
    ...(() => {
      if (!detail.transitStops || detail.transitStops.length === 0) return []
      const routeLocationIds = [...detail.transitStops.map(s => s.locationId), detail.deliveryLocationId].filter((x): x is string => !!x)
      const locationName = (locId: string) => detail.transitStops!.find(s => s.locationId === locId)?.location.name ?? detail.deliveryLocation?.name ?? locId
      const legSteps: Step[] = []
      for (let i = 0; i < routeLocationIds.length - 1; i++) {
        const legSequence = i + 1
        const fromName = locationName(routeLocationIds[i])
        const toName = locationName(routeLocationIds[i + 1])
        const leg = detail.transitTransfers.find(t => t.legSequence === legSequence)
        legSteps.push({
          key: `leg-${legSequence}-dispatch`,
          done: !!leg?.dispatchedAt,
          label: `Dispatched from ${fromName}`,
          date: leg?.dispatchedAt ? fmt(leg.dispatchedAt) : null,
          sub: [`to ${toName}`, leg?.dispatchedBy?.name ? `by ${leg.dispatchedBy.name}` : null],
          photos: leg?.dispatchPhotoKey ? [leg.dispatchPhotoKey] : [],
          photoLabel: 'View dispatch photo',
        })
        legSteps.push({
          key: `leg-${legSequence}-arrive`,
          done: !!leg?.receivedAt,
          label: `Arrived at ${toName}`,
          date: leg?.receivedAt ? fmt(leg.receivedAt) : null,
          sub: [leg?.receivedByName ? `by ${leg.receivedByName}` : null],
          photos: leg?.receivePhotoKey ? [leg.receivePhotoKey] : [],
          photoLabel: 'View receive photo',
        })
      }
      return legSteps
    })(),
    ...(!['RECEIVED', 'CANCELLED'].includes(detail.status) && detail.receipts.length === 0 ? [{
      key: 'receive',
      done: false,
      label: 'Received',
      date: null,
      sub: [],
    }] : []),
    ...(detail.status === 'CANCELLED' ? [{
      key: 'cancelled',
      done: true,
      label: 'Cancelled',
      date: detail.cancelledAt ? fmt(detail.cancelledAt) : null,
      sub: [detail.cancelledByName, detail.cancellationReason],
      cancelled: true,
    }] : []),
  ]

  return (
    <div className="rounded-xl border bg-card p-4 sticky top-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Order Timeline</p>
      <div>
        {steps.map((step, idx) => (
          <div key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${step.cancelled ? 'bg-red-500' : step.done ? 'bg-green-500' : 'border-2 border-muted bg-white'}`}>
                {step.cancelled
                  ? <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  : step.done
                    ? <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    : <div className="h-1.5 w-1.5 rounded-full bg-muted" />}
              </div>
              {idx < steps.length - 1 && (
                <div className="w-px flex-1 my-1.5 min-h-[16px] bg-border" />
              )}
            </div>
            <div className="pb-4 flex-1 min-w-0">
              <p className={`text-sm font-semibold leading-6 ${step.cancelled ? 'text-red-600' : !step.done ? 'text-muted-foreground/40' : ''}`}>{step.label}</p>
              {step.date && <p className="text-xs text-muted-foreground">{step.date}</p>}
              {step.sub.filter(Boolean).map((s, i) => (
                <p key={i} className="text-xs text-muted-foreground/70 truncate">{s}</p>
              ))}
              {step.photos && step.photos.length > 0 && (
                <div className="flex flex-wrap gap-x-2">
                  {step.photos.map((p, i) => (
                    <button key={i} onClick={() => setViewPhoto(p)} className="mt-1 text-xs text-green-600 hover:text-green-700 font-medium underline underline-offset-2">
                      {step.photos!.length > 1 ? `${step.photoLabel ?? 'View photo'} ${i + 1}` : (step.photoLabel ?? 'View photo')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {viewPhoto && (
        <PhotoLightbox photoKey={viewPhoto} onClose={() => setViewPhoto(null)} />
      )}
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = { DRAFT: 'Draft', ORDERED: 'Ordered', IN_TRANSIT: 'In Transit', PARTIALLY_RECEIVED: 'Partially Received', RECEIVED: 'Received', CANCELLED: 'Cancelled' }
const STATUS_COLOR: Record<string, string> = { DRAFT: 'bg-muted text-muted-foreground', ORDERED: 'bg-blue-100 text-blue-700', IN_TRANSIT: 'bg-amber-100 text-amber-700', PARTIALLY_RECEIVED: 'bg-orange-100 text-orange-700', RECEIVED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700' }
// Where the goods physically are right now — distinct from the static final destination.
// For routed POs mid-transit, reuses the server-computed currentLegLabel (which already
// tracks the open transit leg); for a direct (no transit stops) PO, derives it from
// status + dispatchedAt instead, since there's no per-leg data to draw from.
function currentLocationLabel(o: PurchaseOrder): string {
  if (o.status === 'CANCELLED') return '—'
  if (o.currentLegLabel) return o.currentLegLabel.replace(/^On deliver to/, 'On the way to')
  if (o.status === 'IN_TRANSIT' && o.dispatchedAt) {
    return o.deliveryLocation ? `On the way to ${o.deliveryLocation.name}` : 'In transit'
  }
  if (o.status === 'PARTIALLY_RECEIVED' || o.status === 'RECEIVED') {
    return o.deliveryLocation?.name ?? '—'
  }
  // DRAFT / ORDERED — ordered but not dispatched yet
  return o.deliveryLocation ? `Not shipped yet (→ ${o.deliveryLocation.name})` : 'Not shipped yet'
}

const PAYMENT_STATUS_LABEL: Record<string, string> = { UNPAID: 'Unpaid', PENDING: 'Waiting for Payment', PARTIALLY_PAID: 'Partially Paid', PAID: 'Paid' }
const PAYMENT_STATUS_COLOR: Record<string, string> = { UNPAID: 'bg-muted text-muted-foreground', PENDING: 'bg-amber-100 text-amber-700', PARTIALLY_PAID: 'bg-orange-100 text-orange-700', PAID: 'bg-green-100 text-green-700' }
const fmtDate = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtDateTime = (s: string) => new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)
const toDateInputValue = (s: string) => {
  const d = new Date(s)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Display-only mirror of src/lib/po-payment.ts's describeInstallment — labels
// a payment/reimbursement installment as a DP, a top-up, or the one that
// settles the PO, purely from its position and amount relative to the total.
function describeInstallment(grandTotal: number, requestedBefore: number, amount: number): string {
  const isFirst = requestedBefore <= 0
  const completesTotal = requestedBefore + amount >= grandTotal
  if (isFirst) return completesTotal ? 'Full Payment' : 'Down Payment'
  return completesTotal ? 'Final Payment' : 'Additional Payment'
}

function SupplierCombobox({ value, suppliers, onChange, onAdded }: {
  value: string; suppliers: SupplierOption[]; onChange: (name: string, id: string) => void; onAdded: (s: SupplierOption) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const q = search.trim().toLowerCase()
  const opts = q ? suppliers.filter(s => s.name.toLowerCase().includes(q)) : suppliers
  const exactMatch = suppliers.some(s => s.name.toLowerCase() === q)

  async function addNew() {
    const name = search.trim()
    if (!name || adding) return
    setAdding(true); setAddError('')
    try {
      const res = await fetch('/api/purchasing/suppliers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (res.ok) {
        onAdded({ id: data.id, name: data.name })
        onChange(data.name, data.id)
        setOpen(false); setSearch('')
      } else {
        setAddError(data.error ?? 'Failed to add supplier')
      }
    } catch {
      setAddError('Failed to add supplier')
    } finally { setAdding(false) }
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setSearch(''); setAddError('') }}
        className="w-full h-9 border rounded-md px-3 text-sm text-left flex items-center justify-between bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors">
        <span className={value ? '' : 'text-muted-foreground'}>{value || 'Select supplier...'}</span>
        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-xl z-50 max-h-60 flex flex-col">
            <div className="p-2 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input autoFocus className="w-full h-8 border rounded px-2.5 pl-8 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Search or add supplier..." value={search} onChange={e => { setSearch(e.target.value); setAddError('') }} />
              </div>
              {addError && <p className="text-xs text-red-600 mt-1.5">{addError}</p>}
            </div>
            <div className="overflow-y-auto">
              {opts.length === 0 && !q && (
                <p className="px-3 py-3 text-sm text-muted-foreground">No suppliers yet</p>
              )}
              {opts.map(s => (
                <button key={s.id} type="button" onClick={() => { onChange(s.name, s.id); setOpen(false); setSearch('') }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 flex items-center gap-2 transition-colors">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {s.name}
                </button>
              ))}
              {q && !exactMatch && (
                <button type="button" onClick={addNew} disabled={adding}
                  className="w-full text-left px-3 py-2.5 text-sm text-amber-700 hover:bg-amber-50 flex items-center gap-2 border-t transition-colors disabled:opacity-50">
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  {adding ? 'Adding...' : <>Add &ldquo;{search.trim()}&rdquo; as new supplier</>}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Quick-pick for a saved reimbursement bank account — selecting one fills the
// Bank Name / Account Number / Account Holder Name fields below it. Typing a
// fresh account is still just done directly in those fields (see the "Save
// this account" checkbox in the Reimburse modal) — this is purely a picker,
// not an inline multi-field add like SupplierCombobox's single `name` field.
function ReimburseAccountCombobox({ accounts, onPick }: {
  accounts: ReimburseAccountOption[]; onPick: (a: ReimburseAccountOption) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const opts = q
    ? accounts.filter(a => a.accountHolderName.toLowerCase().includes(q) || a.bankName.toLowerCase().includes(q) || a.accountNumber.includes(q))
    : accounts

  if (accounts.length === 0) return null

  return (
    <div className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setSearch('') }}
        className="w-full h-9 border rounded-md px-3 text-sm text-left flex items-center justify-between bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors">
        <span className="text-muted-foreground">Pick a saved account...</span>
        <Banknote className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-xl z-50 max-h-60 flex flex-col">
            <div className="p-2 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input autoFocus className="w-full h-8 border rounded px-2.5 pl-8 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Search saved accounts..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="overflow-y-auto">
              {opts.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">No matches</p>}
              {opts.map(a => (
                <button key={a.id} type="button" onClick={() => { onPick(a); setOpen(false); setSearch('') }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors">
                  <p className="font-medium">{a.accountHolderName}</p>
                  <p className="text-xs text-muted-foreground">{a.bankName} · {a.accountNumber}</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function EmployeeCombobox({ value, employees, onChange }: {
  value: string; employees: EmployeeOption[]; onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const opts = q ? employees.filter(e => e.fullName.toLowerCase().includes(q) || e.employeeNumber.toLowerCase().includes(q)) : employees
  const selected = employees.find(e => e.id === value)

  return (
    <div className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setSearch('') }}
        className="w-full h-9 border rounded-md px-3 text-sm text-left flex items-center justify-between bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors">
        <span className={selected ? '' : 'text-muted-foreground'}>{selected ? selected.fullName : 'Select employee (optional)...'}</span>
        <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-xl z-50 max-h-60 flex flex-col">
            <div className="p-2 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input autoFocus className="w-full h-8 border rounded px-2.5 pl-8 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="overflow-y-auto">
              {value && (
                <button type="button" onClick={() => { onChange(''); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted border-b transition-colors">
                  Clear selection
                </button>
              )}
              {opts.length === 0 && (
                <p className="px-3 py-3 text-sm text-muted-foreground">No employees found</p>
              )}
              {opts.map(e => (
                <button key={e.id} type="button" onClick={() => { onChange(e.id); setOpen(false); setSearch('') }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 flex items-start gap-2 transition-colors">
                  <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="min-w-0">
                    <span className="block truncate">{e.fullName}</span>
                    {(e.office || e.department) && (
                      <span className="block text-[11px] text-muted-foreground truncate">{[e.office, e.department].filter(Boolean).join(' · ')}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

type OrderLine = { itemId: string; itemName: string; baseUnit: string; purchaseUnit: string; itemUnit: string; orderedQty: number; unitCost: number; search: string; open: boolean }

// Portal-based so the dropdown isn't clipped by the line-items table's
// overflow-x-auto scroll container (a plain absolute/relative pair would get cut
// off at the table's bottom edge, since setting overflow-x forces overflow-y to
// clip too per the CSS spec).
function ItemPickerCell({ idx, line, locked, purchaseItems, historicalCustomItems, inp, setLines, pickItem, pickCustomItem }: {
  idx: number; line: OrderLine; locked: boolean
  purchaseItems: PurchaseItem[]; historicalCustomItems: { name: string; unit: string }[]
  inp: string
  setLines: React.Dispatch<React.SetStateAction<OrderLine[]>>
  pickItem: (idx: number, item: PurchaseItem) => void
  pickCustomItem: (idx: number, name: string, unit?: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    if (!line.open || !wrapRef.current) { setPos(null); return }
    const update = () => {
      const r = wrapRef.current!.getBoundingClientRect()
      setPos({ top: r.bottom, left: r.left, width: r.width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [line.open])

  const sugg = line.search.length >= 1
    ? purchaseItems.filter(i => i.name.toLowerCase().includes(line.search.toLowerCase()) || i.sku.toLowerCase().includes(line.search.toLowerCase())).slice(0, 8)
    : purchaseItems.slice(0, 8)
  const customSugg = (line.search.length >= 1
    ? historicalCustomItems.filter(i => i.name.toLowerCase().includes(line.search.toLowerCase()))
    : historicalCustomItems
  ).slice(0, 5)

  if (!line.open) {
    return (
      <button disabled={locked} onClick={() => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, open: true, search: '' }))}
        className={`${inp} text-left flex items-center gap-2 ${!line.itemName ? 'text-muted-foreground' : ''}`}>
        {line.itemName
          ? <><Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="flex-1 truncate">{line.itemName}</span></>
          : <><Search className="h-3.5 w-3.5 shrink-0" /><span>Select item...</span></>
        }
      </button>
    )
  }

  const close = () => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, open: false, search: '' }))

  return (
    <div ref={wrapRef} className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <input autoFocus className={`${inp} pl-8`} placeholder="Search item..."
        value={line.search}
        onChange={e => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, search: e.target.value }))}
        onKeyDown={e => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          // Picks the top match — catalog items first, then non-stock items
          // previously used, then falls back to the typed text as a custom item.
          if (sugg[0]) pickItem(idx, sugg[0])
          else if (customSugg[0]) pickCustomItem(idx, customSugg[0].name, customSugg[0].unit)
          else if (line.search.trim()) pickCustomItem(idx, line.search)
        }}
      />
      {pos && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="fixed z-50 bg-white border rounded-lg shadow-xl max-h-52 overflow-y-auto"
            style={{ top: pos.top + 2, left: pos.left, width: pos.width }}>
            {sugg.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">No items found</p>
            ) : sugg.map(item => (
              <button key={item.id} onClick={() => pickItem(idx, item)}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-amber-50 flex items-center gap-2.5 border-b last:border-0 transition-colors">
                <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium flex-1">{item.name}</span>
                <span className="text-muted-foreground text-xs font-mono">{item.sku}</span>
                <span className="text-muted-foreground text-xs">{item.baseUnit}</span>
                {item.avgPrice > 0 && <span className="text-xs text-amber-700 font-medium">{fmtMoney(item.avgPrice)}</span>}
              </button>
            ))}
            {customSugg.length > 0 && (
              <div className="border-t">
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Previously used (non-stock)</p>
                {customSugg.map(c => (
                  <button key={c.name} onClick={() => pickCustomItem(idx, c.name, c.unit)}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-amber-50 flex items-center gap-2.5 border-b last:border-0 transition-colors">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium flex-1">{c.name}</span>
                    {c.unit && <span className="text-muted-foreground text-xs">{c.unit}</span>}
                  </button>
                ))}
              </div>
            )}
            {line.search.trim()
              && !purchaseItems.some(i => i.name.toLowerCase() === line.search.trim().toLowerCase())
              && !historicalCustomItems.some(c => c.name.toLowerCase() === line.search.trim().toLowerCase()) && (
              <button onClick={() => pickCustomItem(idx, line.search)}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-green-50 flex items-center gap-2.5 border-t transition-colors">
                <Plus className="h-3.5 w-3.5 text-green-600 shrink-0" />
                <span className="font-medium text-green-700 flex-1">Use &quot;{line.search.trim()}&quot;</span>
                <span className="text-xs text-green-600">Not in master list</span>
              </button>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

function TripCombobox({ value, valueLabel, trips, onChange }: {
  value: string; valueLabel: string; trips: TripOption[]; onChange: (id: string, label: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [yachtFilter, setYachtFilter] = useState('')
  const yachtOptions = Array.from(new Map(trips.filter(t => t.yacht).map(t => [t.yacht!.id, t.yacht!.name])).entries())
  const q = search.trim().toLowerCase()
  const opts = trips.filter(t => {
    if (yachtFilter && t.yacht?.id !== yachtFilter) return false
    if (!q) return true
    return t.bookingCode.toLowerCase().includes(q)
      || (t.destination ?? '').toLowerCase().includes(q)
      || t.leadGuestName.toLowerCase().includes(q)
      || t.guestNames.some(n => n.toLowerCase().includes(q))
  }).slice(0, 30)

  return (
    <div className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setSearch('') }}
        className="w-full h-9 border rounded-md px-3 text-sm text-left flex items-center justify-between bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors">
        <span className={value ? '' : 'text-muted-foreground'}>{value ? valueLabel : 'Select trip (optional)...'}</span>
        <Ship className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
            <div className="p-2 border-b shrink-0 space-y-1.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input autoFocus className="w-full h-8 border rounded px-2.5 pl-8 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Search booking code, guest, destination..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className="w-full h-8 border rounded px-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                value={yachtFilter} onChange={e => setYachtFilter(e.target.value)}>
                <option value="">All yachts</option>
                {yachtOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div className="overflow-y-auto">
              {value && (
                <button type="button" onClick={() => { onChange('', ''); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted border-b transition-colors">
                  Clear selection
                </button>
              )}
              {opts.length === 0 && (
                <p className="px-3 py-3 text-sm text-muted-foreground">No trips found</p>
              )}
              {opts.map(t => {
                const label = `${t.bookingCode}${t.yacht ? ` — ${t.yacht.name}` : ''}`
                return (
                  <button key={t.id} type="button" onClick={() => { onChange(t.id, label); setOpen(false); setSearch('') }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 flex items-start gap-2 border-b last:border-0 transition-colors">
                    <Ship className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="font-medium truncate">{t.bookingCode}</span>
                        <span className={`px-1.5 py-0 rounded text-[10px] font-medium shrink-0 ${t.tripType === 'PRIVATE_CHARTER' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {t.tripType === 'PRIVATE_CHARTER' ? 'Private' : 'Open Trip'}
                        </span>
                        {t.status === 'cancelled' && <span className="px-1.5 py-0 rounded text-[10px] font-medium bg-red-100 text-red-700 shrink-0">Cancelled</span>}
                      </span>
                      <span className="block text-[11px] text-muted-foreground truncate">
                        {t.yacht?.name ?? '—'} · {fmtDate(t.startDate)}–{fmtDate(t.endDate)}
                      </span>
                      <span className="block text-[11px] text-muted-foreground truncate">
                        {t.tripType === 'PRIVATE_CHARTER' ? t.leadGuestName : (t.destination ?? '—')}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function PhotoLightbox({ photoKey, onClose }: { photoKey: string; onClose: () => void }) {
  const isPdf = isPdfDataUrl(photoKey)
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
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
        <p className="text-center text-white/60 text-xs mt-3">Click outside to close</p>
      </div>
    </div>
  )
}

function ItemsDetailModal({ order, onClose }: { order: PurchaseOrder; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <p className="text-sm font-semibold">{order.poNumber}</p>
            <p className="text-xs text-muted-foreground">{order.supplierName ?? 'TBD'}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/30 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Item</th>
                <th className="text-right px-4 py-2.5 font-medium">Qty</th>
                <th className="text-right px-4 py-2.5 font-medium">Unit Price</th>
                <th className="text-right px-4 py-2.5 font-medium">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {order.items.map(i => (
                <tr key={i.id}>
                  <td className="px-4 py-2.5">{i.itemName}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{i.orderedQty}{i.unit ? ` ${i.unit}` : ''}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{fmtMoney(i.unitCost)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{i.receivedQty ?? 0}/{i.orderedQty}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  )
}

export default function OrdersPage({ warehouseView = false, openPoId, onOpenPoHandled }: { warehouseView?: boolean; openPoId?: string | null; onOpenPoHandled?: () => void }) {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role ?? ''
  // canReceive is now computed per-order based on deliveryLocation.managedBy
  const isAdminish = ['ADMIN', 'SUPER_ADMIN'].includes(role)
  const canTransit = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN'].includes(role)

  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // list filters
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterDestination, setFilterDestination] = useState('')
  const [filterRequestedBy, setFilterRequestedBy] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [itemSearch, setItemSearch] = useState('')
  const [itemsPopoverOrder, setItemsPopoverOrder] = useState<PurchaseOrder | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 14
  // Separate pagination for the tablet/mobile card layout (< lg) — a 10-column-wide
  // table doesn't fit a tablet screen even with horizontal scroll, so below `lg` we
  // swap to stacked two-line cards instead. Own page size/state since the card layout
  // fits fewer rows per screen than the desktop table.
  const [cardPage, setCardPage] = useState(1)
  const CARD_PAGE_SIZE = 10

  // master data
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([])
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [trips, setTrips] = useState<TripOption[]>([])

  // create form
  const [supplier, setSupplier] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [requestedByEmployeeId, setRequestedByEmployeeId] = useState('')
  const [deliveryLocationId, setDeliveryLocationId] = useState('')
  const [bookingId, setBookingId] = useState('')
  const [bookingLabel, setBookingLabel] = useState('')
  const [expectedAt, setExpectedAt] = useState('')
  const [notes, setNotes] = useState('')
  // Ordered intermediate stops between the supplier and deliveryLocationId (the final
  // destination) — each hop is auto-chained into a normal StockTransfer, see
  // src/lib/purchasing/transitChain.ts.
  const [transitStopIds, setTransitStopIds] = useState<string[]>([])
  const [lines, setLines] = useState<{ itemId: string; itemName: string; baseUnit: string; purchaseUnit: string; itemUnit: string; orderedQty: number; unitCost: number; search: string; open: boolean }[]>([{ itemId: '', itemName: '', baseUnit: '', purchaseUnit: '', itemUnit: '', orderedQty: 1, unitCost: 0, search: '', open: false }])
  // Lets Enter in Qty jump straight to Unit Price without reaching for the mouse/Tab.
  const unitPriceRefs = useRef<(HTMLInputElement | null)[]>([])
  const qtyRefs = useRef<(HTMLInputElement | null)[]>([])
  const [extraCharges, setExtraCharges] = useState<{ label: string; amount: number }[]>([])
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT')
  const [discountValue, setDiscountValue] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // draft confirm form
  const [draftSupplier, setDraftSupplier] = useState('')
  const [draftSupplierEditing, setDraftSupplierEditing] = useState(false)
  const [draftExpectedAt, setDraftExpectedAt] = useState('')
  const [draftNotes, setDraftNotes] = useState('')
  const [draftSaving, setDraftSaving] = useState(false)
  const [draftError, setDraftError] = useState('')

  // transit photo modal
  const [transitModal, setTransitModal] = useState(false)
  const [transitPhoto, setTransitPhoto] = useState<string | null>(null)
  const [transitSaving, setTransitSaving] = useState(false)
  const [transitError, setTransitError] = useState('')
  const [transitPhotoMenuOpen, setTransitPhotoMenuOpen] = useState(false)
  const { isDragging: isDraggingTransitPhoto, dropProps: transitPhotoDropProps } = useFileDrop(files => { if (files[0]) handlePhotoFile(files[0]) })

  // cancel form
  const [cancelModal, setCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)
  const [cancelError, setCancelError] = useState('')

  // follow-up / escalation log (KPI 3)
  const [followUpModal, setFollowUpModal] = useState(false)
  const [followUpNote, setFollowUpNote] = useState('')
  const [followUpIsEscalation, setFollowUpIsEscalation] = useState(false)
  const [followUpEscalatedToId, setFollowUpEscalatedToId] = useState('')
  const [followUpSaving, setFollowUpSaving] = useState(false)
  const [followUpError, setFollowUpError] = useState('')
  const [escalationTargets, setEscalationTargets] = useState<EscalationTarget[]>([])

  // edit PO modal — reuses the create-form's supplier/lines/extraCharges/etc state (see renderOrderFormFields)
  const [editPOModal, setEditPOModal] = useState(false)
  const [editPOSaving, setEditPOSaving] = useState(false)
  const [editPOError, setEditPOError] = useState('')

  // request payment modal
  const [paymentModal, setPaymentModal] = useState(false)
  const [paymentEditId, setPaymentEditId] = useState<string | null>(null)
  const [paymentMode, setPaymentMode] = useState<'REQUEST' | 'DIRECT'>('REQUEST')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentPhotos, setPaymentPhotos] = useState<string[]>([])
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentNotaDate, setPaymentNotaDate] = useState('')
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [paymentPhotoView, setPaymentPhotoView] = useState<string | null>(null)

  // reimburse modal
  const [reimburseModal, setReimburseModal] = useState(false)
  const [reimburseEditId, setReimburseEditId] = useState<string | null>(null)
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
  const [reimburseAccounts, setReimburseAccounts] = useState<ReimburseAccountOption[]>([])
  const [reimburseSaveAccount, setReimburseSaveAccount] = useState(false)

  // receive form
  const [receiveModal, setReceiveModal] = useState(false)
  const [receiveLocation, setReceiveLocation] = useState('')
  const [receiveNotes, setReceiveNotes] = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [receiveLines, setReceiveLines] = useState<{ poItemId: string; itemId: string | null; itemName: string; orderedQty: number; receivedQty: number; unitCost: number; outcome: string; batch: string; expiryDate: string; unit?: string | null }[]>([])
  const [receivePhoto, setReceivePhoto] = useState<string | null>(null)
  const [receivePhotoMenuOpen, setReceivePhotoMenuOpen] = useState(false)
  const { isDragging: isDraggingReceivePhoto, dropProps: receivePhotoDropProps } = useFileDrop(files => { if (files[0]) handleReceivePhotoFile(files[0]) })
  const [receiveSaving, setReceiveSaving] = useState(false)
  const [receiveError, setReceiveError] = useState('')

  // no-login crew "receive goods" link
  const [receiveLinkModal, setReceiveLinkModal] = useState(false)
  const [receiveLink, setReceiveLink] = useState('')
  const [receiveLinkLoading, setReceiveLinkLoading] = useState(false)
  const [receiveLinkError, setReceiveLinkError] = useState('')
  const [receiveLinkCopied, setReceiveLinkCopied] = useState(false)

  // Transit leg dispatch/receive — acts on the auto-chained StockTransfer for the PO's
  // current route hop directly from this page (data still lives in StockTransfer, see
  // src/lib/purchasing/transitChain.ts), so the PO creator/receiver never has to leave
  // the PO to move goods through the rest of the route.
  const [legActionModal, setLegActionModal] = useState<{ leg: TransitLeg; action: 'dispatch' | 'receive' } | null>(null)
  const [legPhoto, setLegPhoto] = useState<string | null>(null)
  const [legPhotoMenuOpen, setLegPhotoMenuOpen] = useState(false)
  const { isDragging: isDraggingLegPhoto, dropProps: legPhotoDropProps } = useFileDrop(files => { if (files[0]) handleLegPhotoFile(files[0]) })
  const [legReceiverName, setLegReceiverName] = useState('')
  const [legSaving, setLegSaving] = useState(false)
  const [legError, setLegError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [oRes, iRes, sRes, lRes, eRes, rRes, tripsRes] = await Promise.all([fetch('/api/purchasing/orders'), fetch('/api/purchasing/items'), fetch('/api/purchasing/suppliers'), fetch('/api/purchasing/locations'), fetch('/api/purchasing/employees'), fetch('/api/purchasing/reimburse-accounts'), fetch('/api/purchasing/trips')])
    if (oRes.ok) setOrders(await oRes.json())
    if (iRes.ok) setPurchaseItems((await iRes.json()).filter((i: PurchaseItem) => i.isActive))
    if (sRes.ok) setSuppliers((await sRes.json()).filter((s: { isActive?: boolean }) => s.isActive !== false))
    if (lRes.ok) setLocations((await lRes.json()).filter((l: StockLocation) => l.isActive !== false))
    if (eRes.ok) setEmployees(await eRes.json())
    if (rRes.ok) setReimburseAccounts(await rRes.json())
    if (tripsRes.ok) setTrips(await tripsRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Deep-link from Item by Location's "click PO number" — open straight into
  // that PO's detail, then report back so the same id doesn't re-trigger.
  useEffect(() => {
    if (!openPoId) return
    openDetail({ id: openPoId } as PurchaseOrder)
    onOpenPoHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPoId])

  async function openDetail(o: PurchaseOrder) {
    setView('detail'); setDetailLoading(true)
    const res = await fetch(`/api/purchasing/orders/${o.id}`)
    if (res.ok) {
      const d = await res.json()
      setDetail(d)
      if (d.status === 'DRAFT') {
        setDraftSupplier(d.supplierName ?? '')
        setDraftNotes(d.notes ?? '')
        setDraftSupplierEditing(false)
      }
    }
    setDetailLoading(false)
  }

  // open: true so the new row's item search box (which is `autoFocus`) grabs focus right
  // away — lets you keep typing the next item without reaching for the mouse.
  function addLine() { setLines(l => [...l, { itemId: '', itemName: '', baseUnit: '', purchaseUnit: '', itemUnit: '', orderedQty: 1, unitCost: 0, search: '', open: true }]) }
  function removeLine(i: number) { setLines(l => l.filter((_, idx) => idx !== i)) }
  function addCharge() { setExtraCharges(c => [...c, { label: '', amount: 0 }]) }
  function removeCharge(i: number) { setExtraCharges(c => c.filter((_, idx) => idx !== i)) }
  function updateCharge(i: number, patch: Partial<{ label: string; amount: number }>) {
    setExtraCharges(c => c.map((charge, idx) => idx !== i ? charge : { ...charge, ...patch }))
  }
  // Item picked (click or Enter) → Qty is the natural next field, so jump focus there for
  // uninterrupted keyboard entry. Deferred a tick since the Qty input for this row doesn't
  // exist yet in the DOM until the setLines() above re-renders.
  function focusQtyNextTick(idx: number) {
    setTimeout(() => qtyRefs.current[idx]?.focus(), 0)
  }
  function pickItem(idx: number, item: PurchaseItem) {
    setLines(l => l.map((line, i) => i !== idx ? line : {
      ...line,
      itemId: item.id, itemName: item.name,
      baseUnit: item.baseUnit, purchaseUnit: item.purchaseUnit,
      itemUnit: item.purchaseUnit, // default to purchase unit
      unitCost: item.avgPrice > 0 ? item.avgPrice : line.unitCost,
      search: '', open: false,
    }))
    focusQtyNextTick(idx)
  }
  function pickCustomItem(idx: number, name: string, unit = '') {
    setLines(l => l.map((line, i) => i !== idx ? line : {
      ...line,
      itemId: '', itemName: name.trim(),
      baseUnit: '', purchaseUnit: '', itemUnit: unit,
      search: '', open: false,
    }))
    focusQtyNextTick(idx)
  }

  // Create and Edit share the same supplier/lines/extraCharges/etc state (see
  // renderOrderFormFields) — this clears it back to a blank slate, needed before
  // opening Create so leftover data from a cancelled Edit session doesn't leak in.
  function resetOrderForm() {
    setSupplier(''); setSupplierId(''); setRequestedByEmployeeId(''); setDeliveryLocationId(''); setBookingId(''); setBookingLabel(''); setExpectedAt(''); setNotes('')
    setLines([{ itemId: '', itemName: '', baseUnit: '', purchaseUnit: '', itemUnit: '', orderedQty: 1, unitCost: 0, search: '', open: false }])
    setExtraCharges([])
    setDiscountType('PERCENT'); setDiscountValue(0)
    setTransitStopIds([])
  }

  async function submit() {
    setSaving(true); setSaveError('')
    if (!supplier.trim()) { setSaveError('Supplier name is required'); setSaving(false); return }
    if (!requestedByEmployeeId) { setSaveError('Requested By is required'); setSaving(false); return }
    const res = await fetch('/api/purchasing/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierId: supplierId || undefined, supplierName: supplier, deliveryLocationId: deliveryLocationId || undefined, bookingId: bookingId || undefined, expectedAt: expectedAt || undefined, notes,
        requestedByEmployeeId: requestedByEmployeeId || undefined,
        items: lines.map(l => ({ itemId: l.itemId || undefined, itemName: l.itemName, orderedQty: l.orderedQty, unitCost: l.unitCost, unit: l.itemId ? undefined : (l.itemUnit || undefined) })),
        extraCharges: extraCharges.filter(c => c.label.trim() || c.amount),
        discountType: discountValue > 0 ? discountType : undefined,
        discountValue: discountValue > 0 ? discountValue : undefined,
        transitStops: transitStopIds,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setSaveError(data.error ?? 'An error occurred'); setSaving(false); return }
    setSaving(false); setView('list')
    resetOrderForm()
    load()
  }

  async function openReceive() {
    if (!detail) return
    setReceiveLines(detail.items.map(i => ({
      poItemId: i.id, itemId: i.itemId, itemName: i.itemName,
      orderedQty: i.orderedQty, receivedQty: i.orderedQty - (i.receivedQty ?? 0),
      unitCost: i.unitCost, outcome: 'ACCEPTED', batch: '', expiryDate: '', unit: i.unit,
    })))
    setReceivePhoto(null)
    setReceiverName((session?.user as { name?: string })?.name ?? '')
    setReceiveError(''); setReceiveModal(true)
    const lRes = await fetch('/api/purchasing/locations')
    if (lRes.ok) {
      const all = await lRes.json()
      const active = all.filter((l: StockLocation) => l.isActive !== false)
      setLocations(active)
      // Goods from the supplier can only land at the first transit stop when the PO has a
      // route — the API enforces this server-side too (src/lib/purchasing/transitChain.ts).
      const firstStopId = detail.transitStops?.[0]?.locationId
      setReceiveLocation(firstStopId ?? detail.deliveryLocationId ?? active[0]?.id ?? '')
    }
  }

  async function openReceiveLink() {
    if (!detail) return
    setReceiveLink(''); setReceiveLinkError(''); setReceiveLinkCopied(false); setReceiveLinkLoading(true); setReceiveLinkModal(true)
    const res = await fetch(`/api/purchasing/orders/${detail.id}/receive-link`, { method: 'POST' })
    const data = await res.json()
    setReceiveLinkLoading(false)
    if (!res.ok) { setReceiveLinkError(data.error ?? 'Gagal membuat link'); return }
    setReceiveLink(data.link)
  }

  async function handleReceivePhotoFile(file: File) {
    const canvas = document.createElement('canvas')
    const img = new window.Image()
    img.onload = () => {
      const MAX = 1200
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      canvas.width = img.width * scale; canvas.height = img.height * scale
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      setReceivePhoto(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.src = URL.createObjectURL(file)
  }

  async function submitReceive() {
    if (!detail) return
    setReceiveSaving(true); setReceiveError('')
    if (!receiveLocation) { setReceiveError('Delivery location PO tidak ditemukan'); setReceiveSaving(false); return }
    if (!receivePhoto) { setReceiveError('Foto bukti penerimaan barang wajib diupload'); setReceiveSaving(false); return }
    const validLines = receiveLines.filter(l => l.receivedQty > 0)
    if (!validLines.length) { setReceiveError('Masukkan jumlah barang yang diterima'); setReceiveSaving(false); return }
    const res = await fetch('/api/purchasing/receipts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: detail.id, locationId: receiveLocation, notes: receiveNotes, receivePhotoKey: receivePhoto, receiverName: receiverName.trim() || undefined, items: validLines }),
    })
    const data = await res.json()
    if (!res.ok) { setReceiveError(data.error ?? 'Failed to save'); setReceiveSaving(false); return }
    setReceiveSaving(false); setReceiveModal(false)
    openDetail(detail)
    load()
  }

  // ── List ──
  const WAREHOUSE_STATUSES = ['ORDERED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED']
  // "Involves the warehouse" — either the final destination is a warehouse location,
  // or the shipping route transits through one, even if the final stop is elsewhere
  // (e.g. straight to a vessel).
  const involvesWarehouse = (o: PurchaseOrder) =>
    o.deliveryLocation?.type === 'WAREHOUSE' || !!o.transitStops?.some(s => s.location.type === 'WAREHOUSE')
  const scopedOrders = warehouseView
    ? orders.filter(o => WAREHOUSE_STATUSES.includes(o.status) && involvesWarehouse(o))
    : orders
  const supplierOptions = Array.from(new Set(scopedOrders.map(o => o.supplierName).filter((n): n is string => !!n))).sort()
  const destinationOptions = Array.from(new Set(scopedOrders.map(o => o.deliveryLocation?.name).filter((n): n is string => !!n))).sort()
  const requestedByOptions = Array.from(new Set(scopedOrders.map(o => o.requestedByName).filter((n): n is string => !!n))).sort()
  const hasActiveFilters = !!(filterSupplier || filterDestination || filterRequestedBy || filterDate || itemSearch.trim())
  const visibleOrders = scopedOrders.filter(o => {
    if (filterSupplier && o.supplierName !== filterSupplier) return false
    if (filterDestination && o.deliveryLocation?.name !== filterDestination) return false
    if (filterRequestedBy && o.requestedByName !== filterRequestedBy) return false
    if (filterDate && toDateInputValue(o.orderedAt) !== filterDate) return false
    if (itemSearch.trim()) {
      const q = itemSearch.trim().toLowerCase()
      if (!o.items.some(i => i.itemName.toLowerCase().includes(q))) return false
    }
    return true
  })
  const totalPages = Math.max(1, Math.ceil(visibleOrders.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageOrders = visibleOrders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const cardTotalPages = Math.max(1, Math.ceil(visibleOrders.length / CARD_PAGE_SIZE))
  const cardCurrentPage = Math.min(cardPage, cardTotalPages)
  const cardPageOrders = visibleOrders.slice((cardCurrentPage - 1) * CARD_PAGE_SIZE, cardCurrentPage * CARD_PAGE_SIZE)

  if (view === 'list') return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{visibleOrders.length} purchase order</p>
        {!warehouseView && (
          <button onClick={() => { resetOrderForm(); setView('create') }} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
            <Plus className="h-4 w-4" /> Create PO
          </button>
        )}
      </div>
      {/* Grid on tablet/mobile (2 filters per row, tidy) — reverts to the desktop
          flex-wrap row at lg where there's room for everything on one line. */}
      <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap lg:items-center">
        <div className="relative w-full lg:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            className="h-9 w-full border rounded-md pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white transition-colors"
            placeholder="Search item..."
            value={itemSearch}
            onChange={e => { setItemSearch(e.target.value); setPage(1); setCardPage(1) }}
          />
        </div>
        <select className="h-9 w-full lg:w-auto border rounded-md px-2.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors" value={filterSupplier} onChange={e => { setFilterSupplier(e.target.value); setPage(1); setCardPage(1) }}>
          <option value="">All suppliers</option>
          {supplierOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="h-9 w-full lg:w-auto border rounded-md px-2.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors" value={filterDestination} onChange={e => { setFilterDestination(e.target.value); setPage(1); setCardPage(1) }}>
          <option value="">All destinations</option>
          {destinationOptions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="h-9 w-full lg:w-auto border rounded-md px-2.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors" value={filterRequestedBy} onChange={e => { setFilterRequestedBy(e.target.value); setPage(1); setCardPage(1) }}>
          <option value="">All requesters</option>
          {requestedByOptions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <input type="date" className="h-9 w-full lg:w-auto border rounded-md px-2.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors" value={filterDate} onChange={e => { setFilterDate(e.target.value); setPage(1); setCardPage(1) }} />
        {hasActiveFilters && (
          <button
            onClick={() => { setFilterSupplier(''); setFilterDestination(''); setFilterRequestedBy(''); setFilterDate(''); setItemSearch(''); setPage(1); setCardPage(1) }}
            className="col-span-2 lg:col-span-1 text-left lg:text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>
      {/* Desktop table — full column set, only makes sense at lg+ width */}
      <div className="hidden lg:block rounded-lg border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">PO No.</th>
              <th className="text-left px-4 py-3 font-medium w-72">Items</th>
              <th className="text-left px-4 py-3 font-medium w-28">Supplier</th>
              <th className="text-left px-4 py-3 font-medium">Current Location</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Payment</th>
              <th className="text-left px-4 py-3 font-medium">PO Created By</th>
              <th className="text-left px-4 py-3 font-medium">Requested By</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? <>
              {[...Array(5)].map((_, i) => (
                <tr key={i} className="border-t">
                  <td className="px-4 py-3.5"><div className="h-3.5 w-28 rounded bg-muted animate-pulse" /></td>
                  <td className="px-4 py-3.5"><div className="h-3.5 w-24 rounded bg-muted animate-pulse" /></td>
                  <td className="px-4 py-3.5"><div className="h-3.5 w-20 rounded bg-muted animate-pulse" /></td>
                  <td className="px-4 py-3.5"><div className="h-3.5 w-20 rounded bg-muted animate-pulse" /></td>
                  <td className="px-4 py-3.5"><div className="h-3.5 w-24 rounded bg-muted animate-pulse" /></td>
                  <td className="px-4 py-3.5"><div className="h-3.5 w-20 rounded bg-muted animate-pulse" /></td>
                  <td className="px-4 py-3.5"><div className="h-3.5 w-20 rounded bg-muted animate-pulse" /></td>
                  <td className="px-4 py-3.5"><div className="h-5 w-20 rounded-full bg-muted animate-pulse" /></td>
                  <td className="px-4 py-3.5"><div className="h-5 w-20 rounded-full bg-muted animate-pulse" /></td>
                  <td className="px-4 py-3.5" />
                </tr>
              ))}
            </>
              : visibleOrders.length === 0 ? <tr><td colSpan={10} className="text-center py-12 text-muted-foreground text-sm">{hasActiveFilters ? 'No matching purchase orders.' : warehouseView ? 'Tidak ada PO yang perlu diproses.' : 'No POs yet.'}</td></tr>
              : pageOrders.map(o => {
                return (
                  <tr key={o.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(o)}>
                    <td className="px-4 py-3 font-mono text-xs font-medium">{o.poNumber}</td>
                    <td className="px-4 py-3 max-w-72">
                      {o.items.length === 0 ? (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      ) : (
                        <button
                          title={o.items.map(i => i.itemName).join(', ')}
                          onClick={e => { e.stopPropagation(); setItemsPopoverOrder(o) }}
                          className="block w-full truncate text-left text-xs font-medium text-amber-700 hover:text-amber-900 hover:underline underline-offset-2 transition-colors"
                        >
                          {o.items[0].itemName}
                          {o.items.length > 1 && <span className="text-muted-foreground font-normal"> +{o.items.length - 1} more</span>}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-28 truncate text-xs" title={o.supplierName ?? undefined}>{o.supplierName ?? <span className="text-muted-foreground italic">TBD</span>}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{currentLocationLabel(o)}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(o.orderedAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[o.status] ?? ''}`}>{o.currentLegLabel ?? STATUS_LABEL[o.status] ?? o.status}</span>
                      {o.lastReceivedBy && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">by {o.lastReceivedBy}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${PAYMENT_STATUS_COLOR[o.paymentStatus] ?? ''}`}>{PAYMENT_STATUS_LABEL[o.paymentStatus] ?? o.paymentStatus}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{o.createdByName ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {o.requestedByName ? (
                        <div>
                          <p>{o.requestedByName}</p>
                          {(o.requestedByOffice || o.requestedByDepartment) && (
                            <p className="text-[10px] text-muted-foreground/70">
                              {[o.requestedByOffice, o.requestedByDepartment].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                  </tr>
                )
              })}
          </tbody>
        </table></div>
      </div>
      {!loading && visibleOrders.length > 0 && totalPages > 1 && (
        <div className="hidden lg:flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {currentPage} of {totalPages} · {visibleOrders.length} purchase order{visibleOrders.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="h-8 px-3 text-sm border rounded-md hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              Prev
            </button>
            <span className="text-sm text-muted-foreground px-2">{currentPage} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="h-8 px-3 text-sm border rounded-md hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Tablet/mobile card layout — one PO per card, two lines, own 10-per-page pagination */}
      <div className="lg:hidden space-y-2">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2 animate-pulse">
              <div className="h-3.5 w-32 rounded bg-muted" />
              <div className="h-3.5 w-48 rounded bg-muted" />
            </div>
          ))
        ) : visibleOrders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm border rounded-lg">
            {hasActiveFilters ? 'No matching purchase orders.' : warehouseView ? 'Tidak ada PO yang perlu diproses.' : 'No POs yet.'}
          </div>
        ) : cardPageOrders.map(o => (
          <button
            key={o.id}
            onClick={() => openDetail(o)}
            className="w-full text-left rounded-lg border p-3 space-y-1.5 hover:bg-muted/30 active:bg-muted/50 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold">{o.poNumber}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLOR[o.status] ?? ''}`}>{o.currentLegLabel ?? STATUS_LABEL[o.status] ?? o.status}</span>
                <span className="text-xs text-muted-foreground">{fmtDate(o.orderedAt)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="truncate min-w-0">
                {o.items.length === 0 ? '—' : (
                  <>
                    <span className="font-medium text-foreground">{o.items[0].itemName}</span>
                    {o.items.length > 1 && <span> +{o.items.length - 1} more</span>}
                    {' · '}{o.supplierName ?? 'TBD'}
                  </>
                )}
              </span>
              <span className="flex items-center gap-1 shrink-0"><MapPin className="h-3 w-3" />{currentLocationLabel(o)}</span>
            </div>
          </button>
        ))}
      </div>
      {!loading && visibleOrders.length > 0 && cardTotalPages > 1 && (
        <div className="lg:hidden flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {cardCurrentPage} of {cardTotalPages} · {visibleOrders.length} purchase order{visibleOrders.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCardPage(p => Math.max(1, p - 1))}
              disabled={cardCurrentPage <= 1}
              className="h-8 px-3 text-sm border rounded-md hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              Prev
            </button>
            <span className="text-sm text-muted-foreground px-2">{cardCurrentPage} / {cardTotalPages}</span>
            <button
              onClick={() => setCardPage(p => Math.min(cardTotalPages, p + 1))}
              disabled={cardCurrentPage >= cardTotalPages}
              className="h-8 px-3 text-sm border rounded-md hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {itemsPopoverOrder && (
        <ItemsDetailModal order={itemsPopoverOrder} onClose={() => setItemsPopoverOrder(null)} />
      )}
    </div>
  )

  // ── Create ──
  // Shared by Create PO and Edit PO — both read/write the same supplier/lines/extraCharges/etc
  // state, so this is the one place that renders those fields instead of two JSX copies to keep
  // in sync. `locked` disables Items/Extra Charges/Discount (still shown, read-only) — used for
  // Edit once the PO has receipts or payment records, since rewriting the total after money has
  // moved against it would desync GoodsReceiptItem cost history and already-requested/paid
  // amounts (see the matching guard in PATCH /api/purchasing/orders/[id]).
  function renderOrderFormFields(locked = false) {
    // Route can only be edited before dispatch — matches the server-side guard in
    // PATCH /api/purchasing/orders/[id]. Only applies in Edit (Create has no detail yet).
    const routeLocked = editPOModal && !!detail?.dispatchedAt
    const itemsTotal = lines.reduce((s, l) => s + l.orderedQty * l.unitCost, 0)
    const chargesTotal = extraCharges.reduce((s, c) => s + c.amount, 0)
    const discountAmount = Math.min(itemsTotal, discountType === 'PERCENT' ? itemsTotal * (discountValue / 100) : discountValue)
    const afterDiscount = itemsTotal - discountAmount
    const total = afterDiscount + chargesTotal
    const inp = 'w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
    // Non-stock items (custom PO lines with no itemId) aren't in the master
    // catalog, so they'd normally have to be retyped from scratch every time —
    // surfacing names already used on past POs lets a repeat non-stock buy
    // (e.g. "Grab", "Event flowers") get picked instead of retyped.
    const historicalCustomItems = Array.from(
      new Map(orders.flatMap(o => o.items).filter(i => !i.itemId).map(i => [i.itemName, i.unit ?? ''])).entries()
    ).map(([name, unit]) => ({ name, unit }))
    return (
      <>
        {/* Order Info */}
        <div className="rounded-xl border bg-white">
          <div className="px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">Order Info</h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Supplier <span className="text-red-500">*</span></label>
                <SupplierCombobox
                  value={supplier}
                  suppliers={suppliers}
                  onChange={(name, id) => { setSupplier(name); setSupplierId(id) }}
                  onAdded={s => setSuppliers(prev => [...prev, s])}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Delivery Location</label>
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <select className={`${inp} pl-8`} value={deliveryLocationId} onChange={e => setDeliveryLocationId(e.target.value)}>
                    <option value="">— Pilih lokasi —</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                {deliveryLocationId && (() => {
                  const loc = locations.find(l => l.id === deliveryLocationId)
                  return loc ? <p className="text-xs text-muted-foreground mt-1">Diterima oleh tim <span className="font-medium">{loc.managedBy === 'PURCHASING' ? 'Purchasing' : 'Warehouse'}</span></p> : null
                })()}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Expected Arrival <span className="font-normal">(optional)</span></label>
                <input type="date" className={inp} value={expectedAt} onChange={e => setExpectedAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Requested By <span className="text-red-500">*</span></label>
                <EmployeeCombobox value={requestedByEmployeeId} employees={employees} onChange={setRequestedByEmployeeId} />
                {requestedByEmployeeId && (() => {
                  const emp = employees.find(e => e.id === requestedByEmployeeId)
                  return emp && (emp.office || emp.department || emp.role) ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      {[emp.office, emp.department, emp.role].filter(Boolean).join(' · ')}
                    </p>
                  ) : null
                })()}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">For Trip <span className="font-normal">(optional)</span></label>
                <TripCombobox value={bookingId} valueLabel={bookingLabel} trips={trips} onChange={(id, label) => { setBookingId(id); setBookingLabel(label) }} />
              </div>
            </div>

            {/* Shipping Route — optional transit stops between the supplier and the Delivery
                Location above. Each hop is auto-chained into a normal Transfer once goods
                arrive at the first stop — see /purchasing/transfers. Locked once dispatched. */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Shipping Route <span className="font-normal">(optional — routes goods through one or more transit stops before Delivery Location)</span></label>
              {routeLocked && (
                <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  <Lock className="h-3.5 w-3.5 shrink-0" /> Route is locked — this PO has already been dispatched.
                </div>
              )}
              {transitStopIds.length > 0 && (
                <div className="space-y-1.5">
                  {transitStopIds.map((locId, idx) => {
                    const loc = locations.find(l => l.id === locId)
                    return (
                      <div key={locId} className="flex items-center gap-2 border rounded-md px-3 py-1.5 bg-muted/30 text-sm">
                        <span className="text-xs font-semibold text-muted-foreground w-4 shrink-0">{idx + 1}</span>
                        <span className="flex-1 truncate">{loc?.name ?? locId}</span>
                        {!routeLocked && (
                          <>
                            <button type="button" disabled={idx === 0}
                              onClick={() => setTransitStopIds(ids => { const next = [...ids];[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; return next })}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed px-1">↑</button>
                            <button type="button" disabled={idx === transitStopIds.length - 1}
                              onClick={() => setTransitStopIds(ids => { const next = [...ids];[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]; return next })}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed px-1">↓</button>
                            <button type="button" onClick={() => setTransitStopIds(ids => ids.filter(id => id !== locId))}
                              className="text-red-500 hover:text-red-700 px-1"><X className="h-3.5 w-3.5" /></button>
                          </>
                        )}
                      </div>
                    )
                  })}
                  <p className="text-xs text-muted-foreground">
                    Final destination: <span className="font-medium">{locations.find(l => l.id === deliveryLocationId)?.name ?? '— pilih Delivery Location —'}</span>
                  </p>
                </div>
              )}
              {!routeLocked && (
                <select className={inp} value=""
                  onChange={e => { const v = e.target.value; if (v) setTransitStopIds(ids => [...ids, v]) }}>
                  <option value="">+ Add transit stop…</option>
                  {locations.filter(l => l.id !== deliveryLocationId && !transitStopIds.includes(l.id)).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Notes <span className="font-normal">(optional)</span></label>
              <textarea className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white resize-none transition-colors"
                rows={2} placeholder="Payment terms, delivery instructions, etc."
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="rounded-xl border bg-white">
          <div className="flex items-center justify-between px-5 py-4 border-b rounded-t-xl">
            <h3 className="text-sm font-semibold">Items</h3>
            {!locked && (
              <button onClick={addLine}
                className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 border border-amber-200 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add Row
              </button>
            )}
          </div>

          {locked && (
            <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 border-b text-xs text-amber-800">
              <Lock className="h-3.5 w-3.5 shrink-0" /> Items &amp; pricing are locked — this PO already has receipts or payment records.
            </div>
          )}

          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/30">
              <tr>
                <th className="text-center w-10 px-3 py-2.5 font-medium">#</th>
                <th className="text-left px-3 py-2.5 font-medium">Item</th>
                <th className="text-left px-3 py-2.5 font-medium w-28">Qty</th>
                <th className="text-left px-3 py-2.5 font-medium w-28">Unit</th>
                <th className="text-left px-3 py-2.5 font-medium w-36">Unit Price</th>
                <th className="text-right px-4 py-2.5 font-medium w-32">Subtotal</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((line, idx) => {
                const subtotal = line.orderedQty * line.unitCost
                const numInp = `${inp} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-right`
                return (
                  <tr key={idx} className="group hover:bg-muted/20 transition-colors">
                    <td className="text-center px-3 py-3 text-xs text-muted-foreground">{idx + 1}</td>

                    {/* Item picker */}
                    <td className="px-2 py-2.5 relative">
                      <ItemPickerCell
                        idx={idx} line={line} locked={locked}
                        purchaseItems={purchaseItems} historicalCustomItems={historicalCustomItems} inp={inp}
                        setLines={setLines} pickItem={pickItem} pickCustomItem={pickCustomItem}
                      />
                    </td>

                    <td className="px-2 py-2.5">
                      <input disabled={locked} ref={el => { qtyRefs.current[idx] = el }} type="number" min={0.01} step="any" className={numInp} value={line.orderedQty}
                        onChange={e => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, orderedQty: Number(e.target.value) }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); unitPriceRefs.current[idx]?.focus() } }}
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      {line.baseUnit ? (
                        line.baseUnit === line.purchaseUnit ? (
                          <span className="h-9 flex items-center px-3 text-sm text-muted-foreground">{line.baseUnit}</span>
                        ) : (
                          <div className="flex rounded-md border overflow-hidden h-9">
                            {[line.purchaseUnit, line.baseUnit].map(u => (
                              <button key={u} disabled={locked} onClick={() => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, itemUnit: u }))}
                                className={`flex-1 text-xs font-medium px-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${line.itemUnit === u ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:bg-muted'}`}>
                                {u}
                              </button>
                            ))}
                          </div>
                        )
                      ) : line.itemName ? (
                        <input disabled={locked} className={inp} placeholder="e.g. bouquet" value={line.itemUnit}
                          onChange={e => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, itemUnit: e.target.value }))} />
                      ) : (
                        <span className="h-9 flex items-center px-3 text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <input disabled={locked} ref={el => { unitPriceRefs.current[idx] = el }} type="number" min={0} step="any" className={numInp} value={line.unitCost || ''} placeholder="0.00"
                        onChange={e => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, unitCost: Number(e.target.value) }))}
                        onKeyDown={e => {
                          if (e.key !== 'Enter') return
                          e.preventDefault()
                          if (idx === lines.length - 1) addLine()
                        }}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                      {subtotal > 0 ? fmtMoney(subtotal) : <span className="text-muted-foreground font-normal">—</span>}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      {!locked && (
                        <button onClick={() => removeLine(idx)} disabled={lines.length === 1}
                          className="p-1.5 text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-0 disabled:pointer-events-none">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>

          <div className="px-5 py-4 bg-muted/20 border-t space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{lines.length} item{lines.length > 1 ? 's' : ''}</span>
              <span className="text-sm text-muted-foreground">Subtotal <span className="ml-3 text-foreground font-medium">{fmtMoney(itemsTotal)}</span></span>
            </div>

            {extraCharges.map((c, i) => (
              <div key={i} className="flex items-center justify-end gap-2">
                <input
                  disabled={locked}
                  className="h-8 w-48 border rounded-md px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white disabled:opacity-60"
                  placeholder="e.g. VAT, MOQ Fee 15%"
                  value={c.label}
                  onChange={e => updateCharge(i, { label: e.target.value })}
                />
                <input
                  disabled={locked}
                  type="number" step="any"
                  className="h-8 w-32 border rounded-md px-2.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white disabled:opacity-60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="0"
                  value={c.amount || ''}
                  onChange={e => updateCharge(i, { amount: Number(e.target.value) || 0 })}
                />
                {!locked && (
                  <button onClick={() => removeCharge(i)} className="p-1.5 text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}

            {!locked && (
              <div className="flex justify-end">
                <button onClick={addCharge}
                  className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 border border-amber-200 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Add Pricing (Tax, Fee, etc.)
                </button>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Discount</span>
              <div className="flex rounded-md border overflow-hidden h-8">
                <button type="button" disabled={locked} onClick={() => setDiscountType('PERCENT')}
                  className={`px-2.5 text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${discountType === 'PERCENT' ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:bg-muted'}`}>%</button>
                <button type="button" disabled={locked} onClick={() => setDiscountType('FIXED')}
                  className={`px-2.5 text-xs font-medium transition-colors border-l disabled:opacity-60 disabled:cursor-not-allowed ${discountType === 'FIXED' ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:bg-muted'}`}>Rp</button>
              </div>
              <input
                disabled={locked}
                type="number" step="any" min={0}
                className="h-8 w-32 border rounded-md px-2.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white disabled:opacity-60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="0"
                value={discountValue || ''}
                onChange={e => setDiscountValue(Number(e.target.value) || 0)}
              />
              {discountAmount > 0 && <span className="text-xs text-muted-foreground w-32 text-right">-{fmtMoney(discountAmount)}</span>}
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-muted-foreground">Order Total</span>
              <span className="text-lg font-bold">{fmtMoney(total)}</span>
            </div>
          </div>
        </div>
      </>
    )
  }

  if (view === 'create') {
    return (
      <div className="space-y-6">

        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Back</button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">Create Purchase Order</span>
        </div>

        {saveError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{saveError}</div>}

        {renderOrderFormFields()}

        <div className="flex justify-end gap-3 pb-4">
          <button onClick={() => setView('list')} className="px-5 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex items-center gap-2 px-6 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 font-semibold transition-colors">
            {saving ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</> : 'Create PO'}
          </button>
        </div>
      </div>
    )
  }

  function handlePhotoFile(file: File) {
    const canvas = document.createElement('canvas')
    const img = new Image()
    img.onload = () => {
      const MAX = 1200
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
      canvas.width = img.width * ratio
      canvas.height = img.height * ratio
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      setTransitPhoto(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.src = URL.createObjectURL(file)
  }

  async function confirmTransit() {
    if (!detail || !transitPhoto) { setTransitError('Photo is required'); return }
    setTransitSaving(true); setTransitError('')
    const res = await fetch(`/api/purchasing/orders/${detail.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'IN_TRANSIT', dispatchPhotoKey: transitPhoto }),
    })
    const data = await res.json()
    if (!res.ok) { setTransitError(data.error ?? 'Failed'); setTransitSaving(false); return }
    setTransitSaving(false); setTransitModal(false); setTransitPhoto(null)
    openDetail(detail); load()
  }

  function handleLegPhotoFile(file: File) {
    const canvas = document.createElement('canvas')
    const img = new Image()
    img.onload = () => {
      const MAX = 1200
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
      canvas.width = img.width * ratio
      canvas.height = img.height * ratio
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      setLegPhoto(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.src = URL.createObjectURL(file)
  }

  function openLegAction(leg: TransitLeg, action: 'dispatch' | 'receive') {
    setLegPhoto(null); setLegError('')
    setLegReceiverName(action === 'receive' ? ((session?.user as { name?: string })?.name ?? '') : '')
    setLegActionModal({ leg, action })
  }

  async function submitLegAction() {
    if (!legActionModal) return
    const { leg, action } = legActionModal
    if (!legPhoto) { setLegError('Foto wajib diupload'); return }
    setLegSaving(true); setLegError('')
    const items = leg.items.map(i => ({
      itemId: i.itemId, itemName: i.itemName,
      ...(action === 'dispatch' ? { dispatchedQty: i.requestedQty } : { receivedQty: i.dispatchedQty }),
    }))
    const res = await fetch(`/api/purchasing/transfers/${leg.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action, items,
        ...(action === 'dispatch' ? { dispatchPhotoKey: legPhoto } : { receivePhotoKey: legPhoto, receivedByName: legReceiverName.trim() || undefined }),
      }),
    })
    const data = await res.json()
    if (!res.ok) { setLegError(data.error ?? 'Failed'); setLegSaving(false); return }
    setLegSaving(false); setLegActionModal(null); setLegPhoto(null)
    if (detail) openDetail(detail)
    load()
  }

  async function confirmDraft() {
    if (!detail) return
    if (!draftSupplier.trim()) { setDraftError('Supplier name is required'); return }
    setDraftSaving(true); setDraftError('')
    const res = await fetch(`/api/purchasing/orders/${detail.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ORDERED', supplierName: draftSupplier, expectedAt: draftExpectedAt || undefined, notes: draftNotes || undefined }),
    })
    const data = await res.json()
    if (!res.ok) { setDraftError(data.error ?? 'Failed'); setDraftSaving(false); return }
    setDraftSaving(false); setDraftSupplier(''); setDraftExpectedAt(''); setDraftNotes('')
    openDetail(detail); load()
  }

  async function cancelPO() {
    if (!detail) return
    if (!cancelReason.trim()) { setCancelError('Cancellation reason is required'); return }
    setCancelSaving(true); setCancelError('')
    const res = await fetch(`/api/purchasing/orders/${detail.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED', cancellationReason: cancelReason }),
    })
    const data = await res.json()
    if (!res.ok) { setCancelError(data.error ?? 'Failed'); setCancelSaving(false); return }
    setCancelSaving(false); setCancelModal(false); setCancelReason('')
    openDetail(detail); load()
  }

  async function openFollowUpModal() {
    setFollowUpNote(''); setFollowUpIsEscalation(false); setFollowUpEscalatedToId(''); setFollowUpError(''); setFollowUpModal(true)
    if (!detail) return
    const res = await fetch(`/api/purchasing/orders/${detail.id}/follow-ups`)
    if (res.ok) { const d = await res.json(); setEscalationTargets(d.escalationTargets ?? []) }
  }

  async function saveFollowUp() {
    if (!detail) return
    if (!followUpNote.trim()) { setFollowUpError('Note is required'); return }
    setFollowUpSaving(true); setFollowUpError('')
    const res = await fetch(`/api/purchasing/orders/${detail.id}/follow-ups`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: followUpNote, isEscalation: followUpIsEscalation, escalatedToId: followUpEscalatedToId || null }),
    })
    const data = await res.json()
    setFollowUpSaving(false)
    if (!res.ok) { setFollowUpError(data.error ?? 'Failed to save'); return }
    setFollowUpModal(false)
    openDetail(detail)
  }

  async function deleteFollowUp(followUpId: string) {
    if (!detail || !confirm('Delete this follow-up entry?')) return
    const res = await fetch(`/api/purchasing/orders/${detail.id}/follow-ups/${followUpId}`, { method: 'DELETE' })
    if (res.ok) openDetail(detail)
  }

  async function submitPaymentRequest() {
    if (!detail) return
    if (!paymentAmount || Number(paymentAmount) <= 0) { setPaymentError('Amount must be greater than 0'); return }
    if (paymentPhotos.length === 0) { setPaymentError('At least one receipt/nota photo is required'); return }
    setPaymentSaving(true); setPaymentError('')
    const url = paymentEditId
      ? `/api/purchasing/orders/${detail.id}/payment-request/${paymentEditId}`
      : `/api/purchasing/orders/${detail.id}/payment-request`
    const res = await fetch(url, {
      method: paymentEditId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(paymentAmount), notePhotoKeys: paymentPhotos, notes: paymentNotes || undefined, notaDate: paymentNotaDate || undefined, paidByPurchasing: paymentMode === 'DIRECT' }),
    })
    const data = await res.json()
    if (!res.ok) { setPaymentError(data.error ?? 'Failed'); setPaymentSaving(false); return }
    setPaymentSaving(false); setPaymentModal(false)
    setPaymentAmount(''); setPaymentPhotos([]); setPaymentNotes(''); setPaymentNotaDate(''); setPaymentEditId(null)
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
      ? `/api/purchasing/orders/${detail.id}/reimbursement/${reimburseEditId}`
      : `/api/purchasing/orders/${detail.id}/reimbursement`
    const res = await fetch(url, {
      method: reimburseEditId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Number(reimburseAmount), notePhotoKeys: reimbursePhotos, notes: reimburseNotes || undefined, notaDate: reimburseNotaDate || undefined,
        requesterName: reimburseRequesterName, bankName: reimburseBankName,
        accountNumber: reimburseAccountNumber, accountHolderName: reimburseAccountHolderName,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setReimburseError(data.error ?? 'Failed'); setReimburseSaving(false); return }
    if (reimburseSaveAccount) {
      fetch('/api/purchasing/reimburse-accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountHolderName: reimburseAccountHolderName, bankName: reimburseBankName, accountNumber: reimburseAccountNumber }),
      }).catch(() => {})
    }
    setReimburseSaving(false); setReimburseModal(false)
    setReimburseAmount(''); setReimbursePhotos([]); setReimburseNotes(''); setReimburseNotaDate('')
    setReimburseRequesterName(''); setReimburseBankName(''); setReimburseAccountNumber(''); setReimburseAccountHolderName(''); setReimburseEditId(null)
    setReimburseSaveAccount(false)
    openDetail(detail); load()
  }

  // A PO can now be paid across multiple installments (DP + final
  // settlement), in any mix of Request Payment/Debit Paid/Reimburse — so
  // "has an action been taken" is no longer a single yes/no per PO.
  const hasAnyPaymentRecord = !!detail && (detail.paymentRequests.length > 0 || detail.reimbursements.length > 0)
  const canRequestMorePayment = !!detail && detail.status !== 'CANCELLED' && detail.remaining > 0
  const latestRecord = !detail ? null : [
    ...detail.paymentRequests.map(p => ({ ...p, kind: 'payment' as const })),
    ...detail.reimbursements.map(r => ({ ...r, kind: 'reimbursement' as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null
  // Only the most recent installment can be edited (and only before it's
  // paid) — earlier, already-settled installments are history.
  const canEditLatest = !!latestRecord && latestRecord.status !== 'PAID'

  function openEditAction() {
    if (!detail) return
    if (detail.status === 'CANCELLED') {
      setCancelReason(detail.cancellationReason ?? ''); setCancelError(''); setCancelModal(true)
      return
    }
    if (!latestRecord) return
    if (latestRecord.kind === 'payment') {
      const p = latestRecord
      setPaymentMode(p.paymentMethod === 'CARD' ? 'DIRECT' : 'REQUEST')
      setPaymentAmount(String(p.amount)); setPaymentPhotos(p.notePhotoKeys); setPaymentNotes(p.notes ?? '')
      setPaymentNotaDate(p.notaDate ? toDateInputValue(p.notaDate) : '')
      setPaymentError(''); setPaymentEditId(p.id); setPaymentModal(true)
    } else {
      const r = latestRecord
      setReimburseAmount(String(r.amount)); setReimbursePhotos(r.notePhotoKeys); setReimburseNotes(r.notes ?? '')
      setReimburseNotaDate(r.notaDate ? toDateInputValue(r.notaDate) : '')
      setReimburseRequesterName(r.requesterName); setReimburseBankName(r.bankName)
      setReimburseAccountNumber(r.accountNumber); setReimburseAccountHolderName(r.accountHolderName)
      setReimburseError(''); setReimburseEditId(r.id); setReimburseSaveAccount(false); setReimburseModal(true)
    }
  }

  // Financial fields become read-only once money has actually moved against this PO —
  // mirrors the guard in PATCH /api/purchasing/orders/[id], which rejects item/pricing
  // changes under the same condition.
  const poFinancialsLocked = (o: OrderDetail) => o.items.some(i => (i.receivedQty ?? 0) > 0) || o.paymentRequests.length > 0 || o.reimbursements.length > 0

  function openEditPO() {
    if (!detail) return
    setSupplier(detail.supplierName ?? ''); setSupplierId(detail.supplierId ?? '')
    setDeliveryLocationId(detail.deliveryLocationId ?? '')
    setBookingId(detail.bookingId ?? '')
    setBookingLabel(detail.booking ? `${detail.booking.bookingCode}${detail.booking.yacht ? ` — ${detail.booking.yacht.name}` : ''}` : '')
    setExpectedAt(detail.expectedAt ? detail.expectedAt.split('T')[0] : '')
    setRequestedByEmployeeId(detail.requestedByEmployeeId ?? '')
    setNotes(detail.notes ?? '')
    setLines(detail.items.length > 0 ? detail.items.map(it => {
      const catalogItem = it.itemId ? purchaseItems.find(p => p.id === it.itemId) : undefined
      return {
        itemId: it.itemId ?? '', itemName: it.itemName,
        baseUnit: catalogItem?.baseUnit ?? '', purchaseUnit: catalogItem?.purchaseUnit ?? '',
        itemUnit: it.unit ?? catalogItem?.purchaseUnit ?? '',
        orderedQty: it.orderedQty, unitCost: it.unitCost,
        search: '', open: false,
      }
    }) : [{ itemId: '', itemName: '', baseUnit: '', purchaseUnit: '', itemUnit: '', orderedQty: 1, unitCost: 0, search: '', open: false }])
    setExtraCharges(detail.extraCharges ?? [])
    setDiscountType(detail.discountType ?? 'PERCENT')
    setDiscountValue(detail.discountValue ?? 0)
    setTransitStopIds(detail.transitStops?.map(s => s.locationId) ?? [])
    setEditPOError(''); setEditPOModal(true)
  }

  async function submitEditPO() {
    if (!detail) return
    setEditPOSaving(true); setEditPOError('')
    if (!supplier.trim()) { setEditPOError('Supplier name is required'); setEditPOSaving(false); return }
    if (!requestedByEmployeeId) { setEditPOError('Requested By is required'); setEditPOSaving(false); return }
    const locked = poFinancialsLocked(detail)
    const res = await fetch(`/api/purchasing/orders/${detail.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierId: supplierId || undefined, supplierName: supplier,
        deliveryLocationId: deliveryLocationId || '',
        requestedByEmployeeId: requestedByEmployeeId || '',
        bookingId: bookingId || '',
        expectedAt: expectedAt || undefined, notes,
        // Shipping route is locked server-side once the PO has dispatched — don't send it
        // in that case (the API rejects any transitStops touch after dispatchedAt).
        ...(!detail.dispatchedAt && { transitStops: transitStopIds }),
        ...(!locked && {
          items: lines.map(l => ({ itemId: l.itemId || undefined, itemName: l.itemName, orderedQty: l.orderedQty, unitCost: l.unitCost, unit: l.itemId ? undefined : (l.itemUnit || undefined) })),
          extraCharges: extraCharges.filter(c => c.label.trim() || c.amount),
          discountType: discountValue > 0 ? discountType : undefined,
          discountValue: discountValue > 0 ? discountValue : undefined,
        }),
      }),
    })
    const data = await res.json()
    if (!res.ok) { setEditPOError(data.error ?? 'Failed'); setEditPOSaving(false); return }
    setEditPOSaving(false); setEditPOModal(false)
    openDetail(detail); load()
  }

  const poGrandTotal = detail
    ? (() => {
        const itemsSubtotal = detail.items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0)
        const discountAmount = detail.discountType
          ? Math.min(itemsSubtotal, detail.discountType === 'PERCENT' ? itemsSubtotal * ((detail.discountValue ?? 0) / 100) : (detail.discountValue ?? 0))
          : 0
        const chargesTotal = detail.extraCharges?.reduce((s, c) => s + c.amount, 0) ?? 0
        return itemsSubtotal - discountAmount + chargesTotal
      })()
    : 0

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <button onClick={() => { setView('list'); setDraftSupplier(''); setDraftExpectedAt(''); setDraftNotes(''); setDraftError('') }} className="text-muted-foreground hover:text-foreground text-sm">← Back</button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground">{detail?.poNumber}</span>
      </div>

      {detail && (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight whitespace-nowrap">{detail.poNumber}</h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              {detail.supplierName ?? <span className="italic">No supplier yet</span>} · {fmtDate(detail.orderedAt)} ·{' '}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[detail.status] ?? ''}`}>
                {detail.currentLegLabel ?? STATUS_LABEL[detail.status] ?? detail.status}
              </span>
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              PO Created By <span className="font-medium text-foreground">{detail.createdByName ?? 'Unknown'}</span>
            </p>
            {detail.requestedByName && (
              <p className="text-muted-foreground text-xs mt-0.5">
                Requested By <span className="font-medium text-foreground">{detail.requestedByName}</span>
                {(detail.requestedByOffice || detail.requestedByDepartment) && (
                  <span> — {[detail.requestedByOffice, detail.requestedByDepartment, detail.requestedByRole].filter(Boolean).join(' · ')}</span>
                )}
              </p>
            )}
            {detail.booking && (
              <p className="text-muted-foreground text-xs mt-0.5 flex items-center gap-1">
                <Ship className="h-3 w-3 shrink-0" />
                For Trip <span className="font-medium text-foreground">{detail.booking.bookingCode}</span>
                {detail.booking.yacht && <span> · {detail.booking.yacht.name}</span>}
                {detail.booking.tripType === 'PRIVATE_CHARTER' && <span> · {detail.booking.leadGuestName}</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end pt-1">
            {detail.status !== 'DRAFT' && (
              <button disabled title="PDF export is still being finalized"
                className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg opacity-50 cursor-not-allowed">
                <FileDown className="h-3.5 w-3.5" /> Download PDF
              </button>
            )}
            {canTransit && detail.status !== 'DRAFT' && detail.paymentStatus !== 'PAID' && (
              <button onClick={openEditPO} className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                <Pencil className="h-3.5 w-3.5" /> Edit PO
              </button>
            )}
            {canTransit && detail.status !== 'DRAFT' && canRequestMorePayment && (
              <>
                <button onClick={() => { setPaymentMode('REQUEST'); setPaymentAmount(detail.remaining > 0 ? String(detail.remaining) : ''); setPaymentPhotos([]); setPaymentNotes(''); setPaymentNotaDate(''); setPaymentError(''); setPaymentEditId(null); setPaymentModal(true) }}
                  className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                  <Wallet className="h-3.5 w-3.5" /> {hasAnyPaymentRecord ? 'Request Payment (Balance)' : 'Request Payment'}
                </button>
                <button onClick={() => { setPaymentMode('DIRECT'); setPaymentAmount(detail.remaining > 0 ? String(detail.remaining) : ''); setPaymentPhotos([]); setPaymentNotes(''); setPaymentNotaDate(''); setPaymentError(''); setPaymentEditId(null); setPaymentModal(true) }}
                  className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Debit Paid
                </button>
                <button onClick={() => {
                  setReimburseAmount(detail.remaining > 0 ? String(detail.remaining) : ''); setReimbursePhotos([]); setReimburseNotes(''); setReimburseNotaDate('')
                  setReimburseRequesterName((session?.user as { name?: string })?.name ?? '')
                  setReimburseBankName(''); setReimburseAccountNumber(''); setReimburseAccountHolderName('')
                  setReimburseError(''); setReimburseEditId(null); setReimburseSaveAccount(false); setReimburseModal(true)
                }}
                  className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                  <Banknote className="h-3.5 w-3.5" /> Reimburse
                </button>
              </>
            )}
            {canTransit && detail.status !== 'DRAFT' && (detail.status === 'CANCELLED' || canEditLatest) && (
              <button onClick={openEditAction} className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                <Pencil className="h-3.5 w-3.5" />
                {detail.status === 'CANCELLED' ? 'Edit Cancellation' : latestRecord?.kind === 'payment' ? 'Edit Payment' : 'Edit Reimbursement'}
              </button>
            )}
            {(detail.status === 'IN_TRANSIT' || detail.status === 'PARTIALLY_RECEIVED') && detail.items.some(i => (i.receivedQty ?? 0) < i.orderedQty) && (() => {
              const managedBy = detail.deliveryLocation?.managedBy ?? 'WAREHOUSE'
              const allowed = managedBy === 'PURCHASING' ? ['PURCHASING', 'ADMIN', 'SUPER_ADMIN'] : ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']
              return allowed.includes(role)
            })() && (
              <button onClick={openReceive} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors">Receive Items</button>
            )}
            {(detail.status === 'IN_TRANSIT' || detail.status === 'PARTIALLY_RECEIVED') && detail.items.some(i => (i.receivedQty ?? 0) < i.orderedQty)
              && ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE'].includes(role) && (
              <button onClick={openReceiveLink} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted font-medium transition-colors">Get Receive Link</button>
            )}
            {/* Continue the shipping route without leaving the PO — acts on the auto-chained
                StockTransfer leg directly (see src/lib/purchasing/transitChain.ts). */}
            {(() => {
              const openLeg = detail.transitTransfers?.find(t => t.status === 'PENDING' || t.status === 'DISPATCHED')
              if (!openLeg) return null
              const action = openLeg.status === 'PENDING' ? 'dispatch' : 'receive'
              return (
                <button onClick={() => openLegAction(openLeg, action)}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors">
                  {action === 'dispatch' ? `Dispatch to ${openLeg.toLocation.name}` : `Confirm Arrival at ${openLeg.toLocation.name}`}
                </button>
              )
            })()}
            {detail.status === 'ORDERED' && canTransit && (detail.paymentRequests.some(p => p.status === 'PAID') || detail.reimbursements.some(r => r.status === 'PAID')) && (
              <button onClick={() => { setTransitPhoto(null); setTransitError(''); setTransitModal(true) }}
                className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                <Camera className="h-3.5 w-3.5" /> Goods In Transit
              </button>
            )}
            {['DRAFT', 'ORDERED'].includes(detail.status) && canTransit && !hasAnyPaymentRecord && (
              <button onClick={() => { setCancelReason(''); setCancelError(''); setCancelModal(true) }}
                className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                Cancel PO
              </button>
            )}
          </div>
        </div>
      )}

      {detailLoading || !detail ? (
        <div className="space-y-4 animate-pulse">
          <div className="rounded-lg border overflow-hidden">
            <div className="h-10 bg-muted/50" />
            {[...Array(3)].map((_, i) => <div key={i} className="px-5 py-4 border-t flex justify-between"><div className="h-4 w-40 rounded bg-muted" /><div className="h-4 w-24 rounded bg-muted" /></div>)}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_272px] gap-6 items-start">
          {/* Left column */}
          <div className="space-y-5 min-w-0">
          {/* Draft: fill supplier & confirm */}
          {detail.status === 'DRAFT' && (
            <div className="rounded-xl border bg-amber-50 border-amber-200">
              <div className="px-5 py-4 border-b border-amber-200">
                <h3 className="text-sm font-semibold text-amber-900">Confirm Purchase Order</h3>
                <p className="text-xs text-amber-700 mt-0.5">This PO was auto-created from an approved PR. Fill in supplier details and confirm.</p>
              </div>
              <div className="p-5 space-y-4">
                {draftError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{draftError}</div>}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Supplier <span className="text-red-500">*</span></label>
                      {!draftSupplierEditing ? (
                        <button onClick={() => setDraftSupplierEditing(true)}
                          className="text-xs text-amber-700 hover:text-amber-900 font-medium underline underline-offset-2">
                          Edit
                        </button>
                      ) : (
                        <button onClick={() => { setDraftSupplierEditing(false); setDraftSupplier(detail.supplierName ?? '') }}
                          className="text-xs text-muted-foreground hover:text-foreground">
                          Cancel
                        </button>
                      )}
                    </div>
                    <input
                      disabled={!draftSupplierEditing}
                      className={`w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors ${draftSupplierEditing ? 'bg-white' : 'bg-muted/40 text-foreground cursor-default select-none'}`}
                      placeholder="Supplier name" value={draftSupplier} onChange={e => setDraftSupplier(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">Expected Arrival</label>
                    <input type="date" className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                      value={draftExpectedAt} onChange={e => setDraftExpectedAt(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Notes</label>
                  <textarea className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white resize-none"
                    rows={2} placeholder="Payment terms, delivery instructions..." value={draftNotes} onChange={e => setDraftNotes(e.target.value)} />
                </div>
                <div className="flex justify-end">
                  <button onClick={confirmDraft} disabled={draftSaving}
                    className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold disabled:opacity-50 transition-colors">
                    {draftSaving ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</> : 'Confirm & Send PO'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border overflow-hidden">
            <div className="px-5 py-3 bg-muted/50 text-xs font-medium text-muted-foreground uppercase">Items Ordered</div>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium">Item</th>
                  <th className="text-right px-5 py-2.5 font-medium">Ordered</th>
                  <th className="text-right px-5 py-2.5 font-medium">Received</th>
                  <th className="text-right px-5 py-2.5 font-medium">Price</th>
                  <th className="text-right px-5 py-2.5 font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {detail.items.map((it, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-5 py-3 font-medium">{it.itemName}</td>
                    <td className="px-5 py-3 text-right">{it.orderedQty} <span className="text-muted-foreground text-xs">{it.unit ?? ''}</span></td>
                    <td className="px-5 py-3 text-right">
                      <span className={it.receivedQty && it.receivedQty >= it.orderedQty ? 'text-green-600 font-medium' : it.receivedQty ? 'text-amber-600' : 'text-muted-foreground'}>
                        {it.receivedQty ?? 0}
                      </span>
                      {it.unit && <span className="text-muted-foreground text-xs"> {it.unit}</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{fmtMoney(it.unitCost)}</td>
                    <td className="px-5 py-3 text-right font-medium">{fmtMoney(it.orderedQty * it.unitCost)}</td>
                  </tr>
                ))}
              </tbody>
              {(() => {
                const itemsSubtotal = detail.items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0)
                const discountAmount = detail.discountType
                  ? Math.min(itemsSubtotal, detail.discountType === 'PERCENT' ? itemsSubtotal * ((detail.discountValue ?? 0) / 100) : (detail.discountValue ?? 0))
                  : 0
                const chargesTotal = detail.extraCharges?.reduce((s, c) => s + c.amount, 0) ?? 0
                const grandTotal = itemsSubtotal - discountAmount + chargesTotal
                const hasBreakdown = discountAmount > 0 || (detail.extraCharges && detail.extraCharges.length > 0)
                return (
                  <tfoot className="bg-muted/30 border-t">
                    {hasBreakdown && (
                      <>
                        <tr>
                          <td colSpan={4} className="px-5 py-2 text-sm text-muted-foreground text-right">Subtotal</td>
                          <td className="px-5 py-2 text-right text-muted-foreground">{fmtMoney(itemsSubtotal)}</td>
                        </tr>
                        {discountAmount > 0 && (
                          <tr>
                            <td colSpan={4} className="px-5 py-2 text-sm text-muted-foreground text-right">
                              Discount{detail.discountType === 'PERCENT' ? ` (${detail.discountValue}%)` : ''}
                            </td>
                            <td className="px-5 py-2 text-right text-muted-foreground">-{fmtMoney(discountAmount)}</td>
                          </tr>
                        )}
                        {detail.extraCharges?.map((c, i) => (
                          <tr key={i}>
                            <td colSpan={4} className="px-5 py-2 text-sm text-muted-foreground text-right">{c.label || 'Additional charge'}</td>
                            <td className="px-5 py-2 text-right text-muted-foreground">{fmtMoney(c.amount)}</td>
                          </tr>
                        ))}
                      </>
                    )}
                    <tr>
                      <td colSpan={4} className="px-5 py-3 text-sm font-semibold text-right">Total</td>
                      <td className="px-5 py-3 text-right font-bold">{fmtMoney(grandTotal)}</td>
                    </tr>
                  </tfoot>
                )
              })()}
            </table></div>
          </div>

          {(() => {
            const isOverdue = !!detail.expectedAt && !['RECEIVED', 'CANCELLED'].includes(detail.status) && new Date(detail.expectedAt) < new Date()
            return (
              <div className="space-y-2">
                {isOverdue && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    This PO is overdue — expected {fmtDate(detail.expectedAt!)}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Follow-ups</h3>
                  <button onClick={openFollowUpModal} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Log Follow-up
                  </button>
                </div>
                {detail.followUps.length === 0 ? (
                  <p className="text-sm text-muted-foreground/60 italic">No follow-ups logged yet.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.followUps.map(f => {
                      const late = f.isEscalation && !!detail.expectedAt && new Date(f.createdAt) > new Date(detail.expectedAt)
                      return (
                        <div key={f.id} className="rounded-lg border p-3 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <p className="flex-1">{f.note}</p>
                            <button onClick={() => deleteFollowUp(f.id)} className="text-muted-foreground hover:text-red-600 transition-colors shrink-0" title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {f.isEscalation && (
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${late ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                Escalated {late ? '(late)' : '(on time)'}{f.escalatedTo?.name && ` → ${f.escalatedTo.name}`}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">by {f.createdBy.name ?? '—'} · {fmtDateTime(f.createdAt)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}

          {detail.receipts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Receipt History</h3>
              {detail.receipts.map(r => (
                <div key={r.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-mono text-sm font-medium">{r.grNumber}</p>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{fmtDate(r.receivedAt)}</p>
                      {r.receiverName && <p className="text-xs text-muted-foreground mt-0.5">by {r.receiverName}</p>}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {r.items.map((it, i) => {
                      const outcomeLabel: Record<string, string> = { ACCEPTED: 'Accepted', DAMAGED: 'Damaged', WRONG_ITEM: 'Wrong Item', REJECTED: 'Rejected', BACKORDERED: 'Backordered' }
                      const outcomeColor: Record<string, string> = { ACCEPTED: 'text-green-600', DAMAGED: 'text-red-500', WRONG_ITEM: 'text-red-500', REJECTED: 'text-red-600', BACKORDERED: 'text-amber-600' }
                      const outcome = it.outcome ?? it.condition
                      return (
                        <div key={i} className="flex items-center justify-between text-sm py-0.5">
                          <div>
                            <span>{it.itemName}</span>
                            {it.batch && <span className="ml-2 font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{it.batch}</span>}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">{it.receivedQty}</span>
                            <span className={outcomeColor[outcome] ?? 'text-muted-foreground'}>{outcomeLabel[outcome] ?? outcome}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {detail.status === 'CANCELLED' && detail.cancellationReason && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-700 mb-1">PO Cancelled</p>
              <p className="text-sm text-red-800">{detail.cancellationReason}</p>
              {detail.cancelledAt && (
                <p className="text-xs text-red-500 mt-1.5">
                  {fmtDate(detail.cancelledAt)}
                  {detail.cancelledByName && ` · by ${detail.cancelledByName}`}
                </p>
              )}
            </div>
          )}

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
          </div>{/* end left column */}

          {/* Right column — Timeline */}
          {detail && <POTimeline detail={detail} />}
        </div>
      )}

      {/* Transit Photo Modal */}
      {transitModal && detail && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setTransitModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div>
                  <h3 className="font-semibold">Mark as In Transit</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Upload dispatch photo before continuing</p>
                </div>
                <button onClick={() => setTransitModal(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-4">
                {transitError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{transitError}</div>}

                {transitPhoto ? (
                  <div className="relative space-y-3">
                    <img src={transitPhoto} alt="Dispatch proof" className="w-full rounded-xl object-cover max-h-64 border" />
                    <button onClick={() => { setTransitPhoto(null); setTransitPhotoMenuOpen(true) }}
                      className="w-full py-2 text-sm text-muted-foreground border rounded-lg hover:bg-muted transition-colors">
                      Replace photo
                    </button>
                    <PhotoSourceMenu open={transitPhotoMenuOpen} onClose={() => setTransitPhotoMenuOpen(false)} onFiles={files => { if (files[0]) handlePhotoFile(files[0]) }} />
                  </div>
                ) : (
                  <div className="relative">
                    <button onClick={() => setTransitPhotoMenuOpen(o => !o)} {...transitPhotoDropProps}
                      className={`w-full border-2 border-dashed rounded-xl py-10 flex flex-col items-center gap-3 transition-colors ${
                        isDraggingTransitPhoto ? 'border-amber-400 bg-amber-50 text-amber-700' : 'text-muted-foreground hover:border-amber-400 hover:text-amber-700'
                      }`}>
                      <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center">
                        <Camera className="h-6 w-6 text-amber-500" />
                      </div>
                      <div className="text-center">
                        <p className="font-medium text-sm">{isDraggingTransitPhoto ? 'Drop to upload' : 'Take, upload, or drag photo'}</p>
                        <p className="text-xs mt-0.5">Packing slip, shipping label, or proof of dispatch</p>
                      </div>
                    </button>
                    <PhotoSourceMenu open={transitPhotoMenuOpen} onClose={() => setTransitPhotoMenuOpen(false)} onFiles={files => { if (files[0]) handlePhotoFile(files[0]) }} />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t">
                <button onClick={() => setTransitModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                <button onClick={confirmTransit} disabled={!transitPhoto || transitSaving}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 font-semibold transition-colors">
                  {transitSaving ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</> : <><Upload className="h-3.5 w-3.5" />Confirm In Transit</>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Transit Leg Dispatch/Receive Modal — acts on the PO's current auto-chained
          StockTransfer leg (see src/lib/purchasing/transitChain.ts) without leaving the PO. */}
      {legActionModal && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setLegActionModal(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div>
                  <h3 className="font-semibold">
                    {legActionModal.action === 'dispatch'
                      ? `Dispatch to ${legActionModal.leg.toLocation.name}`
                      : `Confirm Arrival at ${legActionModal.leg.toLocation.name}`}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{legActionModal.leg.fromLocation.name} → {legActionModal.leg.toLocation.name}</p>
                </div>
                <button onClick={() => setLegActionModal(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-4">
                {legError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{legError}</div>}

                <div className="rounded-xl border divide-y">
                  {legActionModal.leg.items.map(it => (
                    <div key={it.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>{it.itemName}</span>
                      <span className="text-muted-foreground">{legActionModal.action === 'dispatch' ? it.requestedQty : it.dispatchedQty}</span>
                    </div>
                  ))}
                </div>

                {legActionModal.action === 'receive' && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Received By</label>
                    <input className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Receiver name" value={legReceiverName} onChange={e => setLegReceiverName(e.target.value)} />
                  </div>
                )}

                {legPhoto ? (
                  <div className="relative space-y-3">
                    <img src={legPhoto} alt="Proof" className="w-full rounded-xl object-cover max-h-64 border" />
                    <button onClick={() => { setLegPhoto(null); setLegPhotoMenuOpen(true) }}
                      className="w-full py-2 text-sm text-muted-foreground border rounded-lg hover:bg-muted transition-colors">
                      Replace photo
                    </button>
                    <PhotoSourceMenu open={legPhotoMenuOpen} onClose={() => setLegPhotoMenuOpen(false)} onFiles={files => { if (files[0]) handleLegPhotoFile(files[0]) }} />
                  </div>
                ) : (
                  <div className="relative">
                    <button onClick={() => setLegPhotoMenuOpen(o => !o)} {...legPhotoDropProps}
                      className={`w-full border-2 border-dashed rounded-xl py-10 flex flex-col items-center gap-3 transition-colors ${
                        isDraggingLegPhoto ? 'border-green-400 bg-green-50 text-green-700' : 'text-muted-foreground hover:border-green-400 hover:text-green-700'
                      }`}>
                      <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center">
                        <Camera className="h-6 w-6 text-green-500" />
                      </div>
                      <div className="text-center">
                        <p className="font-medium text-sm">{isDraggingLegPhoto ? 'Drop to upload' : 'Take, upload, or drag photo'}</p>
                        <p className="text-xs mt-0.5">{legActionModal.action === 'dispatch' ? 'Proof of dispatch' : 'Proof of arrival'}</p>
                      </div>
                    </button>
                    <PhotoSourceMenu open={legPhotoMenuOpen} onClose={() => setLegPhotoMenuOpen(false)} onFiles={files => { if (files[0]) handleLegPhotoFile(files[0]) }} />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t">
                <button onClick={() => setLegActionModal(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                <button onClick={submitLegAction} disabled={!legPhoto || legSaving}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 font-semibold transition-colors">
                  {legSaving
                    ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</>
                    : (legActionModal.action === 'dispatch' ? 'Confirm Dispatch' : 'Confirm Arrival')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Follow-up Modal */}
      {followUpModal && detail && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setFollowUpModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div>
                  <h3 className="font-semibold">Log Follow-up</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{detail.poNumber} · {detail.supplierName ?? 'No supplier'}</p>
                </div>
                <button onClick={() => setFollowUpModal(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-4">
                {followUpError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{followUpError}</div>}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Note <span className="text-red-500">*</span></label>
                  <textarea
                    autoFocus
                    rows={3}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="e.g. Called supplier, dispatch promised by Friday..."
                    value={followUpNote}
                    onChange={e => setFollowUpNote(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={followUpIsEscalation} onChange={e => setFollowUpIsEscalation(e.target.checked)} />
                  This is an escalation
                </label>
                {followUpIsEscalation && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Escalate to (optional)</label>
                    <select
                      className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      value={followUpEscalatedToId}
                      onChange={e => setFollowUpEscalatedToId(e.target.value)}
                    >
                      <option value="">— None —</option>
                      {escalationTargets.map(u => <option key={u.id} value={u.id}>{u.name ?? u.id}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t">
                <button onClick={() => setFollowUpModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                <button onClick={saveFollowUp} disabled={!followUpNote.trim() || followUpSaving}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 font-semibold transition-colors">
                  {followUpSaving ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</> : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Cancel Modal */}
      {cancelModal && detail && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setCancelModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div>
                  <h3 className="font-semibold">Cancel Purchase Order</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{detail.poNumber} · {detail.supplierName ?? 'No supplier'}</p>
                </div>
                <button onClick={() => setCancelModal(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-4">
                {cancelError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{cancelError}</div>}
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  This action cannot be undone. The PO will be permanently marked as cancelled.
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Reason for cancellation <span className="text-red-500">*</span></label>
                  <textarea
                    autoFocus
                    rows={3}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
                    placeholder="e.g. Supplier unable to fulfil, budget reallocation, duplicate order..."
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t">
                <button onClick={() => setCancelModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Go back</button>
                <button onClick={cancelPO} disabled={!cancelReason.trim() || cancelSaving}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 font-semibold transition-colors">
                  {cancelSaving ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Cancelling...</> : 'Cancel PO'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Edit PO Modal — same fields as Create PO, since this is meant to be a full CRUD edit, not a 3-field patch */}
      {editPOModal && detail && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setEditPOModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
                <div>
                  <h3 className="font-semibold">Edit PO</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{detail.poNumber} · {detail.supplierName ?? 'No supplier'}</p>
                </div>
                <button onClick={() => setEditPOModal(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-4 overflow-y-auto">
                {editPOError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{editPOError}</div>}
                {renderOrderFormFields(poFinancialsLocked(detail))}
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t shrink-0">
                <button onClick={() => setEditPOModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                <button onClick={submitEditPO} disabled={editPOSaving}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 font-semibold transition-colors">
                  {editPOSaving ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</> : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Request Payment Modal */}
      {paymentModal && detail && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setPaymentModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div>
                  <h3 className="font-semibold">{paymentEditId ? 'Edit ' : ''}{paymentMode === 'DIRECT' ? 'Debit Paid' : 'Request Payment'}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{detail.poNumber} · {detail.supplierName ?? 'No supplier'}</p>
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
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
                    <input type="text" inputMode="numeric" autoFocus
                      className="w-full h-10 border rounded-lg pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="e.g. 1.500.000"
                      value={paymentAmount ? new Intl.NumberFormat('id-ID').format(Number(paymentAmount)) : ''}
                      onChange={e => setPaymentAmount(e.target.value.replace(/\D/g, ''))} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Receipt / Nota <span className="text-red-500">*</span></label>
                  <p className="text-xs text-muted-foreground">JPG, PNG, or PDF — you can attach more than one file</p>
                  <MultiFilePicker files={paymentPhotos} onChange={setPaymentPhotos} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Nota Date</label>
                  <input type="date"
                    className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    value={paymentNotaDate} onChange={e => setPaymentNotaDate(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Notes</label>
                  <textarea rows={2}
                    className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Payment terms, urgency, etc. (optional)"
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
        <PhotoLightbox photoKey={paymentPhotoView} onClose={() => setPaymentPhotoView(null)} />
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
                  <p className="text-xs text-muted-foreground mt-0.5">{detail.poNumber} · {detail.supplierName ?? 'No supplier'}</p>
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
                  <input
                    className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Requester's full name"
                    value={reimburseRequesterName} onChange={e => setReimburseRequesterName(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <ReimburseAccountCombobox
                    accounts={reimburseAccounts}
                    onPick={a => {
                      setReimburseBankName(a.bankName); setReimburseAccountNumber(a.accountNumber); setReimburseAccountHolderName(a.accountHolderName)
                      setReimburseSaveAccount(false)
                    }}
                  />
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

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={reimburseSaveAccount} onChange={e => setReimburseSaveAccount(e.target.checked)} />
                  Save this account for future reimbursements
                </label>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Receipt / Nota <span className="text-red-500">*</span></label>
                  <p className="text-xs text-muted-foreground">JPG, PNG, or PDF — you can attach more than one file</p>
                  <MultiFilePicker files={reimbursePhotos} onChange={setReimbursePhotos} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Nota Date</label>
                  <input type="date"
                    className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    value={reimburseNotaDate} onChange={e => setReimburseNotaDate(e.target.value)} />
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

      {/* Receive Modal */}
      {receiveModal && detail && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setReceiveModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col">

              {/* Header */}
              <div className="flex items-start justify-between px-6 py-5 border-b shrink-0">
                <div>
                  <h3 className="font-bold text-lg">Receive Items</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{detail.poNumber} · {detail.supplierName}</p>
                </div>
                <button onClick={() => setReceiveModal(false)} className="text-muted-foreground hover:text-foreground mt-0.5">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
                {receiveError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{receiveError}</div>
                )}

                {/* Location + Receiver */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">{detail.transitStops && detail.transitStops.length > 0 ? 'Receiving At (transit stop)' : 'Delivery Location'}</label>
                    <div className="w-full border rounded-xl px-3 py-2.5 text-sm bg-muted/40 text-foreground">
                      {locations.find(l => l.id === receiveLocation)?.name ?? '—'}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Received By</label>
                    <input className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Receiver name"
                      value={receiverName} onChange={e => setReceiverName(e.target.value)} />
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Items Received</label>
                  <div className="space-y-3">
                    {receiveLines.map((line, i) => (
                      <div key={i} className="rounded-xl border bg-gray-50 p-4 space-y-3">
                        {/* Item name + qty */}
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{line.itemName}</span>
                          <div className="flex items-center gap-1.5">
                            <input type="number" min={0}
                              className="w-16 border rounded-lg px-2 py-1 text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
                              value={line.receivedQty}
                              onChange={e => setReceiveLines(l => l.map((li, idx) => idx !== i ? li : { ...li, receivedQty: Number(e.target.value) }))} />
                            {line.unit && <span className="text-xs font-medium text-muted-foreground">{line.unit}</span>}
                            <span className="text-xs text-muted-foreground">/ {line.orderedQty} {line.unit ?? ''}</span>
                          </div>
                        </div>
                        {/* Actual unit cost + expiry */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground font-medium">Actual Price / {line.unit ?? 'unit'} <span className="text-[#bdac7e]">*</span></label>
                            <input type="number" min={0} step="any"
                              className="w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 text-right"
                              value={line.unitCost}
                              onChange={e => setReceiveLines(l => l.map((li, idx) => idx !== i ? li : { ...li, unitCost: Number(e.target.value) }))} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground font-medium">Exp. Date</label>
                            <input type="date" className="w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                              value={line.expiryDate}
                              onChange={e => setReceiveLines(l => l.map((li, idx) => idx !== i ? li : { ...li, expiryDate: e.target.value }))} />
                          </div>
                        </div>
                        {/* Outcome + Batch */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground font-medium">Outcome</label>
                            <select className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                              value={line.outcome}
                              onChange={e => setReceiveLines(l => l.map((li, idx) => idx !== i ? li : { ...li, outcome: e.target.value }))}>
                              <option value="ACCEPTED">Accepted</option>
                              <option value="DAMAGED">Damaged</option>
                              <option value="WRONG_ITEM">Wrong Item</option>
                              <option value="REJECTED">Rejected</option>
                              <option value="BACKORDERED">Backordered</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground font-medium">Batch / Lot No.</label>
                            <input type="text" placeholder="e.g. LOT-2025-001"
                              className="w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                              value={line.batch}
                              onChange={e => setReceiveLines(l => l.map((li, idx) => idx !== i ? li : { ...li, batch: e.target.value }))} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Receipt photo */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Receipt Photo <span className="text-red-500">*</span></label>
                  {receivePhoto ? (
                    <div className="relative space-y-2">
                      <img src={receivePhoto} alt="Receipt proof" className="w-full rounded-xl object-cover max-h-52 border" />
                      <button onClick={() => { setReceivePhoto(null); setReceivePhotoMenuOpen(true) }}
                        className="w-full py-1.5 text-xs text-muted-foreground border rounded-lg hover:bg-muted transition-colors">
                        Replace photo
                      </button>
                      <PhotoSourceMenu open={receivePhotoMenuOpen} onClose={() => setReceivePhotoMenuOpen(false)} onFiles={files => { if (files[0]) handleReceivePhotoFile(files[0]) }} />
                    </div>
                  ) : (
                    <div className="relative">
                      <button onClick={() => setReceivePhotoMenuOpen(o => !o)} {...receivePhotoDropProps}
                        className={`w-full border-2 border-dashed rounded-xl py-8 flex flex-col items-center gap-2.5 transition-colors ${
                          isDraggingReceivePhoto ? 'border-green-400 bg-green-50 text-green-700' : 'text-muted-foreground hover:border-green-400 hover:text-green-700'
                        }`}>
                        <div className="h-10 w-10 rounded-full bg-green-50 flex items-center justify-center">
                          <Camera className="h-5 w-5 text-green-500" />
                        </div>
                        <div className="text-center">
                          <p className="font-medium text-sm">{isDraggingReceivePhoto ? 'Drop to upload' : 'Take, upload, or drag photo'}</p>
                          <p className="text-xs mt-0.5">Photo of the goods, packaging, or condition on arrival</p>
                        </div>
                      </button>
                      <PhotoSourceMenu open={receivePhotoMenuOpen} onClose={() => setReceivePhotoMenuOpen(false)} onFiles={files => { if (files[0]) handleReceivePhotoFile(files[0]) }} />
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Notes</label>
                  <textarea className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500" rows={2}
                    placeholder="Additional notes..."
                    value={receiveNotes} onChange={e => setReceiveNotes(e.target.value)} />
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
                <button onClick={() => setReceiveModal(false)} className="px-4 py-2 text-sm border rounded-xl hover:bg-muted transition-colors">Cancel</button>
                <button onClick={submitReceive} disabled={receiveSaving}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-40 font-semibold transition-colors">
                  {receiveSaving
                    ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</>
                    : 'Confirm Receipt'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Get Receive Link Modal */}
      {receiveLinkModal && detail && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setReceiveLinkModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between p-5 border-b">
                <h3 className="font-bold text-lg">Crew Receive Link</h3>
                <button onClick={() => setReceiveLinkModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Kirim link ini ke crew kapal (misal via WhatsApp) — mereka bisa konfirmasi penerimaan barang PO ini langsung tanpa login ke ERP. Berlaku 14 hari.
                </p>
                {receiveLinkError && <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{receiveLinkError}</div>}
                {receiveLinkLoading ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">Membuat link...</div>
                ) : receiveLink && (
                  <>
                    <div className="border rounded-md px-3 py-2.5 text-sm font-mono bg-muted/30 break-all">{receiveLink}</div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { navigator.clipboard.writeText(receiveLink); setReceiveLinkCopied(true); setTimeout(() => setReceiveLinkCopied(false), 2000) }}
                        className="flex-1 px-4 py-2 text-sm border rounded-md hover:bg-muted font-medium">
                        {receiveLinkCopied ? 'Tersalin!' : 'Copy Link'}
                      </button>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`Tolong konfirmasi penerimaan barang ${detail?.poNumber ?? ''} di sini: ${receiveLink}`)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-1 px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 font-medium text-center">
                        Share via WhatsApp
                      </a>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
