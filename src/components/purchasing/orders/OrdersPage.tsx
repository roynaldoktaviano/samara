'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, ChevronRight, X, Search, Package, Trash2, Camera, Upload, MapPin, Building2 } from 'lucide-react'


interface DeliveryLocation { id: string; name: string; type: string; managedBy: string; yachtId: string | null }
interface PurchaseOrder {
  id: string; poNumber: string; supplierName: string | null; status: string
  deliveryLocationId: string | null; deliveryLocation: DeliveryLocation | null
  itemCount: number; totalOrdered: number; totalReceived: number; fullyReceivedCount: number
  notes: string | null; orderedAt: string; expectedAt: string | null
  lastReceivedAt: string | null; lastReceivedBy: string | null
  requestedByName: string | null
}
interface SupplierOption { id: string; name: string }
interface PurchaseItem { id: string; name: string; sku: string; baseUnit: string; purchaseUnit: string; conversionFactor: number; avgPrice: number; isActive: boolean }
interface StockLocation { id: string; name: string; type: string; managedBy: string; isActive?: boolean }
interface OrderItem { itemId: string; itemName: string; orderedQty: number; unitCost: number; receivedQty?: number; unit?: string | null }
interface OrderDetail extends PurchaseOrder {
  dispatchPhotoKey?: string | null
  dispatchedAt?: string | null
  dispatchedByName?: string | null
  request?: { prNumber: string; createdAt: string } | null
  cancellationReason?: string | null
  cancelledAt?: string | null
  cancelledByName?: string | null
  items: OrderItem[]
  receipts: { id: string; grNumber: string; receivedAt: string; receiverName?: string | null; receivePhotoKey?: string | null; items: { itemName: string; receivedQty: number; condition: string; outcome?: string; batch?: string | null }[] }[]
}

