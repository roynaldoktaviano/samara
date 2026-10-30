'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Plus, Minus, ChevronRight, ChevronLeft, Trash2, Package, Search, FileText, ChevronDown, Check, Building2, CheckCircle2, Pencil, X, AlertTriangle, Download, ImagePlus, Camera, ShoppingCart, Send, Users, Paperclip, Clock, ArrowRightLeft } from 'lucide-react'
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
import { TripPicker, tripDates, tripShortLabel, tripLinkBody, type TripOption } from '@/components/purchasing/TripPicker'
import { RupiahInput } from '@/components/ui/rupiah-input'
import { TREATMENTS, TREATMENT_LABEL, type Treatment } from '@/lib/purchasing/treatment'
import { formatDate, formatMoney } from '@/lib/format'
import { isMeasureUnit } from '@/lib/purchasing/units'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'

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
interface StockLocation { id: string; name: string; type: string; managedBy: string; isActive: boolean; parentId: string | null; yachtId?: string | null }
interface EmployeeOption { id: string; fullName: string; employeeNumber: string; department: string | null; office: string | null; role: string | null }
interface Quotation { id: string; supplierId: string | null; supplierName: string; price: number; fileKey: string | null; submittedAt: string }
interface InventoryItemOption {
  id: string; itemNumber: string; name: string; quantity: number; unitPrice: number; photoKeys?: string[]
  category: { id: string; name: string }; room: { id: string; name: string }
}
interface RequestLine { id?: string; key?: string; itemId: string; itemName: string; baseUnit: string; purchaseUnit: string; itemUnit: string; unit?: string; quantity: number; estimatedCost: number; supplierId: string; supplierName: string; supplierSearch: string; supplierOpen: boolean; notes: string; search: string; open: boolean; currentStock?: number | null; onHandStock?: number | null; itemTreatment?: Treatment | null; reservedStock?: number; minStock?: number | null; stockCheck?: { locationId: string; locationName: string; requested: number; availability: number; reserve: number; onOrder: number; ending: number; shortage: number; minStock: number; toBeOrder: number; restockQty: number } | null; conversionFactor?: number | null; imageKeys?: string[]; isCustom?: boolean; isStockItem?: boolean; sourceInventoryItemId?: string | null; sourceInventoryItem?: { id: string; itemNumber: string; name: string; room: { name: string } | null; category: { name: string } | null } | null; warehouseStock?: { locationId: string; locationName: string; qty: number }[]; transferEligible?: boolean; quotations?: Quotation[]; exemptionReason?: string | null; selectionJustification?: string | null; requestedByEmployeeId?: string; quotationApproverId?: string | null; quotationApprover?: { id: string; name: string | null } | null; quotationSubmittedAt?: string | null; quotationApprovedById?: string | null; quotationApprovedBy?: { id: string; name: string | null } | null; quotationApprovedAt?: string | null; quotationRejectedBy?: { id: string; name: string | null } | null; quotationRejectedAt?: string | null; quotationRejectionReason?: string | null; convertedAt?: string | null; convertedPoId?: string | null; verifyRejectedById?: string | null; verifyRejectedBy?: { id: string; name: string | null } | null; verifyRejectedAt?: string | null; verifyRejectionReason?: string | null; warehouseDecision?: 'TRANSFER' | 'PURCHASE' | null; backorderQty?: number; backorderLocationId?: string | null; viaWarehouse?: boolean; warehouseCheckedAt?: string | null; warehouseCheckNote?: string | null; requestType?: 'NEW' | 'REPLACEMENT'; damageDetail?: string | null; transfer?: { id: string; transferNumber: string; status: string; fromLocationName: string } | null; sentFromStock?: number | null; toBeOrderSplit?: { po: number; pending: number; received?: number } | null; reservations?: { id: string; stockQty: number; reservedQty: number; source: string; transferId: string | null; transferNumber: string | null; purchaseOrderId: string | null; poNumber: string | null; createdAt: string }[]; requestedBase?: number; backorderFree?: number; backorderIncoming?: { kind: 'PR' | 'PO'; id: string; number: string; status: string; qty: number; expectedAt: string | null }[]; restockLocationId?: string | null; restockLocation?: { id: string; name: string } | null; restockOrders?: { prId: string; prNumber: string; poId: string | null; poNumber: string | null; poStatus: string | null; poExpectedAt?: string | null; qty: number }[]; warehouseApprovedAt?: string | null; warehouseReserveQty?: number | null; warehouseFromLocationId?: string | null }
interface PurchaseRequest {
  id: string
  prNumber: string
  status: string
  deliveryLocationId: string | null
  // Auto "Restock" PRs this PR triggered on Warehouse forward / the vessel PR a Restock PR is for.
  restockRequests?: { id: string; prNumber: string; status: string }[]
  restockFor?: { id: string; prNumber: string } | null
  deliveryLocation: { id: string; name: string; type: string; managedBy: string } | null
  itemCount: number
  itemNames: string[]
  warehouseStarted?: boolean
  // Warehouse still has lines to stock-check (DRAFT, or a parallel ON_PROCESS PR).
  warehousePending?: boolean
  // Some line is still backordered (waiting for restock at the warehouse) — see GET ../route.ts.
  outstanding?: boolean
  warehouseDoneAt?: string | null
  totalBudget: number
  notes: string | null
  createdAt: string
  createdBy: { id: string; name: string } | null
  requestedBy: { name: string } | null
  requestedByEmployee: { id: string; fullName: string; employeeNumber: string } | null
  approverEmployeeId?: string | null
  approvedBy?: { name: string | null } | null
  approvedAt?: string | null
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
  trip: TripOption | null
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
interface FollowUp {
  id: string; note: string; isEscalation: boolean; escalatedToId: string | null
  escalatedTo: { name: string | null } | null; createdBy: { name: string | null }; createdAt: string
}
interface EscalationTarget { id: string; name: string | null }

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: 'Pending Manager Approval', DRAFT: 'Draft', WAREHOUSE: 'Warehouse Check', ON_PROCESS: 'On Process', CONVERTED: 'Converted', REJECTED: 'Rejected', CANCELLED: 'Cancelled',
}
const STATUS_TONE: Record<string, StatusTone> = {
  PENDING_APPROVAL: 'warning', DRAFT: 'info', ON_PROCESS: 'warning', CONVERTED: 'success',
  REJECTED: 'destructive', CANCELLED: 'neutral',
}
// Mirrors OrdersPage's own STATUS_LABEL/STATUS_TONE so a PO's status reads the same
// wherever it shows up.
const PO_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', ORDERED: 'Ordered', IN_TRANSIT: 'On Delivery', PARTIALLY_RECEIVED: 'Partially Received', RECEIVED: 'Received', CANCELLED: 'Cancelled',
}
const PO_STATUS_TONE: Record<string, StatusTone> = {
  DRAFT: 'neutral', ORDERED: 'info', IN_TRANSIT: 'warning',
  PARTIALLY_RECEIVED: 'warning', RECEIVED: 'success', CANCELLED: 'neutral',
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
  // Not a status: every PR Warehouse still has lines to check — DRAFT plus parallel ON_PROCESS ones.
  { key: 'WAREHOUSE', label: 'Warehouse Check' },
  { key: 'ON_PROCESS', label: 'On Process' },
  // Not a status either: part of an item still waits for restock before it can be sent.
  { key: 'OUTSTANDING', label: 'Outstanding' },
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

function UrgentBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-sans text-[10px] font-bold whitespace-nowrap bg-destructive text-destructive-foreground animate-pulse">
      <AlertTriangle className="h-3 w-3" /> URGENT
    </span>
  )
}

const DIVISION_LABEL: Record<string, string> = { BOAT_OPERATION: 'Boat Operation', BUILDING_MATERIAL: 'Building Material' }

// Status dot colour in the list — same meaning as the StatusBadge tones.
const TONE_DOT: Partial<Record<StatusTone, string>> = {
  success: 'bg-success', warning: 'bg-warning', info: 'bg-info', destructive: 'bg-destructive',
  neutral: 'bg-muted-foreground/50', primary: 'bg-primary', brand: 'bg-brand', purple: 'bg-purple-500',
}

// Still needs someone to act on it — a closed PR no longer shows its Urgent flag in the list.
const isOpenRequest = (r: { status: string; outstanding?: boolean }) =>
  !['CONVERTED', 'REJECTED', 'CANCELLED'].includes(r.status) || !!r.outstanding

