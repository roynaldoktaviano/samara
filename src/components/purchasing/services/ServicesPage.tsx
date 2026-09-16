'use client'

// Services — booking/ordering services (driver, photographer, guide, etc.) instead of
// physical goods. Shares the PurchaseOrder/PurchaseOrderItem tables with the goods Purchase
// Orders page (src/components/purchasing/orders/OrdersPage.tsx), distinguished by
// `orderType: 'SERVICE'` — see prisma/schema.prisma's PurchaseOrderKind. Deliberately a
// lighter page than OrdersPage: no catalog item picker, no delivery location/inventory
// room-category, no dispatch/goods-receipt/transit — just Ordered → Completed/Cancelled,
// plus the same Finance payment-request/reimbursement flow (those endpoints are already
// generic, keyed only by order id).
import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, X, Search, Trash2, Wallet, Banknote, CheckCircle2, XCircle, Briefcase } from 'lucide-react'
import { MultiFilePicker } from '@/components/ui/file-preview'
import { PhotoLightbox } from '@/components/purchasing/PhotoLightbox'
import { Timeline, type TimelineStep } from '@/components/purchasing/Timeline'
import { roleMatches } from '@/lib/role-utils'
import {
  SupplierCombobox, EmployeeCombobox, TripCombobox, ReimburseAccountCombobox,
  fmtDate, fmtDateTime, fmtMoney,
  type SupplierOption, type EmployeeOption, type TripOption, type ReimburseAccountOption,
} from '@/components/purchasing/orders/OrdersPage'

interface PaymentRequest {
  id: string; amount: number; notePhotoKeys: string[]; notes: string | null; notaDate: string | null; status: string; paymentMethod: string
  createdAt: string; requestedBy: { name: string } | null
  paidAt: string | null; paidBy: { name: string } | null
}
interface Reimbursement {
  id: string; amount: number; notePhotoKeys: string[]; notes: string | null; notaDate: string | null; status: string
  requesterName: string; bankName: string; accountNumber: string; accountHolderName: string
  createdAt: string; requestedBy: { name: string } | null
  paidAt: string | null; paidBy: { name: string } | null
}
interface ServiceItem { id: string; itemName: string; orderedQty: number; unitCost: number; unit: string | null }
interface ServiceOrder {
  id: string; poNumber: string; supplierName: string | null; status: string
  items: ServiceItem[]; itemCount: number
  notes: string | null; orderedAt: string; expectedAt: string | null
  createdByName: string | null
  requestedByName: string | null; requestedByOffice: string | null; requestedByDepartment: string | null
  paymentStatus: string
  booking: { bookingCode: string; tripType: string; leadGuestName: string; yacht: { name: string } | null } | null
}
interface ServiceOrderDetail extends ServiceOrder {
  extraCharges?: { label: string; amount: number }[] | null
  discountType?: 'PERCENT' | 'FIXED' | null
  discountValue?: number
  completedAt: string | null; completedByName: string | null
  cancelledAt: string | null; cancelledByName: string | null; cancellationReason: string | null
  paymentRequests: PaymentRequest[]
  reimbursements: Reimbursement[]
  grandTotal: number; paidTotal: number; requestedTotal: number; remaining: number
}
type ServiceLine = { itemName: string; unit: string; orderedQty: number; unitCost: number }