function POTimeline({ detail }: { detail: OrderDetail }) {
  const [viewPhoto, setViewPhoto] = useState<string | null>(null)
  const fmt = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  type Step = { key: string; done: boolean; label: string; date: string | null; sub: (string | null | undefined)[]; photo?: string | null; photoLabel?: string; cancelled?: boolean }

  const steps: Step[] = [
    ...(detail.request ? [{
      key: 'pr',
      done: true,
      label: 'PR Submitted',
      date: fmt(detail.request.createdAt),
      sub: [detail.requestedByName, detail.request.prNumber],
    }] : []),
    {
      key: 'ordered',
      done: !['DRAFT'].includes(detail.status),
      label: 'PO Confirmed',
      date: detail.orderedAt ? fmt(detail.orderedAt) : null,
      sub: [detail.supplierName, detail.requestedByName ? `by ${detail.requestedByName}` : null],
    },
    {
      key: 'transit',
      done: ['IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(detail.status),
      label: 'In Transit',
      date: detail.dispatchedAt ? fmt(detail.dispatchedAt) : null,
      sub: [detail.dispatchedByName],
      photo: detail.dispatchPhotoKey,
      photoLabel: 'View dispatch photo',
    },
    ...detail.receipts.map((r, i) => ({
      key: `gr-${r.id}`,
      done: true,
      label: detail.receipts.length === 1 ? 'Received' : `Receipt ${i + 1}`,
      date: fmt(r.receivedAt),
      sub: [r.receiverName, `${r.items.length} item${r.items.length !== 1 ? 's' : ''}`],
      photo: r.receivePhotoKey,
      photoLabel: 'View receipt photo',
    })),
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
              {step.photo && (
                <button onClick={() => setViewPhoto(step.photo!)} className="mt-1 text-xs text-green-600 hover:text-green-700 font-medium underline underline-offset-2">
                  {step.photoLabel ?? 'View photo'}
                </button>
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
const fmtDate = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)

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

function PhotoLightbox({ photoKey, onClose }: { photoKey: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <img src={photoKey} alt="Proof" className="w-full rounded-xl shadow-2xl object-contain max-h-[80vh]" />
        <button onClick={onClose} className="absolute top-3 right-3 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70">
          <X className="h-4 w-4" />
        </button>
        <p className="text-center text-white/60 text-xs mt-3">Click outside to close</p>
      </div>
    </div>
  )
}

export default function OrdersPage({ warehouseView = false }: { warehouseView?: boolean }) {
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

  // master data
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([])
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])

  // create form
  const [supplier, setSupplier] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [deliveryLocationId, setDeliveryLocationId] = useState('')
  const [expectedAt, setExpectedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<{ itemId: string; itemName: string; baseUnit: string; purchaseUnit: string; itemUnit: string; orderedQty: number; unitCost: number; search: string; open: boolean }[]>([{ itemId: '', itemName: '', baseUnit: '', purchaseUnit: '', itemUnit: '', orderedQty: 1, unitCost: 0, search: '', open: false }])
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  // cancel form
  const [cancelModal, setCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)
  const [cancelError, setCancelError] = useState('')

  // receive form
  const [receiveModal, setReceiveModal] = useState(false)
  const [receiveLocation, setReceiveLocation] = useState('')
  const [receiveNotes, setReceiveNotes] = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [receiveLines, setReceiveLines] = useState<{ itemId: string | null; itemName: string; orderedQty: number; receivedQty: number; unitCost: number; outcome: string; batch: string; expiryDate: string; unit?: string | null }[]>([])
  const [receivePhoto, setReceivePhoto] = useState<string | null>(null)
  const receivePhotoRef = useRef<HTMLInputElement>(null)
  const [receiveSaving, setReceiveSaving] = useState(false)
  const [receiveError, setReceiveError] = useState('')
  const [team, setTeam] = useState<{ id: string; name: string }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [oRes, iRes, sRes, lRes, tRes] = await Promise.all([fetch('/api/purchasing/orders'), fetch('/api/purchasing/items'), fetch('/api/purchasing/suppliers'), fetch('/api/purchasing/locations'), fetch('/api/purchasing/team')])
    if (oRes.ok) setOrders(await oRes.json())
    if (iRes.ok) setPurchaseItems((await iRes.json()).filter((i: PurchaseItem) => i.isActive))
    if (sRes.ok) setSuppliers((await sRes.json()).filter((s: { isActive?: boolean }) => s.isActive !== false))
    if (lRes.ok) setLocations((await lRes.json()).filter((l: StockLocation) => l.isActive !== false))
    if (tRes.ok) setTeam(await tRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

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

  function addLine() { setLines(l => [...l, { itemId: '', itemName: '', baseUnit: '', purchaseUnit: '', itemUnit: '', orderedQty: 1, unitCost: 0, search: '', open: false }]) }
  function removeLine(i: number) { setLines(l => l.filter((_, idx) => idx !== i)) }
  function pickItem(idx: number, item: PurchaseItem) {
    setLines(l => l.map((line, i) => i !== idx ? line : {
      ...line,
      itemId: item.id, itemName: item.name,
      baseUnit: item.baseUnit, purchaseUnit: item.purchaseUnit,
      itemUnit: item.purchaseUnit, // default to purchase unit
      unitCost: item.avgPrice > 0 ? item.avgPrice : line.unitCost,
      search: '', open: false,
    }))
  }

  async function submit() {
    setSaving(true); setSaveError('')
    if (!supplier.trim()) { setSaveError('Supplier name is required'); setSaving(false); return }
    const res = await fetch('/api/purchasing/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierId: supplierId || undefined, supplierName: supplier, deliveryLocationId: deliveryLocationId || undefined, expectedAt: expectedAt || undefined, notes, items: lines }),
    })
    const data = await res.json()
    if (!res.ok) { setSaveError(data.error ?? 'An error occurred'); setSaving(false); return }
    setSaving(false); setView('list')
    setSupplier(''); setSupplierId(''); setDeliveryLocationId(''); setExpectedAt(''); setNotes('')
    setLines([{ itemId: '', itemName: '', baseUnit: '', purchaseUnit: '', itemUnit: '', orderedQty: 1, unitCost: 0, search: '', open: false }])
    load()
  }

  async function openReceive() {
    if (!detail) return
    setReceiveLines(detail.items.map(i => ({
      itemId: i.itemId, itemName: i.itemName,
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
      setReceiveLocation(detail.deliveryLocationId ?? active[0]?.id ?? '')
    }
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
  const visibleOrders = warehouseView
    ? orders.filter(o => WAREHOUSE_STATUSES.includes(o.status))
    : orders

  if (view === 'list') return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{visibleOrders.length} purchase order</p>
        {!warehouseView && (
          <button onClick={() => setView('create')} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
            <Plus className="h-4 w-4" /> Create PO
          </button>
        )}
      </div>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">PO No.</th>
              <th className="text-left px-4 py-3 font-medium">Supplier</th>
              <th className="text-left px-4 py-3 font-medium">Destination</th>
              <th className="text-left px-4 py-3 font-medium">Requested By</th>
              <th className="text-center px-4 py-3 font-medium">Items</th>
              <th className="text-left px-4 py-3 font-medium">Received</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
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
                  <td className="px-4 py-3.5"><div className="h-3.5 w-6 rounded bg-muted animate-pulse mx-auto" /></td>
                  <td className="px-4 py-3.5"><div className="h-3.5 w-20 rounded bg-muted animate-pulse" /></td>
                  <td className="px-4 py-3.5"><div className="h-3.5 w-20 rounded bg-muted animate-pulse" /></td>
                  <td className="px-4 py-3.5"><div className="h-5 w-20 rounded-full bg-muted animate-pulse" /></td>
                  <td className="px-4 py-3.5" />
                </tr>
              ))}
            </>
              : visibleOrders.length === 0 ? <tr><td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">{warehouseView ? 'Tidak ada PO yang perlu diproses.' : 'No POs yet.'}</td></tr>
              : visibleOrders.map(o => {
                const pct = o.totalOrdered > 0 ? Math.min(100, (o.totalReceived / o.totalOrdered) * 100) : 0
                return (
                  <tr key={o.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(o)}>
                    <td className="px-4 py-3 font-mono text-sm font-medium">{o.poNumber}</td>
                    <td className="px-4 py-3">{o.supplierName ?? <span className="text-muted-foreground italic">TBD</span>}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {o.deliveryLocation ? (
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{o.deliveryLocation.name}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{o.requestedByName ?? '—'}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{o.itemCount}</td>
                    <td className="px-4 py-3 min-w-[120px]">
                      {o.itemCount === 0 || o.status === 'DRAFT' ? (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            <span className={o.fullyReceivedCount > 0 ? 'font-semibold text-foreground' : ''}>{o.fullyReceivedCount}</span>/{o.itemCount} lines
                          </p>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden w-24">
                            <div
                              className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct > 0 ? 'bg-amber-500' : 'bg-transparent'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(o.orderedAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[o.status] ?? ''}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
                      {o.lastReceivedBy && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">by {o.lastReceivedBy}</p>
                      )}
                    </td>
                    <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )

  // ── Create ──
  if (view === 'create') {
    const total = lines.reduce((s, l) => s + l.orderedQty * l.unitCost, 0)
    const inp = 'w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white transition-colors'
    return (
      <div className="space-y-6">

        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Back</button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">Create Purchase Order</span>
        </div>

        {saveError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{saveError}</div>}

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
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">Items</h3>
            <button onClick={addLine}
              className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 border border-amber-200 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors">
              <Plus className="h-3.5 w-3.5" /> Add Row
            </button>
          </div>

          <table className="w-full text-sm">
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
                const sugg = line.search.length >= 1
                  ? purchaseItems.filter(i => i.name.toLowerCase().includes(line.search.toLowerCase()) || i.sku.toLowerCase().includes(line.search.toLowerCase())).slice(0, 8)
                  : purchaseItems.slice(0, 8)
                const subtotal = line.orderedQty * line.unitCost
                const numInp = `${inp} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-right`
                return (
                  <tr key={idx} className="group hover:bg-muted/20 transition-colors">
                    <td className="text-center px-3 py-3 text-xs text-muted-foreground">{idx + 1}</td>

                    {/* Item picker */}
                    <td className="px-2 py-2.5 relative">
                      {line.open ? (
                        <>
                          {/* Backdrop */}
                          <div className="fixed inset-0 z-40" onClick={() => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, open: false, search: '' }))} />
                          <div className="relative z-50">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                              <input autoFocus className={`${inp} pl-8`} placeholder="Search item..."
                                value={line.search}
                                onChange={e => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, search: e.target.value }))}
                              />
                            </div>
                            <div className="absolute left-0 right-0 top-full mt-0.5 bg-white border rounded-lg shadow-xl max-h-52 overflow-y-auto">
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
                            </div>
                          </div>
                        </>
                      ) : (
                        <button onClick={() => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, open: true, search: '' }))}
                          className={`${inp} text-left flex items-center gap-2 ${!line.itemName ? 'text-muted-foreground' : ''}`}>
                          {line.itemName
                            ? <><Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="flex-1 truncate">{line.itemName}</span></>
                            : <><Search className="h-3.5 w-3.5 shrink-0" /><span>Select item...</span></>
                          }
                        </button>
                      )}
                    </td>

                    <td className="px-2 py-2.5">
                      <input type="number" min={0.01} step="any" className={numInp} value={line.orderedQty}
                        onChange={e => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, orderedQty: Number(e.target.value) }))} />
                    </td>
                    <td className="px-2 py-2.5">
                      {line.baseUnit ? (
                        line.baseUnit === line.purchaseUnit ? (
                          <span className="h-9 flex items-center px-3 text-sm text-muted-foreground">{line.baseUnit}</span>
                        ) : (
                          <div className="flex rounded-md border overflow-hidden h-9">
                            {[line.purchaseUnit, line.baseUnit].map(u => (
                              <button key={u} onClick={() => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, itemUnit: u }))}
                                className={`flex-1 text-xs font-medium px-2 transition-colors ${line.itemUnit === u ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:bg-muted'}`}>
                                {u}
                              </button>
                            ))}
                          </div>
                        )
                      ) : (
                        <span className="h-9 flex items-center px-3 text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <input type="number" min={0} step="any" className={numInp} value={line.unitCost}
                        onChange={e => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, unitCost: Number(e.target.value) }))} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                      {subtotal > 0 ? fmtMoney(subtotal) : <span className="text-muted-foreground font-normal">—</span>}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <button onClick={() => removeLine(idx)} disabled={lines.length === 1}
                        className="p-1.5 text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-0 disabled:pointer-events-none">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="flex items-center justify-between px-5 py-4 bg-muted/20 border-t">
            <span className="text-sm text-muted-foreground">{lines.length} item{lines.length > 1 ? 's' : ''}</span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Order Total</span>
              <span className="text-lg font-bold">{fmtMoney(total)}</span>
            </div>
          </div>
        </div>

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

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <button onClick={() => { setView('list'); setDraftSupplier(''); setDraftExpectedAt(''); setDraftNotes(''); setDraftError('') }} className="text-muted-foreground hover:text-foreground text-sm">← Back</button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground">{detail?.poNumber}</span>
      </div>

      {detail && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{detail.poNumber}</h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              {detail.supplierName ?? <span className="italic">No supplier yet</span>} · {fmtDate(detail.orderedAt)} ·{' '}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[detail.status] ?? ''}`}>
                {STATUS_LABEL[detail.status] ?? detail.status}
              </span>
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Requested by <span className="font-medium text-foreground">{detail.requestedByName ?? 'Unknown'}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-1">
            {(detail.status === 'IN_TRANSIT' || detail.status === 'PARTIALLY_RECEIVED') && (() => {
              const managedBy = detail.deliveryLocation?.managedBy ?? 'WAREHOUSE'
              const allowed = managedBy === 'PURCHASING' ? ['PURCHASING', 'ADMIN', 'SUPER_ADMIN'] : ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']
              return allowed.includes(role)
            })() && (
              <button onClick={openReceive} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors">Receive Items</button>
            )}
            {detail.status === 'ORDERED' && canTransit && (
              <button onClick={() => { setTransitPhoto(null); setTransitError(''); setTransitModal(true) }}
                className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                <Camera className="h-3.5 w-3.5" /> Mark In Transit
              </button>
            )}
            {['DRAFT', 'ORDERED'].includes(detail.status) && canTransit && (
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
            <table className="w-full text-sm">
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
              <tfoot className="bg-muted/30 border-t">
                <tr>
                  <td colSpan={4} className="px-5 py-3 text-sm font-semibold text-right">Total</td>
                  <td className="px-5 py-3 text-right font-bold">{fmtMoney(detail.items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>

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

                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f) }} />

                {transitPhoto ? (
                  <div className="space-y-3">
                    <img src={transitPhoto} alt="Dispatch proof" className="w-full rounded-xl object-cover max-h-64 border" />
                    <button onClick={() => { setTransitPhoto(null); fileInputRef.current?.click() }}
                      className="w-full py-2 text-sm text-muted-foreground border rounded-lg hover:bg-muted transition-colors">
                      Replace photo
                    </button>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed rounded-xl py-10 flex flex-col items-center gap-3 text-muted-foreground hover:border-amber-400 hover:text-amber-700 transition-colors">
                    <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center">
                      <Camera className="h-6 w-6 text-amber-500" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-sm">Take or upload photo</p>
                      <p className="text-xs mt-0.5">Packing slip, shipping label, or proof of dispatch</p>
                    </div>
                  </button>
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
                    <label className="text-sm font-semibold">Delivery Location</label>
                    <div className="w-full border rounded-xl px-3 py-2.5 text-sm bg-muted/40 text-foreground">
                      {locations.find(l => l.id === receiveLocation)?.name ?? '—'}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Received By</label>
                    {team.length > 0 ? (
                      <select className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                        value={receiverName} onChange={e => setReceiverName(e.target.value)}>
                        <option value="">— Select receiver —</option>
                        {team.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                      </select>
                    ) : (
                      <input className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="Receiver name"
                        value={receiverName} onChange={e => setReceiverName(e.target.value)} />
                    )}
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
                  <input ref={receivePhotoRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleReceivePhotoFile(f) }} />
                  {receivePhoto ? (
                    <div className="space-y-2">
                      <img src={receivePhoto} alt="Receipt proof" className="w-full rounded-xl object-cover max-h-52 border" />
                      <button onClick={() => { setReceivePhoto(null); receivePhotoRef.current?.click() }}
                        className="w-full py-1.5 text-xs text-muted-foreground border rounded-lg hover:bg-muted transition-colors">
                        Replace photo
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => receivePhotoRef.current?.click()}
                      className="w-full border-2 border-dashed rounded-xl py-8 flex flex-col items-center gap-2.5 text-muted-foreground hover:border-green-400 hover:text-green-700 transition-colors">
                      <div className="h-10 w-10 rounded-full bg-green-50 flex items-center justify-center">
                        <Camera className="h-5 w-5 text-green-500" />
                      </div>
                      <div className="text-center">
                        <p className="font-medium text-sm">Take or upload photo</p>
                        <p className="text-xs mt-0.5">Photo of the goods, packaging, or condition on arrival</p>
                      </div>
                    </button>
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
    </div>
  )
}