function DivisionBadge({ division }: { division: 'BOAT_OPERATION' | 'BUILDING_MATERIAL' | null }) {
  if (!division) return null
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full font-sans text-[10px] font-semibold whitespace-nowrap bg-muted text-muted-foreground">
      {DIVISION_LABEL[division]}
    </span>
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

const TRANSFER_STATUS_LABEL: Record<string, string> = { PENDING: 'Pending dispatch', DISPATCHED: 'Dispatched', RECEIVED: 'Received', CANCELLED: 'Cancelled' }

// Clickable when onOpen is given — jumps to the transfer's detail in Transfers, where
// Warehouse dispatches it.
function TransferBadge({ transfer, onOpen }: { transfer?: RequestLine['transfer']; onOpen?: (transferId: string) => void }) {
  const clickable = !!(transfer && onOpen)
  return (
    <div className="space-y-0.5">
      <button
        type="button" disabled={!clickable}
        onClick={e => { e.stopPropagation(); if (transfer && onOpen) onOpen(transfer.id) }}
        title={clickable ? 'Open transfer' : undefined}
        className={`inline-flex items-center gap-1 text-xs font-medium text-info bg-info/10 border border-info/30 rounded-md px-2 py-1 whitespace-nowrap ${clickable ? 'hover:bg-info/20 cursor-pointer' : 'cursor-default'}`}
      >
        <ArrowRightLeft className="h-3 w-3" />
        {transfer?.transferNumber ?? 'Transfer from stock'}
        {clickable && <ChevronRight className="h-3 w-3" />}
      </button>
      <p className="text-[10px] text-muted-foreground whitespace-nowrap">
        From warehouse stock{transfer ? ` · ${TRANSFER_STATUS_LABEL[transfer.status] ?? transfer.status}` : ''}
      </p>
    </div>
  )
}

// A Converted PR with part of an item still backordered reads "Outstanding" until the rest is sent.
const prStatusLabel = (r: { status: string; outstanding?: boolean }) =>
  r.outstanding && r.status === 'CONVERTED' ? 'Outstanding' : STATUS_LABEL[r.status] ?? r.status
const prStatusTone = (r: { status: string; outstanding?: boolean }): StatusTone =>
  r.outstanding && r.status === 'CONVERTED' ? 'warning' : STATUS_TONE[r.status]

// Warehouse still owns part of this PR: DRAFT, or ON_PROCESS while Purchasing works the direct
// lines in parallel and Warehouse hasn't finished checking its own (warehouseDoneAt unset).
function isWarehousePending(d: { status: string; warehouseDoneAt?: string | null; items: { viaWarehouse?: boolean }[] }) {
  return d.status === 'DRAFT' || (d.status === 'ON_PROCESS' && !d.warehouseDoneAt && d.items.some(it => it.viaWarehouse))
}
// A Warehouse-routed line Purchasing can't act on yet — Warehouse hasn't processed it (out of stock → PURCHASE)
// nor finished its check.
function isAwaitingWarehouse(item: { viaWarehouse?: boolean; warehouseDecision?: string | null; convertedAt?: string | null; verifyRejectedAt?: string | null }, d: { warehouseDoneAt?: string | null }) {
  return !!item.viaWarehouse && !d.warehouseDoneAt && item.warehouseDecision !== 'PURCHASE' && !item.convertedAt && !item.verifyRejectedAt
}

type LineUnits = { unit?: string; itemUnit?: string; baseUnit?: string | null; purchaseUnit?: string | null; conversionFactor?: number | null }

// Stock figures of a PR line go in the purchase unit only when the base unit is a measure (ml, g)
// and the line was requested in that purchase unit — "2 bottle (1500 ml)". A countable base unit
// (pcs, can) always stays as is: "16 pcs", never "2.67 box".
function showsInPurchaseUnit(item: LineUnits) {
  const conv = item.conversionFactor || 1
  return !!item.purchaseUnit && !!item.baseUnit && item.purchaseUnit !== item.baseUnit && conv !== 1
    && isMeasureUnit(item.baseUnit) && (item.unit ?? item.itemUnit) === item.purchaseUnit
}

// A base-unit stock qty as text — see showsInPurchaseUnit. Same rule as the stock-check cells.
function lineQtyLabel(item: LineUnits, n: number) {
  const r = (x: number) => Math.round(x * 100) / 100
  const conv = item.conversionFactor || 1
  const inPurchase = showsInPurchaseUnit(item)
  return inPurchase ? `${r(n / conv)} ${item.purchaseUnit} (${r(n)} ${item.baseUnit})` : `${r(n)} ${item.baseUnit ?? ''}`.trim()
}

// Part of an accepted line the warehouse couldn't ship yet — shipped on a follow-up TR once
// restock lands (see src/lib/purchasing/backorders.ts): how much went out so far, what's left,
// and where that rest stands (Restock PR not ordered yet → on a PO → arriving at the warehouse).
function BackorderBadge({ item }: { item: Parameters<typeof lineQtyLabel>[0] & { quantity?: number; backorderQty?: number; sentFromStock?: number | null; toBeOrderSplit?: { po: number; pending: number; received?: number } | null } }) {
  if (!item.backorderQty || item.backorderQty <= 0) return null
  const split = item.toBeOrderSplit
  const stage = split && split.pending > 0 ? 'waiting for Purchasing to order'
    : split && split.po > 0 ? 'ordered, waiting to arrive at the warehouse'
    : 'waiting for restock at the warehouse'
  return (
    <div className="text-[11px] leading-snug" title="Sent automatically on a new transfer once the restock arrives at the warehouse — Warehouse only has to dispatch it">
      {item.sentFromStock != null && (
        <p className="text-muted-foreground">
          Sent <span className="font-semibold text-foreground">{lineQtyLabel(item, item.sentFromStock)}</span>
          {item.quantity != null && <> of {item.quantity} {item.unit ?? item.purchaseUnit ?? item.itemUnit}</>}
        </p>
      )}
      <p className="font-medium text-destructive">{lineQtyLabel(item, item.backorderQty)} remaining — {stage}</p>
    </div>
  )
}

export default function RequestsPage({ onOpenPo, onOpenTransfer, deepLinkId, onDeepLinkHandled }: {
  onOpenPo?: (poId: string) => void
  onOpenTransfer?: (transferId: string) => void
  deepLinkId?: string | null
  onDeepLinkHandled?: () => void
} = {}) {
  const { data: session } = useSession()
  // Restricted, own-requests-only roles — none of them do Purchasing's verify/convert work,
  // so every Purchasing-only action in this page stays hidden for all of them (mirrors the
  // server-side OWN_ONLY_ROLES check in the requests API routes).
  const isWarehouse = ['WAREHOUSE', 'CREW', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR'].includes((session?.user as { role?: string })?.role ?? '')
  // "Requested by Me" only makes sense for Admin — Purchasing/Warehouse's whole job here
  // is processing everyone else's requests, not filtering down to their own.
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes((session?.user as { role?: string })?.role ?? '')
  // The actual Warehouse role specifically (not Crew/Boat Captain/Cruise Director, who
  // only share the isWarehouse read-only bucket above because they're requesters too),
  // plus Admin/Super Admin as a manual override — gates the physical stock-check step at
  // DRAFT (see PATCH .../items/[itemId]/warehouse-check and .../warehouse-forward).
  const canWarehouseCheck = ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN'].includes((session?.user as { role?: string })?.role ?? '')
  // Who can release free warehouse stock to a backordered line ("Ship from stock now").
  const canShipBackorder = ['WAREHOUSE', 'PURCHASING', 'ADMIN', 'SUPER_ADMIN'].includes((session?.user as { role?: string })?.role ?? '')
  // Warehouse works the item list only — the PR Timeline is hidden for that role.
  const hideTimeline = (session?.user as { role?: string })?.role === 'WAREHOUSE'
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
  // List page (same inbox list on every screen size).
  const [cardPage, setCardPage] = useState(1)
  const LIST_PAGE_SIZE = 20
  // List search (PR no., items, requester, destination).
  const [search, setSearch] = useState('')
  // PR line id whose backorder is being shipped from stock right now.
  const [shippingBackorder, setShippingBackorder] = useState<string | null>(null)
  // List filter chips: only open Urgent PRs / only auto Restock PRs.
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [restockOnly, setRestockOnly] = useState(false)
  const [selected, setSelected] = useState<PurchaseRequest | null>(null)
  const [detail, setDetail] = useState<(PurchaseRequest & {
    items: RequestLine[]
    canTransfer?: boolean
    // WAREHOUSE role only: the warehouse it always takes from (Gudang Labuan Bajo) — no source picker.
    warehouseHomeLocationId?: string | null
    // Gudang-stock transfers created for this PR — see stockTransfers in GET .../requests/[id].
    stockTransfers?: { id: string; transferNumber: string; status: string; createdAt: string; dispatchedAt: string | null; receivedAt: string | null; receivedByName: string | null; fromLocationName: string; toLocationName: string }[]
  }) | null>(null)
  // Set while the "create" view is reused to edit an already-submitted DRAFT PR (see
  // openEditRequest) — routes submit() to PATCH .../[id] instead of creating new PRs, and
  // routes onBack to the detail view instead of the list.
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null)
  const [fulfillment, setFulfillment] = useState<Record<string, string | null>>({})
  // Warehouse's own physical stock-check inputs, per item — the source location they
  // pick for a Transfer decision, an optional discrepancy note, and which item's request
  // is currently in flight (disables its buttons while saving).
  const [warehouseFrom, setWarehouseFrom] = useState<Record<string, string>>({})
  const [warehouseNote, setWarehouseNote] = useState<Record<string, string>>({})
  const [warehouseBusyItemId, setWarehouseBusyItemId] = useState<string | null>(null)
  const [warehouseForwarding, setWarehouseForwarding] = useState(false)
  const [converting, setConverting] = useState(false)
  // Per-item Inventory Room/Category, required before converting an item into a PO when
  // the PR's delivery location is a ship (not needed for items fulfilled via transfer
  // instead — see convertToPO). Mirrors OrdersPage.tsx's own Room/Category pickers.
  // Per PO-bound line on a ship PR: treatment (custom lines pick it; catalog lines follow the
  // item master) and, for ASSET lines only, the Inventory Room/Category it lands in.
  const [roomAssignment, setRoomAssignment] = useState<Record<string, { roomId: string; categoryId: string; treatment?: Treatment }>>({})
  const [invRooms, setInvRooms] = useState<{ id: string; name: string }[]>([])
  const [invCategoriesByRoom, setInvCategoriesByRoom] = useState<Record<string, { id: string; name: string }[]>>({})
  // Full PO detail (payments, transit legs, receipts) per linked PO id, fetched lazily so
  // the PR Timeline can render each PO's journey exactly like the PO's own Order Timeline.
  const [poFullDetails, setPoFullDetails] = useState<Record<string, PoTimelineDetail>>({})
  // POs whose full detail couldn't be loaded (e.g. the viewer's role can't open that PO) —
  // the Timeline falls back to the PO's summary status instead of "Loading…" forever.
  const [poDetailUnavailable, setPoDetailUnavailable] = useState<Set<string>>(new Set())
  const [timelinePhoto, setTimelinePhoto] = useState<string | null>(null)
  // Warehouse stock check: the item line whose stock / decision / check modal is open.
  const [stockItemId, setStockItemId] = useState<string | null>(null)
  // Reserve typed by Warehouse per line, in the line's unit (blank → the suggested reserve).
  const [warehouseReserve, setWarehouseReserve] = useState<Record<string, string>>({})
  const [approveSummary, setApproveSummary] = useState<{ poNumbers: string[]; poIds: string[]; transferNumbers: string[]; remainingItems: string[] } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Follow-up / escalation log (mirrors OrdersPage.tsx's own PO follow-up log)
  const [prFollowUps, setPrFollowUps] = useState<FollowUp[]>([])
  const [escalationTargets, setEscalationTargets] = useState<EscalationTarget[]>([])
  const [followUpModal, setFollowUpModal] = useState(false)
  const [followUpNote, setFollowUpNote] = useState('')
  const [followUpIsEscalation, setFollowUpIsEscalation] = useState(false)
  const [followUpEscalatedToId, setFollowUpEscalatedToId] = useState('')
  const [followUpSaving, setFollowUpSaving] = useState(false)
  const [followUpError, setFollowUpError] = useState('')

  // Form state (create view — catalog + cart, mirrors the /request-order page)
  const [deliveryLocationId, setDeliveryLocationId] = useState('')
  const [requestedByEmployeeId, setRequestedByEmployeeId] = useState('')
  const [notes, setNotes] = useState('')
  const [neededByDate, setNeededByDate] = useState('')
  const [isUrgent, setIsUrgent] = useState(false)
  const [urgentReason, setUrgentReason] = useState('')
  const [purpose, setPurpose] = useState<'STOCK_INVENTORY' | 'TRIP'>('STOCK_INVENTORY')
  const [trip, setTrip] = useState<TripOption | null>(null)
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
  const [cartOpen, setCartOpen] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogType, setCatalogType] = useState<'All' | PurchaseItemType>('BEVERAGE')
  const [catalogCategory, setCatalogCategory] = useState('All')

  // Stock vs Inventory sub-choice, only meaningful while purpose === STOCK_INVENTORY —
  // "Stock" is the ordinary PurchaseItem catalog above, "Inventory" browses a vessel's own room/category-based InventoryItems instead (see
  // InventoryPickerPanel below), for requesting more of something already tracked there.
  const [catalogSource, setCatalogSource] = useState<'stock' | 'inventory'>('stock')
  const [invRoomId, setInvRoomId] = useState('')
  const [invCategoryId, setInvCategoryId] = useState('')
  const [invSearch, setInvSearch] = useState('')
  const [invPickerRooms, setInvPickerRooms] = useState<{ id: string; name: string }[]>([])
  const [invCategories, setInvCategories] = useState<{ id: string; name: string }[]>([])
  const [invItems, setInvItems] = useState<InventoryItemOption[]>([])
  const [invLoading, setInvLoading] = useState(false)

  // Which vessel's InventoryItems the Inventory picker browses — its own filter, not
  // tied to the delivery location (Goods Receipt tops up the InventoryItem itself via
  // sourceInventoryItemId, wherever the PR is delivered). Follows the delivery location
  // whenever that's a vessel, as the sensible default.
  const [invLocationId, setInvLocationId] = useState('')
  const deliveryIsVessel = locations.find(l => l.id === deliveryLocationId)?.type === 'VESSEL'
  useEffect(() => {
    if (deliveryIsVessel) setInvLocationId(deliveryLocationId)
  }, [deliveryIsVessel, deliveryLocationId])
  // Fall back to Stock when purpose isn't Stock & Inventory, so a stale "Inventory"
  // pick never gets left selected somewhere it no longer makes sense.
  useEffect(() => {
    if (catalogSource === 'inventory' && purpose !== 'STOCK_INVENTORY') setCatalogSource('stock')
  }, [purpose, catalogSource])

  useEffect(() => {
    setInvRoomId(''); setInvCategories([])
    if (!invLocationId) { setInvPickerRooms([]); return }
    fetch(`/api/inventory/rooms?locationId=${invLocationId}`).then(r => r.ok ? r.json() : []).then(setInvPickerRooms)
  }, [invLocationId])

  useEffect(() => {
    setInvCategoryId('')
    if (!invRoomId) { setInvCategories([]); return }
    fetch(`/api/inventory/categories?roomId=${invRoomId}`).then(r => r.ok ? r.json() : []).then(setInvCategories)
  }, [invRoomId])

  useEffect(() => {
    if (catalogSource !== 'inventory' || !invLocationId) { setInvItems([]); return }
    setInvLoading(true)
    const qs = new URLSearchParams({ locationId: invLocationId })
    if (invRoomId) qs.set('roomId', invRoomId)
    if (invCategoryId) qs.set('categoryId', invCategoryId)
    if (invSearch) qs.set('search', invSearch)
    fetch(`/api/inventory/items?${qs}`).then(r => r.ok ? r.json() : []).then(setInvItems).finally(() => setInvLoading(false))
  }, [catalogSource, invLocationId, invRoomId, invCategoryId, invSearch])
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

  // Delivery Location -> Inventory Rooms (+ every room's Categories, batch-loaded) — only
  // meaningful when the PR's destination is a ship. Mirrors OrdersPage.tsx's same fetch.
  useEffect(() => {
    const locationId = detail?.deliveryLocation?.type === 'VESSEL' ? detail.deliveryLocation.id : null
    if (!locationId) { setInvRooms([]); setInvCategoriesByRoom({}); return }
    let cancelled = false
    fetch(`/api/inventory/rooms?locationId=${locationId}`).then(r => r.json()).then(async (rooms: { id: string; name: string }[]) => {
      if (cancelled) return
      setInvRooms(rooms)
      const entries = await Promise.all(rooms.map(async r =>
        [r.id, await fetch(`/api/inventory/categories?roomId=${r.id}`).then(rr => rr.json())] as const
      ))
      if (!cancelled) setInvCategoriesByRoom(Object.fromEntries(entries))
    })
    return () => { cancelled = true }
  }, [detail?.deliveryLocation])

  async function fetchDetail(id: string): Promise<(PurchaseRequest & { items: RequestLine[]; canTransfer?: boolean }) | null> {
    setDetailLoading(true)
    const res = await fetch(`/api/purchasing/requests/${id}`)
    let data: (PurchaseRequest & { items: RequestLine[]; canTransfer?: boolean }) | null = null
    if (res.ok) {
      data = await res.json()
      setDetail(data)
      fetch(`/api/purchasing/requests/${id}/follow-ups`).then(r => r.ok ? r.json() : null).then(d => { if (d) setPrFollowUps(d.followUps ?? []) })
      // Full PO detail (payments, transit legs, receipts) isn't in the PR response —
      // fetched separately per linked PO, same endpoint OrdersPage.tsx itself uses, so
      // the PR Timeline can show each PO's journey exactly like the PO's own Timeline.
      const orders = data!.orders ?? []
      if (orders.length > 0) {
        Promise.all(orders.map(async po => {
          const r = await fetch(`/api/purchasing/orders/${po.id}`).catch(() => null)
          if (!r?.ok) return [po.id, null] as const
          return [po.id, await r.json() as PoTimelineDetail] as const
        })).then(results => {
          setPoFullDetails(prev => {
            const next = { ...prev }
            for (const [poId, full] of results) if (full) next[poId] = full
            return next
          })
          setPoDetailUnavailable(prev => {
            const next = new Set(prev)
            for (const [poId, full] of results) { if (full) next.delete(poId); else next.add(poId) }
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
          // Warehouse already said "not in stock" (or the item is settled) — must go to
          // PO; a hidden transfer default here used to override that decision on convert.
          if (item.warehouseDecision === 'PURCHASE' || item.convertedAt || item.verifyRejectedAt) { next[item.id!] = null; continue }
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
    setRoomAssignment({})
    setPoFullDetails({})
    setPrFollowUps([])
    await fetchDetail(req.id)
  }

  // Jump to a linked Restock / source PR — only an id in hand, so same full-fetch-first
  // approach as the deep link below.
  async function openLinkedRequest(id: string) {
    setApproveSummary(null); setFulfillment({}); setRoomAssignment({}); setPoFullDetails({}); setPrFollowUps([])
    const data = await fetchDetail(id)
    if (data) { setSelected(data); setView('detail') }
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
      setApproveSummary(null); setFulfillment({}); setRoomAssignment({}); setPoFullDetails({})
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
    setTrip(detail.trip ?? null)
    setCart(detail.items.map(item => ({
      ...item,
      // Saved lines carry `unit`, but submit() sends `itemUnit` — without this every
      // line's unit got rewritten to the catalog base unit (or "pcs") on save.
      itemUnit: item.unit || item.itemUnit || item.baseUnit || 'pcs',
      key: item.id,
      supplierSearch: '', supplierOpen: false, search: '', open: false,
    })))
    setEditingRequestId(detail.id)
    setView('create')
  }

  // A PO-bound line's treatment on the ship: the item master's, or Purchasing's pick for custom lines.
  const lineTreatmentOf = (item: RequestLine): Treatment =>
    item.itemId ? (item.itemTreatment ?? 'CONSUMABLE') : (roomAssignment[item.id!]?.treatment ?? 'CONSUMABLE')

  async function convertToPO() {
    if (!selected || !detail || converting) return
    const settleable = detail.items.filter(item => !item.verifyRejectedAt && !item.convertedAt)
    const missingSupplier = settleable.filter(item => !fulfillment[item.id!] && !item.supplierId)
    if (missingSupplier.length === settleable.length) {
      alert(`Set a supplier first for: ${missingSupplier.map(i => i.itemName).join(', ')}`)
      return
    }
    // A PR delivering to a ship must say, per item going the PO route (not transfer),
    // which Inventory Room/Category it's destined for — same rule as creating a PO
    // directly, see OrdersPage.tsx.
    if (detail.deliveryLocation?.type === 'VESSEL') {
      const poBound = settleable.filter(item => item.supplierId && !fulfillment[item.id!] && !item.sourceInventoryItemId)
      const missingRoom = poBound.filter(item => lineTreatmentOf(item) === 'ASSET' && (!roomAssignment[item.id!]?.roomId || !roomAssignment[item.id!]?.categoryId))
      if (missingRoom.length > 0) {
        alert(`Assets need a Room and Category (where they go in the ship Inventory): ${missingRoom.map(i => i.itemName).join(', ')}`)
        return
      }
    }
    // Some items still need a supplier — proceed anyway and let the server convert just
    // the ready ones, leaving the rest on this PR for a later pass (see remainingItems).
    if (missingSupplier.length > 0 && !confirm(`These items still need a supplier and will stay on this PR for later: ${missingSupplier.map(i => i.itemName).join(', ')}.\n\nConvert the rest to PO now?`)) return
    const transferFulfillments = Object.entries(fulfillment)
      .filter(([, fromLocationId]) => fromLocationId)
      .map(([requestItemId, fromLocationId]) => ({ requestItemId, fromLocationId: fromLocationId as string }))
    const roomAssignments = Object.entries(roomAssignment)
      .filter(([requestItemId]) => !fulfillment[requestItemId])
      .map(([requestItemId, a]) => ({ requestItemId, roomId: a.roomId, categoryId: a.categoryId, treatment: a.treatment }))
    setConverting(true)
    const res = await fetch(`/api/purchasing/requests/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CONVERTED', transferFulfillments, roomAssignments }),
    }).finally(() => setConverting(false))
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

  // Requesting more of an existing InventoryItem (see InventoryPickerPanel) — no
  // PurchaseItem catalog link at all; sourceInventoryItemId is what tells Goods Receipt
  // to top up that InventoryItem's quantity instead of creating a StockLot.
  function addInventoryItemToCart(item: InventoryItemOption) {
    if (!deliveryLocationId && invLocationId) setDeliveryLocationId(invLocationId)
    const key = `inv-${item.id}-${requestedByEmployeeId || 'none'}`
    setCart(prev => {
      const existing = prev.find(l => l.key === key)
      if (existing) return prev.map(l => l.key === key ? { ...l, quantity: l.quantity + 1 } : l)
      return [...prev, {
        key, itemId: '', itemName: item.name, baseUnit: 'pcs', purchaseUnit: 'pcs',
        itemUnit: 'pcs', unit: 'pcs', quantity: 1, estimatedCost: item.unitPrice || 0,
        supplierId: '', supplierName: '', supplierSearch: '', supplierOpen: false,
        notes: '', search: '', open: false, isCustom: false,
        imageKeys: item.photoKeys?.length ? [item.photoKeys[0]] : [],
        sourceInventoryItemId: item.id,
        sourceInventoryItem: { id: item.id, itemNumber: item.itemNumber, name: item.name, room: item.room, category: item.category },
        requestedByEmployeeId: requestedByEmployeeId || undefined,
      }]
    })
    toast.success(`${item.name} added to cart`)
  }

  function changeCartQty(key: string, delta: number) {
    setCart(prev => prev.map(l => l.key === key ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l))
  }

  function updateCartLine(key: string, patch: Partial<RequestLine>) {
    setCart(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l))
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
    if (purpose === 'TRIP' && !trip) { setSaveError('Please select which trip this request is for'); setSaving(false); return }
    const missingDamage = cart.find(l => l.requestType === 'REPLACEMENT' && !l.damageDetail?.trim())
    if (missingDamage) { setSaveError(`Please describe the damage on "${missingDamage.itemName}" (replacement)`); setSaving(false); return }

    if (editingRequestId) {
      const id = editingRequestId
      const res = await fetch(`/api/purchasing/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edit: true,
          deliveryLocationId, requestedByEmployeeId: requestedByEmployeeId || undefined, notes,
          neededByDate: neededByDate || undefined, isUrgent, urgentReason: isUrgent ? urgentReason : undefined,
          purpose, ...(purpose === 'TRIP' ? tripLinkBody(trip) : {}),
          items: cart.map(l => ({
            itemId: l.itemId || undefined, itemName: l.itemName, quantity: l.quantity,
            unit: l.itemUnit || l.baseUnit || 'pcs', estimatedCost: l.estimatedCost || undefined,
            supplierId: l.supplierId || undefined, supplierName: l.supplierName || undefined,
            notes: l.notes, imageKeys: l.imageKeys,
            sourceInventoryItemId: l.sourceInventoryItemId || undefined,
            requestType: l.requestType ?? 'NEW', damageDetail: l.requestType === 'REPLACEMENT' ? l.damageDetail ?? undefined : undefined,
          })),
        }),
      })
      const data = await res.json()
      setSaving(false)
      if (!res.ok) { setSaveError(data.error ?? 'An error occurred'); return }
      setEditingRequestId(null)
      setDeliveryLocationId(''); setRequestedByEmployeeId(''); setNotes('')
      setNeededByDate(''); setIsUrgent(false); setUrgentReason('')
      setPurpose('STOCK_INVENTORY'); setTrip(null)
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
          purpose, ...(purpose === 'TRIP' ? tripLinkBody(trip) : {}),
          items: lines.map(l => ({
            itemId: l.itemId || undefined, itemName: l.itemName, quantity: l.quantity,
            unit: l.itemUnit || l.baseUnit || 'pcs', notes: l.notes, imageKeys: l.imageKeys,
            sourceInventoryItemId: l.sourceInventoryItemId || undefined,
            requestType: l.requestType ?? 'NEW', damageDetail: l.requestType === 'REPLACEMENT' ? l.damageDetail ?? undefined : undefined,
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
    setPurpose('STOCK_INVENTORY'); setTrip(null)
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
    const d = await res.json()
    if (!res.ok) { alert(d.error ?? 'Failed to update status'); return }
    // Reopen can land on Pending Approval / On Process rather than Draft — trust the server.
    setSelected(s => s?.id === id ? { ...s, status: d.status ?? status } : s)
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

  // Warehouse's per-line "Approve" — saves the source warehouse + Reserve (base units); nothing
  // moves until "Process Purchase Request". See PATCH .../items/[itemId]/warehouse-check.
  async function warehouseApproveItem(item: RequestLine, reserveQty: number) {
    if (!detail || !item.id) return
    // Same fallback the dropdown displays — the preselected warehouse counts as a choice
    // even if the user never touched the dropdown.
    const fromLocationId = detail.warehouseHomeLocationId ?? warehouseFrom[item.id] ?? item.warehouseFromLocationId ?? item.stockCheck?.locationId ?? item.warehouseStock?.slice().sort((a, b) => b.qty - a.qty)[0]?.locationId ?? ''
    if (!fromLocationId) { toast.error('Select a warehouse location first'); return }
    setWarehouseBusyItemId(item.id)
    const res = await fetch(`/api/purchasing/requests/${detail.id}/items/${item.id}/warehouse-check`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', fromLocationId, note: (warehouseNote[item.id] ?? item.warehouseCheckNote ?? '').trim() || undefined, reserveQty }),
    })
    const data = await res.json().catch(() => ({}))
    setWarehouseBusyItemId(null)
    if (!res.ok) { toast.error(data.error ?? 'Failed to approve item'); return }
    setStockItemId(null)
    toast.success(`${item.itemName} approved — reserve ${lineQtyLabel(item, reserveQty)}`)
    await fetchDetail(detail.id)
  }

  async function warehouseUnapproveItem(item: RequestLine) {
    if (!detail || !item.id) return
    setWarehouseBusyItemId(item.id)
    const res = await fetch(`/api/purchasing/requests/${detail.id}/items/${item.id}/warehouse-check`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unapprove' }),
    })
    const data = await res.json().catch(() => ({}))
    setWarehouseBusyItemId(null)
    if (!res.ok) { toast.error(data.error ?? 'Failed to undo approval'); return }
    toast.success(`${item.itemName}: approval removed`)
    await fetchDetail(detail.id)
  }

  // "Ship from stock now" on a backordered line: free stock at its warehouse goes onto a TR
  // (oldest backorder first) — see POST .../items/[itemId]/ship-backorder.
  async function shipBackorder(itemId: string) {
    if (!detail) return
    setShippingBackorder(itemId)
    const res = await fetch(`/api/purchasing/requests/${detail.id}/items/${itemId}/ship-backorder`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setShippingBackorder(null)
    if (!res.ok) { toast.error(data.error ?? 'Failed to ship from stock'); return }
    toast.success(data.transferNumbers?.length ? `Ready to dispatch on ${data.transferNumbers.join(', ')}` : 'Shipped from stock')
    await fetchDetail(detail.id)
  }

  // Warehouse's "Process Purchase Request" — decides every approved line at once (TR for the
  // Reserve + backorder for the rest), puts To Be Order on restock lines to the warehouse, then
  // closes the PR straight to CONVERTED if everything came from stock, else ON_PROCESS.
  // See PATCH .../warehouse-forward.
  async function warehouseForward() {
    if (!detail) return
    setWarehouseForwarding(true)
    const res = await fetch(`/api/purchasing/requests/${detail.id}/warehouse-forward`, { method: 'PATCH' })
    const data = await res.json().catch(() => ({}))
    setWarehouseForwarding(false)
    if (!res.ok) { toast.error(data.error ?? 'Failed to process request'); return }
    if (data.status) setSelected(s => s ? { ...s, status: data.status } : s)
    toast.success(data.remainingItems?.length ? 'Purchase request processed — sent to Purchasing' : 'Request completed — all from warehouse stock')
    if (data.transferNumbers?.length) toast.success(`Transfer: ${data.transferNumbers.join(', ')}`)
    await fetchDetail(detail.id)
    load()
  }

  async function deleteReq(req: PurchaseRequest) {
    if (!confirm(`Delete ${req.prNumber}?`)) return
    const res = await fetch(`/api/purchasing/requests/${req.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Failed to delete'); return }
    setView('list'); load()
  }

  async function openFollowUpModal() {
    setFollowUpNote(''); setFollowUpIsEscalation(false); setFollowUpEscalatedToId(''); setFollowUpError(''); setFollowUpModal(true)
    if (!detail) return
    const res = await fetch(`/api/purchasing/requests/${detail.id}/follow-ups`)
    if (res.ok) { const d = await res.json(); setEscalationTargets(d.escalationTargets ?? []) }
  }

  async function saveFollowUp() {
    if (!detail) return
    if (!followUpNote.trim()) { setFollowUpError('Note is required'); return }
    setFollowUpSaving(true); setFollowUpError('')
    const res = await fetch(`/api/purchasing/requests/${detail.id}/follow-ups`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: followUpNote, isEscalation: followUpIsEscalation, escalatedToId: followUpEscalatedToId || null }),
    })
    const data = await res.json()
    setFollowUpSaving(false)
    if (!res.ok) { setFollowUpError(data.error ?? 'Failed to save'); return }
    setFollowUpModal(false)
    setPrFollowUps(prev => [data, ...prev])
  }

  async function deleteFollowUp(followUpId: string) {
    if (!detail || !confirm('Delete this follow-up entry?')) return
    const res = await fetch(`/api/purchasing/requests/${detail.id}/follow-ups/${followUpId}`, { method: 'DELETE' })
    if (res.ok) setPrFollowUps(prev => prev.filter(f => f.id !== followUpId))
  }

  // Warehouse's "Process Purchase Request" — enabled once every Warehouse-routed line still open
  // is Approved (also closes a check whose lines are all settled already, e.g. the last one rejected).
  function renderWarehouseFinish() {
    const undecided = (detail?.items ?? []).filter(it => it.viaWarehouse && !it.convertedAt && !it.warehouseDecision && !it.verifyRejectedAt)
    const unapproved = undecided.filter(it => !it.warehouseApprovedAt)
    return (
      <button onClick={warehouseForward} disabled={warehouseForwarding || unapproved.length > 0}
        title={unapproved.length ? `Approve every item first — waiting on: ${unapproved.map(it => it.itemName).join(', ')}` : undefined}
        className="flex items-center gap-2 px-4 py-2 text-sm bg-success text-success-foreground rounded-lg hover:bg-success/90 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-success">
        {warehouseForwarding ? 'Processing…' : 'Process Purchase Request'}
        {undecided.length > 0 && (
          <span className="text-xs font-normal opacity-90 tabular-nums">{undecided.length - unapproved.length}/{undecided.length} approved</span>
        )}
      </button>
    )
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
    const matchesTab = (r: PurchaseRequest, key: string) => key === 'ALL'
      || (key === 'WAREHOUSE' ? !!r.warehousePending
        : key === 'OUTSTANDING' ? !!r.outstanding
        : r.status === key && !(key === 'CONVERTED' && r.outstanding))
    const q = search.trim().toLowerCase()
    const matchesSearch = (r: PurchaseRequest) => !q || [
      r.prNumber, r.deliveryLocation?.name, r.requestedByEmployee?.fullName, r.createdBy?.name, r.restockFor?.prNumber, ...r.itemNames,
    ].some(s => s?.toLowerCase().includes(q))
    const isUrgentOpen = (r: PurchaseRequest) => r.isUrgent && isOpenRequest(r)
    const matchesFlags = (r: PurchaseRequest) => (!urgentOnly || isUrgentOpen(r)) && (!restockOnly || !!r.restockFor)
    // Search and the Urgent/Restock chips narrow the list; the status tabs count within that,
    // and each chip counts within the current tab.
    const searched = scopedRequests.filter(matchesSearch)
    const flagged = searched.filter(matchesFlags)
    const filtered = flagged.filter(r => matchesTab(r, filterStatus))
    const counts = FILTER_TABS.reduce<Record<string, number>>((acc, t) => {
      acc[t.key] = flagged.filter(r => matchesTab(r, t.key)).length
      return acc
    }, {})
    const inTab = searched.filter(r => matchesTab(r, filterStatus))
    const urgentCount = inTab.filter(r => isUrgentOpen(r) && (!restockOnly || !!r.restockFor)).length
    const restockCount = inTab.filter(r => !!r.restockFor && (!urgentOnly || isUrgentOpen(r))).length
    const mineCount = divisionScoped.filter(r => r.createdBy?.id === session?.user?.id).length
    const emptyMessage = requests.length === 0
      ? 'No PRs yet. Click "New PR" to get started.'
      : q || urgentOnly || restockOnly
        ? 'No PRs match these filters.'
        : scopeFilter === 'MINE' && scopedRequests.length === 0
          ? "You haven't requested any PRs yet."
          : `No PRs with status "${STATUS_LABEL[filterStatus] ?? filterStatus}".`
    const totalPages = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE))
    const currentPage = Math.min(cardPage, totalPages)
    const pageItems = filtered.slice((currentPage - 1) * LIST_PAGE_SIZE, currentPage * LIST_PAGE_SIZE)

    const scopeButton = (active: boolean) =>
      `px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${active ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`
    const flagChip = (active: boolean, activeClass: string) =>
      `h-8 px-3 rounded-full border text-xs font-medium flex items-center gap-1.5 transition-colors ${active ? activeClass : 'text-muted-foreground hover:text-foreground'}`
    const requesterName = (r: PurchaseRequest) =>
      r.restockFor ? `Auto restock from ${r.restockFor.prNumber}` : r.requestedByEmployee?.fullName ?? r.createdBy?.name ?? '—'
    // Status column: one status (a dot + label) and, under it, the one thing worth knowing
    // about it — where a converted PR's slowest PO is, or what an On Process PR still waits on.
    const status = (r: PurchaseRequest) => {
      const least = r.status === 'CONVERTED' && !r.outstanding ? leastAdvancedPo(r.orders) : null
      const tone = least ? PO_STATUS_TONE[least.po.status] : prStatusTone(r)
      const label = least
        ? `${least.po.currentLegLabel ?? PO_STATUS_LABEL[least.po.status] ?? least.po.status}${least.count > 1 ? ` (+${least.count - 1})` : ''}`
        : prStatusLabel(r)
      const note = least ? currentLocationLabel(least.po)
        : r.status === 'ON_PROCESS' && r.warehousePending ? 'Warehouse still checking'
        : r.status === 'ON_PROCESS' && r.outstanding ? 'Waiting restock'
        : null
      return { tone, label, note }
    }
    // Same columns for the header and every row. Below sm the row stacks: number + status on
    // top, items under them (see the order-* classes on the cells).
    const grid = 'grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[150px_minmax(0,1fr)_200px] gap-x-6 gap-y-1'

    return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">Purchase Requests</h2>
        <button onClick={() => setView('create')} className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> New PR
        </button>
      </div>

      <div className="space-y-3">
        {/* Status tabs */}
        <div className="flex gap-5 border-b overflow-x-auto">
          {FILTER_TABS.filter(t => t.key === 'ALL' || counts[t.key] > 0 || filterStatus === t.key).map(t => (
            <button key={t.key} onClick={() => { setFilterStatus(t.key); setCardPage(1) }}
              className={`shrink-0 whitespace-nowrap py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                filterStatus === t.key ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {t.label}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Filters — Urgent / Restock chips, scope toggles, search */}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setUrgentOnly(u => !u); setCardPage(1) }}
            className={flagChip(urgentOnly, 'border-destructive/40 bg-destructive/10 text-destructive')}>
            Urgent <span className="tabular-nums opacity-70">{urgentCount}</span>
          </button>
          <button onClick={() => { setRestockOnly(v => !v); setCardPage(1) }}
            className={flagChip(restockOnly, 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300')}>
            Restock <span className="tabular-nums opacity-70">{restockCount}</span>
          </button>
          {/* Division toggle — a Purchasing user with an assigned division; a default view,
              not an access restriction. */}
          {myDivision && (
            <div className="inline-flex rounded-md bg-muted/60 p-0.5">
              {([['MINE', `${DIVISION_LABEL[myDivision]} · ${myDivisionCount}`], ['ALL', 'All Requests']] as const).map(([key, label]) => (
                <button key={key} onClick={() => { setDivisionScope(key); setFilterStatus('ALL'); setCardPage(1) }} className={scopeButton(divisionScope === key)}>{label}</button>
              ))}
            </div>
          )}
          {/* Admin-only: the company-wide queue vs. just what they created themselves. */}
          {isAdmin && (
            <div className="inline-flex rounded-md bg-muted/60 p-0.5">
              {([['ALL', 'All Requests'], ['MINE', `Requested by Me${mineCount ? ` · ${mineCount}` : ''}`]] as const).map(([key, label]) => (
                <button key={key} onClick={() => { setScopeFilter(key); setFilterStatus('ALL'); setCardPage(1) }} className={scopeButton(scopeFilter === key)}>{label}</button>
              ))}
            </div>
          )}
          <div className="relative w-full sm:w-64 sm:ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setCardPage(1) }}
              placeholder="Search PR, item, requester…"
              className="w-full h-8 pl-8 pr-7 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {search && (
              <button onClick={() => { setSearch(''); setCardPage(1) }} aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className={`${grid} hidden sm:grid px-3 pb-2 border-b text-[11px] font-medium uppercase tracking-wide text-muted-foreground`}>
          <span>Request</span><span>Items</span><span>Status</span>
        </div>
        <div className="divide-y">
          {loading ? (
            [...Array(6)].map((_, i) => (
              <div key={i} className={`${grid} px-3 py-4 animate-pulse`}>
                <div className="space-y-1.5"><div className="h-3.5 w-28 rounded bg-muted" /><div className="h-3 w-20 rounded bg-muted" /></div>
                <div className="hidden sm:block space-y-1.5"><div className="h-3.5 w-72 rounded bg-muted" /><div className="h-3 w-48 rounded bg-muted" /></div>
                <div className="h-3.5 w-24 rounded bg-muted" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
              {emptyMessage}
              {(q || urgentOnly || restockOnly) && (
                <button onClick={() => { setSearch(''); setUrgentOnly(false); setRestockOnly(false); setCardPage(1) }}
                  className="block mx-auto mt-2 text-xs font-medium text-primary-strong hover:underline">Clear filters</button>
              )}
            </div>
          ) : pageItems.map(r => {
            const s = status(r)
            return (
              <div key={r.id} role="button" tabIndex={0}
                onClick={() => openDetail(r)}
                onKeyDown={e => { if (e.key === 'Enter') openDetail(r) }}
                className={`${grid} px-3 py-3.5 cursor-pointer hover:bg-muted/40 transition-colors ${isUrgentOpen(r) ? 'shadow-[inset_2px_0_0_var(--destructive)]' : ''}`}>
                <div className="order-1">
                  <p className="font-mono text-sm font-medium whitespace-nowrap">{r.prNumber}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDate(r.createdAt)}</p>
                </div>
                <div className="order-3 sm:order-2 col-span-2 sm:col-span-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm min-w-0">
                    {isUrgentOpen(r) && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-destructive">Urgent</span>}
                    {r.restockFor && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">Restock</span>}
                    <ItemNamesPreview names={r.itemNames} max={3} className="min-w-0" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {r.deliveryLocation?.name ?? '—'} <span className="text-muted-foreground/50">·</span> {requesterName(r)}
                  </p>
                </div>
                <div className="order-2 sm:order-3 min-w-0 text-right sm:text-left">
                  <p className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[s.tone] ?? 'bg-muted-foreground'}`} />
                    {s.label}
                  </p>
                  {s.note && <p className="text-xs text-muted-foreground mt-0.5 sm:pl-4 truncate">{s.note}</p>}
                  {r.status === 'DRAFT' && isAdmin && !r.warehouseStarted && (
                    <button
                      onClick={e => { e.stopPropagation(); changeStatus(r.id, 'ON_PROCESS') }}
                      title="Skip Warehouse's stock check and send straight to Purchasing"
                      className="block sm:ml-4 ml-auto mt-0.5 text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2">
                      Force Verify
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{filtered.length} requests · page {currentPage} of {totalPages}</p>
          <div className="flex items-center gap-1">
            <button onClick={() => setCardPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} aria-label="Previous page"
              className="h-8 w-8 grid place-items-center rounded-md hover:bg-muted transition-colors disabled:opacity-30 disabled:hover:bg-transparent">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setCardPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} aria-label="Next page"
              className="h-8 w-8 grid place-items-center rounded-md hover:bg-muted transition-colors disabled:opacity-30 disabled:hover:bg-transparent">
              <ChevronRight className="h-4 w-4" />
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
        purpose={purpose} setPurpose={setPurpose} trip={trip} setTrip={setTrip} trips={trips}
        cart={cart} cartOpen={cartOpen} setCartOpen={setCartOpen}
        addToCart={addToCart} changeCartQty={changeCartQty} removeCartLine={removeCartLine} updateCartLine={updateCartLine}
        catalogSearch={catalogSearch} setCatalogSearch={setCatalogSearch}
        catalogType={catalogType} setCatalogType={setCatalogType}
        catalogCategory={catalogCategory} setCatalogCategory={setCatalogCategory}
        catalogSource={catalogSource} setCatalogSource={setCatalogSource} invLocationId={invLocationId} setInvLocationId={setInvLocationId}
        invRoomId={invRoomId} setInvRoomId={setInvRoomId} invCategoryId={invCategoryId} setInvCategoryId={setInvCategoryId}
        invSearch={invSearch} setInvSearch={setInvSearch} invRooms={invPickerRooms} invCategories={invCategories}
        invItems={invItems} invLoading={invLoading} addInventoryItemToCart={addInventoryItemToCart}
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
            setPurpose('STOCK_INVENTORY'); setTrip(null)
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
              {formatDate(selected.createdAt)} · created by {selected.createdBy?.name ?? '—'}
              {selected.requestedByEmployee && <> · requested by {selected.requestedByEmployee.fullName}</>}
              {selected.verifiedBy && <> · verified by {selected.verifiedBy.name}</>}
              {' · '}
              {(() => {
                const st = { status: selected.status, outstanding: detail ? detail.items.some(it => (it.backorderQty ?? 0) > 0) : selected.outstanding }
                return <StatusBadge tone={prStatusTone(st)}>{prStatusLabel(st)}</StatusBadge>
              })()}
            </p>
            {selected.isUrgent && selected.urgentReason && (
              <p className="text-sm text-destructive mt-1.5 bg-destructive/10 border border-destructive/30 rounded-md px-3 py-1.5 inline-block">
                <span className="font-semibold">Urgent:</span> {selected.urgentReason}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-1">
            {selected.status === 'DRAFT' && (
              <>
                {isWarehouse && !canWarehouseCheck && (
                  <span className="text-sm text-muted-foreground italic">Being checked by Warehouse</span>
                )}
                {!isWarehouse && (
                  <>
                    {isAdmin && !detail?.items.some(it => it.warehouseDecision || it.convertedAt) && (
                      <button onClick={() => changeStatus(selected.id, 'ON_PROCESS')}
                        title="Skip Warehouse's stock check and send straight to Purchasing"
                        className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover font-medium transition-colors">
                        Force Verify
                      </button>
                    )}
                    {!detail?.items.some(it => it.convertedAt) && (
                      <button onClick={openEditRequest}
                        className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                        Edit
                      </button>
                    )}
                    <button onClick={() => changeStatus(selected.id, 'REJECTED')}
                      className="px-4 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors">
                      Reject
                    </button>
                  </>
                )}
                {canWarehouseCheck && renderWarehouseFinish()}
                {/* Hidden once Warehouse has sent any item via Transfer — deleting the PR
                    would orphan that Transfer (the API refuses it too). Own-only roles can
                    only delete their own PR — Cruise Director/Boat Captain now also see
                    their crew's PRs for the yacht, which they must not be able to delete. */}
                {!detail?.items.some(it => it.convertedAt) && (!isWarehouse || selected.createdBy?.id === session?.user?.id) && (
                  <button onClick={() => deleteReq(selected)}
                    className="px-4 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors">
                    Delete
                  </button>
                )}
              </>
            )}
            {selected.status === 'PENDING_APPROVAL' && (selected.createdBy?.id === session?.user?.id || isAdmin) && (
              <button onClick={() => deleteReq(selected)}
                title="Withdraw this request while it is still waiting for manager approval"
                className="px-4 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors">
                Withdraw
              </button>
            )}
            {selected.status === 'ON_PROCESS' && canWarehouseCheck && detail && isWarehousePending(detail) && renderWarehouseFinish()}
            {selected.status === 'ON_PROCESS' && !isWarehouse && (
              <>
                {(() => {
                  // Lines still waiting on Warehouse (parallel PR) aren't Purchasing's to convert yet.
                  const settleable = detail?.items.filter(item => !item.verifyRejectedAt && !item.convertedAt && !isAwaitingWarehouse(item, detail)) ?? []
                  const missingSupplier = settleable.filter(item => !fulfillment[item.id!] && !item.supplierId)
                  const nothingLeft = settleable.length === 0
                  // Only block when NOTHING is ready yet — if at least one item already has
                  // a supplier/fulfillment picked, Purchasing can send that off as its own
                  // PO now and leave the rest on this PR for a later pass.
                  const disabled = nothingLeft || missingSupplier.length === settleable.length
                  const partial = missingSupplier.length > 0 && missingSupplier.length < settleable.length
                  return (
                    <button onClick={convertToPO} disabled={disabled || converting}
                      title={nothingLeft ? 'Every item is already converted or rejected' : disabled ? `Set a supplier first for: ${missingSupplier.map(i => i.itemName).join(', ')}` : partial ? `Will convert the ready items now; still needs a supplier: ${missingSupplier.map(i => i.itemName).join(', ')}` : undefined}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-success text-success-foreground rounded-lg hover:bg-success/90 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-success">
                      <ShoppingCart className="h-4 w-4" /> {converting ? 'Converting…' : partial ? 'Convert Ready Items' : 'Convert to PO'}
                    </button>
                  )
                })()}
                <button onClick={() => changeStatus(selected.id, 'REJECTED')}
                  className="px-4 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors">
                  Reject
                </button>
              </>
            )}
            {selected.status === 'ON_PROCESS' && isWarehouse && !(detail && isWarehousePending(detail)) && (
              <span className="text-sm text-muted-foreground italic">Being processed by Purchasing</span>
            )}
            {selected.status === 'CONVERTED' && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <span className="text-sm text-muted-foreground italic">Converted to Purchase Order</span>
                {onOpenPo && detail?.orders?.map(po => (
                  <button key={po.id} onClick={() => onOpenPo(po.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-success text-success-foreground rounded-md hover:bg-success/90 transition-colors">
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
        <div className="rounded-lg bg-success/10 border border-success/30 text-success text-sm px-4 py-3 space-y-2">
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
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-success text-success-foreground rounded-md hover:bg-success/90 transition-colors"
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
            <p className="text-warning">Not yet converted (still needs a supplier picked, or supplier-selection approval): {approveSummary.remainingItems.join(', ')} — the request stays On Process until these clear too, and can be converted again once they do.</p>
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
                    ? `Trip${detail.trip ? ` — ${tripShortLabel(detail.trip)} (${tripDates(detail.trip)})` : ''}`
                    : 'Stock & Inventory'}
                </p>
              </div>
              {detail.neededByDate && (
                <div>
                  <p className="text-xs text-muted-foreground">Needed By</p>
                  <p className="font-medium">{formatDate(detail.neededByDate)}</p>
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
            const stockTransfers = (detail.stockTransfers ?? []).filter(t => t.status !== 'CANCELLED')
            // Every item custom (no catalog itemId) → the PR skipped Cek Gudang entirely.
            const skippedWarehouse = detail.items.length > 0 && detail.items.every(it => !it.itemId)
            // Closed out by Gudang alone — every item went out from stock, no PO at all.
            const fulfilledFromStock = detail.status === 'CONVERTED' && (detail.orders?.length ?? 0) === 0
            const steps: TimelineStep[] = [
              {
                key: 'created', done: true, label: 'PR Submitted', date: formatDate(detail.createdAt, 'datetime'),
                sub: [detail.requestedByEmployee?.fullName ?? detail.createdBy?.name ?? null, detail.prNumber],
              },
              // Only PRs routed to a manager have this step (no manager on file → skipped).
              ...((detail.approverEmployeeId || detail.approvedAt) ? [{
                key: 'approved', done: !!detail.approvedAt, label: 'Manager Approved',
                date: detail.approvedAt ? formatDate(detail.approvedAt, 'datetime') : null,
                sub: [detail.approvedBy?.name ? `by ${detail.approvedBy.name}` : (detail.status === 'PENDING_APPROVAL' ? 'Waiting for manager' : null)],
              }] : []),
              ...(!skippedWarehouse ? [{
                key: 'verified', done: !!detail.verifiedAt || fulfilledFromStock,
                label: fulfilledFromStock ? 'Warehouse Check — All From Stock' : 'Warehouse Check — Sent to Purchasing',
                date: detail.verifiedAt ? formatDate(detail.verifiedAt, 'datetime') : (fulfilledFromStock && detail.convertedAt ? formatDate(detail.convertedAt, 'datetime') : null),
                sub: [
                  (detail.verifiedBy?.name ?? (fulfilledFromStock ? detail.convertedBy?.name : null)) ? `by ${detail.verifiedBy?.name ?? detail.convertedBy?.name}` : null,
                  detail.status === 'DRAFT' ? 'Checking stock in Warehouse' : null,
                ],
              }] : []),
              ...(!fulfilledFromStock ? [{
                key: 'converted', done: !!detail.convertedAt, label: 'Converted to PO',
                date: detail.convertedAt ? formatDate(detail.convertedAt, 'datetime') : null,
                sub: [detail.convertedBy?.name ? `by ${detail.convertedBy.name}` : null],
              }] : []),
              // Items Gudang sent from stock — one Dispatched/Arrived pair per transfer.
              ...stockTransfers.flatMap((t): TimelineStep[] => [
                {
                  key: `tr-${t.id}-dispatch`, done: !!t.dispatchedAt, label: `Dispatched from ${t.fromLocationName}`,
                  date: t.dispatchedAt ? formatDate(t.dispatchedAt, 'datetime') : null,
                  sub: [t.transferNumber, `to ${t.toLocationName}`],
                },
                {
                  key: `tr-${t.id}-arrive`, done: !!t.receivedAt, label: `Arrived at ${t.toLocationName}`,
                  date: t.receivedAt ? formatDate(t.receivedAt, 'datetime') : null,
                  sub: [t.transferNumber, t.receivedByName ? `by ${t.receivedByName}` : null],
                },
              ]),
              // Each linked PO's full journey (payments, dispatch, transit leg by leg,
              // receipts) — identical steps to what OrdersPage.tsx's own Timeline shows,
              // built by the same shared function once that PO's full detail has loaded.
              ...(detail.orders ?? []).flatMap((po): TimelineStep[] => {
                const full = poFullDetails[po.id]
                if (!full && poDetailUnavailable.has(po.id)) {
                  return [{
                    key: `po-summary-${po.id}`, done: true,
                    label: `${po.poNumber} — ${po.status.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase())}`,
                    date: null, sub: [po.currentLegLabel ?? null],
                  }]
                }
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
                date: formatDate(detail.rejectedAt, 'datetime'), sub: [detail.rejectedBy?.name ? `by ${detail.rejectedBy.name}` : null],
              }] : []),
              ...(detail.cancelledAt ? [{
                key: 'cancelled', done: true, cancelled: true, label: 'Cancelled',
                date: formatDate(detail.cancelledAt, 'datetime'), sub: [detail.cancelledBy?.name ? `by ${detail.cancelledBy.name}` : null],
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
            // Warehouse reviewing an incoming PR gets the full stock breakdown (against the
            // source warehouse, base units) in place of the single Current Stock figure.
            const showStockCheck = canWarehouseCheck && isWarehousePending(detail)
            // Mark each line's route only while it still matters — the PR mixes both kinds AND
            // Warehouse hasn't finished its check. Afterwards every line is Purchasing's anyway.
            const mixedRoute = isWarehousePending(detail) && detail.items.some(it => it.viaWarehouse) && detail.items.some(it => !it.viaWarehouse)
            const fmtQty = (n: number) => Math.round(n * 100) / 100
            const stockLocations = [...new Set(sortedItems.map(it => it.stockCheck?.locationName).filter(Boolean) as string[])]
            // Purchasing's table: stock + To Be Order (on a PO vs still Pending) for Warehouse-routed lines.
            const showStockCols = detail.items.some(it => it.viaWarehouse && !!it.itemId)
            // Shown in the unit the line was requested in: purchase unit with the base
            // equivalent underneath (e.g. 2 bottle / 1500 ml), else base unit only.
            // Units stay muted & normal-weight so the numbers still read first.
            const lineQty = (item: typeof sortedItems[number], n: number) => {
              const conv = item.conversionFactor || 1
              const inPurchase = showsInPurchaseUnit(item)
              return inPurchase ? (
                <>
                  {fmtQty(n / conv)}<span className="ml-1 text-xs font-normal text-muted-foreground">{item.purchaseUnit}</span>
                  {n !== 0 && <span className="block text-[10px] font-normal text-muted-foreground">{fmtQty(n)} {item.baseUnit}</span>}
                </>
              ) : (
                <>{fmtQty(n)}{item.baseUnit && <span className="ml-1 text-xs font-normal text-muted-foreground">{item.baseUnit}</span>}</>
              )
            }
            // Expanded stock breakdown for one line (against the source warehouse, base units).
            const stockBreakdown = (item: typeof sortedItems[number]) => {
              const sc = item.stockCheck
              if (!sc) return <p className="text-xs text-muted-foreground italic">No stock data for this item.</p>
              const muted = (n: number) => n === 0 ? 'text-muted-foreground/60' : ''
              const qty = (n: number) => lineQty(item, n)
              const split = item.toBeOrderSplit
              const stats: { label: string; value: number | null; cls: string; sub?: string; title?: string; highlight?: boolean }[] = [
                { label: 'Current Stock', value: sc.availability, cls: '', sub: stockLocations.length > 1 ? sc.locationName : undefined },
                { label: 'Min. Stock', value: sc.minStock, cls: muted(sc.minStock) || 'text-muted-foreground' },
                { label: 'Requested', value: sc.requested, cls: '' },
                { label: 'Reserve', value: sc.reserve, cls: sc.reserve > 0 ? 'text-warning' : muted(0) },
                { label: 'To Be Order', value: sc.toBeOrder, cls: sc.toBeOrder > 0 ? 'text-info' : muted(0), highlight: true, title: '(Requested − Current Stock) + Min. Stock' },
                { label: 'PO', value: split?.po ?? null, cls: split?.po ? 'text-success' : muted(0), title: 'To Be Order on a Purchase Order, not arrived yet', sub: split?.received ? `${lineQtyLabel(item, split.received)} arrived` : undefined },
                { label: 'Pending', value: split?.pending ?? null, cls: split?.pending ? 'text-warning' : muted(0), title: 'To Be Order not ordered yet' },
              ]
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {stats.map(st => (
                    <div key={st.label} title={st.title} className={`rounded-md border px-3 py-2 ${st.highlight ? 'bg-info/5 border-info/30' : 'bg-card'}`}>
                      <p className={`text-[10px] font-medium uppercase tracking-wide ${st.highlight ? 'text-info' : 'text-muted-foreground'}`}>{st.label}</p>
                      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${st.value === null ? 'text-muted-foreground/50' : st.cls}`}>{st.value === null ? '—' : qty(st.value)}</p>
                      {st.sub && <p className="text-[10px] text-muted-foreground">{st.sub}</p>}
                    </div>
                  ))}
                </div>
              )
            }
            // Shipment history of one line: every batch of warehouse stock handed to it (Warehouse
            // check, then each restock that arrives) with its TR's Reserved → Dispatched → Received
            // dates, then what's still to come. The line is complete once Σ batches = PR.
            const TR_STAGE: Record<string, { label: string; tone: StatusTone }> = {
              PENDING: { label: 'Ready to dispatch', tone: 'warning' },
              DISPATCHED: { label: 'In transit', tone: 'info' },
              RECEIVED: { label: 'Received', tone: 'success' },
              CANCELLED: { label: 'Cancelled', tone: 'neutral' },
            }
            const reservationLog = (item: typeof sortedItems[number]) => {
              if (!item.viaWarehouse || !item.itemId || item.verifyRejectedAt) return null
              const rows = item.reservations ?? []
              // Lines processed before the log existed: one row from what was sent, stock unknown.
              const legacy = !rows.length && (item.sentFromStock ?? 0) > 0
              if (!rows.length && !legacy) return null
              const shown: { key: string; date: string | null; stock: number | null; reserved: number; tr: { id: string | null; number: string } | null; po: { id: string; number: string } | null; restock: boolean }[] = legacy
                ? [{ key: 'legacy', date: item.warehouseCheckedAt ?? null, stock: null, reserved: item.sentFromStock!, tr: item.transfer ? { id: item.transfer.id, number: item.transfer.transferNumber } : null, po: null, restock: false }]
                : rows.map(r => ({
                    key: r.id, date: r.createdAt, stock: r.stockQty, reserved: r.reservedQty, restock: r.source === 'BACKORDER',
                    tr: r.transferNumber ? { id: r.transferId, number: r.transferNumber } : null,
                    po: r.purchaseOrderId && r.poNumber ? { id: r.purchaseOrderId, number: r.poNumber } : null,
                  }))
              const docLink = (label: string, open?: () => void) => open
                ? <button type="button" onClick={open} className="font-medium text-info hover:underline underline-offset-2">{label}</button>
                : <span className="font-medium text-foreground">{label}</span>
              const trOf = (tr: { id: string | null; number: string } | null) => tr
                ? (detail.stockTransfers ?? []).find(t => (tr.id && t.id === tr.id) || t.transferNumber === tr.number) ?? null
                : null
              const requested = item.requestedBase ?? item.stockCheck?.requested ?? 0
              const total = shown.reduce((s, r) => s + r.reserved, 0)
              const remaining = Math.max(0, requested - total)
              const complete = remaining <= 1e-6
              // Where the next batch comes from: the restock PO (Purchasing sees which), else just the stage.
              const split = item.toBeOrderSplit
              const nextOrder = (item.restockOrders ?? []).find(o => o.poStatus !== 'RECEIVED')
              const step = (label: string, date: string | null, by?: string | null) => (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${date ? 'bg-success' : 'bg-muted-foreground/25'}`} />
                    <span className={`text-[10px] font-medium uppercase tracking-wide ${date ? 'text-foreground' : 'text-muted-foreground/60'}`}>{label}</span>
                  </div>
                  <p className={`mt-0.5 pl-3.5 text-[11px] leading-tight ${date ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
                    {date ? <>{formatDate(date)} · {formatDate(date, 'time')}</> : '—'}
                  </p>
                  {by && <p className="pl-3.5 text-[11px] font-medium leading-tight truncate">{by}</p>}
                </div>
              )
              return (
                <div>
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Shipment History</p>
                    <p className="text-xs text-muted-foreground">
                      Sent <span className={`font-semibold tabular-nums ${complete ? 'text-success' : 'text-foreground'}`}>{lineQtyLabel(item, total)}</span> of {lineQtyLabel(item, requested)}
                    </p>
                  </div>
                  <div className="rounded-lg border divide-y">
                    {shown.map((r, i) => {
                      // A check that reserved nothing (all bought by Purchasing) isn't a batch — just note it.
                      if (r.reserved <= 0) return (
                        <p key={r.key} className="px-3 py-2.5 text-[11px] text-muted-foreground">
                          {r.date ? formatDate(r.date) : '—'} · {r.restock ? (r.po ? 'Restock arrived' : 'From warehouse stock') : 'Warehouse check'}
                          {r.stock !== null && <> · stock then {lineQtyLabel(item, r.stock)}</>} — nothing reserved
                        </p>
                      )
                      const k = shown.slice(0, i).filter(x => x.reserved > 0).length
                      const t = trOf(r.tr)
                      const stage = t ? TR_STAGE[t.status] : null
                      return (
                        <div key={r.key} className="px-3 py-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-muted text-[10px] font-bold flex items-center justify-center">{k + 1}</span>
                              <div className="min-w-0">
                                <p className="text-sm">
                                  Batch {k + 1} · <span className="font-semibold tabular-nums">{lineQtyLabel(item, r.reserved)}</span>
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {r.restock ? (r.po ? 'Restock arrived' : 'From warehouse stock') : 'Warehouse check'}
                                  {r.stock !== null && <> · stock then {lineQtyLabel(item, r.stock)}</>}
                                  {r.po && <> · {docLink(r.po.number, onOpenPo ? () => onOpenPo(r.po!.id) : undefined)}</>}
                                  {r.tr && <> · {docLink(r.tr.number, onOpenTransfer && r.tr.id ? () => onOpenTransfer(r.tr!.id!) : undefined)}</>}
                                </p>
                              </div>
                            </div>
                            {stage && <StatusBadge tone={stage.tone} size="sm" className="shrink-0">{stage.label}</StatusBadge>}
                          </div>
                          <div className="flex gap-2 pl-7">
                            {step('Reserved', r.date)}
                            {step('Dispatched', t?.dispatchedAt ?? null)}
                            {step('Received', t?.receivedAt ?? null, t?.receivedByName)}
                          </div>
                        </div>
                      )
                    })}
                    <div className={`px-3 py-2.5 text-xs ${complete ? 'bg-success/5' : 'bg-warning/5'}`}>
                      {complete ? (
                        <span className="flex items-center gap-1.5 font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Complete — everything requested has been sent</span>
                      ) : item.warehouseDecision === 'PURCHASE' ? (
                        <span className="text-muted-foreground">Bought directly by Purchasing</span>
                      ) : (
                        <div className="flex items-start gap-1.5">
                          <Clock className="h-3.5 w-3.5 mt-px shrink-0 text-warning" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-warning">Next batch · {lineQtyLabel(item, remaining)} remaining</p>
                            <p className="text-muted-foreground mt-0.5">
                              {(item.backorderFree ?? 0) > 0 ? (
                                <>{lineQtyLabel(item, item.backorderFree!)} is free at the warehouse now — it only ships by itself when a restock arrives, so send it from stock.</>
                              ) : nextOrder?.poId && nextOrder.poNumber ? (
                                <>Restock on {docLink(nextOrder.poNumber, onOpenPo ? () => onOpenPo(nextOrder.poId!) : undefined)}
                                  {nextOrder.poStatus && <> ({PO_STATUS_LABEL[nextOrder.poStatus] ?? nextOrder.poStatus})</>}
                                  {nextOrder.poExpectedAt && <> · ETA {formatDate(nextOrder.poExpectedAt)}</>}
                                  {' '}— reserved and put on a new transfer as soon as it arrives at the warehouse.</>
                              ) : split && split.pending > 0 ? (
                                <>Waiting for Purchasing to order the restock — reserved automatically once it arrives.</>
                              ) : split && split.po > 0 ? (
                                <>Restock ordered, waiting to arrive at the warehouse — reserved automatically once it arrives.</>
                              ) : item.backorderIncoming?.length ? (
                                <>No restock of its own — already on its way to the warehouse, so it isn&apos;t bought twice. Reserved automatically once it arrives:</>
                              ) : (
                                <span className="text-destructive">Not on any restock yet — nothing is coming to the warehouse for it. Purchasing still has to order it.</span>
                              )}
                            </p>
                            {!(item.backorderFree ?? 0) && !nextOrder && !(split && (split.pending > 0 || split.po > 0)) && !!item.backorderIncoming?.length && (
                              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                {item.backorderIncoming.map(o => (
                                  <li key={`${o.kind}:${o.id}`}>
                                    {o.kind === 'PR'
                                      ? docLink(o.number, isWarehouse ? undefined : () => openLinkedRequest(o.id))
                                      : docLink(o.number, onOpenPo ? () => onOpenPo(o.id) : undefined)}
                                    {' · '}<span className="font-medium text-foreground tabular-nums">{lineQtyLabel(item, o.qty)}</span>
                                    {' · '}{o.kind === 'PR'
                                      ? <span className="text-warning">not ordered yet</span>
                                      : <>{PO_STATUS_LABEL[o.status] ?? o.status}{o.expectedAt && <> · ETA {formatDate(o.expectedAt)}</>}</>}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {canShipBackorder && (item.backorderFree ?? 0) > 0 && (item.backorderQty ?? 0) > 0 && (
                              <button onClick={() => shipBackorder(item.id!)} disabled={shippingBackorder === item.id}
                                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-50">
                                <ArrowRightLeft className="h-3.5 w-3.5" />
                                {shippingBackorder === item.id ? 'Shipping…' : `Ship ${lineQtyLabel(item, Math.min(item.backorderQty!, item.backorderFree!))} from stock now`}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {!!item.restockOrders?.length && (
                    <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs dark:border-violet-500/30 dark:bg-violet-500/10">
                      <p className="font-medium text-violet-700 dark:text-violet-300">Restock (To Be Order) for the warehouse</p>
                      <ul className="mt-1 space-y-0.5 text-muted-foreground">
                        {item.restockOrders.map((o, k) => (
                          <li key={k}>
                            <span className="font-medium text-foreground tabular-nums">{lineQtyLabel(item, o.qty)}</span>
                            {o.prId !== detail.id && <> · {docLink(o.prNumber, isWarehouse ? undefined : () => openLinkedRequest(o.prId))}</>}
                            {' → '}
                            {o.poId && o.poNumber
                              ? <>{docLink(o.poNumber, onOpenPo ? () => onOpenPo(o.poId!) : undefined)}{o.poStatus && <span className="ml-1">({PO_STATUS_LABEL[o.poStatus] ?? o.poStatus})</span>}{o.poExpectedAt && o.poStatus !== 'RECEIVED' && <> · ETA {formatDate(o.poExpectedAt)}</>}</>
                              : <span className="text-warning">not ordered yet</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            }
            // Warehouse's modal for one line: pick the source warehouse, type the Reserve (capped at
            // Current Stock there) and see Ending / Shortage / To Be Order update live, then Process.
            const stockModal = (item: typeof sortedItems[number]) => {
              const sc = item.stockCheck ?? null
              const isRejected = !!item.verifyRejectedAt
              const isCustom = !item.itemId
              const canDecide = !isWarehouse && ['DRAFT', 'ON_PROCESS'].includes(detail.status) && !item.convertedAt
              const pending = !isRejected && !isCustom && !!item.viaWarehouse && !item.warehouseDecision && !item.convertedAt
              const photos = Array.isArray(item.imageKeys) ? item.imageKeys : []
              const busy = warehouseBusyItemId === item.id
              // Reserve is typed in the line's unit (bottle when requested in bottles), sent in base units.
              const conv = item.conversionFactor || 1
              const inPurchase = showsInPurchaseUnit(item)
              const unitLabel = (inPurchase ? item.purchaseUnit : item.baseUnit) ?? ''
              const toDisplay = (n: number) => Math.floor((inPurchase ? n / conv : n) * 100 + 1e-6) / 100
              const toBase = (n: number) => inPurchase ? n * conv : n
              const warehouseLocations = locations.filter(l => l.type === 'WAREHOUSE' && l.id !== detail.deliveryLocationId)
              const approved = !!item.warehouseApprovedAt
              const defaultFrom = item.warehouseFromLocationId ?? sc?.locationId ?? item.warehouseStock?.slice().sort((x, y) => y.qty - x.qty)[0]?.locationId ?? ''
              const homeId = detail.warehouseHomeLocationId ?? null
              const fromValue = homeId ?? warehouseFrom[item.id!] ?? defaultFrom
              // Full breakdown is only known for the warehouse stockCheck ran against.
              const scHere = sc && sc.locationId === fromValue ? sc : null
              const maxBase = scHere ? scHere.availability : (item.warehouseStock?.find(w => w.locationId === fromValue)?.qty ?? null)
              const requestedBase = sc?.requested ?? toBase(item.quantity)
              const suggested = approved && item.warehouseFromLocationId === fromValue && item.warehouseReserveQty != null
                ? item.warehouseReserveQty
                : scHere ? scHere.reserve : Math.min(requestedBase, maxBase ?? 0)
              const reserveStr = warehouseReserve[item.id!] ?? String(toDisplay(suggested))
              const typed = reserveStr.trim() === '' ? NaN : Number(reserveStr)
              let reserveBase = toBase(typed)
              // The display rounds down to 2 decimals — typing that shown max still means "all of it".
              if (maxBase !== null && reserveBase > maxBase && typed <= toDisplay(maxBase) + 1e-9) reserveBase = maxBase
              const overMax = maxBase !== null && reserveBase > maxBase + 1e-6
              const invalid = !Number.isFinite(reserveBase) || reserveBase < 0 || overMax
              const live = pending && scHere && !invalid ? (() => {
                const ending = Math.max(0, scHere.availability - reserveBase)
                const shortage = Math.max(0, scHere.requested - reserveBase)
                const toBeOrder = Math.max(0, shortage + scHere.minStock - ending)
                return { ...scHere, reserve: reserveBase, ending, shortage, toBeOrder }
              })() : null
              const fig = live ?? (pending ? scHere : sc)
              const qty = (n: number) => lineQty(item, n)
              const stat = (label: string, value: number | null, cls = '', title?: string, highlight = false) => (
                <div title={title} className={`rounded-lg border px-3 py-2.5 ${highlight ? 'bg-info/5 border-info/30' : 'bg-muted/20'}`}>
                  <p className={`text-[10px] font-medium uppercase tracking-wide ${highlight ? 'text-info' : 'text-muted-foreground'}`}>{label}</p>
                  <p className={`mt-0.5 text-base font-semibold tabular-nums ${value === null ? 'text-muted-foreground/50' : cls}`}>{value === null ? '—' : qty(value)}</p>
                </div>
              )
              const muted = (n: number) => n === 0 ? 'text-muted-foreground/60' : ''
              const sectionLabel = 'text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2'
              return (
                <>
                  <div className="flex items-start gap-3 px-5 py-4 border-b">
                    {photos[0] ? (
                      <img src={photos[0]} alt={item.itemName} onClick={() => openLightbox(photos, 0, item.itemName)}
                        className="w-14 h-14 shrink-0 rounded-lg object-cover border cursor-zoom-in" />
                    ) : (
                      <div className="w-14 h-14 shrink-0 rounded-lg border bg-muted/50 flex items-center justify-center">
                        <Package className="h-6 w-6 text-muted-foreground/60" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold leading-snug">{item.itemName}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Requested <span className="font-semibold text-foreground tabular-nums">{item.quantity} {item.unit ?? item.purchaseUnit ?? item.itemUnit}</span>
                        {item.baseUnit && item.purchaseUnit && item.baseUnit !== item.purchaseUnit && item.conversionFactor
                          ? ` (${item.quantity * item.conversionFactor} ${item.baseUnit})` : ''}
                      </p>
                      {item.supplierName && <p className="text-xs text-muted-foreground mt-0.5">Supplier: {item.supplierName}</p>}
                      {item.requestType === 'REPLACEMENT' && item.damageDetail && (
                        <p className="text-xs text-destructive/80 mt-1 whitespace-pre-line"><span className="font-semibold">Damage:</span> {item.damageDetail}</p>
                      )}
                      {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
                    </div>
                    <button onClick={() => setStockItemId(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
                  </div>

                  <div className="p-5 space-y-5">
                    {pending && approved && (
                      <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>
                          Approved by Warehouse{item.warehouseApprovedAt && <> · {formatDate(item.warehouseApprovedAt, 'datetime')}</>} — reserve {lineQtyLabel(item, item.warehouseReserveQty ?? 0)}.
                          <span className="text-success/80"> Change it below and save again, or undo.</span>
                        </span>
                      </div>
                    )}
                    {pending ? (
                      <>
                        <div>
                          <p className={sectionLabel}>Take from</p>
                          {homeId ? (
                            <p className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              {locations.find(l => l.id === homeId)?.name ?? sc?.locationName ?? 'Warehouse'}
                            </p>
                          ) : (
                          <div className="relative">
                            <select
                              className="w-full appearance-none text-sm pl-3 pr-8 py-2 rounded-md border bg-card cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                              value={fromValue}
                              onChange={e => {
                                setWarehouseFrom(f => ({ ...f, [item.id!]: e.target.value }))
                                setWarehouseReserve(r => { const next = { ...r }; delete next[item.id!]; return next })
                              }}
                            >
                              <option value="">Select warehouse…</option>
                              {warehouseLocations.map(loc => {
                                const hint = item.warehouseStock?.find(w => w.locationId === loc.id)
                                return <option key={loc.id} value={loc.id}>{loc.name}{hint ? ` (stock: ${lineQtyLabel(item, hint.qty)})` : ''}</option>
                              })}
                            </select>
                            <ChevronDown className="h-4 w-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
                          </div>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {stat('Current Stock', maxBase, maxBase === 0 ? 'text-destructive' : '', 'Free stock at this warehouse (on hand − reserved by other requests)')}
                          {stat('Min. Stock', scHere?.minStock ?? null, 'text-muted-foreground')}
                          {stat('Requested', requestedBase)}
                        </div>

                        <div className="rounded-lg border p-4 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <label htmlFor={`reserve-${item.id}`} className="text-sm font-medium">Reserve for this request</label>
                            {maxBase !== null && (
                              <span className="text-xs text-muted-foreground">Max <span className="font-medium text-foreground">{lineQtyLabel(item, maxBase)}</span></span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <input
                                id={`reserve-${item.id}`} type="number" inputMode="decimal" min={0} step="any"
                                max={maxBase !== null ? toDisplay(maxBase) : undefined}
                                className={`w-full text-base font-semibold tabular-nums border rounded-md pl-3 pr-16 py-2 focus:outline-none focus:ring-1 ${overMax ? 'border-destructive focus:ring-destructive' : 'focus:ring-ring'}`}
                                value={reserveStr}
                                onChange={e => setWarehouseReserve(r => ({ ...r, [item.id!]: e.target.value }))}
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">{unitLabel}</span>
                            </div>
                            {maxBase !== null && (
                              <button type="button" onClick={() => setWarehouseReserve(r => ({ ...r, [item.id!]: String(toDisplay(Math.min(maxBase, requestedBase))) }))}
                                className="text-xs font-medium px-3 py-2.5 rounded-md border hover:bg-muted whitespace-nowrap">
                                Requested
                              </button>
                            )}
                          </div>
                          {overMax ? (
                            <p className="text-xs text-destructive">Reserve can&apos;t be more than the current stock ({lineQtyLabel(item, maxBase!)}).</p>
                          ) : !Number.isFinite(reserveBase) || reserveBase < 0 ? (
                            <p className="text-xs text-destructive">Enter a quantity (0 or more).</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {reserveBase > 0
                                ? <>On Process: send <span className="font-semibold text-foreground">{lineQtyLabel(item, reserveBase)}</span>{reserveBase < requestedBase && <> · backorder <span className="font-semibold text-destructive">{lineQtyLabel(item, requestedBase - reserveBase)}</span></>}</>
                                : <span className="font-medium text-warning">On Process: nothing from stock → backorder <span className="font-semibold text-destructive">{lineQtyLabel(item, requestedBase)}</span>, shipped from the warehouse after restock</span>}
                            </p>
                          )}
                        </div>

                        {(() => {
                          // Nothing is ordered before Process, so the whole To Be Order is still Pending.
                          const po = item.toBeOrderSplit?.po ?? (fig ? 0 : null)
                          const pendingQty = item.toBeOrderSplit?.pending ?? fig?.toBeOrder ?? null
                          return (
                            <div className="grid grid-cols-3 gap-2">
                              {stat('To Be Order', fig?.toBeOrder ?? null, fig && fig.toBeOrder > 0 ? 'text-info' : muted(0), '(Requested − Current Stock) + Min. Stock − already on its way to the warehouse — Purchasing buys it into the warehouse, then the backorder ships from there', true)}
                              {stat('PO', po, po ? 'text-success' : muted(0), 'To Be Order already on a Purchase Order')}
                              {stat('Pending', pendingQty, pendingQty ? 'text-warning' : muted(0), 'To Be Order not ordered yet')}
                            </div>
                          )
                        })()}

                        <div>
                          <p className={sectionLabel}>Note</p>
                          <input
                            type="text" placeholder="Optional"
                            className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
                            value={warehouseNote[item.id!] ?? item.warehouseCheckNote ?? ''}
                            onChange={e => setWarehouseNote(n => ({ ...n, [item.id!]: e.target.value }))}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="rounded-lg border px-4 py-3 text-sm">
                          {isRejected ? (
                            <div className="space-y-1">
                              <StatusBadge tone="destructive" size="sm">Rejected</StatusBadge>
                              {item.verifyRejectionReason && <p className="text-xs text-muted-foreground">{item.verifyRejectionReason}</p>}
                            </div>
                          ) : !item.viaWarehouse || isCustom ? (
                            <span className="text-muted-foreground">{isCustom ? 'Custom request — goes' : 'Goes'} straight to Purchasing, no warehouse check needed.</span>
                          ) : item.warehouseDecision === 'PURCHASE' ? (
                            <StatusBadge tone="warning" size="sm">Nothing from stock — sent to Purchasing</StatusBadge>
                          ) : (
                            <div className="space-y-1">
                              {item.transfer && <TransferBadge transfer={item.transfer} onOpen={onOpenTransfer} />}
                              <BackorderBadge item={item} />
                            </div>
                          )}
                          {item.warehouseCheckNote && <p className="text-xs text-muted-foreground mt-1.5">Note: {item.warehouseCheckNote}</p>}
                        </div>
                        {reservationLog(item)}
                        {sc && (
                          <div>
                            <p className={sectionLabel}>Stock at {sc.locationName}</p>
                            {stockBreakdown(item)}
                          </div>
                        )}
                        {isCustom && (
                          <button onClick={() => openEditItem(item)} className="text-xs text-info hover:underline underline-offset-2">View item details</button>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 px-5 py-4 border-t bg-muted/20">
                    <div>
                      {canDecide && (isRejected ? (
                        <button onClick={() => setItemVerifyDecision(item, false)} className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2">
                          Undo reject
                        </button>
                      ) : (
                        <button onClick={() => openRejectItemModal(item)}
                          className="text-sm font-medium px-3 py-2 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors">
                          Reject item
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setStockItemId(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">
                        {pending ? 'Cancel' : 'Close'}
                      </button>
                      {pending && approved && (
                        <button disabled={busy} onClick={() => warehouseUnapproveItem(item)}
                          className="px-4 py-2 text-sm border rounded-md text-muted-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed">
                          Undo approval
                        </button>
                      )}
                      {pending && (
                        <button
                          disabled={busy || !fromValue || invalid}
                          onClick={() => warehouseApproveItem(item, reserveBase)}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-success text-success-foreground hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Check className="h-4 w-4" /> {busy ? 'Saving…' : approved ? 'Save approval' : 'Approve'}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )
            }
            // Short line status for the Warehouse list (the controls themselves live in the modal).
            const checkStatus = (item: typeof sortedItems[number]) =>
              item.verifyRejectedAt ? <StatusBadge tone="destructive" size="sm">Rejected</StatusBadge>
                : !item.viaWarehouse ? <StatusBadge tone="neutral" size="sm">Direct to Purchasing</StatusBadge>
                : item.warehouseDecision === 'PURCHASE' ? <StatusBadge tone="warning" size="sm">Sent to Purchasing</StatusBadge>
                : item.convertedAt && item.warehouseDecision === 'TRANSFER' ? (
                  (item.backorderQty ?? 0) > 0
                    ? <StatusBadge tone="warning" size="sm">{(item.sentFromStock ?? 0) > 0 ? 'Partly sent' : 'Backordered'} · {lineQtyLabel(item, item.backorderQty!)} remaining</StatusBadge>
                    : <StatusBadge tone="success" size="sm"><Check className="h-3 w-3" /> Complete</StatusBadge>
                )
                : item.warehouseApprovedAt ? <StatusBadge tone="success" size="sm"><Check className="h-3 w-3" /> Approved · reserve {lineQtyLabel(item, item.warehouseReserveQty ?? 0)}</StatusBadge>
                : null
            // Purchasing / requester view: same card list, everything else in the item modal.
            const lineCtx = (item: typeof sortedItems[number]) => {
              const isCustom = !item.itemId
              // Already sent out of warehouse stock via a Transfer — nothing left for
              // Purchasing to pick (supplier, fulfillment, room), so those show the transfer.
              const transferred = !!item.convertedAt && !item.convertedPoId && (item.warehouseDecision === 'TRANSFER' || !!item.transfer)
              return {
                isCustom, transferred,
                isRejected: !!item.verifyRejectedAt,
                editable: detail.status === 'ON_PROCESS' && !isWarehouse,
                canDecide: !isWarehouse && ['DRAFT', 'ON_PROCESS'].includes(detail.status) && !item.convertedAt,
                chosenFromLocationId: fulfillment[item.id!] ?? null,
                poNumber: item.convertedPoId ? poNumberMap.get(item.convertedPoId) ?? null : null,
                // Parallel PR: Purchasing sees this line but Warehouse hasn't released it yet.
                awaiting: detail.status === 'ON_PROCESS' && !isWarehouse && isAwaitingWarehouse(item, detail),
              }
            }
            const requestedLabel = (item: typeof sortedItems[number]) => (
              <>
                <span className="font-semibold text-foreground tabular-nums">{item.quantity} {item.unit ?? item.purchaseUnit ?? item.itemUnit}</span>
                {item.baseUnit && item.purchaseUnit && item.baseUnit !== item.purchaseUnit && item.conversionFactor
                  ? ` (${item.quantity * item.conversionFactor} ${item.baseUnit})` : ''}
              </>
            )
            const supplierContent = (item: typeof sortedItems[number]) => {
              const c = lineCtx(item)
              return c.awaiting ? (
                <StatusBadge tone="info" size="sm">Waiting for Warehouse</StatusBadge>
              ) : c.transferred ? (
                <div className="space-y-1">
                  <TransferBadge transfer={item.transfer} onOpen={onOpenTransfer} />
                  {(detail.status !== 'ON_PROCESS' || isWarehouse) && <BackorderBadge item={item} />}
                </div>
              ) : detail.status !== 'ON_PROCESS' || isWarehouse ? (
                <>
                  {item.supplierName ?? <span className="text-muted-foreground/50 italic">—</span>}
                  {item.transferEligible && !item.convertedAt && !!item.warehouseStock?.length && detail.deliveryLocation?.type !== 'WAREHOUSE' && (
                    <p className="text-[10px] text-info mt-0.5">
                      Possible transfer from {item.warehouseStock[0].locationName}
                      {item.warehouseStock.length > 1 ? ` +${item.warehouseStock.length - 1} more` : ''}
                    </p>
                  )}
                </>
              ) : c.chosenFromLocationId ? (
                <span className="text-xs text-muted-foreground/60 italic">— (transfer, no supplier needed)</span>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => openEditItem(item)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${
                      item.supplierName ? 'bg-card text-foreground border-border hover:bg-muted' : 'bg-warning/10 text-warning border-warning/30 hover:bg-warning/20'
                    }`}
                  >
                    {item.supplierName ?? 'Select supplier…'}
                  </button>
                  {item.convertedAt ? (
                    <StatusBadge tone="neutral" size="sm">Converted</StatusBadge>
                  ) : getBand(item.estimatedCost) !== 'A' && (
                    item.quotationApprovedAt ? (
                      <StatusBadge tone="success" size="sm">Approved</StatusBadge>
                    ) : item.quotationRejectedAt ? (
                      <StatusBadge tone="destructive" size="sm">Rejected</StatusBadge>
                    ) : item.quotationSubmittedAt ? (
                      <StatusBadge tone="warning" size="sm">Pending approval</StatusBadge>
                    ) : null
                  )}
                </div>
              )
            }
            const poButton = (item: typeof sortedItems[number]) => {
              const poNumber = lineCtx(item).poNumber
              if (!poNumber) return null
              return onOpenPo ? (
                <button
                  onClick={() => onOpenPo(item.convertedPoId!)}
                  className="text-xs font-medium text-success bg-success/10 border border-success/30 rounded-md px-2 py-1 hover:bg-success/20 transition-colors whitespace-nowrap"
                >
                  {poNumber}
                </button>
              ) : (
                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{poNumber}</span>
              )
            }
            const fulfillmentContent = (item: typeof sortedItems[number]) => {
              const c = lineCtx(item)
              return c.awaiting ? (
                <span className="text-xs text-muted-foreground italic">Warehouse is checking stock</span>
              ) : c.transferred ? (
                <div className="space-y-1">
                  {item.transfer && <span className="block text-xs text-info">Transfer from {item.transfer.fromLocationName}</span>}
                  <BackorderBadge item={item} />
                </div>
              ) : item.restockLocationId ? (
                <span className="text-sm text-muted-foreground">Purchase Order → delivered to <span className="font-medium text-foreground">{item.restockLocation?.name ?? 'the warehouse'}</span></span>
              ) : item.warehouseDecision === 'PURCHASE' || !item.transferEligible || !item.warehouseStock?.length ? (
                <span className="text-sm text-muted-foreground" title={item.warehouseDecision === 'PURCHASE' ? 'Warehouse checked physically — no stock' : undefined}>Purchase Order</span>
              ) : (
                <div className="relative">
                  <select
                    className={`w-full appearance-none text-sm font-medium pl-3 pr-8 py-2 rounded-md border cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-ring ${
                      c.chosenFromLocationId ? 'bg-info/10 text-info border-info/30 hover:bg-info/20' : 'bg-card text-muted-foreground border-border hover:bg-muted'
                    }`}
                    value={c.chosenFromLocationId ?? ''}
                    onChange={e => setFulfillment(f => ({ ...f, [item.id!]: e.target.value || null }))}
                  >
                    <option value="">Purchase Order</option>
                    {item.warehouseStock.map(w => (
                      <option key={w.locationId} value={w.locationId}>Transfer from {w.locationName} ({lineQtyLabel(item, w.qty)})</option>
                    ))}
                  </select>
                  <ChevronDown className={`h-4 w-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${c.chosenFromLocationId ? 'text-info' : 'text-muted-foreground'}`} />
                </div>
              )
            }
            const onShipContent = (item: typeof sortedItems[number]) => {
              const c = lineCtx(item)
              if (c.chosenFromLocationId || c.transferred) return <span className="text-xs text-muted-foreground/60 italic">— (transfer, not needed)</span>
              return (
                <div className="space-y-2">
                  {c.isCustom ? (
                    <select
                      className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring bg-card"
                      value={roomAssignment[item.id!]?.treatment ?? 'CONSUMABLE'}
                      onChange={e => setRoomAssignment(a => ({ ...a, [item.id!]: { roomId: a[item.id!]?.roomId ?? '', categoryId: a[item.id!]?.categoryId ?? '', treatment: e.target.value as Treatment } }))}
                    >
                      {TREATMENTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  ) : (
                    <p className="text-sm" title="Set on the item in Items & Pricing">{TREATMENT_LABEL[lineTreatmentOf(item)]}</p>
                  )}
                  {lineTreatmentOf(item) === 'ASSET' && (
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className="text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring bg-card"
                        value={roomAssignment[item.id!]?.roomId ?? ''}
                        onChange={e => setRoomAssignment(a => ({ ...a, [item.id!]: { ...a[item.id!], roomId: e.target.value, categoryId: '' } }))}
                      >
                        <option value="">Room…</option>
                        {invRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <select
                        className="text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring bg-card disabled:opacity-50"
                        value={roomAssignment[item.id!]?.categoryId ?? ''}
                        disabled={!roomAssignment[item.id!]?.roomId}
                        onChange={e => setRoomAssignment(a => ({ ...a, [item.id!]: { ...a[item.id!], roomId: a[item.id!]?.roomId ?? '', categoryId: e.target.value } }))}
                      >
                        <option value="">Category…</option>
                        {(invCategoriesByRoom[roomAssignment[item.id!]?.roomId ?? ''] ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )
            }
            // One-line status for a Purchasing card (details live in the modal).
            const lineStatus = (item: typeof sortedItems[number]) => {
              const c = lineCtx(item)
              if (c.isRejected) return <StatusBadge tone="destructive" size="sm">Rejected</StatusBadge>
              if (c.awaiting) return <StatusBadge tone="info" size="sm">Waiting for Warehouse</StatusBadge>
              if (c.transferred) return (
                <>
                  <StatusBadge tone="info" size="sm"><ArrowRightLeft className="h-3 w-3" /> {item.transfer?.transferNumber ?? 'Transfer'}</StatusBadge>
                  {(item.backorderQty ?? 0) > 0
                    ? <StatusBadge tone="warning" size="sm">{lineQtyLabel(item, item.backorderQty!)} remaining</StatusBadge>
                    : <StatusBadge tone="success" size="sm"><Check className="h-3 w-3" /> Complete</StatusBadge>}
                </>
              )
              if (c.poNumber) return <StatusBadge tone="success" size="sm">{c.poNumber}</StatusBadge>
              if (c.chosenFromLocationId) return <StatusBadge tone="info" size="sm">Transfer from {item.warehouseStock?.find(w => w.locationId === c.chosenFromLocationId)?.locationName ?? 'warehouse'}</StatusBadge>
              if (c.editable && !item.supplierName) return <StatusBadge tone="warning" size="sm">Select supplier</StatusBadge>
              if (item.supplierName) return <span className="text-[11px] text-muted-foreground truncate max-w-full">{item.supplierName}</span>
              return null
            }
            const itemModal = (item: typeof sortedItems[number]) => {
              const c = lineCtx(item)
              const photos = Array.isArray(item.imageKeys) ? item.imageKeys : []
              const stock = item.currentStock ?? null
              const min = item.minStock ?? 0
              const stockColor = stock === null ? '' : stock === 0 ? 'text-destructive' : stock < min ? 'text-warning' : 'text-success'
              const split = item.toBeOrderSplit
              const withStock = showStockCols && !!item.viaWarehouse && !!item.itemId
              const sectionLabel = 'text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2'
              const stat = (label: string, value: number | null, cls = '', opts: { sub?: string; title?: string; highlight?: boolean } = {}) => (
                <div title={opts.title} className={`rounded-lg border px-3 py-2.5 ${opts.highlight ? 'bg-info/5 border-info/30' : 'bg-muted/20'}`}>
                  <p className={`text-[10px] font-medium uppercase tracking-wide ${opts.highlight ? 'text-info' : 'text-muted-foreground'}`}>{label}</p>
                  <p className={`mt-0.5 text-base font-semibold tabular-nums ${value === null ? 'text-muted-foreground/50' : value === 0 ? 'text-muted-foreground/60' : cls}`}>{value === null ? '—' : lineQty(item, value)}</p>
                  {opts.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{opts.sub}</p>}
                </div>
              )
              return (
                <>
                  <div className="flex items-start gap-3 px-5 py-4 border-b">
                    {photos[0] ? (
                      <img src={photos[0]} alt={item.itemName} onClick={() => openLightbox(photos, 0, item.itemName)}
                        className="w-14 h-14 shrink-0 rounded-lg object-cover border cursor-zoom-in" />
                    ) : (
                      <div className="w-14 h-14 shrink-0 rounded-lg border bg-muted/50 flex items-center justify-center">
                        <Package className="h-6 w-6 text-muted-foreground/60" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className={`font-semibold leading-snug ${c.isRejected ? 'line-through text-muted-foreground' : ''}`}>{item.itemName}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">{item.restockLocationId ? 'To order' : 'Requested'} {requestedLabel(item)}</p>
                      {item.restockLocationId && (
                        <p className="text-xs text-muted-foreground mt-0.5">To Be Order from the warehouse check — bought for {item.restockLocation?.name ?? 'the warehouse'}; any shortage for the ship is sent from it on arrival.</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {item.restockLocationId && <span className="text-[10px] font-medium text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full dark:text-violet-300 dark:bg-violet-500/10 dark:border-violet-500/30">Restock → {item.restockLocation?.name ?? 'Warehouse'}</span>}
                        {c.isCustom && <span className="text-[10px] font-medium text-warning bg-warning/10 px-1.5 py-0.5 rounded-full">Custom request</span>}
                        {mixedRoute && (item.viaWarehouse
                          ? <span className="text-[10px] font-medium text-info bg-info/10 px-1.5 py-0.5 rounded-full">Via Warehouse</span>
                          : <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">Direct</span>)}
                        {item.requestType === 'REPLACEMENT' && <span className="text-[10px] font-medium text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">Replacement</span>}
                        {c.isRejected ? <StatusBadge tone="destructive" size="sm" title={item.verifyRejectionReason || undefined}>Rejected</StatusBadge>
                          : ['DRAFT', 'ON_PROCESS'].includes(detail.status) && !c.canDecide && <StatusBadge tone="success" size="sm">Accepted</StatusBadge>}
                      </div>
                      {c.isRejected && item.verifyRejectionReason && <p className="text-xs text-muted-foreground mt-1">Reason: {item.verifyRejectionReason}</p>}
                      {item.requestType === 'REPLACEMENT' && item.damageDetail && (
                        <p className="text-xs text-destructive/80 mt-1 whitespace-pre-line"><span className="font-semibold">Damage:</span> {item.damageDetail}</p>
                      )}
                      {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
                      {photos.length > 1 && (
                        <div className="flex gap-1.5 mt-2">
                          {photos.slice(1, 6).map((src, j) => (
                            <img key={j} src={src} alt={`${item.itemName} reference ${j + 2}`} onClick={() => openLightbox(photos, j + 1, item.itemName)}
                              className="w-9 h-9 rounded-md object-cover border cursor-zoom-in hover:opacity-80" />
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => setStockItemId(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
                  </div>

                  <div className="p-5 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className={sectionLabel}>Supplier</p>
                        <div className="text-sm">{supplierContent(item)}</div>
                      </div>
                      {c.poNumber && (
                        <div>
                          <p className={sectionLabel}>Purchase Order</p>
                          {poButton(item)}
                        </div>
                      )}
                    </div>

                    {(stock !== null || withStock) && (
                      <div>
                        <p className={sectionLabel}>Stock{item.stockCheck?.locationName ? ` at ${item.stockCheck.locationName}` : ''}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {stat('Current Stock', stock, stockColor, {
                            sub: item.reservedStock ? `${lineQtyLabel(item, item.onHandStock ?? 0)} on hand · ${lineQtyLabel(item, item.reservedStock)} reserved` : undefined,
                            title: 'Free stock = on hand − reserved by pending transfers',
                          })}
                          {withStock && stat('Min. Stock', item.minStock ?? 0, 'text-muted-foreground')}
                          {withStock && stat('Reserve', item.sentFromStock ?? null, 'text-warning', { title: 'Sent from warehouse stock' })}
                          {withStock && stat('To Be Order', split ? split.po + split.pending + (split.received ?? 0) : null, 'text-info', { highlight: true })}
                          {withStock && stat('PO', split?.po ?? null, 'text-success', { title: 'To Be Order on a Purchase Order, not arrived yet', sub: split?.received ? `${lineQtyLabel(item, split.received)} arrived → Current Stock` : undefined })}
                          {withStock && stat('Pending', split?.pending ?? null, 'text-warning', { title: 'To Be Order not ordered yet' })}
                        </div>
                      </div>
                    )}

                    {reservationLog(item)}

                    {detail.status === 'ON_PROCESS' && !isWarehouse && (
                      <div>
                        <p className={sectionLabel}>Fulfillment</p>
                        {fulfillmentContent(item)}
                      </div>
                    )}

                    {detail.status === 'ON_PROCESS' && !isWarehouse && detail.deliveryLocation?.type === 'VESSEL' && !item.restockLocationId && (
                      <div>
                        <p className={sectionLabel} title="Consumable = trip usage · Asset = ship Inventory (needs Room/Category) · Spare part = maintenance">On the ship</p>
                        {onShipContent(item)}
                      </div>
                    )}

                    {item.warehouseCheckNote && <p className="text-xs text-muted-foreground">Warehouse note: {item.warehouseCheckNote}</p>}
                  </div>

                  <div className="flex items-center justify-between gap-2 px-5 py-4 border-t bg-muted/20">
                    <div>
                      {c.canDecide && (c.isRejected ? (
                        <button onClick={() => setItemVerifyDecision(item, false)} className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2">
                          Undo reject
                        </button>
                      ) : (
                        <button onClick={() => openRejectItemModal(item)}
                          className="text-sm font-medium px-3 py-2 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors">
                          Reject item
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setStockItemId(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Close</button>
                      {((c.editable && !c.transferred) || c.isCustom) && (
                        <button onClick={() => openEditItem(item)}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                          <Pencil className="h-3.5 w-3.5" /> {c.editable && !c.transferred ? 'Edit price / supplier' : 'View item details'}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )
            }
            // Where each line stands, so an On Process PR reads as "what's left to do" at a glance.
            type Stage = 'purchase' | 'warehouse' | 'waiting' | 'ordered' | 'sent' | 'rejected'
            const lineStage = (item: typeof sortedItems[number]): Stage => {
              const c = lineCtx(item)
              if (c.isRejected) return 'rejected'
              if (c.awaiting) return 'warehouse'
              if (c.transferred) return (item.backorderQty ?? 0) > 0 ? 'waiting' : 'sent'
              if (c.poNumber) return 'ordered'
              return 'purchase'
            }
            const STAGES: { key: Stage; label: string; hint: string; dot: string }[] = [
              { key: 'purchase', label: 'To purchase', hint: 'Pick a supplier, then Convert to PO', dot: 'bg-warning' },
              { key: 'warehouse', label: 'Warehouse checking', hint: 'Warehouse is checking its stock', dot: 'bg-info' },
              { key: 'waiting', label: 'Partly sent — rest waiting for restock', hint: 'Shipped automatically once the restock arrives at the warehouse', dot: 'bg-warning' },
              { key: 'ordered', label: 'Ordered', hint: 'On a Purchase Order', dot: 'bg-info' },
              { key: 'sent', label: 'Sent from warehouse', hint: 'Fully covered by warehouse stock (reserved = PR)', dot: 'bg-success' },
              { key: 'rejected', label: 'Rejected', hint: '', dot: 'bg-destructive' },
            ]
            const grouped = ['ON_PROCESS', 'CONVERTED'].includes(detail.status)
            const shipLines = sortedItems.filter(it => !it.restockLocationId)
            const restockLines = sortedItems.filter(it => !!it.restockLocationId)
            const stockItem = stockItemId ? sortedItems.find(it => it.id === stockItemId) ?? null : null
            return (
              <div className={`grid grid-cols-1 gap-6 items-start ${hideTimeline ? '' : 'lg:grid-cols-[1fr_300px]'}`}>
                <div className="space-y-6 min-w-0">
                {(() => {
                  const waiting = sortedItems.filter(it => (it.backorderQty ?? 0) > 0)
                  if (!waiting.length || ['CANCELLED', 'REJECTED'].includes(detail.status)) return null
                  return (
                    <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
                      <p className="font-medium text-warning flex items-center gap-1.5">
                        <Clock className="h-4 w-4" /> Outstanding — {waiting.length} {waiting.length === 1 ? 'item is' : 'items are'} only partly sent
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        The rest ships automatically: once the restock arrives at the warehouse a transfer is created and Warehouse is notified to dispatch it.
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {waiting.map((it, k) => (
                          <li key={it.id ?? k} className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-medium">{it.itemName}</span>
                            <BackorderBadge item={it} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })()}
                <div className="rounded-lg border overflow-hidden min-w-0">
                  <div className="px-5 py-3 bg-muted/50 border-b flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Item List</p>
                    {(detail.restockRequests?.length || detail.restockFor) ? (
                      <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <span className="text-muted-foreground">{detail.restockFor ? 'Restock for' : 'Restock order'}</span>
                        {(detail.restockFor ? [detail.restockFor] : detail.restockRequests!).map(r => (
                          <button key={r.id} type="button"
                            onClick={() => openLinkedRequest(r.id)}
                            className="font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-md px-2 py-0.5 hover:bg-violet-100 dark:text-violet-300 dark:bg-violet-500/10 dark:border-violet-500/30 dark:hover:bg-violet-500/20">
                            {r.prNumber}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {showStockCheck && stockLocations.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Stock at <span className="font-medium text-foreground">{stockLocations.join(', ')}</span>
                        <span className="ml-1.5">· approve each item, then Process Purchase Request</span>
                      </p>
                    )}
                  </div>
                  {showStockCheck ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
                      {sortedItems.map((item, i) => {
                        const photo = Array.isArray(item.imageKeys) ? item.imageKeys[0] : undefined
                        const status = checkStatus(item)
                        return (
                          <button
                            key={item.id ?? i} type="button"
                            onClick={() => item.id && setStockItemId(item.id)}
                            className={`group flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-info/40 hover:bg-info/5 ${item.verifyRejectedAt ? 'opacity-60' : ''}`}
                          >
                            {photo ? (
                              <img src={photo} alt={item.itemName} className="w-12 h-12 shrink-0 rounded-md object-cover border" />
                            ) : (
                              <div className="w-12 h-12 shrink-0 rounded-md border bg-muted/50 flex items-center justify-center">
                                <Package className="h-5 w-5 text-muted-foreground/60" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className={`font-medium text-sm leading-snug line-clamp-2 ${item.verifyRejectedAt ? 'line-through text-muted-foreground' : ''}`}>{item.itemName}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Requested <span className="font-semibold text-foreground tabular-nums">{item.quantity} {item.unit ?? item.purchaseUnit ?? item.itemUnit}</span>
                                {item.baseUnit && item.purchaseUnit && item.baseUnit !== item.purchaseUnit && item.conversionFactor
                                  ? ` (${item.quantity * item.conversionFactor} ${item.baseUnit})` : ''}
                              </p>
                              {(status || !item.itemId || item.requestType === 'REPLACEMENT') && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {!item.itemId && <span className="text-[10px] font-medium text-warning bg-warning/10 px-1.5 py-0.5 rounded-full">Custom request</span>}
                                  {item.requestType === 'REPLACEMENT' && <span className="text-[10px] font-medium text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">Replacement</span>}
                                  {status}
                                </div>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground/50 group-hover:text-info" />
                          </button>
                        )
                      })}
                    </div>
                  ) : (() => {
                    const card = (item: typeof sortedItems[number], i: number) => {
                      const photo = Array.isArray(item.imageKeys) ? item.imageKeys[0] : undefined
                      const split = showStockCols && item.viaWarehouse && item.itemId ? item.toBeOrderSplit : null
                      const toBeOrder = split ? split.po + split.pending + (split.received ?? 0) : 0
                      const status = lineStatus(item)
                      return (
                        <button
                          key={item.id ?? i} type="button"
                          onClick={() => item.id && setStockItemId(item.id)}
                          className={`group flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-info/40 hover:bg-info/5 ${item.verifyRejectedAt ? 'opacity-60' : ''}`}
                        >
                          {photo ? (
                            <img src={photo} alt={item.itemName} className="w-12 h-12 shrink-0 rounded-md object-cover border" />
                          ) : (
                            <div className="w-12 h-12 shrink-0 rounded-md border bg-muted/50 flex items-center justify-center">
                              <Package className="h-5 w-5 text-muted-foreground/60" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className={`font-medium text-sm leading-snug line-clamp-2 ${item.verifyRejectedAt ? 'line-through text-muted-foreground' : ''}`}>{item.itemName}</p>
                            <p className="text-xs text-muted-foreground mt-1">{item.restockLocationId ? 'To order' : 'Requested'} {requestedLabel(item)}</p>
                            {toBeOrder > 0 && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                To Be Order <span className="font-semibold text-info tabular-nums">{lineQtyLabel(item, toBeOrder)}</span>
                                {split!.pending > 0 && <> · <span className="text-warning">{lineQtyLabel(item, split!.pending)} pending</span></>}
                              </p>
                            )}
                            {(status || !item.itemId || item.requestType === 'REPLACEMENT' || mixedRoute || item.restockLocationId) && (
                              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                {item.restockLocationId && <span className="text-[10px] font-medium text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full dark:text-violet-300 dark:bg-violet-500/10 dark:border-violet-500/30">Restock → {item.restockLocation?.name ?? 'Warehouse'}</span>}
                                {!item.itemId && <span className="text-[10px] font-medium text-warning bg-warning/10 px-1.5 py-0.5 rounded-full">Custom request</span>}
                                {mixedRoute && (item.viaWarehouse
                                  ? <span className="text-[10px] font-medium text-info bg-info/10 px-1.5 py-0.5 rounded-full">Via Warehouse</span>
                                  : <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">Direct</span>)}
                                {item.requestType === 'REPLACEMENT' && <span className="text-[10px] font-medium text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">Replacement</span>}
                                {status}
                              </div>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground/50 group-hover:text-info" />
                        </button>
                      )
                    }
                    const grid = (items: typeof sortedItems) => (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{items.map(card)}</div>
                    )
                    if (!grouped) return <div className="p-4">{grid(sortedItems)}</div>
                    const counts = STAGES.map(st => ({ ...st, items: shipLines.filter(it => lineStage(it) === st.key) })).filter(st => st.items.length)
                    const doneCount = shipLines.filter(it => ['sent', 'ordered', 'rejected'].includes(lineStage(it))).length
                    // Restock lines are Purchasing's to-do on this PR — on top while any is still to be
                    // ordered so it's seen without scrolling, back at the bottom once all are on a PO.
                    // (Warehouse never gets restock lines — see GET ../route.ts.)
                    const restockOpen = restockLines.filter(it => !it.convertedAt && !it.verifyRejectedAt)
                    const restockNoSupplier = restockOpen.filter(it => !it.supplierId).length
                    const restockFirst = restockOpen.length > 0
                    const restockSection = restockLines.length > 0 && (
                      <section className={`rounded-lg border p-3 dark:bg-violet-500/5 ${restockFirst ? 'border-violet-300 bg-violet-50/70 dark:border-violet-500/50' : 'border-violet-200 bg-violet-50/40 dark:border-violet-500/30'}`}>
                        <div className="mb-2 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-violet-700 dark:text-violet-300">Restock for the warehouse</h4>
                            <p className="text-xs text-muted-foreground">To Be Order from the warehouse check — buy these to {[...new Set(restockLines.map(it => it.restockLocation?.name).filter(Boolean))].join(', ') || 'the warehouse'}. When they arrive, what the vessel is still waiting for ships to it automatically.</p>
                          </div>
                          {restockFirst && (
                            <span className="shrink-0 text-xs font-medium text-violet-700 dark:text-violet-300">
                              {restockOpen.length} to order{restockNoSupplier > 0 && <span className="text-warning"> · {restockNoSupplier} need a supplier</span>}
                            </span>
                          )}
                        </div>
                        {grid(restockLines)}
                      </section>
                    )
                    return (
                      <div className="p-4 space-y-5">
                        {restockFirst && restockSection}
                        <div className="rounded-lg border bg-muted/20 px-4 py-3">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-medium">{doneCount} of {shipLines.length} items handled</span>
                            <span className="text-muted-foreground">{shipLines.length - doneCount} still open</span>
                          </div>
                          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
                            {counts.map(st => <div key={st.key} className={st.dot} style={{ width: `${(st.items.length / Math.max(1, shipLines.length)) * 100}%` }} />)}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                            {counts.map(st => (
                              <span key={st.key} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${st.dot}`} />{st.label} <span className="font-semibold text-foreground">{st.items.length}</span></span>
                            ))}
                          </div>
                        </div>
                        {counts.map(st => (
                          <section key={st.key}>
                            <div className="flex items-baseline gap-2 mb-2">
                              <span className={`h-2 w-2 rounded-full self-center ${st.dot}`} />
                              <h4 className="text-sm font-semibold">{st.label}</h4>
                              <span className="text-xs text-muted-foreground">{st.items.length}{st.hint && ` · ${st.hint}`}</span>
                            </div>
                            {grid(st.items)}
                          </section>
                        ))}
                        {!restockFirst && restockSection}
                      </div>
                    )
                  })()}
                </div>

                {(() => {
                  const isOverdue = !!detail.neededByDate && !['CONVERTED', 'REJECTED'].includes(detail.status) && new Date(detail.neededByDate) < new Date()
                  return (
                    <div className="space-y-2">
                      {isOverdue && (
                        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
                          This PR is overdue — needed by {formatDate(detail.neededByDate!)}
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Follow-ups</h3>
                        <button onClick={openFollowUpModal} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted transition-colors">
                          <Plus className="h-3.5 w-3.5" /> Log Follow-up
                        </button>
                      </div>
                      {prFollowUps.length === 0 ? (
                        <p className="text-sm text-muted-foreground/60 italic">No follow-ups logged yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {prFollowUps.map(f => (
                            <div key={f.id} className="rounded-lg border p-3 text-sm">
                              <div className="flex items-start justify-between gap-3">
                                <p className="flex-1">{f.note}</p>
                                <button onClick={() => deleteFollowUp(f.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0" title="Delete">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {f.isEscalation && (
                                  <StatusBadge tone="warning" size="sm">
                                    Escalated{f.escalatedTo?.name && ` → ${f.escalatedTo.name}`}
                                  </StatusBadge>
                                )}
                                <span className="text-xs text-muted-foreground">by {f.createdBy.name ?? '—'} · {formatDate(f.createdAt, 'datetime')}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
                </div>
                {!hideTimeline && <Timeline steps={steps} title="Timeline" onViewPhoto={setTimelinePhoto} />}
                {stockItem && (
                  <>
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setStockItemId(null)} />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                      <div className="pointer-events-auto bg-card rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
                        {showStockCheck ? stockModal(stockItem) : itemModal(stockItem)}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          })()}
        </>
      )}
      {timelinePhoto && (
        <PhotoLightbox photoKey={timelinePhoto} onClose={() => setTimelinePhoto(null)} />
      )}

      {followUpModal && detail && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setFollowUpModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-card rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div>
                  <h3 className="font-semibold">Log Follow-up</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{detail.prNumber}</p>
                </div>
                <button onClick={() => setFollowUpModal(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-4">
                {followUpError && <div className="rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm px-3 py-2">{followUpError}</div>}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Note <span className="text-destructive">*</span></label>
                  <textarea
                    autoFocus
                    rows={3}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g. Called supplier for a quotation, promised by Friday…"
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
                      className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover disabled:opacity-40 font-semibold transition-colors">
                  {followUpSaving ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</> : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Edit Item Modal (est. price / supplier, plus full detail for custom requests) ── */}
      {editItemModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
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
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2.5">
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
                              className="w-full h-9 border rounded-md px-3 text-sm text-left flex items-center justify-between gap-2 bg-background hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-background"
                            >
                              <span className={`truncate ${editItemSupplierId ? '' : 'text-muted-foreground'}`}>
                                {suppliers.find(s => s.id === editItemSupplierId)?.name || (supplierFieldDisabled ? 'Set by approver once a quotation is chosen' : 'Select or add supplier…')}
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
                          className="w-full h-9 border rounded-md px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
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
                              title={`${h.poNumber} · ${formatDate(h.orderedAt)}`}
                              className="flex items-center gap-1.5 border rounded-full pl-3 pr-2.5 py-1.5 text-xs hover:bg-warning/10 hover:border-primary/40 transition-colors"
                            >
                              <span className="font-medium">{h.supplierName ?? 'Unknown supplier'}</span>
                              <span className="text-muted-foreground">{formatMoney(h.price)}</span>
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
                          <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
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
                          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{quoteError}</div>
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
                              <div key={q.id} className={`border rounded-md p-2 text-sm space-y-1.5 transition-opacity ${isChosen ? 'border-success bg-success/10' : ''} ${isDeselected ? 'opacity-50 grayscale' : ''}`}>
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
                                      className="absolute top-1 right-1 bg-card/90 hover:bg-card text-foreground rounded-full p-1 shadow transition-colors"
                                    >
                                      <Download className="h-3 w-3" />
                                    </button>
                                    {isChosen && (
                                      <span className="absolute top-1 left-1 flex items-center gap-1 text-[10px] font-semibold text-success-foreground bg-success rounded-full px-2 py-0.5 shadow">
                                        <CheckCircle2 className="h-3 w-3" /> Chosen
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="w-full h-20 rounded border border-dashed flex items-center justify-center text-[11px] text-muted-foreground/60 italic">No document</div>
                                )}
                                <div className="flex items-center justify-between gap-2 min-w-0">
                                  <p className={`truncate ${isChosen ? 'font-semibold' : 'font-medium'}`}>{q.supplierName}</p>
                                  <span className="font-medium shrink-0">{formatMoney(q.price)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs text-muted-foreground">{formatDate(q.submittedAt)}</p>
                                  <button onClick={() => deleteQuotation(q.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Remove quotation">
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
                          <div className="space-y-1.5 rounded-md border border-dashed border-warning/30 bg-warning/5 p-2.5">
                            <p className="text-[11px] font-semibold text-warning uppercase tracking-wide">Quotations from other requests</p>
                            {quotationHistory.map((q, i) => (
                              <div key={i} className="flex items-center justify-between text-sm bg-card border rounded-md px-3 py-2">
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{q.supplierName}</p>
                                  <p className="text-xs text-muted-foreground">{q.prNumber} · {formatDate(q.submittedAt)}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-medium">{formatMoney(q.price)}</span>
                                  <button
                                    onClick={() => reuseQuotation(q)}
                                    disabled={reusingQuotation}
                                    className="text-[11px] font-medium text-warning hover:text-warning/80 border border-warning/30 rounded-md px-2 py-1 hover:bg-warning/10 transition-colors disabled:opacity-50 whitespace-nowrap"
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
                              className="w-full h-9 border rounded-md px-3 text-sm text-left bg-background hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                              <span className={`truncate block ${quoteForm.supplierName ? '' : 'text-muted-foreground'}`}>
                                {quoteForm.supplierName || 'Select supplier…'}
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
                            className="h-9 px-3 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover disabled:opacity-50 whitespace-nowrap"
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
                            {isPdfDataUrl(quoteForm.fileKey) ? <FileText className="h-3.5 w-3.5 text-destructive shrink-0" /> : <ImagePlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                            <span className="text-muted-foreground">Quotation document attached</span>
                            <button type="button" onClick={() => setQuoteForm(f => ({ ...f, fileKey: '' }))} className="text-muted-foreground hover:text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <label
                            htmlFor="quote-file-input"
                            className={`inline-flex items-center gap-1.5 text-xs border border-dashed rounded-md px-2.5 py-1.5 w-fit cursor-pointer transition-colors ${quoteFileBusy ? 'opacity-50 pointer-events-none' : 'text-warning border-warning/30 hover:text-warning/80 hover:border-warning'}`}
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
                            placeholder="Exemption reason…"
                            className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
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
                              <div className="flex items-center gap-2 text-xs text-success bg-success/10 border border-success/30 rounded-md px-3 py-2">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                Approved by {editItemModal.quotationApprovedBy?.name ?? '—'} on {formatDate(editItemModal.quotationApprovedAt)}
                              </div>
                            )
                          }
                          if (editItemModal.quotationRejectedAt) {
                            return (
                              <div className="space-y-2">
                                <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                                  <p className="font-semibold">Rejected by {editItemModal.quotationRejectedBy?.name ?? '—'}</p>
                                  {editItemModal.quotationRejectionReason && <p className="mt-0.5">{editItemModal.quotationRejectionReason}</p>}
                                </div>
                                <button onClick={submitForApproval} disabled={submitDisabled}
                                  className="w-full h-9 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover disabled:opacity-50">
                                  {submittingApproval ? 'Submitting…' : 'Resubmit for Approval'}
                                </button>
                              </div>
                            )
                          }
                          if (editItemModal.quotationSubmittedAt) {
                            return (
                              <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded-md px-3 py-2">
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                Pending approval by {editItemModal.quotationApprover?.name ?? '—'}
                              </div>
                            )
                          }
                          return (
                            <div className="space-y-1.5">
                              {quotations.length < required && <p className="text-[11px] text-muted-foreground italic">Gather {required - quotations.length} more quotation{required - quotations.length > 1 ? 's' : ''} first.</p>}
                              <button onClick={submitForApproval} disabled={submitDisabled}
                                className="w-full h-9 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover disabled:opacity-50">
                                {submittingApproval ? 'Submitting…' : 'Submit for Approval'}
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
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary-hover disabled:opacity-50 font-medium"
              >
                {editItemSaving ? 'Saving…' : 'Save'}
              </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Item modal — optional reason for excluding one item at verify triage ── */}
      {rejectItemModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden">
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
                className="w-full text-sm border rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
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
                className="px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 font-medium disabled:opacity-50"
              >
                {rejectItemSaving ? 'Rejecting…' : 'Reject Item'}
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
              <div className="pointer-events-auto bg-card rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[82vh]">
                <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
                  <h3 className="font-semibold text-base">Select Supplier</h3>
                  <button onClick={() => setSupplierModal(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
                </div>
                <div className="px-4 py-3 border-b shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <input autoFocus className="w-full h-10 border rounded-lg pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Search or type a new supplier name…" value={supplierModalSearch} onChange={e => setSupplierModalSearch(e.target.value)} />
                  </div>
                </div>
                {allCities.length > 1 && (
                  <div className="px-4 py-2 border-b shrink-0 flex gap-1.5 flex-wrap">
                    {allCities.map(c => (
                      <button key={c} onClick={() => setSupplierFilterCity(c)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${supplierFilterCity === c ? 'bg-info text-info-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
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
                      className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-warning/10 border-b last:border-0 transition-colors">
                      <div className="h-8 w-8 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4 text-warning" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{s.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {(s.locations ?? []).map((l, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-info/15 text-info text-xs rounded-full">{l.city}</span>
                          ))}
                          {s.contact && <span className="text-xs text-muted-foreground">{s.contact}</span>}
                        </div>
                      </div>
                      {(supplierModal === 'editItem' ? editItemSupplierId === s.id : quoteForm.supplierId === s.id) && <Check className="h-4 w-4 text-warning shrink-0" />}
                    </button>
                  ))}
                  {supplierModalSearch.trim() && !suppliers.some(s => s.name.toLowerCase() === supplierModalSearch.toLowerCase()) && (
                    <button onClick={() => quickAddSupplier(supplierModalSearch.trim()).then(() => setSupplierModal(null))}
                      className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-success/10 transition-colors border-t">
                      <div className="h-8 w-8 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                        <Plus className="h-4 w-4 text-success" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-success">Add &quot;{supplierModalSearch.trim()}&quot;</p>
                        <p className="text-xs text-success">Create as new supplier</p>
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
              className="flex items-center gap-1.5 bg-card text-foreground text-sm font-medium px-3 py-1.5 rounded-full hover:bg-card/90 transition-colors"
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
              <div className="bg-card rounded-xl shadow-2xl overflow-hidden w-[90vw] max-w-2xl">
                <embed src={quoteFileLightbox} type="application/pdf" className="w-full h-[75vh]" />
                <div className="p-3 flex justify-center">
                  <a href={quoteFileLightbox} target="_blank" rel="noopener noreferrer" className="text-sm text-warning hover:text-warning/80 font-medium underline underline-offset-2">
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
  purpose, setPurpose, trip, setTrip, trips,
  cart, cartOpen, setCartOpen,
  addToCart, changeCartQty, removeCartLine, updateCartLine,
  catalogSearch, setCatalogSearch,
  catalogType, setCatalogType,
  catalogCategory, setCatalogCategory,
  catalogSource, setCatalogSource, invLocationId, setInvLocationId,
  invRoomId, setInvRoomId, invCategoryId, setInvCategoryId, invSearch, setInvSearch,
  invRooms, invCategories, invItems, invLoading, addInventoryItemToCart,
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
  trip: TripOption | null; setTrip: (t: TripOption | null) => void
  trips: TripOption[]
  cart: RequestLine[]; cartOpen: boolean; setCartOpen: (v: boolean) => void
  addToCart: (item: PurchaseItem, unit: string) => void
  changeCartQty: (key: string, delta: number) => void
  removeCartLine: (key: string) => void
  updateCartLine: (key: string, patch: Partial<RequestLine>) => void
  catalogSearch: string; setCatalogSearch: (v: string) => void
  catalogType: 'All' | PurchaseItemType; setCatalogType: (v: 'All' | PurchaseItemType) => void
  catalogCategory: string; setCatalogCategory: (v: string) => void
  catalogSource: 'stock' | 'inventory'; setCatalogSource: (v: 'stock' | 'inventory') => void
  invLocationId: string; setInvLocationId: (v: string) => void
  invRoomId: string; setInvRoomId: (v: string) => void
  invCategoryId: string; setInvCategoryId: (v: string) => void
  invSearch: string; setInvSearch: (v: string) => void
  invRooms: { id: string; name: string }[]; invCategories: { id: string; name: string }[]
  invItems: InventoryItemOption[]; invLoading: boolean
  addInventoryItemToCart: (item: InventoryItemOption) => void
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

  const PAGE_SIZE = 24
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
  const canBrowseInventory = purpose === 'STOCK_INVENTORY'

  const cartPanelProps = {
    cart, removeCartLine, changeCartQty, updateCartLine,
    locations, deliveryLocationId, setDeliveryLocationId,
    employees, requestedByEmployeeId, setRequestedByEmployeeId,
    notes, setNotes,
    neededByDate, setNeededByDate, isUrgent, setIsUrgent, urgentReason, setUrgentReason,
    purpose, setPurpose, trip, setTrip, trips,
    submit, saving, saveError, editingPrNumber,
  }

  return (
    <div className="space-y-4 pb-24 md:pb-0">
      <div>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-1">
          ← {editingPrNumber ? `Back to ${editingPrNumber}` : 'Back to Purchase Requests'}
        </button>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{editingPrNumber ? `Edit ${editingPrNumber}` : 'Create Purchase Request'}</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] xl:grid-cols-[1fr_340px] gap-4 xl:gap-6 items-start">
        {/* ── Catalog ── */}
        <div className="space-y-3 min-w-0">
          {/* Toolbar — what to browse, search, and who the next items are for */}
          <div className="bg-card border rounded-xl shadow-sm p-3 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              {canBrowseInventory && (
                <div className="inline-flex gap-1 bg-muted rounded-lg p-1 shrink-0">
                  <button type="button" onClick={() => setCatalogSource('stock')}
                    className={`flex-1 sm:flex-none px-3 h-8 text-xs font-semibold rounded-md transition-colors ${catalogSource === 'stock' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    Catalog
                  </button>
                  <button type="button" onClick={() => setCatalogSource('inventory')}
                    className={`flex-1 sm:flex-none px-3 h-8 text-xs font-semibold rounded-md transition-colors ${catalogSource === 'inventory' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    Vessel Inventory
                  </button>
                </div>
              )}
              <div className="flex gap-2 flex-1 min-w-0">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  {catalogSource === 'inventory' ? (
                    <input
                      className="w-full h-10 pl-9 pr-3 text-sm border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="Search inventory item…"
                      value={invSearch} onChange={e => setInvSearch(e.target.value)}
                    />
                  ) : (
                    <input
                      className="w-full h-10 pl-9 pr-3 text-sm border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="Search item name or SKU…"
                      value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)}
                    />
                  )}
                </div>
                <button
                  onClick={() => setCustomModal(true)}
                  title="Request an item that isn't in the catalog"
                  className="flex items-center justify-center gap-2 h-10 px-3 sm:px-4 rounded-lg border border-warning/30 bg-warning/10 text-warning text-sm font-medium transition-colors hover:bg-warning/20 hover:border-warning shrink-0"
                >
                  <ImagePlus className="h-4 w-4" /> <span className="hidden sm:inline">Custom Item</span>
                </button>
              </div>
            </div>

            {catalogSource === 'inventory' ? (
              <InventoryFilters
                vessels={locations.filter(l => l.type === 'VESSEL' && l.isActive && !l.parentId)}
                invLocationId={invLocationId} setInvLocationId={setInvLocationId}
                invRoomId={invRoomId} setInvRoomId={setInvRoomId}
                invCategoryId={invCategoryId} setInvCategoryId={setInvCategoryId}
                invRooms={invRooms} invCategories={invCategories}
              />
            ) : (
              <>
                {/* Horizontal scroll on narrow screens instead of wrapping into several rows */}
                <div className="flex gap-1 overflow-x-auto -mx-3 px-3 scrollbar-none">
                  {ITEM_TYPES.map(t => (
                    <button key={t} onClick={() => { setCatalogType(t); setCatalogCategory('All') }}
                      className={`px-3 h-8 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${catalogType === t ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                      {ITEM_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
                {categories.length > 2 && (
                  <div className="flex gap-1.5 overflow-x-auto -mx-3 px-3 scrollbar-none">
                    {categories.map(c => (
                      <button key={c} onClick={() => setCatalogCategory(c)}
                        className={`px-2.5 h-7 rounded-full text-xs font-medium border whitespace-nowrap transition-colors shrink-0 ${
                          catalogCategory === c ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                        }`}>
                        {c === 'All' ? c : toTitleCase(c)}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {catalogSource === 'inventory' ? (
            <InventoryPickerPanel
              invLocationId={invLocationId} invItems={invItems} invLoading={invLoading}
              cart={cart} addInventoryItemToCart={addInventoryItemToCart} changeCartQty={changeCartQty}
              requestedByEmployeeId={requestedByEmployeeId}
            />
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground bg-card border rounded-xl">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No items found.</p>
              <button onClick={() => setCustomModal(true)} className="mt-3 text-sm font-medium text-warning hover:underline">+ Request a custom item</button>
            </div>
          ) : (
            <>
              <div className={CARD_GRID}>
                {pageItems.map(item => {
                  const hasPurchaseUnit = !!(item.purchaseUnit && item.purchaseUnit !== item.baseUnit && item.conversionFactor > 1)
                  const requesterKey = requestedByEmployeeId || 'none'
                  const baseLine = cart.find(l => l.key === `${item.id}-${item.baseUnit}-${requesterKey}`)
                  const purchaseLine = hasPurchaseUnit ? cart.find(l => l.key === `${item.id}-${item.purchaseUnit}-${requesterKey}`) : undefined
                  // ml / gr is only for POS recipes — drinks are requested by the bottle.
                  const offerBase = !(hasPurchaseUnit && isMeasureUnit(item.baseUnit))
                  return (
                    <ItemCard key={item.id} active={!!(baseLine || purchaseLine)}
                      image={item.imageKey} name={item.name} caption={item.category}
                      sub={hasPurchaseUnit ? `${item.baseUnit} · ${item.purchaseUnit} = ${item.conversionFactor} ${item.baseUnit}` : item.baseUnit}>
                      {baseLine
                        ? <QtyStepper qty={baseLine.quantity} unit={item.baseUnit} onChange={d => changeCartQty(baseLine.key!, d)} />
                        : offerBase && <AddButton label={item.baseUnit} onClick={() => addToCart(item, item.baseUnit)} />}
                      {hasPurchaseUnit && (purchaseLine
                        ? <QtyStepper qty={purchaseLine.quantity} unit={item.purchaseUnit!} onChange={d => changeCartQty(purchaseLine.key!, d)} />
                        : <AddButton label={item.purchaseUnit!} outline={offerBase} onClick={() => addToCart(item, item.purchaseUnit!)} />)}
                    </ItemCard>
                  )
                })}
              </div>

              {pageCount > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">
                    {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                      className="h-9 w-9 flex items-center justify-center rounded-md border bg-card hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors">
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
                          className={`h-9 w-9 rounded-md text-xs font-semibold transition-colors ${
                            n === currentPage ? 'bg-primary text-primary-foreground' : 'border bg-card hover:bg-muted text-muted-foreground'
                          }`}>
                          {n}
                        </button>
                      ))}
                    <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={currentPage === pageCount}
                      className="h-9 w-9 flex items-center justify-center rounded-md border bg-card hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Request panel (tablet + desktop) ── */}
        {/* top-16 clears the app's own sticky header (h-12 + a little breathing room). */}
        <div className="hidden md:block sticky top-16">
          <RequestCartPanel {...cartPanelProps} />
        </div>
      </div>

      {/* ── Phone: floating bar → full-screen request sheet ── */}
      {!cartOpen && (
        <button onClick={() => setCartOpen(true)}
          className="md:hidden fixed left-4 right-4 bottom-4 z-40 flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="h-4 w-4" />
            {cart.length === 0 ? 'Your request' : `${cart.length} item${cart.length > 1 ? 's' : ''} · ${totalQty} qty`}
          </span>
          <span className="flex items-center gap-1 text-sm font-semibold">Review <ChevronRight className="h-4 w-4" /></span>
        </button>
      )}
      {cartOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 top-12 bg-card rounded-t-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <button onClick={() => setCartOpen(false)} className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                <ChevronLeft className="h-4 w-4" /> Add more items
              </button>
              <button onClick={() => setCartOpen(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="flex-1 min-h-0">
              <RequestCartPanel {...cartPanelProps} embedded />
            </div>
          </div>
        </div>
      )}

      {/* ── Custom Request Modal ── */}
      {customModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 sm:py-5 border-b shrink-0">
              <div>
                <h3 className="font-bold text-lg">Custom Item</h3>
                <p className="text-xs text-muted-foreground mt-0.5">For items not in the catalog — this won&apos;t create a new catalog item, it&apos;s just added to your request for purchasing to review</p>
              </div>
              <button onClick={() => setCustomModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="px-5 sm:px-6 py-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description <span className="text-destructive">*</span></label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  rows={3} placeholder="What do you need? Be as specific as possible…"
                  value={customForm.itemName} onChange={e => setCustomForm(f => ({ ...f, itemName: e.target.value }))} autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quantity</label>
                  <input type="number" min={1} className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={customForm.quantity} onChange={e => setCustomForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unit</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" placeholder="pcs"
                    value={customForm.unit} onChange={e => setCustomForm(f => ({ ...f, unit: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  rows={2} placeholder="Optional additional detail…"
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
                        isDraggingCustomImage ? 'border-warning bg-warning/10 text-warning' : 'text-muted-foreground hover:bg-muted/30'
                      }`}>
                      <Camera className="h-5 w-5" />
                      <span className="text-[11px] text-center px-1">{compressingCustomImage ? 'Processing…' : isDraggingCustomImage ? 'Drop' : 'Add photo'}</span>
                    </button>
                    <PhotoSourceMenu open={customPhotoMenuOpen} onClose={() => setCustomPhotoMenuOpen(false)} onFiles={onCustomImageFiles} multiple />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end px-5 sm:px-6 py-4 border-t bg-muted/20 shrink-0">
              <button onClick={() => setCustomModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted">Cancel</button>
              <button onClick={addCustomToCart} disabled={!customForm.itemName.trim()}
                className="px-5 py-2 text-sm text-primary-foreground rounded-lg font-medium disabled:opacity-40 transition-colors bg-primary hover:bg-primary-hover">
                Add to Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Catalog building blocks ──────────────────────────────────────────────────
const CARD_GRID = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-2.5'

function ItemCard({ image, name, caption, sub, active, children }: {
  image?: string | null; name: string; caption: string; sub: string; active: boolean; children: React.ReactNode
}) {
  return (
    <div className={`bg-card rounded-xl border overflow-hidden flex flex-col transition-all ${active ? 'border-warning ring-1 ring-warning' : 'hover:border-primary/40 hover:shadow-sm'}`}>
      {/* Product shots (bottles, cans) are tall — contain + padding keeps them whole without a huge square */}
      <div className="h-28 sm:h-32 bg-card flex items-center justify-center overflow-hidden border-b border-muted">
        {image ? <img src={image} alt={name} loading="lazy" className="max-w-full max-h-full object-contain p-2" /> : <Package className="h-7 w-7 text-muted-foreground/25" />}
      </div>
      <div className="p-2.5 flex flex-col flex-1">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-warning truncate">{caption}</span>
        <p className="text-xs font-medium leading-snug mt-0.5 line-clamp-2">{name}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>
        <div className="mt-auto pt-2 space-y-1">{children}</div>
      </div>
    </div>
  )
}

function AddButton({ label, outline = false, onClick }: { label: string; outline?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center justify-center gap-1 h-8 rounded-lg text-xs font-semibold transition-colors ${
        outline ? 'border border-primary text-primary-strong hover:bg-primary/10' : 'bg-primary hover:bg-primary-hover text-primary-foreground'
      }`}>
      <Plus className="h-3.5 w-3.5" /> {label}
    </button>
  )
}

function QtyStepper({ qty, unit, onChange, small = false }: { qty: number; unit?: string; onChange: (delta: number) => void; small?: boolean }) {
  const btn = `${small ? 'w-7 h-7' : 'w-8 h-8'} rounded-md bg-card border flex items-center justify-center hover:bg-muted transition-colors shrink-0`
  return (
    <div className={`flex items-center justify-between gap-1 ${small ? '' : 'bg-warning/10 rounded-lg'}`}>
      <button onClick={() => onChange(-1)} className={btn}><Minus className="h-3.5 w-3.5" /></button>
      <span className={`text-xs font-semibold tabular-nums text-center ${small ? 'min-w-6' : ''}`}>{qty}{unit ? ` ${unit}` : ''}</span>
      <button onClick={() => onChange(1)} className={btn}><Plus className="h-3.5 w-3.5" /></button>
    </div>
  )
}

// Vessel / Room / Category filters for browsing a vessel's own InventoryItems — for
// requesting more of something already tracked there (a "Convert to Stock"-adjacent flow —
// see ItemsPage.tsx — but the other direction: existing InventoryItem -> new PR line).
function InventoryFilters({
  vessels, invLocationId, setInvLocationId,
  invRoomId, setInvRoomId, invCategoryId, setInvCategoryId,
  invRooms, invCategories,
}: {
  vessels: StockLocation[]; invLocationId: string; setInvLocationId: (v: string) => void
  invRoomId: string; setInvRoomId: (v: string) => void
  invCategoryId: string; setInvCategoryId: (v: string) => void
  invRooms: { id: string; name: string }[]; invCategories: { id: string; name: string }[]
}) {
  const sel = 'w-full h-9 border rounded-md px-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50'
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <select className={sel} value={invLocationId} onChange={e => setInvLocationId(e.target.value)}>
        <option value="">Select vessel…</option>
        {vessels.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
      <select className={sel} value={invRoomId} onChange={e => setInvRoomId(e.target.value)} disabled={!invLocationId}>
        <option value="">All rooms</option>
        {invRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <select className={sel} value={invCategoryId} onChange={e => setInvCategoryId(e.target.value)} disabled={!invRoomId}>
        <option value="">All categories</option>
        {invCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  )
}

function InventoryPickerPanel({
  invLocationId, invItems, invLoading,
  cart, addInventoryItemToCart, changeCartQty, requestedByEmployeeId,
}: {
  invLocationId: string
  invItems: InventoryItemOption[]; invLoading: boolean
  cart: RequestLine[]; addInventoryItemToCart: (item: InventoryItemOption) => void
  changeCartQty: (key: string, delta: number) => void
  requestedByEmployeeId: string
}) {
  const empty = (text: string) => (
    <div className="text-center py-16 text-muted-foreground bg-card border rounded-xl">
      <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
      <p className="text-sm">{text}</p>
    </div>
  )
  if (!invLocationId) return empty('Select a vessel to browse its inventory.')
  if (invLoading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
  if (invItems.length === 0) return empty('No inventory items found for this room/category.')
  return (
    <div className={CARD_GRID}>
      {invItems.map(item => {
        const key = `inv-${item.id}-${requestedByEmployeeId || 'none'}`
        const line = cart.find(l => l.key === key)
        return (
          <ItemCard key={item.id} active={!!line} image={item.photoKeys?.[0]} name={item.name}
            caption={`${item.room.name} · ${item.category.name}`} sub={`Currently ${item.quantity} pcs`}>
            {line
              ? <QtyStepper qty={line.quantity} unit="pcs" onChange={d => changeCartQty(line.key!, d)} />
              : <AddButton label="pcs" onClick={() => addInventoryItemToCart(item)} />}
          </ItemCard>
        )
      })}
    </div>
  )
}

function RequestCartPanel({
  cart, removeCartLine, changeCartQty, updateCartLine,
  locations, deliveryLocationId, setDeliveryLocationId,
  employees, requestedByEmployeeId, setRequestedByEmployeeId,
  notes, setNotes,
  neededByDate, setNeededByDate, isUrgent, setIsUrgent, urgentReason, setUrgentReason,
  purpose, setPurpose, trip, setTrip, trips,
  submit, saving, saveError,
  editingPrNumber,
  embedded = false,
}: {
  cart: RequestLine[]; removeCartLine: (key: string) => void; changeCartQty: (key: string, delta: number) => void
  updateCartLine: (key: string, patch: Partial<RequestLine>) => void
  locations: StockLocation[]; deliveryLocationId: string; setDeliveryLocationId: (id: string) => void
  employees: EmployeeOption[]; requestedByEmployeeId: string; setRequestedByEmployeeId: (id: string) => void
  notes: string; setNotes: (v: string) => void
  neededByDate: string; setNeededByDate: (v: string) => void
  isUrgent: boolean; setIsUrgent: (v: boolean) => void
  urgentReason: string; setUrgentReason: (v: string) => void
  purpose: 'STOCK_INVENTORY' | 'TRIP'; setPurpose: (v: 'STOCK_INVENTORY' | 'TRIP') => void
  trip: TripOption | null; setTrip: (t: TripOption | null) => void
  trips: TripOption[]
  submit: () => void; saving: boolean; saveError: string
  editingPrNumber?: string
  embedded?: boolean
}) {
  const label = 'text-[11px] font-semibold text-muted-foreground uppercase tracking-wide'
  const groupCount = new Set(cart.map(l => l.requestedByEmployeeId || '')).size
  const deliveryYachtId = locations.find(l => l.id === deliveryLocationId)?.yachtId ?? null
  // The trip list follows the delivery location's yacht — so a picked trip on another yacht
  // no longer fits once the location changes.
  const changeDeliveryLocation = (id: string) => {
    setDeliveryLocationId(id)
    const nextYachtId = locations.find(l => l.id === id)?.yachtId ?? null
    if (trip && nextYachtId && trip.yacht?.id !== nextYachtId) setTrip(null)
  }
  const missing = [!deliveryLocationId && 'delivery location', cart.length === 0 && 'items', purpose === 'TRIP' && !trip && 'trip'].filter(Boolean) as string[]

  return (
    <div className={`bg-card flex flex-col ${embedded ? 'h-full' : 'rounded-xl border shadow-sm max-h-[calc(100vh-5rem)]'}`}>
      <div className={`flex items-center gap-2 px-4 py-3 border-b shrink-0 ${embedded ? '' : 'bg-warning/5 rounded-t-xl'}`}>
        <ShoppingCart className="h-4 w-4 text-warning" />
        <h3 className="font-semibold text-sm flex-1">Your Request</h3>
        {cart.length > 0 && <span className="text-xs font-semibold bg-primary text-primary-foreground rounded-full px-2 py-0.5">{cart.length}</span>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Requested By — who the NEXT items are for (e.g. a ship crew member), separate
            from who's submitting it (always the logged-in account). Optional: leave blank
            if you're requesting for yourself / general stock. */}
        <div className="px-4 pt-4 space-y-1">
          <label className={label}>Adding items for</label>
          <select
            className="w-full h-10 border rounded-lg px-3 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            value={requestedByEmployeeId} onChange={e => setRequestedByEmployeeId(e.target.value)}
          >
            <option value="">Myself / general stock</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeNumber})</option>)}
          </select>
          <p className="text-[11px] text-muted-foreground">Applies to items you add next — each person becomes their own PR.</p>
        </div>

        {/* ── 1. Items ── */}
        <div className="p-4 space-y-2">
          {cart.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
              <ShoppingCart className="h-6 w-6 mx-auto mb-2 opacity-30" />
              <p className="text-xs">No items yet — tap <span className="font-semibold">+</span> on an item to add it</p>
            </div>
          ) : (() => {
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
              const who = empId ? (employees.find(e => e.id === empId)?.fullName ?? 'Unknown') : 'Myself / general stock'
              return (
                <div key={empId || '__none__'} className="space-y-1.5">
                  {order.length > 1 && (
                    <p className="text-[11px] font-semibold text-warning uppercase tracking-wide flex items-center gap-1 pt-1">
                      <Users className="h-3 w-3" /> {who} <span className="font-normal text-muted-foreground normal-case">— own PR</span>
                    </p>
                  )}
                  {lines.map(line => (
                    <div key={line.key} className="border rounded-lg p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="relative w-9 h-9 rounded-md bg-muted/50 shrink-0 overflow-hidden flex items-center justify-center">
                          {line.imageKeys?.[0] ? <img src={line.imageKeys[0]} alt={line.itemName} className="w-full h-full object-cover" /> : <Package className="h-4 w-4 text-muted-foreground/40" />}
                          {!!line.imageKeys && line.imageKeys.length > 1 && (
                            <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] font-semibold px-1 rounded-tl">+{line.imageKeys.length - 1}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium line-clamp-2 leading-snug">{line.itemName}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {line.isCustom ? `Custom · ${line.quantity} ${line.itemUnit}` : line.sourceInventoryItem
                              ? `Inventory · ${line.sourceInventoryItem.room?.name ?? '—'} / ${line.sourceInventoryItem.category?.name ?? '—'}`
                              : line.itemUnit}
                          </p>
                        </div>
                        <button onClick={() => removeCartLine(line.key!)} className="p-1 text-muted-foreground hover:text-destructive shrink-0" title="Remove">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* New vs Replacement — replacement needs a damage description */}
                        <div className="flex gap-0.5 bg-muted rounded-md p-0.5 flex-1">
                          <button type="button" onClick={() => updateCartLine(line.key!, { requestType: 'NEW' })}
                            className={`flex-1 px-1.5 h-6 text-[11px] font-medium rounded transition-colors ${line.requestType !== 'REPLACEMENT' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                            New
                          </button>
                          <button type="button" onClick={() => updateCartLine(line.key!, { requestType: 'REPLACEMENT' })}
                            className={`flex-1 px-1.5 h-6 text-[11px] font-medium rounded transition-colors ${line.requestType === 'REPLACEMENT' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                            Replace
                          </button>
                        </div>
                        {!line.isCustom && <QtyStepper small qty={line.quantity} onChange={d => changeCartQty(line.key!, d)} />}
                      </div>
                      {line.requestType === 'REPLACEMENT' && (
                        <textarea
                          className="w-full border rounded-md px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                          rows={2} placeholder="Damage details — what is broken, how it happened (required)"
                          value={line.damageDetail ?? ''} onChange={e => updateCartLine(line.key!, { damageDetail: e.target.value })}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )
            })
          })()}
        </div>

        {/* ── 2. Request details ── */}
        <div className="p-4 space-y-3.5 border-t bg-muted/20">
          <div className="space-y-1">
            <label className={label}>Deliver to <span className="text-destructive">*</span></label>
            <select
              className={`w-full h-10 border rounded-lg px-3 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring ${!deliveryLocationId && cart.length > 0 ? 'border-warning' : ''}`}
              value={deliveryLocationId} onChange={e => changeDeliveryLocation(e.target.value)}
            >
              <option value="">Select location…</option>
              {renderLocationOptions(locations, { topLevelOnly: true })}
            </select>
          </div>

          {/* Purpose — general restocking vs a specific upcoming trip. Trip requests link
              to the actual Booking so Purchasing knows which departure to have ready for. */}
          <div className="space-y-1.5">
            <label className={label}>Purpose <span className="text-destructive">*</span></label>
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              <button type="button" onClick={() => setPurpose('STOCK_INVENTORY')}
                className={`flex-1 px-2 h-8 text-xs font-medium rounded-md transition-colors ${purpose === 'STOCK_INVENTORY' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                Stock & Inventory
              </button>
              <button type="button" onClick={() => setPurpose('TRIP')}
                className={`flex-1 px-2 h-8 text-xs font-medium rounded-md transition-colors ${purpose === 'TRIP' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                Trip
              </button>
            </div>
            {purpose === 'TRIP' && (deliveryLocationId
              ? <TripPicker yachtFromLocation trips={trips} value={trip} onChange={setTrip} suggestedYachtId={deliveryYachtId} />
              : <p className="text-[11px] text-muted-foreground">Select the delivery location first — its trips will show here.</p>)}
          </div>

          <div className="space-y-1">
            <label className={label}>Needed by</label>
            <input
              type="date"
              className="w-full h-10 border rounded-lg px-3 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
              value={neededByDate} onChange={e => setNeededByDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="checkbox" checked={isUrgent} onChange={e => setIsUrgent(e.target.checked)} className="h-4 w-4 accent-red-600" />
              <span className="text-destructive">Urgent</span>
            </label>
            {isUrgent && (
              <textarea
                className="w-full border border-destructive/30 rounded-lg px-3 py-2 text-sm resize-none bg-card focus:outline-none focus:ring-1 focus:ring-destructive"
                rows={2} placeholder="Why is this urgent? (required)"
                value={urgentReason} onChange={e => setUrgentReason(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-1">
            <label className={label}>Notes</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none bg-card focus:outline-none focus:ring-1 focus:ring-ring"
              rows={2} placeholder="Optional notes for the purchasing team…"
              value={notes} onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="p-4 border-t shrink-0 space-y-2 bg-card rounded-b-xl">
        {saveError ? (
          <p className="text-xs text-destructive flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" /> {saveError}</p>
        ) : missing.length > 0 && (
          <p className="text-[11px] text-muted-foreground">Still needed: {missing.join(', ')}</p>
        )}
        <button
          onClick={submit} disabled={saving || cart.length === 0}
          className="w-full flex items-center justify-center gap-2 h-11 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-semibold disabled:opacity-40 transition-colors"
        >
          {saving ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="h-4 w-4" />}
          {saving ? 'Saving…' : editingPrNumber ? 'Save Changes' : groupCount > 1 ? `Submit ${groupCount} Requests` : 'Submit Request'}
        </button>
      </div>
    </div>
  )
}
