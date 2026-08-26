'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Plus, Minus, ChevronRight, ChevronLeft, Trash2, Package, Search, FileText, ChevronDown, Check, Building2, MapPin, CheckCircle2, Pencil, X, AlertTriangle, Download, ImagePlus, Camera, ShoppingCart, Send, Users, Paperclip, Clock, Ship } from 'lucide-react'
import { ITEM_TYPES, ITEM_TYPE_LABELS, type PurchaseItemType } from '@/lib/purchase-item-types'
import { useFileDrop } from '@/hooks/useFileDrop'
import { getBand, requiredQuotationCount, BAND_LABEL, RECURRING_SUPPLIER_ORDER_THRESHOLD } from '@/lib/purchasing/quotationBands'
import { PhotoSourceMenu, FilePreview } from '@/components/ui/file-preview'
import { readUploadFile, isPdfDataUrl, downloadDataUrl, extFromDataUrl } from '@/lib/fileUpload'
import { Timeline, type TimelineStep } from '@/components/purchasing/Timeline'
import { PhotoLightbox } from '@/components/purchasing/PhotoLightbox'
import { buildPoTimelineSteps, type PoTimelineDetail } from '@/lib/purchasing/poTimelineSteps'
import { currentLocationLabel } from '@/lib/purchasing/currentLocationLabel'
import { renderLocationOptions } from '@/components/purchasing/LocationOptions'
import { RupiahInput } from '@/components/ui/rupiah-input'

type FileDropProps = ReturnType<typeof useFileDrop>['dropProps']

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 900
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = reject
    img.src = url
  })
}

interface PurchaseItem { id: string; name: string; sku: string; type: PurchaseItemType; category: string; baseUnit: string; purchaseUnit: string; conversionFactor: number; imageKey: string | null; avgPrice: number; isActive: boolean }
interface SupplierLocation { city: string; address: string }
interface Supplier { id: string; name: string; locations: SupplierLocation[]; contact: string | null; phone: string | null; _count?: { orders: number } }
interface StockLocation { id: string; name: string; type: string; managedBy: string; isActive: boolean; parentId: string | null }
interface EmployeeOption { id: string; fullName: string; employeeNumber: string; department: string | null; office: string | null; role: string | null }
interface Quotation { id: string; supplierId: string | null; supplierName: string; price: number; fileKey: string | null; submittedAt: string }
interface RequestLine { id?: string; key?: string; itemId: string; itemName: string; baseUnit: string; purchaseUnit: string; itemUnit: string; unit?: string; quantity: number; estimatedCost: number; supplierId: string; supplierName: string; supplierSearch: string; supplierOpen: boolean; notes: string; search: string; open: boolean; currentStock?: number | null; minStock?: number | null; conversionFactor?: number | null; imageKeys?: string[]; isCustom?: boolean; isStockItem?: boolean; warehouseStock?: { locationId: string; locationName: string; qty: number }[]; transferEligible?: boolean; quotations?: Quotation[]; exemptionReason?: string | null; selectionJustification?: string | null; requestedByEmployeeId?: string; quotationApproverId?: string | null; quotationApprover?: { id: string; name: string | null } | null; quotationSubmittedAt?: string | null; quotationApprovedById?: string | null; quotationApprovedBy?: { id: string; name: string | null } | null; quotationApprovedAt?: string | null; quotationRejectedBy?: { id: string; name: string | null } | null; quotationRejectedAt?: string | null; quotationRejectionReason?: string | null; convertedAt?: string | null; convertedPoId?: string | null; verifyRejectedById?: string | null; verifyRejectedBy?: { id: string; name: string | null } | null; verifyRejectedAt?: string | null; verifyRejectionReason?: string | null }
interface PurchaseRequest {
  id: string
  prNumber: string
  status: string
  deliveryLocationId: string | null
  deliveryLocation: { id: string; name: string; type: string; managedBy: string } | null
  itemCount: number
  itemNames: string[]
  totalBudget: number
  notes: string | null
  createdAt: string
  createdBy: { id: string; name: string } | null
  requestedBy: { name: string } | null
  requestedByEmployee: { id: string; fullName: string; employeeNumber: string } | null
  verifiedBy: { name: string } | null
  verifiedAt: string | null
  convertedBy: { name: string } | null
  convertedAt: string | null
  rejectedBy: { name: string } | null
  rejectedAt: string | null
  cancelledBy: { name: string } | null
  cancelledAt: string | null
  neededByDate: string | null
  isUrgent: boolean
  urgentReason: string | null
  purpose: 'STOCK_INVENTORY' | 'TRIP'
  division: 'BOAT_OPERATION' | 'BUILDING_MATERIAL' | null
  tripBooking: { id: string; bookingCode: string; yacht: { name: string } | null } | null
  // The PO(s) this PR was converted into — lets the list badge show how far the request
  // actually got, down to exactly where a routed PO physically is right now (same text
  // as the PO's own list — see currentLocationLabel). The detail Timeline fetches each
  // one's full detail separately (see poFullDetails state) to show its complete journey.
  orders?: {
    id: string
    poNumber: string
    status: string
    dispatchedAt: string | null
    deliveryLocation: { name: string } | null
    currentLegLabel?: string | null
  }[]
}
interface TripOption {
  id: string; bookingCode: string; tripType: string; startDate: string; endDate: string
  destination: string | null; status: string
  yacht: { id: string; name: string } | null
  leadGuestName: string; guestNames: string[]
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: 'Pending Manager Approval', DRAFT: 'Draft', ON_PROCESS: 'On Process', CONVERTED: 'Converted', REJECTED: 'Rejected', CANCELLED: 'Cancelled',
}
const STATUS_COLOR: Record<string, string> = {
  PENDING_APPROVAL: 'bg-purple-100 text-purple-700', DRAFT: 'bg-blue-100 text-blue-700', ON_PROCESS: 'bg-amber-100 text-amber-700', CONVERTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700', CANCELLED: 'bg-muted text-muted-foreground',
}
// Mirrors OrdersPage's own STATUS_LABEL/STATUS_COLOR so a PO's status reads the same
// wherever it shows up.
const PO_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', ORDERED: 'Ordered', IN_TRANSIT: 'On Delivery', PARTIALLY_RECEIVED: 'Partially Received', RECEIVED: 'Received', CANCELLED: 'Cancelled',
}
const PO_STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground', ORDERED: 'bg-blue-100 text-blue-700', IN_TRANSIT: 'bg-amber-100 text-amber-700',
  PARTIALLY_RECEIVED: 'bg-orange-100 text-orange-700', RECEIVED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700',
}
// Ranks a PR's linked POs by progress so the list can surface the one bottlenecking the
// whole request — a cancelled PO shouldn't hide that a sibling PO is still stuck at Ordered.
const PO_PROGRESS_RANK: Record<string, number> = { DRAFT: 0, ORDERED: 1, IN_TRANSIT: 2, PARTIALLY_RECEIVED: 3, RECEIVED: 4 }
function leastAdvancedPo(orders: PurchaseRequest['orders']): { po: NonNullable<PurchaseRequest['orders']>[number]; count: number } | null {
  if (!orders || orders.length === 0) return null
  const active = orders.filter(o => o.status !== 'CANCELLED')
  const pool = active.length > 0 ? active : orders
  const least = pool.reduce((a, b) => (PO_PROGRESS_RANK[b.status] ?? 0) < (PO_PROGRESS_RANK[a.status] ?? 0) ? b : a)
  return { po: least, count: orders.length }
}
const FILTER_TABS = [
  { key: 'ALL', label: 'All' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'ON_PROCESS', label: 'On Process' },
  { key: 'CONVERTED', label: 'Converted' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'CANCELLED', label: 'Cancelled' },
]

// Category names come from free-text data entry (some "CHAMPAGNE", some "Dairy") —
// normalize to Title Case for display only, so the filter chips read consistently
// regardless of how a category was originally typed in.
function toTitleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function UrgentBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white animate-pulse">
      <AlertTriangle className="h-3 w-3" /> URGENT
    </span>
  )
}

const DIVISION_LABEL: Record<string, string> = { BOAT_OPERATION: 'Boat Operation', BUILDING_MATERIAL: 'Building Material' }

function DivisionBadge({ division }: { division: 'BOAT_OPERATION' | 'BUILDING_MATERIAL' | null }) {
  if (!division) return null
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
      {DIVISION_LABEL[division]}
    </span>
  )
}

// Trip picker for the "Purpose: Trip" option — same shape/behavior as the PO page's own
// trip picker (search by booking code/guest/destination, filter by yacht).
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
        className="w-full h-10 border rounded-lg px-3 text-sm text-left flex items-center justify-between bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors">
        <span className={value ? '' : 'text-muted-foreground'}>{value ? valueLabel : 'Select trip...'}</span>
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

// Item names for a PR list row — a couple of names inline, "+N more" for the rest so a
// PR with a long cart doesn't blow out the row height; full list on hover via title.
function ItemNamesPreview({ names, max = 2, className = '' }: { names: string[]; max?: number; className?: string }) {
  if (names.length === 0) return null
  const shown = names.slice(0, max).join(', ')
  const rest = names.length - max
  return (
    <p className={`truncate ${className}`} title={names.join(', ')}>
      {shown}{rest > 0 && <span className="text-muted-foreground/70"> +{rest} more</span>}
    </p>
  )
}