const STATUS_LABEL: Record<string, string> = { ORDERED: 'Ordered', COMPLETED: 'Completed', CANCELLED: 'Cancelled', REJECTED: 'Payment Rejected' }
const STATUS_COLOR: Record<string, string> = { ORDERED: 'bg-blue-100 text-blue-700', COMPLETED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700', REJECTED: 'bg-pink-100 text-pink-700' }
const PAYMENT_STATUS_LABEL: Record<string, string> = { UNPAID: 'Unpaid', PENDING: 'Waiting for Payment', PARTIALLY_PAID: 'Partially Paid', PAID: 'Paid', REJECTED: 'Rejected' }
const PAYMENT_STATUS_COLOR: Record<string, string> = { UNPAID: 'bg-muted text-muted-foreground', PENDING: 'bg-amber-100 text-amber-700', PARTIALLY_PAID: 'bg-orange-100 text-orange-700', PAID: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700' }
const PAGE_SIZE = 20
const inp = 'w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white transition-colors'

export default function ServicesPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role ?? ''
  const canManage = roleMatches(role, ['PURCHASING', 'ADMIN', 'SUPER_ADMIN'])

  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<ServiceOrder[]>([])
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [trips, setTrips] = useState<TripOption[]>([])
  const [reimburseAccounts, setReimburseAccounts] = useState<ReimburseAccountOption[]>([])

  const [statusTab, setStatusTab] = useState('ALL')
  const [search, setSearch] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterRequestedBy, setFilterRequestedBy] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    const [oRes, sRes, eRes, rRes, tRes] = await Promise.all([
      fetch('/api/purchasing/orders?orderType=SERVICE'),
      fetch('/api/purchasing/suppliers'),
      fetch('/api/purchasing/employees'),
      fetch('/api/purchasing/reimburse-accounts'),
      fetch('/api/purchasing/trips'),
    ])
    if (oRes.ok) setOrders(await oRes.json())
    if (sRes.ok) setSuppliers((await sRes.json()).filter((s: { isActive?: boolean }) => s.isActive !== false))
    if (eRes.ok) setEmployees(await eRes.json())
    if (rRes.ok) setReimburseAccounts(await rRes.json())
    if (tRes.ok) setTrips(await tRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Create form
  const [supplier, setSupplier] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [requestedByEmployeeId, setRequestedByEmployeeId] = useState('')
  const [bookingId, setBookingId] = useState('')
  const [bookingLabel, setBookingLabel] = useState('')
  const [expectedAt, setExpectedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<ServiceLine[]>([{ itemName: '', unit: '', orderedQty: 1, unitCost: 0 }])
  const [extraCharges, setExtraCharges] = useState<{ label: string; amount: number }[]>([])
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT')
  const [discountValue, setDiscountValue] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  function resetForm() {
    setSupplier(''); setSupplierId(''); setRequestedByEmployeeId(''); setBookingId(''); setBookingLabel(''); setExpectedAt(''); setNotes('')
    setLines([{ itemName: '', unit: '', orderedQty: 1, unitCost: 0 }])
    setExtraCharges([]); setDiscountType('PERCENT'); setDiscountValue(0); setSaveError('')
  }
  function addLine() { setLines(l => [...l, { itemName: '', unit: '', orderedQty: 1, unitCost: 0 }]) }
  function removeLine(i: number) { setLines(l => l.filter((_, idx) => idx !== i)) }
  function addCharge() { setExtraCharges(c => [...c, { label: '', amount: 0 }]) }
  function removeCharge(i: number) { setExtraCharges(c => c.filter((_, idx) => idx !== i)) }

  async function submit() {
    setSaving(true); setSaveError('')
    if (!supplier.trim()) { setSaveError('Supplier name is required'); setSaving(false); return }
    if (!requestedByEmployeeId) { setSaveError('Requested By is required'); setSaving(false); return }
    if (lines.every(l => !l.itemName.trim())) { setSaveError('At least one service line is required'); setSaving(false); return }
    const res = await fetch('/api/purchasing/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderType: 'SERVICE',
        supplierId: supplierId || undefined, supplierName: supplier, bookingId: bookingId || undefined, expectedAt: expectedAt || undefined, notes,
        requestedByEmployeeId: requestedByEmployeeId || undefined,
        items: lines.filter(l => l.itemName.trim()).map(l => ({ itemName: l.itemName.trim(), orderedQty: l.orderedQty, unitCost: l.unitCost, unit: l.unit || undefined })),
        extraCharges: extraCharges.filter(c => c.label.trim() || c.amount),
        discountType: discountValue > 0 ? discountType : undefined,
        discountValue: discountValue > 0 ? discountValue : undefined,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setSaveError(data.error ?? 'Failed to save'); setSaving(false); return }
    setSaving(false); resetForm(); setView('list'); load()
  }

  // Detail
  const [detail, setDetail] = useState<ServiceOrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [cancelModal, setCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)
  const [cancelError, setCancelError] = useState('')

  async function openDetail(o: { id: string }) {
    setView('detail'); setDetailLoading(true)
    const res = await fetch(`/api/purchasing/orders/${o.id}`)
    if (res.ok) setDetail(await res.json())
    setDetailLoading(false)
  }

  async function markCompleted() {
    if (!detail) return
    setCompleting(true)
    const res = await fetch(`/api/purchasing/orders/${detail.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    })
    setCompleting(false)
    if (res.ok) { openDetail(detail); load() }
  }

  async function submitCancel() {
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

  // Payment / Reimburse modals — same endpoints and payload shape OrdersPage.tsx uses
  // (see its submitPaymentRequest/submitReimbursement); reimplemented here rather than
  // extracted, since that logic is tightly woven into OrdersPage's own local state.
  const [paymentModal, setPaymentModal] = useState(false)
  const [paymentMode, setPaymentMode] = useState<'REQUEST' | 'DIRECT'>('REQUEST')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentPhotos, setPaymentPhotos] = useState<string[]>([])
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentNotaDate, setPaymentNotaDate] = useState('')
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [paymentPhotoView, setPaymentPhotoView] = useState<string | null>(null)

  const [reimburseModal, setReimburseModal] = useState(false)
  const [reimburseAmount, setReimburseAmount] = useState('')
  const [reimburseRequesterName, setReimburseRequesterName] = useState('')
  const [reimburseBankName, setReimburseBankName] = useState('')
  const [reimburseAccountNumber, setReimburseAccountNumber] = useState('')
  const [reimburseAccountHolderName, setReimburseAccountHolderName] = useState('')
  const [reimbursePhotos, setReimbursePhotos] = useState<string[]>([])
  const [reimburseNotes, setReimburseNotes] = useState('')
  const [reimburseNotaDate, setReimburseNotaDate] = useState('')
  const [reimburseSaveAccount, setReimburseSaveAccount] = useState(false)
  const [reimburseSaving, setReimburseSaving] = useState(false)
  const [reimburseError, setReimburseError] = useState('')

  async function submitPaymentRequest() {
    if (!detail) return
    if (!paymentAmount || Number(paymentAmount) <= 0) { setPaymentError('Amount must be greater than 0'); return }
    if (paymentPhotos.length === 0) { setPaymentError('At least one receipt/nota photo is required'); return }
    setPaymentSaving(true); setPaymentError('')
    const res = await fetch(`/api/purchasing/orders/${detail.id}/payment-request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(paymentAmount), notePhotoKeys: paymentPhotos, notes: paymentNotes || undefined, notaDate: paymentNotaDate || undefined, paidByPurchasing: paymentMode === 'DIRECT' }),
    })
    const data = await res.json()
    if (!res.ok) { setPaymentError(data.error ?? 'Failed'); setPaymentSaving(false); return }
    setPaymentSaving(false); setPaymentModal(false)
    setPaymentAmount(''); setPaymentPhotos([]); setPaymentNotes(''); setPaymentNotaDate('')
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
    const res = await fetch(`/api/purchasing/orders/${detail.id}/reimbursement`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    setReimburseRequesterName(''); setReimburseBankName(''); setReimburseAccountNumber(''); setReimburseAccountHolderName('')
    setReimburseSaveAccount(false)
    openDetail(detail); load()
  }

  // ---- List view ----
  const supplierOptions = Array.from(new Set(orders.map(o => o.supplierName).filter((n): n is string => !!n))).sort()
  const requestedByOptions = Array.from(new Set(orders.map(o => o.requestedByName).filter((n): n is string => !!n))).sort()
  const filtered = orders.filter(o => {
    if (filterSupplier && o.supplierName !== filterSupplier) return false
    if (filterRequestedBy && o.requestedByName !== filterRequestedBy) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      if (!o.items.some(i => i.itemName.toLowerCase().includes(q)) && !o.poNumber.toLowerCase().includes(q)) return false
    }
    return true
  })
  const STATUS_TAB_ORDER = ['ORDERED', 'COMPLETED', 'REJECTED', 'CANCELLED']
  const statusTabs = [
    { key: 'ALL', label: 'All', count: filtered.length },
    ...STATUS_TAB_ORDER.map(s => ({ key: s, label: STATUS_LABEL[s], count: filtered.filter(o => o.status === s).length })),
  ]
  const visibleOrders = statusTab === 'ALL' ? filtered : filtered.filter(o => o.status === statusTab)
  const totalPages = Math.max(1, Math.ceil(visibleOrders.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageOrders = visibleOrders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  if (view === 'list') return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Briefcase className="h-5 w-5 text-amber-600" /> Services</h2>
        <p className="text-muted-foreground text-sm mt-1">Book and track services — drivers, photographers, guides, and other non-goods purchases.</p>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{visibleOrders.length} service order{visibleOrders.length !== 1 ? 's' : ''}</p>
        {canManage && (
          <button onClick={() => { resetForm(); setView('create') }} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
            <Plus className="h-4 w-4" /> Book Service
          </button>
        )}
      </div>
      <div className="flex items-center gap-1 overflow-x-auto border-b">
        {statusTabs.map(t => (
          <button key={t.key} onClick={() => { setStatusTab(t.key); setPage(1) }}
            className={`shrink-0 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${statusTab === t.key ? 'border-amber-600 text-amber-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.label} <span className="text-xs">({t.count})</span>
          </button>
        ))}
      </div>
      <div className="space-y-2.5 rounded-lg border bg-muted/20 px-3 py-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input className="h-9 w-full border rounded-md pl-9 pr-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
            placeholder="Search service or SV number..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <select className="h-9 w-full border rounded-md px-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors" value={filterSupplier} onChange={e => { setFilterSupplier(e.target.value); setPage(1) }}>
            <option value="">All suppliers</option>
            {supplierOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="h-9 w-full border rounded-md px-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors" value={filterRequestedBy} onChange={e => { setFilterRequestedBy(e.target.value); setPage(1) }}>
            <option value="">All requesters</option>
            {requestedByOptions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">SV No.</th>
              <th className="text-left px-4 py-3 font-medium">Service</th>
              <th className="text-left px-4 py-3 font-medium">Supplier</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Payment</th>
              <th className="text-left px-4 py-3 font-medium">Requested By</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? [...Array(5)].map((_, i) => (
              <tr key={i}><td colSpan={8} className="px-4 py-3.5"><div className="h-3.5 w-full max-w-xs rounded bg-muted animate-pulse" /></td></tr>
            )) : visibleOrders.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">No service orders yet.</td></tr>
            ) : pageOrders.map(o => (
              <tr key={o.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(o)}>
                <td className="px-4 py-3 font-mono text-xs font-medium">{o.poNumber}</td>
                <td className="px-4 py-3 max-w-72 truncate text-xs">
                  {o.items[0]?.itemName ?? <span className="text-muted-foreground/40">—</span>}
                  {o.items.length > 1 && <span className="text-muted-foreground"> +{o.items.length - 1} more</span>}
                </td>
                <td className="px-4 py-3 text-xs">{o.supplierName ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(o.orderedAt)}</td>
                <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[o.status] ?? ''}`}>{STATUS_LABEL[o.status] ?? o.status}</span></td>
                <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_STATUS_COLOR[o.paymentStatus] ?? ''}`}>{PAYMENT_STATUS_LABEL[o.paymentStatus] ?? o.paymentStatus}</span></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{o.requestedByName ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">→</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button disabled={currentPage === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 border rounded-md disabled:opacity-40">Prev</button>
          <span className="text-muted-foreground">Page {currentPage} of {totalPages}</span>
          <button disabled={currentPage === totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 border rounded-md disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  )

  // ---- Create view ----
  if (view === 'create') {
    const itemsTotal = lines.reduce((s, l) => s + l.orderedQty * l.unitCost, 0)
    const chargesTotal = extraCharges.reduce((s, c) => s + c.amount, 0)
    const discountAmount = Math.min(itemsTotal, discountType === 'PERCENT' ? itemsTotal * (discountValue / 100) : discountValue)
    const total = itemsTotal - discountAmount + chargesTotal
    return (
      <div className="p-6 space-y-5 max-w-3xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="text-muted-foreground hover:text-foreground text-sm">← Back</button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-muted-foreground">Book Service</span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Book a Service</h2>

        {saveError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{saveError}</div>}

        <div className="rounded-xl border bg-white">
          <div className="px-5 py-4 border-b"><h3 className="text-sm font-semibold">Service Info</h3></div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Supplier <span className="text-red-500">*</span></label>
                <SupplierCombobox value={supplier} suppliers={suppliers} onChange={(name, id) => { setSupplier(name); setSupplierId(id) }} onAdded={s => setSuppliers(prev => [...prev, s])} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Requested By <span className="text-red-500">*</span></label>
                <EmployeeCombobox value={requestedByEmployeeId} employees={employees} onChange={setRequestedByEmployeeId} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Scheduled Date <span className="font-normal">(optional)</span></label>
                <input type="date" className={inp} value={expectedAt} onChange={e => setExpectedAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">For Trip <span className="font-normal">(optional)</span></label>
                <TripCombobox value={bookingId} valueLabel={bookingLabel} trips={trips} onChange={(id, label) => { setBookingId(id); setBookingLabel(label) }} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Notes <span className="font-normal">(optional)</span></label>
              <textarea className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white resize-none transition-colors"
                rows={2} placeholder="Special instructions, schedule details, etc." value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">Service Lines</h3>
            <button onClick={addLine} className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 border border-amber-200 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors">
              <Plus className="h-3.5 w-3.5" /> Add Row
            </button>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/30">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium">Description</th>
                <th className="text-left px-3 py-2.5 font-medium w-24">Qty</th>
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
                  <tr key={idx} className="hover:bg-muted/20 transition-colors">
                    <td className="px-2 py-2.5">
                      <input className={inp} placeholder="e.g. Airport transfer, Photographer (half day)" value={line.itemName}
                        onChange={e => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, itemName: e.target.value }))} />
                    </td>
                    <td className="px-2 py-2.5">
                      <input type="number" min={0.01} step="any" className={numInp} value={line.orderedQty}
                        onChange={e => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, orderedQty: Number(e.target.value) }))} />
                    </td>
                    <td className="px-2 py-2.5">
                      <input className={inp} placeholder="e.g. trip, day" value={line.unit}
                        onChange={e => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, unit: e.target.value }))} />
                    </td>
                    <td className="px-2 py-2.5">
                      <input type="number" min={0} step="any" className={numInp} value={line.unitCost || ''} placeholder="0"
                        onChange={e => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, unitCost: Number(e.target.value) }))} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">{subtotal > 0 ? fmtMoney(subtotal) : <span className="text-muted-foreground font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center">
                      <button onClick={() => removeLine(idx)} disabled={lines.length === 1} className="p-1.5 text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-0 disabled:pointer-events-none">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
          <div className="px-5 py-4 bg-muted/20 border-t space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{lines.length} line{lines.length > 1 ? 's' : ''}</span>
              <span className="text-sm text-muted-foreground">Subtotal <span className="ml-3 text-foreground font-medium">{fmtMoney(itemsTotal)}</span></span>
            </div>
            {extraCharges.map((c, i) => (
              <div key={i} className="flex items-center justify-end gap-2">
                <input className="h-8 w-48 border rounded-md px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white" placeholder="e.g. Service fee"
                  value={c.label} onChange={e => setExtraCharges(prev => prev.map((ch, idx) => idx !== i ? ch : { ...ch, label: e.target.value }))} />
                <input type="number" step="any" className="h-8 w-32 border rounded-md px-2.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="0" value={c.amount || ''} onChange={e => setExtraCharges(prev => prev.map((ch, idx) => idx !== i ? ch : { ...ch, amount: Number(e.target.value) || 0 }))} />
                <button onClick={() => removeCharge(i)} className="p-1.5 text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <div className="flex justify-end">
              <button onClick={addCharge} className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 border border-amber-200 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add Pricing (Tax, Fee, etc.)
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Discount</span>
              <div className="flex rounded-md border overflow-hidden h-8">
                <button type="button" onClick={() => setDiscountType('PERCENT')} className={`px-2.5 text-xs font-medium transition-colors ${discountType === 'PERCENT' ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:bg-muted'}`}>%</button>
                <button type="button" onClick={() => setDiscountType('FIXED')} className={`px-2.5 text-xs font-medium transition-colors border-l ${discountType === 'FIXED' ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:bg-muted'}`}>Rp</button>
              </div>
              <input type="number" step="any" min={0} className="h-8 w-32 border rounded-md px-2.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="0" value={discountValue || ''} onChange={e => setDiscountValue(Number(e.target.value) || 0)} />
              {discountAmount > 0 && <span className="text-xs text-muted-foreground w-32 text-right">-{fmtMoney(discountAmount)}</span>}
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-muted-foreground">Order Total</span>
              <span className="text-lg font-bold">{fmtMoney(total)}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={() => setView('list')} className="px-4 py-2 text-sm border rounded-md hover:bg-muted transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-5 py-2 text-sm bg-amber-600 text-white rounded-md hover:bg-amber-700 font-medium disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Book Service'}
          </button>
        </div>
      </div>
    )
  }

  // ---- Detail view ----
  const steps: TimelineStep[] = detail ? [
    { key: 'ordered', done: true, label: 'Ordered', date: fmtDateTime(detail.orderedAt), sub: [detail.createdByName ? `by ${detail.createdByName}` : null] },
    detail.status === 'CANCELLED'
      ? { key: 'cancelled', done: true, cancelled: true, label: 'Cancelled', date: detail.cancelledAt ? fmtDateTime(detail.cancelledAt) : null, sub: [detail.cancelledByName ? `by ${detail.cancelledByName}` : null, detail.cancellationReason] }
      : { key: 'completed', done: detail.status === 'COMPLETED', label: 'Completed', date: detail.completedAt ? fmtDateTime(detail.completedAt) : null, sub: [detail.completedByName ? `by ${detail.completedByName}` : null] },
  ] : []

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <button onClick={() => { setView('list') }} className="text-muted-foreground hover:text-foreground text-sm">← Back</button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground">{detail?.poNumber}</span>
      </div>

      {detailLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {detail && (
        <>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold tracking-tight whitespace-nowrap">{detail.poNumber}</h2>
              <p className="text-muted-foreground text-sm mt-0.5">
                {detail.supplierName ?? <span className="italic">No supplier</span>} · {fmtDate(detail.orderedAt)} ·{' '}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[detail.status] ?? ''}`}>{STATUS_LABEL[detail.status] ?? detail.status}</span>
              </p>
              {detail.requestedByName && (
                <p className="text-muted-foreground text-xs mt-1">
                  Requested By <span className="font-medium text-foreground">{detail.requestedByName}</span>
                  {(detail.requestedByOffice || detail.requestedByDepartment) && <span> — {[detail.requestedByOffice, detail.requestedByDepartment].filter(Boolean).join(' · ')}</span>}
                </p>
              )}
              {detail.booking && (
                <p className="text-muted-foreground text-xs mt-0.5">
                  For Trip <span className="font-medium text-foreground">{detail.booking.bookingCode}</span>
                  {detail.booking.yacht && <span> · {detail.booking.yacht.name}</span>}
                </p>
              )}
            </div>
            {canManage && (
              <div className="flex items-center gap-2 flex-wrap justify-end pt-1">
                {detail.status === 'ORDERED' && detail.remaining > 0 && (
                  <>
                    <button onClick={() => { setPaymentMode('REQUEST'); setPaymentAmount(String(detail.remaining)); setPaymentPhotos([]); setPaymentNotes(''); setPaymentNotaDate(''); setPaymentError(''); setPaymentModal(true) }}
                      className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                      <Wallet className="h-3.5 w-3.5" /> Request Payment
                    </button>
                    <button onClick={() => { setPaymentMode('DIRECT'); setPaymentAmount(String(detail.remaining)); setPaymentPhotos([]); setPaymentNotes(''); setPaymentNotaDate(''); setPaymentError(''); setPaymentModal(true) }}
                      className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Debit Paid
                    </button>
                    <button onClick={() => {
                      setReimburseAmount(String(detail.remaining)); setReimbursePhotos([]); setReimburseNotes(''); setReimburseNotaDate('')
                      setReimburseRequesterName((session?.user as { name?: string })?.name ?? '')
                      setReimburseBankName(''); setReimburseAccountNumber(''); setReimburseAccountHolderName(''); setReimburseError(''); setReimburseSaveAccount(false); setReimburseModal(true)
                    }} className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                      <Banknote className="h-3.5 w-3.5" /> Reimburse
                    </button>
                  </>
                )}
                {detail.status === 'ORDERED' && (
                  <button onClick={markCompleted} disabled={completing} className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 transition-colors">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {completing ? 'Saving...' : 'Mark Completed'}
                  </button>
                )}
                {detail.status === 'ORDERED' && (
                  <button onClick={() => { setCancelReason(''); setCancelError(''); setCancelModal(true) }} className="flex items-center gap-2 px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                    <XCircle className="h-3.5 w-3.5" /> Cancel
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              <div className="rounded-xl border overflow-hidden">
                <div className="px-5 py-3 bg-muted/30 border-b"><h3 className="text-sm font-semibold">Service Lines</h3></div>
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b bg-muted/20">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">Description</th>
                      <th className="text-left px-4 py-2.5 font-medium">Qty</th>
                      <th className="text-right px-4 py-2.5 font-medium">Unit Price</th>
                      <th className="text-right px-4 py-2.5 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {detail.items.map(i => (
                      <tr key={i.id}>
                        <td className="px-4 py-3">{i.itemName}</td>
                        <td className="px-4 py-3">{i.orderedQty} {i.unit ?? ''}</td>
                        <td className="px-4 py-3 text-right">{fmtMoney(i.unitCost)}</td>
                        <td className="px-4 py-3 text-right font-medium">{fmtMoney(i.orderedQty * i.unitCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/10">
                    {detail.extraCharges?.map((c, i) => (
                      <tr key={i}><td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">{c.label || 'Charge'}</td><td className="px-4 py-2 text-right">{fmtMoney(c.amount)}</td></tr>
                    ))}
                    {!!detail.discountType && (detail.discountValue ?? 0) > 0 && (
                      <tr><td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">Discount{detail.discountType === 'PERCENT' ? ` (${detail.discountValue}%)` : ''}</td><td className="px-4 py-2 text-right">-{fmtMoney(detail.grandTotal < 0 ? 0 : (detail.items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0) - detail.grandTotal + (detail.extraCharges?.reduce((s, c) => s + c.amount, 0) ?? 0)))}</td></tr>
                    )}
                    <tr><td colSpan={3} className="px-4 py-3 text-right font-semibold">Total</td><td className="px-4 py-3 text-right font-bold">{fmtMoney(detail.grandTotal)}</td></tr>
                  </tfoot>
                </table></div>
              </div>

              {detail.notes && (
                <div className="rounded-xl border bg-white p-5">
                  <h3 className="text-sm font-semibold mb-1.5">Notes</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{detail.notes}</p>
                </div>
              )}

              {(detail.paymentRequests.length > 0 || detail.reimbursements.length > 0) && (
                <div className="rounded-xl border bg-white">
                  <div className="px-5 py-3 border-b"><h3 className="text-sm font-semibold">Payments</h3></div>
                  <div className="divide-y">
                    {detail.paymentRequests.map(p => (
                      <div key={p.id} className="px-5 py-3 flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium">{fmtMoney(p.amount)} <span className="text-xs text-muted-foreground font-normal">· {p.paymentMethod === 'DIRECT_DEBIT' ? 'Debit Paid' : 'Payment Request'}</span></p>
                          <p className="text-xs text-muted-foreground">{fmtDateTime(p.createdAt)} · by {p.requestedBy?.name ?? '—'}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_STATUS_COLOR[p.status] ?? ''}`}>{p.status}</span>
                      </div>
                    ))}
                    {detail.reimbursements.map(r => (
                      <div key={r.id} className="px-5 py-3 flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium">{fmtMoney(r.amount)} <span className="text-xs text-muted-foreground font-normal">· Reimburse · {r.requesterName}</span></p>
                          <p className="text-xs text-muted-foreground">{fmtDateTime(r.createdAt)} · {r.bankName} {r.accountNumber}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_STATUS_COLOR[r.status] ?? ''}`}>{r.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Timeline steps={steps} title="Service Timeline" sticky />
          </div>
        </>
      )}

      {/* Cancel modal */}
      {cancelModal && detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setCancelModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold">Cancel Service Order</h3>
              <button onClick={() => setCancelModal(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-3">
              {cancelError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{cancelError}</div>}
              <label className="text-sm font-medium">Reason <span className="text-red-500">*</span></label>
              <textarea className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-500" rows={3}
                value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setCancelModal(false)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Back</button>
              <button onClick={submitCancel} disabled={cancelSaving} className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50">
                {cancelSaving ? 'Saving...' : 'Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {paymentModal && detail && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPaymentModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="font-semibold">{paymentMode === 'DIRECT' ? 'Debit Paid' : 'Request Payment'}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{detail.poNumber} · {detail.supplierName ?? 'No supplier'}</p>
              </div>
              <button onClick={() => setPaymentModal(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              {paymentError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{paymentError}</div>}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Amount <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
                  <input type="text" inputMode="numeric" className="w-full h-10 border rounded-lg pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    value={paymentAmount ? new Intl.NumberFormat('id-ID').format(Number(paymentAmount)) : ''} onChange={e => setPaymentAmount(e.target.value.replace(/\D/g, ''))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Receipt / Nota <span className="text-red-500">*</span></label>
                <MultiFilePicker files={paymentPhotos} onChange={setPaymentPhotos} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nota Date</label>
                <input type="date" className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" value={paymentNotaDate} onChange={e => setPaymentNotaDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Notes</label>
                <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setPaymentModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted">Cancel</button>
              <button onClick={submitPaymentRequest} disabled={!paymentAmount || paymentPhotos.length === 0 || paymentSaving}
                className={`px-5 py-2 text-sm text-white rounded-lg disabled:opacity-40 font-semibold ${paymentMode === 'DIRECT' ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
                {paymentSaving ? 'Saving...' : paymentMode === 'DIRECT' ? 'Mark as Paid' : 'Send to Finance'}
              </button>
            </div>
          </div>
        </div>
      )}
      {paymentPhotoView && <PhotoLightbox photoKey={paymentPhotoView} onClose={() => setPaymentPhotoView(null)} />}

      {/* Reimburse modal */}
      {reimburseModal && detail && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setReimburseModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="font-semibold">Reimburse</h3>
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
                  <input type="text" inputMode="numeric" className="w-full h-10 border rounded-lg pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    value={reimburseAmount ? new Intl.NumberFormat('id-ID').format(Number(reimburseAmount)) : ''} onChange={e => setReimburseAmount(e.target.value.replace(/\D/g, ''))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name <span className="text-red-500">*</span></label>
                <input className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" value={reimburseRequesterName} onChange={e => setReimburseRequesterName(e.target.value)} />
              </div>
              <ReimburseAccountCombobox accounts={reimburseAccounts} onPick={a => { setReimburseBankName(a.bankName); setReimburseAccountNumber(a.accountNumber); setReimburseAccountHolderName(a.accountHolderName); setReimburseSaveAccount(false) }} />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Bank Name <span className="text-red-500">*</span></label>
                  <input className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" value={reimburseBankName} onChange={e => setReimburseBankName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Account Number <span className="text-red-500">*</span></label>
                  <input className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" value={reimburseAccountNumber} onChange={e => setReimburseAccountNumber(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Account Holder Name <span className="text-red-500">*</span></label>
                <input className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" value={reimburseAccountHolderName} onChange={e => setReimburseAccountHolderName(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={reimburseSaveAccount} onChange={e => setReimburseSaveAccount(e.target.checked)} />
                Save this account for future reimbursements
              </label>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Receipt / Nota <span className="text-red-500">*</span></label>
                <MultiFilePicker files={reimbursePhotos} onChange={setReimbursePhotos} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nota Date</label>
                <input type="date" className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" value={reimburseNotaDate} onChange={e => setReimburseNotaDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Notes</label>
                <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500" value={reimburseNotes} onChange={e => setReimburseNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setReimburseModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted">Cancel</button>
              <button onClick={submitReimbursement} disabled={reimburseSaving} className="px-5 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-40 font-semibold">
                {reimburseSaving ? 'Saving...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