export default function RequestsPage({ onOpenPo, deepLinkId, onDeepLinkHandled }: {
  onOpenPo?: (poId: string) => void
  deepLinkId?: string | null
  onDeepLinkHandled?: () => void
} = {}) {
  const { data: session } = useSession()
  const isWarehouse = (session?.user as { role?: string })?.role === 'WAREHOUSE'
  // "Requested by Me" only makes sense for Admin — Purchasing/Warehouse's whole job here
  // is processing everyone else's requests, not filtering down to their own.
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes((session?.user as { role?: string })?.role ?? '')
  const [requests, setRequests] = useState<PurchaseRequest[]>([])
  const [items, setItems] = useState<PurchaseItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [filterStatus, setFilterStatus] = useState('ALL')
  // Admin/Purchasing see the whole company's queue by default — this scopes it down to
  // just the PRs the logged-in user themselves created, same distinction as "My Approvals".
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'MINE'>('ALL')
  // A Purchasing user assigned a division (see User.purchasingDivision) defaults to just
  // their own division's queue, but can switch to the full list any time — division
  // never actually restricts access, it only picks what's shown first. Everyone else
  // (myDivision null) never sees this toggle and always gets the full list.
  const [myDivision, setMyDivision] = useState<'BOAT_OPERATION' | 'BUILDING_MATERIAL' | null>(null)
  const [divisionScope, setDivisionScope] = useState<'MINE' | 'ALL'>('MINE')
  // Tablet/mobile card layout (< lg) paginates independently of the desktop table,
  // which just renders the full filtered list — see OrdersPage.tsx for the same pattern.
  const [cardPage, setCardPage] = useState(1)
  const CARD_PAGE_SIZE = 10
  const [selected, setSelected] = useState<PurchaseRequest | null>(null)
  const [detail, setDetail] = useState<(PurchaseRequest & { items: RequestLine[]; canTransfer?: boolean }) | null>(null)
  // Set while the "create" view is reused to edit an already-submitted DRAFT PR (see
  // openEditRequest) — routes submit() to PATCH .../[id] instead of creating new PRs, and
  // routes onBack to the detail view instead of the list.
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null)
  const [fulfillment, setFulfillment] = useState<Record<string, string | null>>({})
  // Full PO detail (payments, transit legs, receipts) per linked PO id, fetched lazily so
  // the PR Timeline can render each PO's journey exactly like the PO's own Order Timeline.
  const [poFullDetails, setPoFullDetails] = useState<Record<string, PoTimelineDetail>>({})
  const [timelinePhoto, setTimelinePhoto] = useState<string | null>(null)
  const [approveSummary, setApproveSummary] = useState<{ poNumbers: string[]; poIds: string[]; transferNumbers: string[]; remainingItems: string[] } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Form state (create view — catalog + cart, mirrors the /request-order page)
  const [deliveryLocationId, setDeliveryLocationId] = useState('')
  const [requestedByEmployeeId, setRequestedByEmployeeId] = useState('')
  const [notes, setNotes] = useState('')
  const [neededByDate, setNeededByDate] = useState('')
  const [isUrgent, setIsUrgent] = useState(false)
  const [urgentReason, setUrgentReason] = useState('')
  const [purpose, setPurpose] = useState<'STOCK_INVENTORY' | 'TRIP'>('STOCK_INVENTORY')
  const [tripBookingId, setTripBookingId] = useState('')
  const [tripBookingLabel, setTripBookingLabel] = useState('')
  const [trips, setTrips] = useState<TripOption[]>([])
  const [cart, setCart] = useState<RequestLine[]>([])

  // Picking "Requested By" only applies to items added *after* that point (each
  // person becomes their own PR) — but items added before anyone was picked yet
  // (still on the "myself / general stock" default) are easy to mistake as already
  // covered. Backfill those still-blank lines when a name is picked, so setting it
  // after already adding items doesn't silently leave them unassigned. Lines already
  // tagged to a *different* specific person are left alone — that's the intentional
  // multi-requester-per-session split.
  function updateRequestedByEmployeeId(id: string) {
    setRequestedByEmployeeId(id)
    if (id) setCart(prev => prev.map(l => l.requestedByEmployeeId ? l : { ...l, requestedByEmployeeId: id, key: `${l.itemId}-${l.itemUnit}-${id}` }))
  }
  function setTripBooking(id: string, label: string) {
    setTripBookingId(id)
    setTripBookingLabel(label)
  }
  const [cartOpen, setCartOpen] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogType, setCatalogType] = useState<'All' | PurchaseItemType>('BEVERAGE')
  const [catalogCategory, setCatalogCategory] = useState('All')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [supplierModal, setSupplierModal] = useState<'editItem' | 'quotation' | null>(null)
  const [supplierModalSearch, setSupplierModalSearch] = useState('')
  const [supplierFilterCity, setSupplierFilterCity] = useState('All')

  // Custom request modal (create view)
  const [customModal, setCustomModal] = useState(false)
  const [customForm, setCustomForm] = useState({ itemName: '', quantity: 1, unit: 'pcs', notes: '', images: [] as string[] })
  const [compressingCustomImage, setCompressingCustomImage] = useState(false)
  const { isDragging: isDraggingCustomImage, dropProps: customImageDropProps } = useFileDrop(
    files => processCustomImages(Array.from(files)), compressingCustomImage
  )

  // Edit item (est. price / supplier) from the detail view — also used to view custom request detail
  const [editItemModal, setEditItemModal] = useState<RequestLine | null>(null)
  const [rejectItemModal, setRejectItemModal] = useState<RequestLine | null>(null)
  const [rejectItemReason, setRejectItemReason] = useState('')
  const [rejectItemSaving, setRejectItemSaving] = useState(false)
  const [editItemCost, setEditItemCost] = useState('')
  const [editItemSupplierId, setEditItemSupplierId] = useState('')
  const [editItemIsStockItem, setEditItemIsStockItem] = useState(true)
  const [editItemSaving, setEditItemSaving] = useState(false)
  const [editItemError, setEditItemError] = useState('')

  // Quotations / sourcing-compliance sub-section of the Edit Item modal (KPI 5)
  const [quoteForm, setQuoteForm] = useState({ supplierId: '', supplierName: '', price: '', fileKey: '' })
  const [quoteSaving, setQuoteSaving] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [quoteFileBusy, setQuoteFileBusy] = useState(false)
  const [quoteFileLightbox, setQuoteFileLightbox] = useState<string | null>(null)
  const [exemptionChecked, setExemptionChecked] = useState(false)
  const [exemptionReasonText, setExemptionReasonText] = useState('')
  // True only while the exemption above was filled in automatically (recurring-supplier
  // detection), never when Purchasing checked the box themselves — so switching to a
  // different, non-recurring supplier can safely clear it without ever touching a reason
  // someone typed by hand.
  const [exemptionAutoSet, setExemptionAutoSet] = useState(false)

  // Band is decided by unit price, not line total (quantity × price) — a bulk order of a
  // cheap item shouldn't need the same sourcing rigor as one expensive unit.
  const editItemBand = editItemModal ? getBand(parseFloat(editItemCost) || 0) : 'A'
  const editItemQuotations = editItemModal?.quotations ?? []

  // Price/supplier history for the item being edited — lets Purchasing reuse a past purchase
  const [priceHistory, setPriceHistory] = useState<{ supplierId: string | null; supplierName: string | null; price: number; poNumber: string; orderedAt: string }[]>([])
  // Quotations already gathered for this same item on OTHER purchase requests — lets
  // Purchasing reuse one instead of asking the supplier to re-quote.
  const [quotationHistory, setQuotationHistory] = useState<{ supplierId: string | null; supplierName: string; price: number; fileKey: string | null; submittedAt: string; prNumber: string }[]>([])
  const [reusingQuotation, setReusingQuotation] = useState(false)

  // The chosen supplier has fulfilled this exact item before (any past PO) — price
  // naturally fluctuates and stays exempt, but a supplier who's never supplied this item
  // is a fresh sourcing decision and still needs quotations + manager approval. Mirrors
  // itemRequiresQuotationApproval in src/lib/purchasing/quotationApproval.ts server-side.
  const historyExempt = editItemBand !== 'A' && !!editItemSupplierId && priceHistory.some(h => h.supplierId === editItemSupplierId)
  const [submittingApproval, setSubmittingApproval] = useState(false)

  // Reference photo lightbox
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number; name: string } | null>(null)

  function openLightbox(images: string[], index: number, name: string) {
    setLightbox({ images, index, name })
  }

  function downloadLightboxImage() {
    if (!lightbox) return
    const src = lightbox.images[lightbox.index]
    const ext = src.match(/^data:image\/(\w+);/)?.[1] ?? 'jpg'
    const a = document.createElement('a')
    a.href = src
    a.download = `${lightbox.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-reference-${lightbox.index + 1}.${ext}`
    a.click()
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [rRes, iRes, sRes, lRes, eRes, tRes, dRes] = await Promise.all([
      fetch('/api/purchasing/requests'),
      fetch('/api/purchasing/items'),
      fetch('/api/purchasing/suppliers'),
      fetch('/api/purchasing/locations'),
      fetch('/api/purchasing/employees'),
      fetch('/api/purchasing/trips'),
      fetch('/api/purchasing/my-division'),
    ])
    if (rRes.ok) setRequests(await rRes.json())
    if (iRes.ok) setItems((await iRes.json()).filter((i: PurchaseItem & { isActive: boolean }) => i.isActive))
    if (sRes.ok) setSuppliers((await sRes.json()).filter((s: Supplier & { isActive: boolean }) => s.isActive))
    if (lRes.ok) setLocations((await lRes.json()).filter((l: StockLocation) => l.isActive))
    if (eRes.ok) setEmployees(await eRes.json())
    if (tRes.ok) setTrips(await tRes.json())
    if (dRes.ok) setMyDivision((await dRes.json()).purchasingDivision)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function fetchDetail(id: string): Promise<(PurchaseRequest & { items: RequestLine[]; canTransfer?: boolean }) | null> {
    setDetailLoading(true)
    const res = await fetch(`/api/purchasing/requests/${id}`)
    let data: (PurchaseRequest & { items: RequestLine[]; canTransfer?: boolean }) | null = null
    if (res.ok) {
      data = await res.json()
      setDetail(data)
      // Full PO detail (payments, transit legs, receipts) isn't in the PR response —
      // fetched separately per linked PO, same endpoint OrdersPage.tsx itself uses, so
      // the PR Timeline can show each PO's journey exactly like the PO's own Timeline.
      const orders = data!.orders ?? []
      if (orders.length > 0) {
        Promise.all(orders.map(async po => {
          const r = await fetch(`/api/purchasing/orders/${po.id}`)
          if (!r.ok) return null
          return [po.id, await r.json() as PoTimelineDetail] as const
        })).then(results => {
          setPoFullDetails(prev => {
            const next = { ...prev }
            for (const r of results) if (r) next[r[0]] = r[1]
            return next
          })
        })
      }
      // Default eligible items to the warehouse with the most stock; the approver
      // can flip any of them back to "Purchase Order" before approving. Preserve any
      // choice already made (e.g. re-fetching after editing a supplier shouldn't
      // silently reset a fulfillment pick the approver already made).
      setFulfillment(prev => {
        const next = { ...prev }
        for (const item of data!.items as RequestLine[]) {
          if (next[item.id!] !== undefined) continue
          const best = item.warehouseStock?.slice().sort((a, b) => b.qty - a.qty)[0]
          next[item.id!] = best?.locationId ?? null
        }
        return next
      })
    }
    setDetailLoading(false)
    return data
  }

  async function openDetail(req: PurchaseRequest) {
    setSelected(req)
    setView('detail')
    setApproveSummary(null)
    setFulfillment({})
    setPoFullDetails({})
    await fetchDetail(req.id)
  }

  // Deep-link from a notification click — unlike openDetail (which can show a stub row
  // immediately since it always already has the real row from the loaded list), here we
  // only have a bare id, and the header above reads straight off `selected` (prNumber,
  // status, createdAt, ...), so fetch full detail first and only then select it — avoids
  // a flash of blank/"Invalid Date" header content.
  useEffect(() => {
    if (!deepLinkId) return
    let cancelled = false
    ;(async () => {
      setApproveSummary(null); setFulfillment({}); setPoFullDetails({})
      const data = await fetchDetail(deepLinkId)
      if (!cancelled && data) { setSelected(data); setView('detail') }
      onDeepLinkHandled?.()
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId])

  // Reuses the same catalog/cart UI as "New PR" to edit a still-DRAFT request — same
  // form, same validation, so there's no separate/confusing edit layout to learn.
  function openEditRequest() {
    if (!selected || !detail) return
    setDeliveryLocationId(detail.deliveryLocationId || '')
    setRequestedByEmployeeId(detail.requestedByEmployee?.id || '')
    setNotes(detail.notes || '')
    setNeededByDate(detail.neededByDate ? detail.neededByDate.slice(0, 10) : '')
    setIsUrgent(detail.isUrgent)
    setUrgentReason(detail.urgentReason || '')
    setPurpose(detail.purpose)
    setTripBookingId(detail.tripBooking?.id || '')
    setTripBookingLabel(detail.tripBooking ? `${detail.tripBooking.bookingCode}${detail.tripBooking.yacht ? ` — ${detail.tripBooking.yacht.name}` : ''}` : '')
    setCart(detail.items.map(item => ({
      ...item,
      key: item.id,
      supplierSearch: '', supplierOpen: false, search: '', open: false,
    })))
    setEditingRequestId(detail.id)
    setView('create')
  }

  async function convertToPO() {
    if (!selected || !detail) return
    const missingSupplier = detail.items.filter(item => !item.verifyRejectedAt && !item.convertedAt && !fulfillment[item.id!] && !item.supplierId)
    if (missingSupplier.length > 0) {
      alert(`Set a supplier first for: ${missingSupplier.map(i => i.itemName).join(', ')}`)
      return
    }
    const transferFulfillments = Object.entries(fulfillment)
      .filter(([, fromLocationId]) => fromLocationId)
      .map(([requestItemId, fromLocationId]) => ({ requestItemId, fromLocationId: fromLocationId as string }))
    const res = await fetch(`/api/purchasing/requests/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CONVERTED', transferFulfillments }),
    })
    const data = await res.json()
    if (!res.ok) { alert(data.error ?? 'Failed to convert to PO'); return }
    // data.status reflects what actually happened: CONVERTED only once every item cleared
    // approval and was converted — otherwise the request stays ON_PROCESS with the ready
    // items already sent off, and remainingItems lists what's still waiting.
    setSelected(s => s ? { ...s, status: data.status } : s)
    await fetchDetail(selected.id)
    setApproveSummary({ poNumbers: data.createdPoNumbers ?? [], poIds: data.createdPoIds ?? [], transferNumbers: data.createdTransferNumbers ?? [], remainingItems: data.remainingItems ?? [] })
    load()
  }

  function openEditItem(item: RequestLine) {
    setEditItemModal(item)
    setEditItemCost(item.estimatedCost ? String(item.estimatedCost) : '')
    setEditItemSupplierId(item.supplierId || '')
    setEditItemIsStockItem(item.isStockItem ?? true)
    setEditItemError('')
    // No saved exemption yet but the item's current supplier already has an established
    // order history — auto-exempt rather than making Purchasing tick the box themselves.
    const recurringSupplier = !item.exemptionReason && item.supplierId ? suppliers.find(s => s.id === item.supplierId) : undefined
    if (recurringSupplier && isRecurringSupplier(recurringSupplier.id)) {
      setExemptionChecked(true)
      setExemptionReasonText(`Recurring supplier — ${recurringSupplier._count?.orders} previous order${recurringSupplier._count?.orders === 1 ? '' : 's'} on file`)
      setExemptionAutoSet(true)
    } else {
      setExemptionChecked(!!item.exemptionReason)
      setExemptionReasonText(item.exemptionReason ?? '')
      setExemptionAutoSet(false)
    }
    setQuoteForm({ supplierId: '', supplierName: '', price: '', fileKey: '' })
    setQuoteError('')
    setPriceHistory([])
    setQuotationHistory([])
    const qs = item.itemId ? `itemId=${encodeURIComponent(item.itemId)}` : `itemName=${encodeURIComponent(item.itemName)}`
    const excludeQs = item.id ? `&excludeRequestItemId=${encodeURIComponent(item.id)}` : ''
    fetch(`/api/purchasing/items/price-history?${qs}${excludeQs}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) { setPriceHistory(data.history ?? []); setQuotationHistory(data.quotations ?? []) } })
      .catch(() => {})
  }

  function useHistoryEntry(h: { supplierId: string | null; supplierName: string | null; price: number }) {
    setEditItemCost(String(h.price))
    if (h.supplierId) setEditItemSupplierId(h.supplierId)
  }

  // Persists the price/supplier/exemption fields without closing the modal — shared by
  // the explicit Save button and by Submit for Approval, which auto-saves any pending
  // edits first rather than making Purchasing click Save separately before it'll submit.
  async function persistEditItem(): Promise<boolean> {
    if (!editItemModal?.id || !detail) return false
    setEditItemSaving(true); setEditItemError('')
    const supplier = suppliers.find(s => s.id === editItemSupplierId)
    const res = await fetch(`/api/purchasing/requests/${detail.id}/items/${editItemModal.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estimatedCost: parseFloat(editItemCost) || 0,
        supplierId: editItemSupplierId || null,
        supplierName: supplier?.name || null,
        exemptionReason: exemptionChecked ? exemptionReasonText.trim() : '',
        isStockItem: editItemIsStockItem,
      }),
    })
    const data = await res.json()
    setEditItemSaving(false)
    if (!res.ok) { setEditItemError(data.error ?? 'Failed to save'); return false }
    setEditItemModal(m => m ? { ...m, estimatedCost: parseFloat(editItemCost) || 0, supplierId: editItemSupplierId || '', supplierName: supplier?.name || '' } : m)
    if (data.promotedNew) {
      toast.success(`Added "${editItemModal.itemName}" to the item master`, { description: `SKU ${data.promotedSku} — edit its category/pricing anytime under Non-Stock Items` })
    }
    return true
  }

  async function saveEditItem() {
    if (!(await persistEditItem())) return
    setEditItemModal(null)
    if (detail) await fetchDetail(detail.id)
  }

  // Re-pulls just this item's quotations (so the modal updates immediately) and
  // refreshes the underlying PR detail in the background to keep the table in sync —
  // fetchDetail alone can't update editItemModal since it's a separate state snapshot.
  async function refreshQuotations() {
    if (!editItemModal?.id || !detail) return
    const res = await fetch(`/api/purchasing/requests/${detail.id}/items/${editItemModal.id}/quotations`)
    if (res.ok) {
      const data = await res.json()
      setEditItemModal(m => m ? { ...m, quotations: data.quotations } : m)
    }
    fetchDetail(detail.id)
  }

  async function handleQuoteFile(file: File) {
    setQuoteFileBusy(true)
    try {
      const dataUrl = await readUploadFile(file)
      setQuoteForm(f => ({ ...f, fileKey: dataUrl }))
    } catch {
      setQuoteError('Failed to read file')
    } finally {
      setQuoteFileBusy(false)
    }
  }

  async function addQuotation() {
    if (!editItemModal?.id || !detail) return
    if (!quoteForm.supplierName.trim() || !quoteForm.price) { setQuoteError('Supplier and price are required'); return }
    if (!quoteForm.fileKey) { setQuoteError('Attach the quotation document — proof is required for the approver'); return }
    setQuoteSaving(true); setQuoteError('')
    const res = await fetch(`/api/purchasing/requests/${detail.id}/items/${editItemModal.id}/quotations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierId: quoteForm.supplierId || undefined,
        supplierName: quoteForm.supplierName,
        price: parseFloat(quoteForm.price) || 0,
        fileKey: quoteForm.fileKey || undefined,
      }),
    })
    const data = await res.json()
    setQuoteSaving(false)
    if (!res.ok) { setQuoteError(data.error ?? 'Failed to add quotation'); return }
    setQuoteForm({ supplierId: '', supplierName: '', price: '', fileKey: '' })
    await refreshQuotations()
  }

  async function deleteQuotation(quotationId: string) {
    if (!editItemModal?.id || !detail) return
    const res = await fetch(`/api/purchasing/requests/${detail.id}/items/${editItemModal.id}/quotations/${quotationId}`, { method: 'DELETE' })
    if (res.ok) await refreshQuotations()
  }

  function addToCart(item: PurchaseItem, unit: string) {
    // Keying by requester too — adding the same item while a different person is
    // "active" must land as its own line, not silently bump someone else's quantity.
    const key = `${item.id}-${unit}-${requestedByEmployeeId || 'none'}`
    setCart(prev => {
      const existing = prev.find(l => l.key === key)
      if (existing) return prev.map(l => l.key === key ? { ...l, quantity: l.quantity + 1 } : l)
      return [...prev, {
        key, itemId: item.id, itemName: item.name, baseUnit: item.baseUnit, purchaseUnit: item.purchaseUnit,
        itemUnit: unit, unit, quantity: 1, estimatedCost: 0,
        supplierId: '', supplierName: '', supplierSearch: '', supplierOpen: false,
        notes: '', search: '', open: false, isCustom: false,
        imageKeys: item.imageKey ? [item.imageKey] : [],
        requestedByEmployeeId: requestedByEmployeeId || undefined,
      }]
    })
    toast.success(`${item.name} added to cart`)
  }

  function changeCartQty(key: string, delta: number) {
    setCart(prev => prev.map(l => l.key === key ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l))
  }

  function removeCartLine(key: string) {
    setCart(prev => prev.filter(l => l.key !== key))
  }

  async function processCustomImages(files: File[]) {
    if (!files.length) return
    setCompressingCustomImage(true)
    const compressed = await Promise.all(files.map(compressImage))
    setCustomForm(f => ({ ...f, images: [...f.images, ...compressed] }))
    setCompressingCustomImage(false)
  }

  async function handleCustomImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    await processCustomImages(files)
  }

  function removeCustomImage(index: number) {
    setCustomForm(f => ({ ...f, images: f.images.filter((_, i) => i !== index) }))
  }

  function addCustomToCart() {
    if (!customForm.itemName.trim()) return
    setCart(prev => [...prev, {
      key: `custom-${Date.now()}`,
      itemId: '', itemName: customForm.itemName.trim(), baseUnit: '', purchaseUnit: '',
      itemUnit: customForm.unit.trim() || 'pcs', unit: customForm.unit.trim() || 'pcs',
      quantity: Number(customForm.quantity) || 1, estimatedCost: 0,
      supplierId: '', supplierName: '', supplierSearch: '', supplierOpen: false,
      notes: customForm.notes.trim(), search: '', open: false, isCustom: true,
      imageKeys: customForm.images,
      requestedByEmployeeId: requestedByEmployeeId || undefined,
    }])
    setCustomForm({ itemName: '', quantity: 1, unit: 'pcs', notes: '', images: [] })
    setCustomModal(false)
  }

  function isRecurringSupplier(supplierId: string) {
    const s = suppliers.find(sup => sup.id === supplierId)
    return (s?._count?.orders ?? 0) >= RECURRING_SUPPLIER_ORDER_THRESHOLD
  }

  // The one place that sets the item's Chosen Supplier — used by the supplier picker,
  // and by the quotations list's "Use" shortcut so both paths behave identically.
  function chooseSupplier(supplierId: string) {
    setEditItemSupplierId(supplierId)
    const s = suppliers.find(sup => sup.id === supplierId)
    // Picking an established supplier (3+ past orders) auto-exempts the item from
    // gathering fresh quotations — but only fills in over a blank field or a previous
    // auto-fill; a reason Purchasing typed by hand (for this or a prior supplier) is
    // never overwritten. Switching away from a supplier we auto-exempted, to one that
    // isn't recurring, clears the now-stale auto reason instead of leaving it behind.
    if (isRecurringSupplier(supplierId)) {
      if (exemptionAutoSet || !exemptionChecked) {
        setExemptionChecked(true)
        setExemptionReasonText(`Recurring supplier — ${s?._count?.orders} previous order${s?._count?.orders === 1 ? '' : 's'} on file`)
        setExemptionAutoSet(true)
      }
    } else if (exemptionAutoSet) {
      setExemptionChecked(false)
      setExemptionReasonText('')
      setExemptionAutoSet(false)
    }
  }

  function selectSupplierForTarget(s: Supplier) {
    if (supplierModal === 'quotation') { setQuoteForm(f => ({ ...f, supplierId: s.id, supplierName: s.name })); return }
    chooseSupplier(s.id)
  }

  // "Add" on a quotation gathered for the same item on a DIFFERENT PR — copies it in as a
  // quotation on this item too, so it counts toward the required N and stays on file for
  // this PR's own audit trail. Which one gets used is the approver's call, not ours — this
  // does not select it as Chosen Supplier.
  async function reuseQuotation(q: { supplierId: string | null; supplierName: string; price: number; fileKey: string | null; submittedAt: string }) {
    if (!editItemModal?.id || !detail) return
    setReusingQuotation(true); setQuoteError('')
    const res = await fetch(`/api/purchasing/requests/${detail.id}/items/${editItemModal.id}/quotations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierId: q.supplierId || undefined,
        supplierName: q.supplierName,
        price: q.price,
        fileKey: q.fileKey || undefined,
        submittedAt: q.submittedAt,
      }),
    })
    const data = await res.json()
    setReusingQuotation(false)
    if (!res.ok) { setQuoteError(data.error ?? 'Failed to reuse quotation'); return }
    await refreshQuotations()
  }

  // Sends the item's gathered quotations to the submitting staffer's manager for
  // approval — Convert to PO stays blocked (server-enforced) until they act on it.
  async function submitForApproval() {
    if (!editItemModal?.id || !detail) return
    setSubmittingApproval(true); setQuoteError('')
    // Auto-save a pending price/supplier edit first — the approval endpoint reads the
    // item's persisted estimatedCost to work out the band, so a submit against a stale
    // saved price would gate on the wrong band. Saves quietly here instead of making
    // Purchasing click Save separately before Submit for Approval will even enable.
    const hasUnsavedChanges = editItemCost !== String(editItemModal.estimatedCost ?? 0)
    if (hasUnsavedChanges && !(await persistEditItem())) { setSubmittingApproval(false); return }
    const res = await fetch(`/api/purchasing/requests/${detail.id}/items/${editItemModal.id}/quotations/approval`, { method: 'POST' })
    const data = await res.json()
    setSubmittingApproval(false)
    if (!res.ok) { setQuoteError(data.error ?? 'Failed to submit for approval'); return }
    const fresh = await fetchDetail(detail.id)
    const freshItem = fresh?.items.find(i => i.id === editItemModal.id)
    if (freshItem) setEditItemModal(freshItem)
  }

  async function quickAddSupplier(name: string) {
    const res = await fetch('/api/purchasing/suppliers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) return
    const s: Supplier = await res.json()
    setSuppliers(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)))
    if (supplierModal === 'quotation') setQuoteForm(f => ({ ...f, supplierId: s.id, supplierName: s.name }))
    else setEditItemSupplierId(s.id)
  }

  async function submit() {
    setSaving(true)
    setSaveError('')
    if (!deliveryLocationId) { setSaveError('Please select a delivery location'); setSaving(false); return }
    if (cart.length === 0) { setSaveError('Add at least one item to the request'); setSaving(false); return }
    if (isUrgent && !urgentReason.trim()) { setSaveError('Please explain why this request is urgent'); setSaving(false); return }
    if (purpose === 'TRIP' && !tripBookingId) { setSaveError('Please select which trip this request is for'); setSaving(false); return }

    if (editingRequestId) {
      const id = editingRequestId
      const res = await fetch(`/api/purchasing/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edit: true,
          deliveryLocationId, requestedByEmployeeId: requestedByEmployeeId || undefined, notes,
          neededByDate: neededByDate || undefined, isUrgent, urgentReason: isUrgent ? urgentReason : undefined,
          purpose, tripBookingId: purpose === 'TRIP' ? tripBookingId : undefined,
          items: cart.map(l => ({
            itemId: l.itemId || undefined, itemName: l.itemName, quantity: l.quantity,
            unit: l.itemUnit || l.baseUnit || 'pcs', estimatedCost: l.estimatedCost || undefined,
            supplierId: l.supplierId || undefined, supplierName: l.supplierName || undefined,
            notes: l.notes, imageKeys: l.imageKeys,
          })),
        }),
      })
      const data = await res.json()
      setSaving(false)
      if (!res.ok) { setSaveError(data.error ?? 'An error occurred'); return }
      setEditingRequestId(null)
      setDeliveryLocationId(''); setRequestedByEmployeeId(''); setNotes('')
      setNeededByDate(''); setIsUrgent(false); setUrgentReason('')
      setPurpose('STOCK_INVENTORY'); setTripBookingId(''); setTripBookingLabel('')
      setCart([]); setCartOpen(false)
      toast.success(`Purchase Request ${data.prNumber} updated`)
      const listRes = await fetch('/api/purchasing/requests')
      if (listRes.ok) {
        const list = await listRes.json()
        setRequests(list)
        const fresh = list.find((r: PurchaseRequest) => r.id === id)
        if (fresh) setSelected(fresh)
      }
      setView('detail')
      await fetchDetail(id)
      return
    }

    // Group by requester — each distinct "Requested By" (including blank, meaning
    // "myself / general stock") becomes its own PR, all sharing the same delivery
    // location, notes, needed-by date, and urgency. Submitted one at a time (not
    // Promise.all) since PR number generation isn't safe under concurrent writes.
    const groups = new Map<string, RequestLine[]>()
    for (const line of cart) {
      const key = line.requestedByEmployeeId || ''
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(line)
    }

    const created: { prNumber: string; requesterName: string; id: string; pendingApproval: boolean }[] = []
    for (const [empId, lines] of groups) {
      const res = await fetch('/api/purchasing/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryLocationId: deliveryLocationId || undefined, requestedByEmployeeId: empId || undefined, notes,
          neededByDate: neededByDate || undefined, isUrgent, urgentReason: isUrgent ? urgentReason : undefined,
          purpose, tripBookingId: purpose === 'TRIP' ? tripBookingId : undefined,
          items: lines.map(l => ({
            itemId: l.itemId || undefined, itemName: l.itemName, quantity: l.quantity,
            unit: l.itemUnit || l.baseUnit || 'pcs', notes: l.notes, imageKeys: l.imageKeys,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const madeSoFar = created.length ? ` (${created.map(c => c.prNumber).join(', ')} was already created before this failed)` : ''
        setSaveError(`${data.error ?? 'An error occurred'}${madeSoFar}`)
        setSaving(false)
        return
      }
      const requesterName = empId ? (employees.find(e => e.id === empId)?.fullName ?? 'Unknown') : 'Myself / general stock'
      created.push({ prNumber: data.prNumber, requesterName, id: data.id, pendingApproval: data.status === 'PENDING_APPROVAL' })
    }

    setSaving(false)
    setDeliveryLocationId(''); setRequestedByEmployeeId(''); setNotes('')
    setNeededByDate(''); setIsUrgent(false); setUrgentReason('')
    setPurpose('STOCK_INVENTORY'); setTripBookingId(''); setTripBookingLabel('')
    setCart([]); setCartOpen(false)
    if (created.length > 1) {
      toast.success(`${created.length} Purchase Requests created`, {
        description: created.map(c => `${c.prNumber} — ${c.requesterName}`).join(' · '),
      })
      setView('list')
      load()
    } else {
      // Awaiting-manager-approval PRs are deliberately hidden from this list until
      // approved, so dumping the user back on 'list' here would make their brand-new
      // submission look like it vanished — jump straight to its detail instead.
      toast.success(`Purchase Request ${created[0].prNumber} created`, {
        description: created[0].pendingApproval ? 'Waiting for manager approval before Purchasing can process it.' : undefined,
      })
      await openDetail({ id: created[0].id, prNumber: created[0].prNumber, status: created[0].pendingApproval ? 'PENDING_APPROVAL' : 'DRAFT' } as PurchaseRequest)
      load()
    }
  }

  async function changeStatus(id: string, status: string) {
    const res = await fetch(`/api/purchasing/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Failed to update status'); return }
    setSelected(s => s?.id === id ? { ...s, status } : s)
    // The item list / timeline / Decision column all key off `detail`, not `selected` —
    // without this they'd stay stuck showing the pre-verify layout until the user left
    // and reopened the request.
    await fetchDetail(id)
    load()
  }

  // Accept/reject a single item before or while the PR is being verified — lets Purchasing
  // fix which items actually go on to a PO instead of an all-or-nothing PR-level decision.
  async function setItemVerifyDecision(item: RequestLine, rejected: boolean, reason?: string): Promise<boolean> {
    if (!detail || !item.id) return false
    const res = await fetch(`/api/purchasing/requests/${detail.id}/items/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifyRejected: rejected, verifyRejectionReason: reason ?? '' }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? 'Failed to update item decision'); return false }
    await fetchDetail(detail.id)
    return true
  }

  function openRejectItemModal(item: RequestLine) {
    setRejectItemModal(item)
    setRejectItemReason('')
  }

  async function confirmRejectItem() {
    if (!rejectItemModal) return
    setRejectItemSaving(true)
    const ok = await setItemVerifyDecision(rejectItemModal, true, rejectItemReason)
    setRejectItemSaving(false)
    if (ok) setRejectItemModal(null)
  }

  async function deleteReq(req: PurchaseRequest) {
    if (!confirm(`Delete ${req.prNumber}?`)) return
    const res = await fetch(`/api/purchasing/requests/${req.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Failed to delete'); return }
    setView('list'); load()
  }

  // ── List view ──
  if (view === 'list') {
    // Division default — narrows to the assigned division (+ uncategorized PRs) unless
    // the user has flipped to "All Requests". Purely client-side: the server always
    // returns the full list, so switching this never re-fetches.
    const divisionScoped = (myDivision && divisionScope === 'MINE')
      ? requests.filter(r => r.division === myDivision || r.division === null)
      : requests
    const myDivisionCount = myDivision ? requests.filter(r => r.division === myDivision || r.division === null).length : 0
    const scopedRequests = scopeFilter === 'MINE' ? divisionScoped.filter(r => r.createdBy?.id === session?.user?.id) : divisionScoped
    const filtered = filterStatus === 'ALL' ? scopedRequests : scopedRequests.filter(r => r.status === filterStatus)
    const counts = FILTER_TABS.reduce<Record<string, number>>((acc, t) => {
      acc[t.key] = t.key === 'ALL' ? scopedRequests.length : scopedRequests.filter(r => r.status === t.key).length
      return acc
    }, {})
    const mineCount = divisionScoped.filter(r => r.createdBy?.id === session?.user?.id).length
    const emptyMessage = requests.length === 0
      ? 'No PRs yet. Click "New PR" to get started.'
      : scopeFilter === 'MINE' && scopedRequests.length === 0
        ? "You haven't requested any PRs yet."
        : `No PRs with status "${STATUS_LABEL[filterStatus] ?? filterStatus}".`
    const cardTotalPages = Math.max(1, Math.ceil(filtered.length / CARD_PAGE_SIZE))
    const cardCurrentPage = Math.min(cardPage, cardTotalPages)
    const cardPageItems = filtered.slice((cardCurrentPage - 1) * CARD_PAGE_SIZE, cardCurrentPage * CARD_PAGE_SIZE)
    return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Purchase Request</h2>
          <p className="text-muted-foreground text-sm mt-1">Purchase requests to suppliers</p>
        </div>
        <button onClick={() => setView('create')} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> New PR
        </button>
      </div>

      {/* Division toggle — only shown to a Purchasing user with an assigned division.
          Defaults to their own division (+ uncategorized PRs); "All Requests" always
          stays one click away, it's a default view not an access restriction. */}
      {myDivision && (
        <div className="inline-flex rounded-md border p-0.5 bg-muted/40 w-fit">
          {([['MINE', DIVISION_LABEL[myDivision]], ['ALL', 'All Requests']] as const).map(([key, label]) => (
            <button key={key} onClick={() => { setDivisionScope(key); setFilterStatus('ALL'); setCardPage(1) }}
              className={`px-3 py-1.5 text-sm font-medium rounded-[5px] transition-colors flex items-center gap-1.5 ${
                divisionScope === key ? 'bg-white shadow-sm text-amber-700' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {label}
              {key === 'MINE' && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${divisionScope === key ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                  {myDivisionCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Scope toggle — the company-wide queue vs. just what the logged-in user created
          themselves. Admin-only: Purchasing/Warehouse's job here is processing everyone
          else's requests, and Warehouse's queue is already server-scoped to their own. */}
      {isAdmin && (
        <div className="inline-flex rounded-md border p-0.5 bg-muted/40 w-fit">
          {([['ALL', 'All Requests'], ['MINE', 'Requested by Me']] as const).map(([key, label]) => (
            <button key={key} onClick={() => { setScopeFilter(key); setFilterStatus('ALL'); setCardPage(1) }}
              className={`px-3 py-1.5 text-sm font-medium rounded-[5px] transition-colors flex items-center gap-1.5 ${
                scopeFilter === key ? 'bg-white shadow-sm text-amber-700' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {label}
              {key === 'MINE' && mineCount > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${scopeFilter === key ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                  {mineCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Filter tabs — horizontally scrollable so 6 tabs + count badges don't get
          cramped on a narrower tablet width */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {FILTER_TABS.filter(t => t.key === 'ALL' || counts[t.key] > 0).map(t => (
          <button key={t.key} onClick={() => { setFilterStatus(t.key); setCardPage(1) }}
            className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
              filterStatus === t.key ? 'border-amber-500 text-amber-700' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {t.label}
            {counts[t.key] > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${filterStatus === t.key ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Desktop table — full column set, only makes sense at lg+ width */}
      <div className="hidden desktop:block rounded-lg border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">PR No.</th>
              <th className="text-left px-4 py-3 font-medium">Destination</th>
              <th className="text-left px-4 py-3 font-medium">Requested by</th>
              <th className="text-center px-4 py-3 font-medium">Items</th>
              <th className="text-right px-4 py-3 font-medium">Budget</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <>
                {[...Array(5)].map((_, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-3.5"><div className="h-3.5 w-28 rounded bg-muted animate-pulse" /></td>
                    <td className="px-4 py-3.5"><div className="h-3.5 w-20 rounded bg-muted animate-pulse" /></td>
                    <td className="px-4 py-3.5"><div className="h-3.5 w-24 rounded bg-muted animate-pulse" /></td>
                    <td className="px-4 py-3.5"><div className="h-3.5 w-6 rounded bg-muted animate-pulse mx-auto" /></td>
                    <td className="px-4 py-3.5"><div className="h-3.5 w-24 rounded bg-muted animate-pulse ml-auto" /></td>
                    <td className="px-4 py-3.5"><div className="h-3.5 w-20 rounded bg-muted animate-pulse" /></td>
                    <td className="px-4 py-3.5"><div className="h-5 w-16 rounded-full bg-muted animate-pulse" /></td>
                    <td className="px-4 py-3.5" />
                  </tr>
                ))}
              </>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                {emptyMessage}
              </td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(r)}>
                <td className="px-4 py-3 font-mono text-sm font-medium max-w-55">
                  <span className="flex items-center gap-1.5">
                    {r.prNumber}
                    {r.isUrgent && <UrgentBadge />}
                    <DivisionBadge division={r.division} />
                  </span>
                  <ItemNamesPreview names={r.itemNames} className="font-sans font-normal text-[11px] text-muted-foreground mt-0.5" />
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {r.deliveryLocation ? (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />{r.deliveryLocation.name}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.requestedByEmployee ? (
                    <>
                      <p className="text-foreground">{r.requestedByEmployee.fullName}</p>
                      <p className="text-[11px]">Created by {r.createdBy?.name ?? '—'}</p>
                    </>
                  ) : (r.createdBy?.name ?? '—')}
                </td>
                <td className="px-4 py-3 text-center text-muted-foreground">{r.itemCount}</td>
                <td className="px-4 py-3 text-right tabular-nums text-sm">
                  {r.totalBudget > 0
                    ? <span className="font-medium">Rp {new Intl.NumberFormat('id-ID').format(r.totalBudget)}</span>
                    : <span className="text-muted-foreground/40">—</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.createdAt)}</td>
                <td className="px-4 py-3">
                  {(() => {
                    const least = r.status === 'CONVERTED' ? leastAdvancedPo(r.orders) : null
                    if (!least) return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status] ?? ''}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                    const { po, count } = least
                    return (
                      <div className="space-y-0.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${PO_STATUS_COLOR[po.status] ?? ''}`}>
                          {po.currentLegLabel ?? PO_STATUS_LABEL[po.status] ?? po.status}{count > 1 && ` (+${count - 1})`}
                        </span>
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{currentLocationLabel(po)}</p>
                      </div>
                    )
                  })()}
                </td>
                <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                  {r.status === 'DRAFT' && !isWarehouse ? (
                    <button
                      onClick={() => changeStatus(r.id, 'ON_PROCESS')}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-md transition-colors whitespace-nowrap">
                      <CheckCircle2 className="h-3 w-3" /> Verify
                    </button>
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {/* Tablet/mobile card layout — one PR per card, two lines, own 10-per-page pagination */}
      <div className="desktop:hidden space-y-2">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2 animate-pulse">
              <div className="h-3.5 w-32 rounded bg-muted" />
              <div className="h-3.5 w-48 rounded bg-muted" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm border rounded-lg">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
            {requests.length === 0 ? 'No PRs yet. Click "New PR" to get started.' : `No PRs with status "${STATUS_LABEL[filterStatus] ?? filterStatus}".`}
          </div>
        ) : cardPageItems.map(r => (
          <button
            key={r.id}
            onClick={() => openDetail(r)}
            className="w-full text-left rounded-lg border p-3 space-y-1.5 hover:bg-muted/30 active:bg-muted/50 transition-colors"
          >
            {(() => {
              const least = r.status === 'CONVERTED' ? leastAdvancedPo(r.orders) : null
              return (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold flex items-center gap-1.5">
                      {r.prNumber}
                      {r.isUrgent && <UrgentBadge />}
                      <DivisionBadge division={r.division} />
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {least ? (
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${PO_STATUS_COLOR[least.po.status] ?? ''}`}>
                          {least.po.currentLegLabel ?? PO_STATUS_LABEL[least.po.status] ?? least.po.status}{least.count > 1 && ` (+${least.count - 1})`}
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLOR[r.status] ?? ''}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{fmtDate(r.createdAt)}</span>
                    </div>
                  </div>
                  <ItemNamesPreview names={r.itemNames} max={3} className="text-xs text-muted-foreground" />
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate min-w-0">
                      <span className="font-medium text-foreground">{r.requestedByEmployee?.fullName ?? r.createdBy?.name ?? '—'}</span>
                      {r.deliveryLocation && <> · {r.deliveryLocation.name}</>}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {r.totalBudget > 0 ? `Rp ${new Intl.NumberFormat('id-ID').format(r.totalBudget)}` : `${r.itemCount} item${r.itemCount !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                  {least && (
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{currentLocationLabel(least.po)}</p>
                  )}
                </>
              )
            })()}
          </button>
        ))}
      </div>
      {!loading && filtered.length > 0 && cardTotalPages > 1 && (
        <div className="desktop:hidden flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {cardCurrentPage} of {cardTotalPages} · {filtered.length} PR{filtered.length !== 1 ? 's' : ''}
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
    </div>
  )
  }

  // ── Create view (catalog + cart, mirrors the /request-order page) ──
  if (view === 'create') {
    return (
      <CreateRequestView
        items={items} locations={locations} employees={employees}
        deliveryLocationId={deliveryLocationId} setDeliveryLocationId={setDeliveryLocationId}
        requestedByEmployeeId={requestedByEmployeeId} setRequestedByEmployeeId={updateRequestedByEmployeeId}
        notes={notes} setNotes={setNotes}
        neededByDate={neededByDate} setNeededByDate={setNeededByDate}
        isUrgent={isUrgent} setIsUrgent={setIsUrgent} urgentReason={urgentReason} setUrgentReason={setUrgentReason}
        purpose={purpose} setPurpose={setPurpose} tripBookingId={tripBookingId} tripBookingLabel={tripBookingLabel} setTripBooking={setTripBooking} trips={trips}
        cart={cart} cartOpen={cartOpen} setCartOpen={setCartOpen}
        addToCart={addToCart} changeCartQty={changeCartQty} removeCartLine={removeCartLine}
        catalogSearch={catalogSearch} setCatalogSearch={setCatalogSearch}
        catalogType={catalogType} setCatalogType={setCatalogType}
        catalogCategory={catalogCategory} setCatalogCategory={setCatalogCategory}
        customModal={customModal} setCustomModal={setCustomModal}
        customForm={customForm} setCustomForm={setCustomForm}
        compressingCustomImage={compressingCustomImage}
        isDraggingCustomImage={isDraggingCustomImage} customImageDropProps={customImageDropProps}
        onCustomImageFiles={processCustomImages} removeCustomImage={removeCustomImage} addCustomToCart={addCustomToCart}
        saveError={saveError} saving={saving} submit={submit}
        editingPrNumber={editingRequestId ? selected?.prNumber : undefined}
        onBack={() => {
          if (editingRequestId) {
            setEditingRequestId(null)
            setDeliveryLocationId(''); setRequestedByEmployeeId(''); setNotes('')
            setNeededByDate(''); setIsUrgent(false); setUrgentReason('')
            setPurpose('STOCK_INVENTORY'); setTripBookingId(''); setTripBookingLabel('')
            setCart([]); setCartOpen(false)
            setView('detail')
          } else {
            setView('list')
          }
        }}
      />
    )
  }

  // ── Detail view ──
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setView('list')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Back</button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground">{selected?.prNumber}</span>
      </div>

      {selected && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              {selected.prNumber}
              {selected.isUrgent && <UrgentBadge />}
              <DivisionBadge division={selected.division} />
            </h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              {fmtDate(selected.createdAt)} · created by {selected.createdBy?.name ?? '—'}
              {selected.requestedByEmployee && <> · requested by {selected.requestedByEmployee.fullName}</>}
              {selected.verifiedBy && <> · verified by {selected.verifiedBy.name}</>}
              {' · '}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[selected.status] ?? ''}`}>
                {STATUS_LABEL[selected.status] ?? selected.status}
              </span>
            </p>
            {selected.isUrgent && selected.urgentReason && (
              <p className="text-sm text-red-600 mt-1.5 bg-red-50 border border-red-200 rounded-md px-3 py-1.5 inline-block">
                <span className="font-semibold">Urgent:</span> {selected.urgentReason}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-1">
            {selected.status === 'DRAFT' && (
              <>
                {!isWarehouse && (
                  <>
                    <button onClick={() => changeStatus(selected.id, 'ON_PROCESS')}
                      className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium transition-colors">
                      Verify
                    </button>
                    <button onClick={openEditRequest}
                      className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                      Edit
                    </button>
                    <button onClick={() => changeStatus(selected.id, 'REJECTED')}
                      className="px-4 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                      Reject
                    </button>
                  </>
                )}
                <button onClick={() => deleteReq(selected)}
                  className="px-4 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                  Delete
                </button>
              </>
            )}
            {selected.status === 'ON_PROCESS' && !isWarehouse && (
              <>
                {(() => {
                  const settleable = detail?.items.filter(item => !item.verifyRejectedAt && !item.convertedAt) ?? []
                  const missingSupplier = settleable.filter(item => !fulfillment[item.id!] && !item.supplierId)
                  const nothingLeft = settleable.length === 0
                  const disabled = nothingLeft || missingSupplier.length > 0
                  return (
                    <button onClick={convertToPO} disabled={disabled}
                      title={nothingLeft ? 'Every item is already converted or rejected' : missingSupplier.length > 0 ? `Set a supplier first for: ${missingSupplier.map(i => i.itemName).join(', ')}` : undefined}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600">
                      <ShoppingCart className="h-4 w-4" /> Convert to PO
                    </button>
                  )
                })()}
                <button onClick={() => changeStatus(selected.id, 'REJECTED')}
                  className="px-4 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                  Reject
                </button>
              </>
            )}
            {selected.status === 'ON_PROCESS' && isWarehouse && (
              <span className="text-sm text-muted-foreground italic">Being processed by Purchasing</span>
            )}
            {selected.status === 'CONVERTED' && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <span className="text-sm text-muted-foreground italic">Converted to Purchase Order</span>
                {onOpenPo && detail?.orders?.map(po => (
                  <button key={po.id} onClick={() => onOpenPo(po.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors">
                    <ShoppingCart className="h-3 w-3" /> Go to {po.poNumber}
                  </button>
                ))}
              </div>
            )}
            {selected.status === 'REJECTED' && !isWarehouse && (
              <button onClick={() => changeStatus(selected.id, 'DRAFT')}
                className="px-4 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-muted transition-colors">
                Reopen
              </button>
            )}
          </div>
        </div>
      )}

      {approveSummary && (approveSummary.poNumbers.length > 0 || approveSummary.transferNumbers.length > 0) && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 space-y-2">
          <p className="font-medium">
            {approveSummary.remainingItems.length > 0 ? 'Ready items converted — the rest is still waiting on approval.' : 'Request converted to Purchase Order.'}
          </p>
          {approveSummary.poNumbers.length > 0 && (
            <div className="space-y-1.5">
              <p>Purchase Order{approveSummary.poNumbers.length > 1 ? 's' : ''}: {approveSummary.poNumbers.join(', ')}</p>
              <div className="flex flex-wrap gap-2">
                {approveSummary.poNumbers.map((poNumber, i) => {
                  const poId = approveSummary.poIds[i]
                  return poId && onOpenPo ? (
                    <button
                      key={poId}
                      onClick={() => onOpenPo(poId)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                    >
                      <ShoppingCart className="h-3 w-3" /> Go to {poNumber}
                    </button>
                  ) : null
                })}
              </div>
            </div>
          )}
          {approveSummary.transferNumbers.length > 0 && <p>Transfer{approveSummary.transferNumbers.length > 1 ? 's' : ''} (fulfilled from warehouse stock): {approveSummary.transferNumbers.join(', ')}</p>}
          {approveSummary.remainingItems.length > 0 && (
            <p className="text-amber-700">Still needs supplier-selection approval, not yet converted: {approveSummary.remainingItems.join(', ')} — the request stays On Process until these clear too, and can be converted again once they do.</p>
          )}
        </div>
      )}

      {detailLoading || !detail ? (
        <div className="space-y-4 animate-pulse">
          <div className="rounded-lg border p-5 space-y-3">
            <div className="h-4 w-16 rounded bg-muted" />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><div className="h-3 w-12 rounded bg-muted" /><div className="h-4 w-24 rounded bg-muted" /></div>
              <div className="space-y-2"><div className="h-3 w-16 rounded bg-muted" /><div className="h-4 w-32 rounded bg-muted" /></div>
            </div>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <div className="h-10 bg-muted/50" />
            {[...Array(3)].map((_, i) => <div key={i} className="px-5 py-4 border-t flex justify-between"><div className="h-4 w-40 rounded bg-muted" /><div className="h-4 w-24 rounded bg-muted" /></div>)}
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-lg border p-5 space-y-3">
            <h3 className="font-semibold text-sm">Info</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-xs text-muted-foreground">Delivery Location</p><p className="font-medium">{detail.deliveryLocation?.name ?? '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Created By</p><p className="font-medium">{detail.createdBy?.name ?? '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Requested By</p><p className="font-medium">{detail.requestedByEmployee?.fullName ?? <span className="text-muted-foreground/60 italic font-normal">Same as created by</span>}</p></div>
              <div>
                <p className="text-xs text-muted-foreground">Purpose</p>
                <p className="font-medium">
                  {detail.purpose === 'TRIP'
                    ? `Trip${detail.tripBooking ? ` — ${detail.tripBooking.bookingCode}${detail.tripBooking.yacht ? ` (${detail.tripBooking.yacht.name})` : ''}` : ''}`
                    : 'Stock & Inventory'}
                </p>
              </div>
              {detail.neededByDate && (
                <div>
                  <p className="text-xs text-muted-foreground">Needed By</p>
                  <p className="font-medium">{fmtDate(detail.neededByDate)}</p>
                </div>
              )}
              {detail.notes && <div><p className="text-xs text-muted-foreground">Notes</p><p>{detail.notes}</p></div>}
            </div>
          </div>
          {(() => {
            // Same connected-dot visual language as the PO's own Order Timeline (green
            // check = done, hollow grey = not reached yet, red X = rejected/cancelled) —
            // continues straight past "Converted to PO" into each resulting PO's own
            // Ordered/On Delivery/Received progress instead of stopping at "Converted".
            const multiPo = (detail.orders?.length ?? 0) > 1
            const steps: TimelineStep[] = [
              {
                key: 'created', done: true, label: 'PR Submitted', date: fmtDateTime(detail.createdAt),
                sub: [detail.requestedByEmployee?.fullName ?? detail.createdBy?.name ?? null, detail.prNumber],
              },
              {
                key: 'verified', done: !!detail.verifiedAt, label: 'Verified (On Process)',
                date: detail.verifiedAt ? fmtDateTime(detail.verifiedAt) : null,
                sub: [detail.verifiedBy?.name ? `by ${detail.verifiedBy.name}` : null],
              },
              {
                key: 'converted', done: !!detail.convertedAt, label: 'Converted to PO',
                date: detail.convertedAt ? fmtDateTime(detail.convertedAt) : null,
                sub: [detail.convertedBy?.name ? `by ${detail.convertedBy.name}` : null],
              },
              // Each linked PO's full journey (payments, dispatch, transit leg by leg,
              // receipts) — identical steps to what OrdersPage.tsx's own Timeline shows,
              // built by the same shared function once that PO's full detail has loaded.
              ...(detail.orders ?? []).flatMap((po): TimelineStep[] => {
                const full = poFullDetails[po.id]
                if (!full) {
                  return [{
                    key: `po-loading-${po.id}`, done: false,
                    label: multiPo ? `Loading ${po.poNumber}…` : 'Loading PO timeline…',
                    date: null, sub: [],
                  }]
                }
                const poSteps = buildPoTimelineSteps(full, { includePrStep: false })
                // With more than one PO on the same PR (partial-convert passes), showing
                // each PO's full history here duplicates what's already one click away on
                // that PO's own detail page (via "Go to PONumber") — collapse each PO down
                // to just its latest status (the most recent step that's actually done).
                const doneSteps = poSteps.filter(s => s.done)
                const visibleSteps = multiPo ? doneSteps.slice(-1) : poSteps
                return visibleSteps.map(s => ({
                  ...s,
                  key: `${po.id}-${s.key}`,
                  label: multiPo ? `${s.label} — ${po.poNumber}` : s.label,
                }))
              }),
              ...(detail.rejectedAt ? [{
                key: 'rejected', done: true, cancelled: true, label: 'Rejected',
                date: fmtDateTime(detail.rejectedAt), sub: [detail.rejectedBy?.name ? `by ${detail.rejectedBy.name}` : null],
              }] : []),
              ...(detail.cancelledAt ? [{
                key: 'cancelled', done: true, cancelled: true, label: 'Cancelled',
                date: fmtDateTime(detail.cancelledAt), sub: [detail.cancelledBy?.name ? `by ${detail.cancelledBy.name}` : null],
              }] : []),
            ]
            const poNumberMap = new Map((detail.orders ?? []).map(po => [po.id, po.poNumber]))
            // Group items that landed in the same PO together (in first-appearance order)
            // so a partial-convert PR doesn't leave items from the same PO scattered across
            // the list — items not yet converted (or converted via Transfer) stay solo.
            const itemsWithIdx = detail.items.map((item, idx) => ({ item, idx }))
            const firstIdxByKey = new Map<string, number>()
            for (const { item, idx } of itemsWithIdx) {
              const key = item.convertedPoId ?? `__solo_${idx}`
              if (!firstIdxByKey.has(key)) firstIdxByKey.set(key, idx)
            }
            const sortedItems = [...itemsWithIdx].sort((a, b) => {
              const keyA = a.item.convertedPoId ?? `__solo_${a.idx}`
              const keyB = b.item.convertedPoId ?? `__solo_${b.idx}`
              const rank = firstIdxByKey.get(keyA)! - firstIdxByKey.get(keyB)!
              return rank !== 0 ? rank : a.idx - b.idx
            }).map(x => x.item)
            return (
              <div className="grid grid-cols-[1fr_300px] gap-6 items-start">
                <div className="rounded-lg border overflow-hidden min-w-0">
                  <div className="px-5 py-3 bg-muted/50 border-b">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Item List</p>
                  </div>
                  <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="border-b text-xs text-muted-foreground bg-muted/20">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium">Item</th>
                  <th className="text-left px-5 py-2.5 font-medium">Supplier</th>
                  {detail.orders && detail.orders.length > 0 && <th className="text-left px-5 py-2.5 font-medium">PO</th>}
                  <th className="text-right px-5 py-2.5 font-medium">Requested</th>
                  <th className="text-right px-5 py-2.5 font-medium">Current Stock</th>
                  {['DRAFT', 'ON_PROCESS'].includes(detail.status) && <th className="text-left px-5 py-2.5 font-medium">Decision</th>}
                  {detail.status === 'ON_PROCESS' && !isWarehouse && <th className="text-left px-5 py-2.5 font-medium">Fulfillment</th>}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedItems.map((item, i) => {
                  const stock = item.currentStock ?? null
                  const min = item.minStock ?? 0
                  const stockColor = stock === null ? '' : stock === 0 ? 'text-red-600 font-semibold' : stock < min ? 'text-orange-500 font-semibold' : 'text-green-700'
                  const photos = Array.isArray(item.imageKeys) ? item.imageKeys : []
                  const editable = detail.status === 'ON_PROCESS' && !isWarehouse
                  const isCustom = !item.itemId
                  const chosenFromLocationId = fulfillment[item.id!] ?? null
                  const isRejected = !!item.verifyRejectedAt
                  const canDecide = !isWarehouse && ['DRAFT', 'ON_PROCESS'].includes(detail.status) && !item.convertedAt
                  const poNumber = item.convertedPoId ? poNumberMap.get(item.convertedPoId) : null
                  const isNewPoGroup = i > 0 && item.convertedPoId && sortedItems[i - 1].convertedPoId !== item.convertedPoId
                  return (
                    <tr
                      key={item.id ?? i}
                      className={`hover:bg-muted/20 ${isCustom ? 'cursor-pointer' : ''} ${isRejected ? 'opacity-50' : ''} ${isNewPoGroup ? 'border-t-2 border-t-slate-200' : ''}`}
                      onClick={() => isCustom && openEditItem(item)}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-start gap-2.5">
                          {!!photos.length && (
                            <div className="flex -space-x-2 shrink-0">
                              {photos.slice(0, 3).map((src, j) => (
                                <img
                                  key={j} src={src} alt={`${item.itemName} reference ${j + 1}`}
                                  className="w-9 h-9 rounded-md object-cover border-2 border-white shadow-sm cursor-zoom-in hover:opacity-80 transition-opacity"
                                  style={{ zIndex: 3 - j }}
                                  onClick={e => { e.stopPropagation(); openLightbox(photos, j, item.itemName) }}
                                />
                              ))}
                              {photos.length > 3 && (
                                <div className="w-9 h-9 rounded-md bg-muted border-2 border-white flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                                  +{photos.length - 3}
                                </div>
                              )}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className={`font-medium ${isRejected ? 'line-through text-muted-foreground' : ''}`}>{item.itemName}</p>
                            {isCustom && <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">Custom request</span>}
                            {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground" onClick={e => detail.status === 'ON_PROCESS' && !isWarehouse && e.stopPropagation()}>
                        {detail.status !== 'ON_PROCESS' || isWarehouse ? (
                          <>
                            {item.supplierName ?? <span className="text-muted-foreground/50 italic">—</span>}
                            {item.transferEligible && !!item.warehouseStock?.length && detail.deliveryLocation?.type !== 'WAREHOUSE' && (
                              <p className="text-[10px] text-blue-600 mt-0.5">
                                Possible transfer from {item.warehouseStock[0].locationName}
                                {item.warehouseStock.length > 1 ? ` +${item.warehouseStock.length - 1} more` : ''}
                              </p>
                            )}
                          </>
                        ) : chosenFromLocationId ? (
                          <span className="text-xs text-muted-foreground/60 italic">— (transfer, no supplier needed)</span>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              onClick={() => openEditItem(item)}
                              className={`text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${
                                item.supplierName ? 'bg-white text-foreground border-gray-300 hover:bg-muted' : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                              }`}
                            >
                              {item.supplierName ?? 'Select supplier...'}
                            </button>
                            {item.convertedAt ? (
                              <span className="text-[10px] font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded-full px-2 py-0.5 whitespace-nowrap">Converted</span>
                            ) : getBand(item.estimatedCost) !== 'A' && (
                              item.quotationApprovedAt ? (
                                <span className="text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 whitespace-nowrap">Approved</span>
                              ) : item.quotationRejectedAt ? (
                                <span className="text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 whitespace-nowrap">Rejected</span>
                              ) : item.quotationSubmittedAt ? (
                                <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap">Pending approval</span>
                              ) : null
                            )}
                          </div>
                        )}
                      </td>
                      {detail.orders && detail.orders.length > 0 && (
                        <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                          {poNumber ? (
                            onOpenPo ? (
                              <button
                                onClick={() => onOpenPo(item.convertedPoId!)}
                                className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md px-2 py-1 hover:bg-green-100 transition-colors whitespace-nowrap"
                              >
                                {poNumber}
                              </button>
                            ) : (
                              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{poNumber}</span>
                            )
                          ) : (
                            <span className="text-muted-foreground/50 italic text-xs">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-5 py-3 text-right">
                        <span>{item.quantity} {item.unit ?? item.purchaseUnit ?? item.itemUnit}</span>
                        {item.baseUnit && item.purchaseUnit && item.baseUnit !== item.purchaseUnit && item.conversionFactor && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({item.quantity * item.conversionFactor} {item.baseUnit})
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {stock === null
                          ? <span className="text-muted-foreground">—</span>
                          : <span className={stockColor}>{stock} <span className="text-xs font-normal text-muted-foreground">{item.baseUnit ?? ''}</span></span>
                        }
                      </td>
                      {['DRAFT', 'ON_PROCESS'].includes(detail.status) && (
                        <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                          {isRejected ? (
                            <div className="flex items-center gap-1.5">
                              <span
                                className="text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 whitespace-nowrap"
                                title={item.verifyRejectionReason || undefined}
                              >
                                Rejected
                              </span>
                              {canDecide && (
                                <button onClick={() => setItemVerifyDecision(item, false)} className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2">
                                  Undo
                                </button>
                              )}
                            </div>
                          ) : canDecide ? (
                            <button
                              onClick={() => openRejectItemModal(item)}
                              className="text-[10px] font-medium text-muted-foreground hover:text-red-600 border border-dashed border-border hover:border-red-300 rounded-full px-2.5 py-0.5 transition-colors"
                            >
                              Reject
                            </button>
                          ) : (
                            <span className="text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 whitespace-nowrap">Accepted</span>
                          )}
                        </td>
                      )}
                      {detail.status === 'ON_PROCESS' && !isWarehouse && (
                        <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                          {!item.transferEligible || !item.warehouseStock?.length ? (
                            <span className="text-xs text-muted-foreground">Purchase Order</span>
                          ) : (
                            <div className="relative inline-block">
                              <select
                                className={`appearance-none text-xs font-medium pl-2.5 pr-6 py-1.5 rounded-md border cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                                  chosenFromLocationId ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' : 'bg-white text-muted-foreground border-gray-300 hover:bg-muted'
                                }`}
                                value={chosenFromLocationId ?? ''}
                                onChange={e => setFulfillment(f => ({ ...f, [item.id!]: e.target.value || null }))}
                              >
                                <option value="">Purchase Order</option>
                                {item.warehouseStock.map(w => (
                                  <option key={w.locationId} value={w.locationId}>Transfer from {w.locationName} ({w.qty})</option>
                                ))}
                              </select>
                              <ChevronDown className={`h-3 w-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none ${chosenFromLocationId ? 'text-blue-700' : 'text-muted-foreground'}`} />
                            </div>
                          )}
                        </td>
                      )}
                      <td className="px-5 py-3 text-right" onClick={e => e.stopPropagation()}>
                        {editable && (
                          <button onClick={() => openEditItem(item)} className="text-muted-foreground hover:text-foreground transition-colors" title="Edit price / supplier">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
                </div>
                <Timeline steps={steps} title="Timeline" onViewPhoto={setTimelinePhoto} />
              </div>
            )
          })()}
        </>
      )}
      {timelinePhoto && (
        <PhotoLightbox photoKey={timelinePhoto} onClose={() => setTimelinePhoto(null)} />
      )}

      {/* ── Edit Item Modal (est. price / supplier, plus full detail for custom requests) ── */}
      {editItemModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b shrink-0">
              <div className="min-w-0">
                <h3 className="font-semibold text-base">{editItemModal.itemId ? 'Edit Item' : 'Custom Request Detail'}</h3>
                <p className="text-sm text-muted-foreground truncate">{editItemModal.itemName}</p>
              </div>
              <button onClick={() => setEditItemModal(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
              {editItemError && (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {editItemError}
                </div>
              )}

              {!editItemModal.itemId && (editItemModal.notes || !!editItemModal.imageKeys?.length) && (
                <div className="rounded-lg border p-4 space-y-3">
                  {editItemModal.notes && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                      <p className="text-sm text-muted-foreground">{editItemModal.notes}</p>
                    </div>
                  )}
                  {!!editItemModal.imageKeys?.length && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Reference Photos</p>
                      <div className="grid grid-cols-4 gap-2">
                        {editItemModal.imageKeys.map((src, i) => (
                          <img
                            key={i} src={src} alt={`Reference ${i + 1}`}
                            className="aspect-square rounded-lg object-cover border cursor-zoom-in hover:opacity-80 transition-opacity"
                            onClick={() => openLightbox(editItemModal.imageKeys!, i, editItemModal.itemName)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {detail?.status !== 'ON_PROCESS' || isWarehouse ? (
                <p className="text-xs text-muted-foreground italic bg-muted/40 rounded-md px-3 py-2.5">
                  Price, supplier and quotations can only be set once this request has been verified (On Process).
                </p>
              ) : (
                <>
                  <div className="rounded-lg border p-4 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pricing &amp; Supplier</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Estimated Price</label>
                        <RupiahInput
                          value={editItemCost}
                          onChange={setEditItemCost}
                          disabled={!!editItemModal?.quotationApprovedAt}
                          title={editItemModal?.quotationApprovedAt ? 'Set by the approved quotation' : undefined}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Chosen Supplier</label>
                        {(() => {
                          // Once a band applies (quotations required), which supplier gets used is the
                          // approver's decision — this locks and auto-fills once they pick one. Exempt
                          // items (recurring supplier, no quotations needed) still let Purchasing set it directly.
                          const supplierFieldDisabled = editItemBand !== 'A' && !historyExempt
                          return (
                            <button
                              type="button"
                              disabled={supplierFieldDisabled}
                              onClick={() => { setSupplierModal('editItem'); setSupplierModalSearch(''); setSupplierFilterCity('All') }}
                              title={supplierFieldDisabled ? 'Set by the approver once they pick a quotation' : undefined}
                              className="w-full h-9 border rounded-md px-3 text-sm text-left flex items-center justify-between gap-2 bg-background hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-background"
                            >
                              <span className={`truncate ${editItemSupplierId ? '' : 'text-muted-foreground'}`}>
                                {suppliers.find(s => s.id === editItemSupplierId)?.name || (supplierFieldDisabled ? 'Set by approver once a quotation is chosen' : 'Select or add supplier...')}
                              </span>
                              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            </button>
                          )
                        })()}
                      </div>
                    </div>

                    {!editItemModal.itemId && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Item Type</label>
                        <select
                          value={editItemIsStockItem ? 'stock' : 'non-stock'}
                          onChange={e => setEditItemIsStockItem(e.target.value === 'stock')}
                          className="w-full h-9 border rounded-md px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                        >
                          <option value="stock">Stock Item — tracked in inventory (warehouse, yacht, etc.)</option>
                          <option value="non-stock">Non-Stock Item — consumed directly, not tracked in stock</option>
                        </select>
                      </div>
                    )}

                    {priceHistory.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-[11px] font-medium text-muted-foreground">Bought before — tap to reuse</p>
                        <div className="flex flex-wrap gap-1.5">
                          {priceHistory.map((h, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => useHistoryEntry(h)}
                              title={`${h.poNumber} · ${new Date(h.orderedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                              className="flex items-center gap-1.5 border rounded-full pl-3 pr-2.5 py-1.5 text-xs hover:bg-amber-50 hover:border-amber-300 transition-colors"
                            >
                              <span className="font-medium">{h.supplierName ?? 'Unknown supplier'}</span>
                              <span className="text-muted-foreground">Rp {new Intl.NumberFormat('id-ID').format(h.price)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {(() => {
                    const band = editItemBand
                    if (band === 'A') return null
                    if (historyExempt) {
                      return (
                        <div className="flex items-start gap-2.5 rounded-lg border border-dashed px-3.5 py-3 text-xs text-muted-foreground bg-muted/20">
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                          <p>
                            <span className="font-medium text-foreground">{suppliers.find(s => s.id === editItemSupplierId)?.name}</span> has supplied this item before —
                            no quotation approval needed. Picking a different supplier will require quotations + approval.
                          </p>
                        </div>
                      )
                    }
                    const quotations = editItemQuotations
                    const required = requiredQuotationCount(band)
                    return (
                      <div className="rounded-lg border p-4 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sourcing &amp; Approval</p>
                          <span className="text-[11px] font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5 whitespace-nowrap">{BAND_LABEL[band]} · needs {required}</span>
                        </div>

                        {quoteError && (
                          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{quoteError}</div>
                        )}

                        <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground">Quotations on file ({quotations.length}/{required})</p>
                        {quotations.length === 0 ? (
                          <p className="text-xs text-muted-foreground/60 italic">None yet — add at least {required} below.</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {quotations.map(q => {
                              const isChosen = !!editItemSupplierId && q.supplierId === editItemSupplierId
                              const isDeselected = !!editItemSupplierId && !isChosen
                              return (
                              <div key={q.id} className={`border rounded-md p-2 text-sm space-y-1.5 transition-opacity ${isChosen ? 'border-green-400 bg-green-50' : ''} ${isDeselected ? 'opacity-50 grayscale' : ''}`}>
                                {q.fileKey ? (
                                  <div className="relative">
                                    <FilePreview
                                      src={q.fileKey}
                                      alt="Quotation document"
                                      onClick={() => setQuoteFileLightbox(q.fileKey)}
                                      className="w-full h-20 rounded border object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                    />
                                    <button
                                      onClick={() => downloadDataUrl(q.fileKey!, `${q.supplierName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-quotation.${extFromDataUrl(q.fileKey!)}`)}
                                      title="Download quotation document"
                                      className="absolute top-1 right-1 bg-white/90 hover:bg-white text-foreground rounded-full p-1 shadow transition-colors"
                                    >
                                      <Download className="h-3 w-3" />
                                    </button>
                                    {isChosen && (
                                      <span className="absolute top-1 left-1 flex items-center gap-1 text-[10px] font-semibold text-white bg-green-600 rounded-full px-2 py-0.5 shadow">
                                        <CheckCircle2 className="h-3 w-3" /> Chosen
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="w-full h-20 rounded border border-dashed flex items-center justify-center text-[11px] text-muted-foreground/60 italic">No document</div>
                                )}
                                <div className="flex items-center justify-between gap-2 min-w-0">
                                  <p className={`truncate ${isChosen ? 'font-semibold' : 'font-medium'}`}>{q.supplierName}</p>
                                  <span className="font-medium shrink-0">Rp {new Intl.NumberFormat('id-ID').format(q.price)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs text-muted-foreground">{new Date(q.submittedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                  <button onClick={() => deleteQuotation(q.id)} className="text-muted-foreground hover:text-red-600 transition-colors" title="Remove quotation">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              )
                            })}
                          </div>
                        )}
                        </div>

                        {quotationHistory.length > 0 && (
                          <div className="space-y-1.5 rounded-md border border-dashed border-amber-200 bg-amber-50/40 p-2.5">
                            <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">Quotations from other requests</p>
                            {quotationHistory.map((q, i) => (
                              <div key={i} className="flex items-center justify-between text-sm bg-white border rounded-md px-3 py-2">
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{q.supplierName}</p>
                                  <p className="text-xs text-muted-foreground">{q.prNumber} · {new Date(q.submittedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-medium">Rp {new Intl.NumberFormat('id-ID').format(q.price)}</span>
                                  <button
                                    onClick={() => reuseQuotation(q)}
                                    disabled={reusingQuotation}
                                    className="text-[11px] font-medium text-amber-700 hover:text-amber-900 border border-amber-200 rounded-md px-2 py-1 hover:bg-amber-50 transition-colors disabled:opacity-50 whitespace-nowrap"
                                  >
                                    Add
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {!editItemModal.quotationApprovedAt && (
                        <div className="space-y-2 pt-4 border-t">
                        <p className="text-[11px] font-medium text-muted-foreground">Add a quotation</p>
                        <div className="grid grid-cols-[1fr_120px_auto] gap-2 items-end">
                          <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground">Supplier</label>
                            <button
                              type="button"
                              onClick={() => { setSupplierModal('quotation'); setSupplierModalSearch(''); setSupplierFilterCity('All') }}
                              className="w-full h-9 border rounded-md px-3 text-sm text-left bg-background hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            >
                              <span className={`truncate block ${quoteForm.supplierName ? '' : 'text-muted-foreground'}`}>
                                {quoteForm.supplierName || 'Select supplier...'}
                              </span>
                            </button>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground">Price</label>
                            <RupiahInput value={quoteForm.price} onChange={v => setQuoteForm(f => ({ ...f, price: v }))} />
                          </div>
                          <button
                            onClick={addQuotation}
                            disabled={quoteSaving || !quoteForm.supplierName.trim() || !quoteForm.price || !quoteForm.fileKey}
                            title={!quoteForm.fileKey ? 'Attach the quotation document first' : undefined}
                            className="h-9 px-3 text-xs font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            {quoteSaving ? '...' : '+ Add'}
                          </button>
                        </div>

                        <input
                          id="quote-file-input" type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleQuoteFile(f) }}
                        />
                        {quoteForm.fileKey ? (
                          <div className="flex items-center gap-2 text-xs border rounded-md px-2.5 py-1.5 bg-muted/30 w-fit">
                            {isPdfDataUrl(quoteForm.fileKey) ? <FileText className="h-3.5 w-3.5 text-red-500 shrink-0" /> : <ImagePlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                            <span className="text-muted-foreground">Quotation document attached</span>
                            <button type="button" onClick={() => setQuoteForm(f => ({ ...f, fileKey: '' }))} className="text-muted-foreground hover:text-red-600">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <label
                            htmlFor="quote-file-input"
                            className={`inline-flex items-center gap-1.5 text-xs border border-dashed rounded-md px-2.5 py-1.5 w-fit cursor-pointer transition-colors ${quoteFileBusy ? 'opacity-50 pointer-events-none' : 'text-amber-700 border-amber-300 hover:text-amber-900 hover:border-amber-400'}`}
                          >
                            <Paperclip className="h-3.5 w-3.5" /> {quoteFileBusy ? 'Uploading…' : 'Attach quotation document — required'}
                          </label>
                        )}
                        </div>
                        )}

                        {!editItemModal.quotationApprovedAt && (
                        <div className="space-y-2 pt-4 border-t">
                        <label className="flex items-start gap-2 text-xs">
                          <input type="checkbox" className="mt-0.5" checked={exemptionChecked} onChange={e => { setExemptionChecked(e.target.checked); setExemptionAutoSet(false) }} />
                          <span>Exempt from quotation count (approved catalogue price / recurring supplier agreement)</span>
                        </label>
                        {exemptionChecked && (
                          <textarea
                            rows={2}
                            placeholder="Exemption reason..."
                            className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-500"
                            value={exemptionReasonText}
                            onChange={e => { setExemptionReasonText(e.target.value); setExemptionAutoSet(false) }}
                          />
                        )}

                        </div>
                        )}

                        <div className="pt-4 border-t">
                        {(() => {
                          // Which supplier gets used is the approver's call, not ours — Submit
                          // only needs enough quotations on file, not a pre-picked supplier.
                          // Any pending price/supplier edit is auto-saved inside submitForApproval,
                          // so it doesn't need to gate the button here.
                          const submitDisabled = submittingApproval || quotations.length < required

                          if (editItemModal.quotationApprovedAt) {
                            return (
                              <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                Approved by {editItemModal.quotationApprovedBy?.name ?? '—'} on {new Date(editItemModal.quotationApprovedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </div>
                            )
                          }
                          if (editItemModal.quotationRejectedAt) {
                            return (
                              <div className="space-y-2">
                                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                                  <p className="font-semibold">Rejected by {editItemModal.quotationRejectedBy?.name ?? '—'}</p>
                                  {editItemModal.quotationRejectionReason && <p className="mt-0.5">{editItemModal.quotationRejectionReason}</p>}
                                </div>
                                <button onClick={submitForApproval} disabled={submitDisabled}
                                  className="w-full h-9 text-xs font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50">
                                  {submittingApproval ? 'Submitting...' : 'Resubmit for Approval'}
                                </button>
                              </div>
                            )
                          }
                          if (editItemModal.quotationSubmittedAt) {
                            return (
                              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                Pending approval by {editItemModal.quotationApprover?.name ?? '—'}
                              </div>
                            )
                          }
                          return (
                            <div className="space-y-1.5">
                              {quotations.length < required && <p className="text-[11px] text-muted-foreground italic">Gather {required - quotations.length} more quotation{required - quotations.length > 1 ? 's' : ''} first.</p>}
                              <button onClick={submitForApproval} disabled={submitDisabled}
                                className="w-full h-9 text-xs font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50">
                                {submittingApproval ? 'Submitting...' : 'Submit for Approval'}
                              </button>
                            </div>
                          )
                        })()}
                        </div>
                      </div>
                    )
                  })()}
                </>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-muted/20 shrink-0">
              <button onClick={() => setEditItemModal(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">{detail?.status === 'ON_PROCESS' && !isWarehouse ? 'Cancel' : 'Close'}</button>
              {detail?.status === 'ON_PROCESS' && !isWarehouse && (
              <button
                onClick={saveEditItem}
                disabled={editItemSaving}
                className="px-4 py-2 text-sm bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 font-medium"
              >
                {editItemSaving ? 'Saving...' : 'Save'}
              </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Item modal — optional reason for excluding one item at verify triage ── */}
      {rejectItemModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b shrink-0">
              <div className="min-w-0">
                <h3 className="font-semibold text-base">Reject Item</h3>
                <p className="text-sm text-muted-foreground truncate">{rejectItemModal.itemName}</p>
              </div>
              <button onClick={() => setRejectItemModal(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Reason (optional)</label>
              <textarea
                value={rejectItemReason}
                onChange={e => setRejectItemReason(e.target.value)}
                rows={3}
                placeholder="e.g. Not needed this month"
                className="w-full text-sm border rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t shrink-0">
              <button onClick={() => setRejectItemModal(null)} disabled={rejectItemSaving} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">
                Cancel
              </button>
              <button
                onClick={confirmRejectItem}
                disabled={rejectItemSaving}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 font-medium disabled:opacity-50"
              >
                {rejectItemSaving ? 'Rejecting...' : 'Reject Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Supplier picker modal (for Edit Item modal) ── */}
      {(supplierModal === 'editItem' || supplierModal === 'quotation') && (() => {
        const allCities = ['All', ...Array.from(new Set(suppliers.flatMap(s => (s.locations ?? []).map(l => l.city).filter(Boolean)))).sort()]
        const filtered = suppliers.filter(s => {
          const q = supplierModalSearch.toLowerCase()
          if (q && !s.name.toLowerCase().includes(q)) return false
          if (supplierFilterCity !== 'All' && !(s.locations ?? []).some(l => l.city === supplierFilterCity)) return false
          return true
        })
        return (
          <>
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setSupplierModal(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[82vh]">
                <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
                  <h3 className="font-semibold text-base">Select Supplier</h3>
                  <button onClick={() => setSupplierModal(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
                </div>
                <div className="px-4 py-3 border-b shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <input autoFocus className="w-full h-10 border rounded-lg pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="Search or type a new supplier name..." value={supplierModalSearch} onChange={e => setSupplierModalSearch(e.target.value)} />
                  </div>
                </div>
                {allCities.length > 1 && (
                  <div className="px-4 py-2 border-b shrink-0 flex gap-1.5 flex-wrap">
                    {allCities.map(c => (
                      <button key={c} onClick={() => setSupplierFilterCity(c)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${supplierFilterCity === c ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
                        {c}
                      </button>
                    ))}
                  </div>
                )}
                <div className="overflow-y-auto flex-1">
                  {supplierModal === 'editItem' && (
                    <button onClick={() => { setEditItemSupplierId(''); setSupplierModal(null) }}
                      className="w-full text-left px-5 py-3 text-sm text-muted-foreground hover:bg-muted/40 border-b transition-colors">
                      — None —
                    </button>
                  )}
                  {filtered.map(s => (
                    <button key={s.id} onClick={() => { selectSupplierForTarget(s); setSupplierModal(null) }}
                      className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-amber-50 border-b last:border-0 transition-colors">
                      <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{s.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {(s.locations ?? []).map((l, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full">{l.city}</span>
                          ))}
                          {s.contact && <span className="text-xs text-muted-foreground">{s.contact}</span>}
                        </div>
                      </div>
                      {(supplierModal === 'editItem' ? editItemSupplierId === s.id : quoteForm.supplierId === s.id) && <Check className="h-4 w-4 text-amber-600 shrink-0" />}
                    </button>
                  ))}
                  {supplierModalSearch.trim() && !suppliers.some(s => s.name.toLowerCase() === supplierModalSearch.toLowerCase()) && (
                    <button onClick={() => quickAddSupplier(supplierModalSearch.trim()).then(() => setSupplierModal(null))}
                      className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-green-50 transition-colors border-t">
                      <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                        <Plus className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-green-700">Add &quot;{supplierModalSearch.trim()}&quot;</p>
                        <p className="text-xs text-green-600">Create as new supplier</p>
                      </div>
                    </button>
                  )}
                  {filtered.length === 0 && !supplierModalSearch.trim() && (
                    <p className="px-5 py-8 text-sm text-muted-foreground text-center">No suppliers match the filter.</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* ── Reference Photo Lightbox ── */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/80 hover:text-white">
            <X className="h-7 w-7" />
          </button>

          {lightbox.images.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); setLightbox(l => l && { ...l, index: (l.index - 1 + l.images.length) % l.images.length }) }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          <img
            src={lightbox.images[lightbox.index]}
            alt={`${lightbox.name} reference ${lightbox.index + 1}`}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />

          {lightbox.images.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); setLightbox(l => l && { ...l, index: (l.index + 1) % l.images.length }) }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3" onClick={e => e.stopPropagation()}>
            {lightbox.images.length > 1 && (
              <span className="text-white/70 text-sm">{lightbox.index + 1} / {lightbox.images.length}</span>
            )}
            <button
              onClick={downloadLightboxImage}
              className="flex items-center gap-1.5 bg-white text-foreground text-sm font-medium px-3 py-1.5 rounded-full hover:bg-white/90 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </button>
          </div>
        </div>
      )}

      {/* ── Quotation Document Viewer ── */}
      {quoteFileLightbox && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={() => setQuoteFileLightbox(null)}>
          <div className="relative inline-block" onClick={e => e.stopPropagation()}>
            {isPdfDataUrl(quoteFileLightbox) ? (
              <div className="bg-white rounded-xl shadow-2xl overflow-hidden w-[90vw] max-w-2xl">
                <embed src={quoteFileLightbox} type="application/pdf" className="w-full h-[75vh]" />
                <div className="p-3 flex justify-center">
                  <a href={quoteFileLightbox} target="_blank" rel="noopener noreferrer" className="text-sm text-amber-700 hover:text-amber-900 font-medium underline underline-offset-2">
                    Open PDF in new tab
                  </a>
                </div>
              </div>
            ) : (
              <img src={quoteFileLightbox} alt="Quotation document" className="block max-w-[90vw] max-h-[85vh] w-auto h-auto rounded-xl shadow-2xl object-contain" />
            )}
            <button onClick={() => setQuoteFileLightbox(null)} className="absolute top-3 right-3 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Create view (catalog browse + cart) ──

function CreateRequestView({
  items, locations, employees,
  deliveryLocationId, setDeliveryLocationId,
  requestedByEmployeeId, setRequestedByEmployeeId,
  notes, setNotes,
  neededByDate, setNeededByDate, isUrgent, setIsUrgent, urgentReason, setUrgentReason,
  purpose, setPurpose, tripBookingId, tripBookingLabel, setTripBooking, trips,
  cart, cartOpen, setCartOpen,
  addToCart, changeCartQty, removeCartLine,
  catalogSearch, setCatalogSearch,
  catalogType, setCatalogType,
  catalogCategory, setCatalogCategory,
  customModal, setCustomModal,
  customForm, setCustomForm,
  compressingCustomImage,
  isDraggingCustomImage, customImageDropProps,
  onCustomImageFiles, removeCustomImage, addCustomToCart,
  saveError, saving, submit,
  editingPrNumber,
  onBack,
}: {
  items: PurchaseItem[]; locations: StockLocation[]; employees: EmployeeOption[]
  deliveryLocationId: string; setDeliveryLocationId: (id: string) => void
  requestedByEmployeeId: string; setRequestedByEmployeeId: (id: string) => void
  notes: string; setNotes: (v: string) => void
  neededByDate: string; setNeededByDate: (v: string) => void
  isUrgent: boolean; setIsUrgent: (v: boolean) => void
  urgentReason: string; setUrgentReason: (v: string) => void
  purpose: 'STOCK_INVENTORY' | 'TRIP'; setPurpose: (v: 'STOCK_INVENTORY' | 'TRIP') => void
  tripBookingId: string; tripBookingLabel: string; setTripBooking: (id: string, label: string) => void
  trips: TripOption[]
  cart: RequestLine[]; cartOpen: boolean; setCartOpen: (v: boolean) => void
  addToCart: (item: PurchaseItem, unit: string) => void
  changeCartQty: (key: string, delta: number) => void
  removeCartLine: (key: string) => void
  catalogSearch: string; setCatalogSearch: (v: string) => void
  catalogType: 'All' | PurchaseItemType; setCatalogType: (v: 'All' | PurchaseItemType) => void
  catalogCategory: string; setCatalogCategory: (v: string) => void
  customModal: boolean; setCustomModal: (v: boolean) => void
  customForm: { itemName: string; quantity: number; unit: string; notes: string; images: string[] }
  setCustomForm: React.Dispatch<React.SetStateAction<{ itemName: string; quantity: number; unit: string; notes: string; images: string[] }>>
  compressingCustomImage: boolean
  isDraggingCustomImage: boolean
  customImageDropProps: FileDropProps
  onCustomImageFiles: (files: File[]) => void
  removeCustomImage: (index: number) => void
  addCustomToCart: () => void
  saveError: string; saving: boolean; submit: () => void
  editingPrNumber?: string
  onBack: () => void
}) {
  const categories = useMemo(() => {
    const inType = catalogType === 'All' ? items : items.filter(i => i.type === catalogType)
    return ['All', ...Array.from(new Set(inType.map(i => i.category)))]
  }, [items, catalogType])

  const filtered = useMemo(() => items.filter(i =>
    (catalogType === 'All' || i.type === catalogType) &&
    (catalogCategory === 'All' || i.category === catalogCategory) &&
    (!catalogSearch || i.name.toLowerCase().includes(catalogSearch.toLowerCase()) || i.sku.toLowerCase().includes(catalogSearch.toLowerCase()))
  ), [items, catalogType, catalogCategory, catalogSearch])

  const [customPhotoMenuOpen, setCustomPhotoMenuOpen] = useState(false)

  const PAGE_SIZE = 12
  const [page, setPage] = useState(1)
  // Jump back to page 1 whenever the filters change — adjusted during render (not
  // an effect) per https://react.dev/learn/you-might-not-need-an-effect
  const filterKey = `${catalogType}|${catalogCategory}|${catalogSearch}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const totalQty = cart.reduce((s, l) => s + l.quantity, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-1">
            ← {editingPrNumber ? `Back to ${editingPrNumber}` : 'Back to Purchase Requests'}
          </button>
          <h2 className="text-2xl font-bold tracking-tight">{editingPrNumber ? `Edit ${editingPrNumber}` : 'Create Purchase Request'}</h2>
        </div>
        <button
          onClick={() => setCartOpen(true)}
          className="lg:hidden relative flex items-center gap-2 border rounded-lg px-3 py-2 text-sm font-medium bg-white hover:bg-muted transition-colors shrink-0"
        >
          <ShoppingCart className="h-4 w-4" />
          {totalQty > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4.5 h-4.5 flex items-center justify-center">{totalQty}</span>}
        </button>
      </div>

      {saveError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{saveError}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* ── Catalog ── */}
        <div className="space-y-4 min-w-0">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                className="w-full h-10 pl-9 pr-3 text-sm border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder="Search item name or SKU..."
                value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)}
              />
            </div>
            <button
              onClick={() => setCustomModal(true)}
              className="flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm font-medium transition-colors hover:bg-amber-100 hover:border-amber-400 shrink-0"
            >
              <ImagePlus className="h-4 w-4" /> Custom Request
            </button>
          </div>

          <div className="bg-white border rounded-xl shadow-sm p-3.5 space-y-3">
            <div className="inline-flex gap-1 bg-muted rounded-lg p-1 flex-wrap">
              {ITEM_TYPES.map(t => (
                <button key={t} onClick={() => { setCatalogType(t); setCatalogCategory('All') }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${catalogType === t ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  {ITEM_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 flex-wrap pt-2.5 border-t">
              {categories.map(c => (
                <button key={c} onClick={() => setCatalogCategory(c)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    catalogCategory === c ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-muted-foreground border-border hover:border-amber-300 hover:text-foreground'
                  }`}>
                  {c === 'All' ? c : toTitleCase(c)}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No items found. Try a different search or use Custom Request.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
              {pageItems.map(item => {
                const hasPurchaseUnit = !!(item.purchaseUnit && item.purchaseUnit !== item.baseUnit && item.conversionFactor > 1)
                const requesterKey = requestedByEmployeeId || 'none'
                const baseLine = cart.find(l => l.key === `${item.id}-${item.baseUnit}-${requesterKey}`)
                const purchaseLine = hasPurchaseUnit ? cart.find(l => l.key === `${item.id}-${item.purchaseUnit}-${requesterKey}`) : undefined
                return (
                  <div key={item.id} className="bg-white rounded-xl border overflow-hidden flex flex-col shadow-sm hover:shadow-md hover:border-amber-300 transition-all">
                    <div className="aspect-square bg-muted/40 flex items-center justify-center overflow-hidden">
                      {item.imageKey ? <img src={item.imageKey} alt={item.name} className="w-full h-full object-cover" /> : <Package className="h-8 w-8 text-muted-foreground/30" />}
                    </div>
                    <div className="p-2.5 flex flex-col flex-1">
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-700">{item.category}</span>
                      <p className="text-xs font-medium leading-snug mt-0.5 line-clamp-2">{item.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {hasPurchaseUnit ? `${item.baseUnit} · ${item.purchaseUnit} (${item.conversionFactor}×)` : item.baseUnit}
                      </p>
                      <div className="mt-auto pt-2 space-y-1">
                        {baseLine ? (
                          <div className="flex items-center justify-between gap-1 bg-muted/50 rounded-lg p-1">
                            <button onClick={() => changeCartQty(baseLine.key!, -1)} className="w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center hover:bg-muted transition-colors">
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="text-[11px] font-semibold tabular-nums">{baseLine.quantity} {item.baseUnit}</span>
                            <button onClick={() => changeCartQty(baseLine.key!, 1)} className="w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center hover:bg-muted transition-colors">
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => addToCart(item, item.baseUnit)}
                            className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold transition-colors">
                            <Plus className="h-3 w-3" /> Add {item.baseUnit}
                          </button>
                        )}

                        {hasPurchaseUnit && (
                          purchaseLine ? (
                            <div className="flex items-center justify-between gap-1 bg-muted/50 rounded-lg p-1">
                              <button onClick={() => changeCartQty(purchaseLine.key!, -1)} className="w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center hover:bg-muted transition-colors">
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="text-[11px] font-semibold tabular-nums">{purchaseLine.quantity} {item.purchaseUnit}</span>
                              <button onClick={() => changeCartQty(purchaseLine.key!, 1)} className="w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center hover:bg-muted transition-colors">
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => addToCart(item, item.purchaseUnit)}
                              className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold border-2 border-amber-500 text-amber-700 transition-colors hover:bg-amber-50">
                              <Plus className="h-3 w-3" /> Add {item.purchaseUnit}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {pageCount > 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="h-8 w-8 flex items-center justify-center rounded-md border bg-white hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: pageCount }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === pageCount || Math.abs(n - currentPage) <= 1)
                  .reduce<(number | 'ellipsis')[]>((acc, n) => {
                    if (acc.length && n - (acc[acc.length - 1] as number) > 1) acc.push('ellipsis')
                    acc.push(n)
                    return acc
                  }, [])
                  .map((n, i) => n === 'ellipsis' ? (
                    <span key={`e${i}`} className="w-8 text-center text-xs text-muted-foreground">…</span>
                  ) : (
                    <button key={n} onClick={() => setPage(n)}
                      className={`h-8 w-8 rounded-md text-xs font-semibold transition-colors ${
                        n === currentPage ? 'bg-amber-600 text-white' : 'border bg-white hover:bg-muted text-muted-foreground'
                      }`}>
                      {n}
                    </button>
                  ))}
                <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={currentPage === pageCount}
                  className="h-8 w-8 flex items-center justify-center rounded-md border bg-white hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar (desktop) ── */}
        <div className="hidden lg:block">
          {/* top-16 clears the app's own sticky header (h-12 + a little breathing room),
              so the cart doesn't stick flush under it while scrolling. */}
          <div className="sticky top-16">
            <RequestCartPanel
              cart={cart} removeCartLine={removeCartLine} changeCartQty={changeCartQty}
              locations={locations} deliveryLocationId={deliveryLocationId} setDeliveryLocationId={setDeliveryLocationId}
              employees={employees} requestedByEmployeeId={requestedByEmployeeId} setRequestedByEmployeeId={setRequestedByEmployeeId}
              notes={notes} setNotes={setNotes}
              neededByDate={neededByDate} setNeededByDate={setNeededByDate}
              isUrgent={isUrgent} setIsUrgent={setIsUrgent} urgentReason={urgentReason} setUrgentReason={setUrgentReason}
              purpose={purpose} setPurpose={setPurpose} tripBookingId={tripBookingId} tripBookingLabel={tripBookingLabel} setTripBooking={setTripBooking} trips={trips}
              submit={submit} saving={saving} editingPrNumber={editingPrNumber}
            />
          </div>
        </div>
      </div>

      {/* ── Mobile cart drawer ── */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 top-16 bg-white rounded-t-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <h3 className="font-semibold">Your Request</h3>
              <button onClick={() => setCartOpen(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <RequestCartPanel
                cart={cart} removeCartLine={removeCartLine} changeCartQty={changeCartQty}
                locations={locations} deliveryLocationId={deliveryLocationId} setDeliveryLocationId={setDeliveryLocationId}
                employees={employees} requestedByEmployeeId={requestedByEmployeeId} setRequestedByEmployeeId={setRequestedByEmployeeId}
                notes={notes} setNotes={setNotes}
                neededByDate={neededByDate} setNeededByDate={setNeededByDate}
                isUrgent={isUrgent} setIsUrgent={setIsUrgent} urgentReason={urgentReason} setUrgentReason={setUrgentReason}
                purpose={purpose} setPurpose={setPurpose} tripBookingId={tripBookingId} tripBookingLabel={tripBookingLabel} setTripBooking={setTripBooking} trips={trips}
                submit={submit} saving={saving} editingPrNumber={editingPrNumber}
                embedded
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Custom Request Modal ── */}
      {customModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b shrink-0">
              <div>
                <h3 className="font-bold text-lg">Custom Request</h3>
                <p className="text-xs text-muted-foreground mt-0.5">For items not in the catalog — this won&apos;t create a new catalog item, it&apos;s just added to your request for purchasing to review</p>
              </div>
              <button onClick={() => setCustomModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="px-6 py-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description <span className="text-red-500">*</span></label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-500"
                  rows={3} placeholder="What do you need? Be as specific as possible..."
                  value={customForm.itemName} onChange={e => setCustomForm(f => ({ ...f, itemName: e.target.value }))} autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quantity</label>
                  <input type="number" min={1} className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={customForm.quantity} onChange={e => setCustomForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unit</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" placeholder="pcs"
                    value={customForm.unit} onChange={e => setCustomForm(f => ({ ...f, unit: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-500"
                  rows={2} placeholder="Optional additional detail..."
                  value={customForm.notes} onChange={e => setCustomForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reference Photos</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  {customForm.images.map((src, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border">
                      <img src={src} alt={`Reference ${i + 1}`} className="w-full h-full object-cover" />
                      <button onClick={() => removeCustomImage(i)} className="absolute top-1.5 right-1.5 bg-black/50 text-white rounded-full p-1">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <div className="relative aspect-square">
                    <button onClick={() => setCustomPhotoMenuOpen(o => !o)} disabled={compressingCustomImage} {...customImageDropProps}
                      className={`w-full h-full flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-lg transition-colors disabled:opacity-50 ${
                        isDraggingCustomImage ? 'border-amber-500 bg-amber-50 text-amber-700' : 'text-muted-foreground hover:bg-muted/30'
                      }`}>
                      <Camera className="h-5 w-5" />
                      <span className="text-[11px] text-center px-1">{compressingCustomImage ? 'Processing…' : isDraggingCustomImage ? 'Drop' : 'Add photo'}</span>
                    </button>
                    <PhotoSourceMenu open={customPhotoMenuOpen} onClose={() => setCustomPhotoMenuOpen(false)} onFiles={onCustomImageFiles} multiple />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end px-6 py-4 border-t bg-muted/20 shrink-0">
              <button onClick={() => setCustomModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted">Cancel</button>
              <button onClick={addCustomToCart} disabled={!customForm.itemName.trim()}
                className="px-5 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-40 transition-colors bg-amber-600 hover:bg-amber-700">
                Add to Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RequestCartPanel({
  cart, removeCartLine, changeCartQty,
  locations, deliveryLocationId, setDeliveryLocationId,
  employees, requestedByEmployeeId, setRequestedByEmployeeId,
  notes, setNotes,
  neededByDate, setNeededByDate, isUrgent, setIsUrgent, urgentReason, setUrgentReason,
  purpose, setPurpose, tripBookingId, tripBookingLabel, setTripBooking, trips,
  submit, saving,
  editingPrNumber,
  embedded = false,
}: {
  cart: RequestLine[]; removeCartLine: (key: string) => void; changeCartQty: (key: string, delta: number) => void
  locations: StockLocation[]; deliveryLocationId: string; setDeliveryLocationId: (id: string) => void
  employees: EmployeeOption[]; requestedByEmployeeId: string; setRequestedByEmployeeId: (id: string) => void
  notes: string; setNotes: (v: string) => void
  neededByDate: string; setNeededByDate: (v: string) => void
  isUrgent: boolean; setIsUrgent: (v: boolean) => void
  urgentReason: string; setUrgentReason: (v: string) => void
  purpose: 'STOCK_INVENTORY' | 'TRIP'; setPurpose: (v: 'STOCK_INVENTORY' | 'TRIP') => void
  tripBookingId: string; tripBookingLabel: string; setTripBooking: (id: string, label: string) => void
  trips: TripOption[]
  submit: () => void; saving: boolean
  editingPrNumber?: string
  embedded?: boolean
}) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm flex flex-col ${!embedded ? 'max-h-[calc(100vh-200px)]' : ''}`}>
      {!embedded && (
        <div className="flex items-center gap-2 px-5 py-4 border-b shrink-0 bg-amber-50/60 rounded-t-xl">
          <ShoppingCart className="h-4 w-4 text-amber-700" />
          <h3 className="font-semibold text-sm">Your Request {cart.length > 0 && `(${cart.length})`}</h3>
        </div>
      )}

      <div className="p-5 space-y-4 overflow-y-auto flex-1">
        {/* Delivery Location */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Delivery Location <span className="text-red-500">*</span></label>
          <select
            className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
            value={deliveryLocationId} onChange={e => setDeliveryLocationId(e.target.value)}
          >
            <option value="">— Select location —</option>
            {renderLocationOptions(locations, { topLevelOnly: true })}
          </select>
        </div>

        {/* Purpose — general restocking vs a specific upcoming trip. Trip requests link
            to the actual Booking so Purchasing knows which departure to have ready for. */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Purpose <span className="text-red-500">*</span></label>
          <div className="inline-flex gap-1 bg-muted rounded-lg p-1 w-full">
            <button type="button" onClick={() => setPurpose('STOCK_INVENTORY')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${purpose === 'STOCK_INVENTORY' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              Stock & Inventory
            </button>
            <button type="button" onClick={() => setPurpose('TRIP')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${purpose === 'TRIP' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              Trip
            </button>
          </div>
          {purpose === 'TRIP' && (
            <TripCombobox value={tripBookingId} valueLabel={tripBookingLabel} trips={trips} onChange={setTripBooking} />
          )}
        </div>

        {/* Requested By — who this is actually for (e.g. a ship crew member), separate
            from who's submitting it (always the logged-in account). Optional: leave
            blank if you're requesting for yourself / general stock. */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Requested By </label>
          <select
            className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
            value={requestedByEmployeeId} onChange={e => setRequestedByEmployeeId(e.target.value)}
          >
            <option value="">— Myself / general stock —</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeNumber})</option>)}
          </select>
          <p className="text-[11px] text-muted-foreground">Applies to items you add next. Switch this to add items for someone else — each person becomes their own PR automatically.</p>
        </div>

        {/* Items */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Items</label>
          {cart.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
              <ShoppingCart className="h-6 w-6 mx-auto mb-2 opacity-30" />
              <p className="text-xs">No items yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(() => {
                // Grouped into sections by requester — matches how submit() splits the
                // cart into one PR per requester. Section order follows first-added.
                const order: string[] = []
                const groups = new Map<string, RequestLine[]>()
                for (const line of cart) {
                  const key = line.requestedByEmployeeId || ''
                  if (!groups.has(key)) { groups.set(key, []); order.push(key) }
                  groups.get(key)!.push(line)
                }
                return order.map(empId => {
                  const lines = groups.get(empId)!
                  const label = empId ? (employees.find(e => e.id === empId)?.fullName ?? 'Unknown') : 'Myself / general stock'
                  return (
                    <div key={empId || '__none__'} className="space-y-2">
                      {order.length > 1 && (
                        <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1">
                          <Users className="h-3 w-3" /> {label} <span className="font-normal text-muted-foreground normal-case">— will be its own PR</span>
                        </p>
                      )}
                      {lines.map(line => (
                        <div key={line.key} className="flex items-center gap-2.5 border rounded-lg p-2">
                          <div className="relative w-10 h-10 rounded-md bg-muted/50 shrink-0 overflow-hidden flex items-center justify-center">
                            {line.imageKeys?.[0] ? <img src={line.imageKeys[0]} alt={line.itemName} className="w-full h-full object-cover" /> : <Package className="h-4 w-4 text-muted-foreground/40" />}
                            {!!line.imageKeys && line.imageKeys.length > 1 && (
                              <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] font-semibold px-1 rounded-tl">+{line.imageKeys.length - 1}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{line.itemName}</p>
                            <p className="text-[10px] text-muted-foreground">{line.isCustom ? 'Custom request' : line.itemUnit}</p>
                          </div>
                          {line.isCustom ? (
                            <span className="text-xs font-semibold tabular-nums shrink-0">{line.quantity} {line.itemUnit}</span>
                          ) : (
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => changeCartQty(line.key!, -1)} className="w-5 h-5 rounded border flex items-center justify-center hover:bg-muted"><Minus className="h-3 w-3" /></button>
                              <span className="text-xs font-semibold tabular-nums w-4 text-center">{line.quantity}</span>
                              <button onClick={() => changeCartQty(line.key!, 1)} className="w-5 h-5 rounded border flex items-center justify-center hover:bg-muted"><Plus className="h-3 w-3" /></button>
                            </div>
                          )}
                          <button onClick={() => removeCartLine(line.key!)} className="text-muted-foreground hover:text-destructive shrink-0">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>

        {/* Needed by */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Needed By</label>
          <input
            type="date"
            className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
            value={neededByDate} onChange={e => setNeededByDate(e.target.value)}
          />
        </div>

        {/* Urgent */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" checked={isUrgent} onChange={e => setIsUrgent(e.target.checked)} className="h-4 w-4" />
            <span className="text-red-600">This request is urgent</span>
          </label>
          {isUrgent && (
            <textarea
              className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
              rows={2} placeholder="Why is this urgent? (required)"
              value={urgentReason} onChange={e => setUrgentReason(e.target.value)}
            />
          )}
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</label>
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-500"
            rows={2} placeholder="Additional notes for the purchasing team..."
            value={notes} onChange={e => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="p-5 border-t shrink-0">
        {(() => {
          const groupCount = new Set(cart.map(l => l.requestedByEmployeeId || '')).size
          return (
            <button
              onClick={submit} disabled={saving || cart.length === 0}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
            >
              {saving ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="h-4 w-4" />}
              {saving ? 'Saving…' : editingPrNumber ? 'Save Changes' : groupCount > 1 ? `Submit ${groupCount} Requests` : 'Submit Request'}
            </button>
          )
        })()}
      </div>
    </div>
  )
}
