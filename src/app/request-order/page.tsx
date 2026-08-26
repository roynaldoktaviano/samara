'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Search, Plus, Minus, X, Trash2, ChevronsUpDown, ChevronLeft, ChevronRight, Check, Camera,
  Package, ShoppingCart, Send, CheckCircle2, AlertTriangle, ImagePlus, Ship,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { PhotoSourceMenu } from '@/components/ui/file-preview'
import { cn } from '@/lib/utils'
import { ITEM_TYPES, ITEM_TYPE_LABELS, TYPE_CATEGORIES, type PurchaseItemType } from '@/lib/purchase-item-types'
import { useFileDrop } from '@/hooks/useFileDrop'
import { renderLocationOptions } from '@/components/purchasing/LocationOptions'

interface CatalogItem { id: string; sku: string; name: string; type: PurchaseItemType; category: string; baseUnit: string; purchaseUnit: string | null; conversionFactor: number; imageKey: string | null }
interface EmployeeLite { id: string; fullName: string; employeeNumber: string; department: string | null }
interface LocationLite { id: string; name: string; type: string; parentId: string | null }
interface TripOption {
  id: string; bookingCode: string; tripType: string; startDate: string; endDate: string
  destination: string | null; status: string
  yacht: { id: string; name: string } | null
  leadGuestName: string; guestNames: string[]
}
interface CartLine {
  key: string
  itemId: string | null
  itemName: string
  category: string
  unit: string
  imageKeys: string[]
  quantity: number
  isCustom: boolean
  notes: string
}

// Category names come from free-text data entry (some "CHAMPAGNE", some "Dairy") —
// normalize to Title Case for display only, so the filter chips read consistently
// regardless of how a category was originally typed in.
function toTitleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

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

export default function RequestOrderPage() {
  return (
    <Suspense fallback={null}>
      <RequestOrderContent />
    </Suspense>
  )
}

function RequestOrderContent() {
  const searchParams = useSearchParams()
  const linkToken = searchParams.get('token')
  const tenantQS = linkToken ? `?token=${encodeURIComponent(linkToken)}` : ''

  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [locations, setLocations] = useState<LocationLite[]>([])
  const [loading, setLoading] = useState(!!linkToken)

  const [search, setSearch] = useState('')
  const [activeType, setActiveType] = useState<'All' | PurchaseItemType>('BEVERAGE')
  const [activeCat, setActiveCat] = useState('All')

  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)

  const [employeeId, setEmployeeId] = useState('')
  const [employeeOpen, setEmployeeOpen] = useState(false)
  const [locationId, setLocationId] = useState('')
  const [notes, setNotes] = useState('')
  const [neededByDate, setNeededByDate] = useState('')
  const [isUrgent, setIsUrgent] = useState(false)
  const [urgentReason, setUrgentReason] = useState('')
  const [purpose, setPurpose] = useState<'STOCK_INVENTORY' | 'TRIP'>('STOCK_INVENTORY')
  const [division, setDivision] = useState<'BOAT_OPERATION' | 'BUILDING_MATERIAL' | ''>('')
  const [tripBookingId, setTripBookingId] = useState('')
  const [tripBookingLabel, setTripBookingLabel] = useState('')
  const [trips, setTrips] = useState<TripOption[]>([])

  const [customModal, setCustomModal] = useState(false)
  const [customForm, setCustomForm] = useState({ itemName: '', quantity: 1, unit: 'pcs', notes: '', images: [] as string[] })
  const [customPhotoMenuOpen, setCustomPhotoMenuOpen] = useState(false)
  const [compressingCustomImage, setCompressingCustomImage] = useState(false)
  const { isDragging: isDraggingCustomImage, dropProps: customImageDropProps } = useFileDrop(
    files => processCustomImages(Array.from(files)), compressingCustomImage
  )

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState<{ prNumber: string } | null>(null)
  const [fetchFailed, setFetchFailed] = useState(false)
  const invalidLink = !linkToken || fetchFailed

  useEffect(() => {
    if (!linkToken) return
    Promise.all([
      fetch(`/api/hr/request-orders/catalog${tenantQS}`),
      fetch(`/api/hr/request-orders/employees${tenantQS}`),
      fetch(`/api/hr/request-orders/locations${tenantQS}`),
      fetch(`/api/hr/request-orders/trips${tenantQS}`),
    ]).then(async ([cr, er, lr, tr]) => {
      if (!cr.ok || !er.ok || !lr.ok) { setFetchFailed(true); setLoading(false); return }
      const [c, e, l] = await Promise.all([cr.json(), er.json(), lr.json()])
      setCatalog(Array.isArray(c) ? c : [])
      setEmployees(Array.isArray(e) ? e : [])
      setLocations(Array.isArray(l) ? l : [])
      if (tr.ok) setTrips(await tr.json())
      setLoading(false)
    })
  }, [tenantQS, linkToken])

  const categories = useMemo(() => {
    const inType = activeType === 'All' ? catalog : catalog.filter(i => i.type === activeType)
    return ['All', ...Array.from(new Set(inType.map(i => i.category)))]
  }, [catalog, activeType])

  const filtered = useMemo(() => catalog.filter(i =>
    (activeType === 'All' || i.type === activeType) &&
    (activeCat === 'All' || i.category === activeCat) &&
    (!search || i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase()))
  ), [catalog, activeType, activeCat, search])

  const PAGE_SIZE = 12
  const [page, setPage] = useState(1)
  // Jump back to page 1 whenever the filters change — adjusted during render (not
  // an effect) per https://react.dev/learn/you-might-not-need-an-effect
  const filterKey = `${activeType}|${activeCat}|${search}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function addToCart(item: CatalogItem, unit: string) {
    const key = `${item.id}-${unit}`
    setCart(prev => {
      const existing = prev.find(l => l.key === key)
      if (existing) return prev.map(l => l.key === key ? { ...l, quantity: l.quantity + 1 } : l)
      return [...prev, { key, itemId: item.id, itemName: item.name, category: item.category, unit, imageKeys: item.imageKey ? [item.imageKey] : [], quantity: 1, isCustom: false, notes: '' }]
    })
  }

  function changeQty(key: string, delta: number) {
    setCart(prev => prev.map(l => l.key === key ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l))
  }

  function removeLine(key: string) {
    setCart(prev => prev.filter(l => l.key !== key))
  }

  function setTripBooking(id: string, label: string) {
    setTripBookingId(id)
    setTripBookingLabel(label)
  }

  async function processCustomImages(files: File[]) {
    if (!files.length) return
    setCompressingCustomImage(true)
    const compressed = await Promise.all(files.map(compressImage))
    setCustomForm(f => ({ ...f, images: [...f.images, ...compressed] }))
    setCompressingCustomImage(false)
  }

  function removeCustomImage(index: number) {
    setCustomForm(f => ({ ...f, images: f.images.filter((_, i) => i !== index) }))
  }

  function addCustomToCart() {
    if (!customForm.itemName.trim()) return
    setCart(prev => [...prev, {
      key: `custom-${Date.now()}`,
      itemId: null,
      itemName: customForm.itemName.trim(),
      category: 'Custom Request',
      unit: customForm.unit.trim() || 'pcs',
      imageKeys: customForm.images,
      quantity: Number(customForm.quantity) || 1,
      isCustom: true,
      notes: customForm.notes.trim(),
    }])
    setCustomForm({ itemName: '', quantity: 1, unit: 'pcs', notes: '', images: [] })
    setCustomModal(false)
  }

  const selectedEmployee = employees.find(e => e.id === employeeId) ?? null
  const totalQty = cart.reduce((s, l) => s + l.quantity, 0)

  async function submit() {
    setSubmitError('')
    if (!employeeId) { setSubmitError('Please select who is requesting'); return }
    if (!locationId) { setSubmitError('Please select a delivery location'); return }
    if (cart.length === 0) { setSubmitError('Add at least one item to the request'); return }
    if (isUrgent && !urgentReason.trim()) { setSubmitError('Please explain why this request is urgent'); return }
    if (purpose === 'TRIP' && !tripBookingId) { setSubmitError('Please select which trip this request is for'); return }
    if (!division) { setSubmitError('Please select what this request is for'); return }
    setSubmitting(true)
    const res = await fetch(`/api/hr/request-orders${tenantQS}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId, locationId: locationId || null, notes,
        neededByDate: neededByDate || null, isUrgent, urgentReason: isUrgent ? urgentReason : null,
        purpose, tripBookingId: purpose === 'TRIP' ? tripBookingId : null,
        division,
        items: cart.map(l => ({ itemId: l.itemId, itemName: l.itemName, quantity: l.quantity, unit: l.unit, notes: l.notes, imageKeys: l.imageKeys })),
      }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) { setSubmitError(data.error ?? 'Something went wrong'); return }
    setSuccess({ prNumber: data.prNumber })
  }

  function resetForm() {
    setCart([]); setEmployeeId(''); setLocationId(''); setNotes('')
    setNeededByDate(''); setIsUrgent(false); setUrgentReason('')
    setPurpose('STOCK_INVENTORY'); setDivision(''); setTripBookingId(''); setTripBookingLabel('')
    setSuccess(null); setCartOpen(false)
  }

  if (invalidLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafaf8] p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border p-8 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-xl font-bold">Link Not Valid</h2>
          <p className="text-muted-foreground text-sm mt-2">
            This request order link is missing or no longer valid. Please ask your admin for the current link.
          </p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafaf8] p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border p-8 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle2 className="h-7 w-7 text-green-600" />
          </div>
          <h2 className="text-xl font-bold">Request Submitted</h2>
          <p className="text-muted-foreground text-sm mt-2">
            Your request <span className="font-mono font-semibold text-foreground">{success.prNumber}</span> has been sent to the purchasing team for review.
          </p>
          <button onClick={resetForm} className="mt-6 w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors">
            Make Another Request
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fafaf8]">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Request Order</h1>
            <p className="text-muted-foreground text-xs mt-0.5">Request items for your vessel — no ERP login required</p>
          </div>
          <button
            onClick={() => setCartOpen(true)}
            className="lg:hidden relative flex items-center gap-2 border rounded-lg px-3 py-2 text-sm font-medium bg-white hover:bg-muted transition-colors shrink-0"
          >
            <ShoppingCart className="h-4 w-4" />
            {totalQty > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4.5 h-4.5 flex items-center justify-center">{totalQty}</span>}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 p-4 sm:p-6">
        {/* ── Catalog ── */}
        <div className="space-y-4 min-w-0">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                className="w-full h-10 pl-9 pr-3 text-sm border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder="Search item name or SKU..."
                value={search} onChange={e => setSearch(e.target.value)}
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
                <button key={t} onClick={() => { setActiveType(t); setActiveCat('All') }}
                  className={cn('px-3 py-1.5 rounded-md text-xs font-semibold transition-colors', activeType === t ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                  {ITEM_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 flex-wrap pt-2.5 border-t">
              {categories.map(c => (
                <button key={c} onClick={() => setActiveCat(c)}
                  className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    activeCat === c ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-muted-foreground border-border hover:border-amber-300 hover:text-foreground')}>
                  {c === 'All' ? c : toTitleCase(c)}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
              {[...Array(12)].map((_, i) => <div key={i} className="rounded-xl border bg-white h-44 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No items found. Try a different search or use Custom Request.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
              {pageItems.map(item => {
                const hasPurchaseUnit = !!(item.purchaseUnit && item.purchaseUnit !== item.baseUnit && item.conversionFactor > 1)
                const baseLine = cart.find(l => l.key === `${item.id}-${item.baseUnit}`)
                const purchaseLine = hasPurchaseUnit ? cart.find(l => l.key === `${item.id}-${item.purchaseUnit}`) : undefined
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
                            <button onClick={() => changeQty(baseLine.key, -1)} className="w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center hover:bg-muted transition-colors">
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="text-[11px] font-semibold tabular-nums">{baseLine.quantity} {item.baseUnit}</span>
                            <button onClick={() => changeQty(baseLine.key, 1)} className="w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center hover:bg-muted transition-colors">
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
                              <button onClick={() => changeQty(purchaseLine.key, -1)} className="w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center hover:bg-muted transition-colors">
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="text-[11px] font-semibold tabular-nums">{purchaseLine.quantity} {item.purchaseUnit}</span>
                              <button onClick={() => changeQty(purchaseLine.key, 1)} className="w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center hover:bg-muted transition-colors">
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => addToCart(item, item.purchaseUnit!)}
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
          <div className="sticky top-22">
            <RequestSidebar
              cart={cart} removeLine={removeLine} changeQty={changeQty}
              employees={employees} employeeId={employeeId} setEmployeeId={setEmployeeId}
              employeeOpen={employeeOpen} setEmployeeOpen={setEmployeeOpen} selectedEmployee={selectedEmployee}
              locations={locations} locationId={locationId} setLocationId={setLocationId}
              notes={notes} setNotes={setNotes}
              neededByDate={neededByDate} setNeededByDate={setNeededByDate}
              isUrgent={isUrgent} setIsUrgent={setIsUrgent}
              urgentReason={urgentReason} setUrgentReason={setUrgentReason}
              purpose={purpose} setPurpose={setPurpose} division={division} setDivision={setDivision} tripBookingId={tripBookingId} tripBookingLabel={tripBookingLabel} setTripBooking={setTripBooking} trips={trips}
              submit={submit} submitting={submitting} submitError={submitError}
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
              <RequestSidebar
                cart={cart} removeLine={removeLine} changeQty={changeQty}
                employees={employees} employeeId={employeeId} setEmployeeId={setEmployeeId}
                employeeOpen={employeeOpen} setEmployeeOpen={setEmployeeOpen} selectedEmployee={selectedEmployee}
                locations={locations} locationId={locationId} setLocationId={setLocationId}
                notes={notes} setNotes={setNotes}
                neededByDate={neededByDate} setNeededByDate={setNeededByDate}
                isUrgent={isUrgent} setIsUrgent={setIsUrgent}
                urgentReason={urgentReason} setUrgentReason={setUrgentReason}
                purpose={purpose} setPurpose={setPurpose} division={division} setDivision={setDivision} tripBookingId={tripBookingId} tripBookingLabel={tripBookingLabel} setTripBooking={setTripBooking} trips={trips}
                submit={submit} submitting={submitting} submitError={submitError}
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
                <p className="text-xs text-muted-foreground mt-0.5">For items not in the catalog — this won't create a new catalog item, it's just added to your request for purchasing to review</p>
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
                    <PhotoSourceMenu open={customPhotoMenuOpen} onClose={() => setCustomPhotoMenuOpen(false)} onFiles={processCustomImages} multiple />
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

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Trip picker for the "Purpose: Trip" option — same shape/behavior as the internal PR
// page's trip picker (search by booking code/guest/destination, filter by yacht).
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
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent/30 flex items-start gap-2 border-b last:border-0 transition-colors">
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

function RequestSidebar({
  cart, removeLine, changeQty,
  employees, employeeId, setEmployeeId, employeeOpen, setEmployeeOpen, selectedEmployee,
  locations, locationId, setLocationId,
  notes, setNotes,
  neededByDate, setNeededByDate, isUrgent, setIsUrgent, urgentReason, setUrgentReason,
  purpose, setPurpose, division, setDivision, tripBookingId, tripBookingLabel, setTripBooking, trips,
  submit, submitting, submitError,
  embedded = false,
}: {
  cart: CartLine[]; removeLine: (key: string) => void; changeQty: (key: string, delta: number) => void
  employees: EmployeeLite[]; employeeId: string; setEmployeeId: (id: string) => void
  employeeOpen: boolean; setEmployeeOpen: (v: boolean) => void; selectedEmployee: EmployeeLite | null
  locations: LocationLite[]; locationId: string; setLocationId: (id: string) => void
  notes: string; setNotes: (v: string) => void
  neededByDate: string; setNeededByDate: (v: string) => void
  isUrgent: boolean; setIsUrgent: (v: boolean) => void
  urgentReason: string; setUrgentReason: (v: string) => void
  purpose: 'STOCK_INVENTORY' | 'TRIP'; setPurpose: (v: 'STOCK_INVENTORY' | 'TRIP') => void
  division: 'BOAT_OPERATION' | 'BUILDING_MATERIAL' | ''; setDivision: (v: 'BOAT_OPERATION' | 'BUILDING_MATERIAL') => void
  tripBookingId: string; tripBookingLabel: string; setTripBooking: (id: string, label: string) => void
  trips: TripOption[]
  submit: () => void; submitting: boolean; submitError: string
  embedded?: boolean
}) {
  return (
    <div className={cn('bg-white rounded-xl border shadow-sm flex flex-col', !embedded && 'max-h-[calc(100vh-104px)]')}>
      {!embedded && (
        <div className="flex items-center gap-2 px-5 py-4 border-b shrink-0 bg-amber-50/60 rounded-t-xl">
          <ShoppingCart className="h-4 w-4 text-amber-700" />
          <h3 className="font-semibold text-sm">Your Request {cart.length > 0 && `(${cart.length})`}</h3>
        </div>
      )}

      <div className="p-5 space-y-4 overflow-y-auto flex-1">
        {submitError && (
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {submitError}
          </div>
        )}

        {/* Requester */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Requested By <span className="text-red-500">*</span></label>
          <Popover open={employeeOpen} onOpenChange={setEmployeeOpen}>
            <PopoverTrigger asChild>
              <button className="w-full flex items-center justify-between px-3 py-2.5 h-auto rounded-lg border bg-background text-sm hover:bg-accent/30 transition-colors">
                {selectedEmployee ? (
                  <div className="text-left min-w-0">
                    <p className="font-medium truncate">{selectedEmployee.fullName}</p>
                    {selectedEmployee.department && <p className="text-xs text-muted-foreground truncate">{selectedEmployee.department}</p>}
                  </div>
                ) : <span className="text-muted-foreground">Search your name…</span>}
                <ChevronsUpDown className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="p-0" align="start" style={{ width: 'var(--radix-popover-trigger-width)' }}>
              <Command>
                <CommandInput placeholder="Search employee…" />
                <CommandList>
                  <CommandEmpty><p className="text-muted-foreground text-sm py-2">No employees found.</p></CommandEmpty>
                  <CommandGroup>
                    {employees.map(e => (
                      <CommandItem key={e.id} value={`${e.fullName} ${e.employeeNumber}`} onSelect={() => { setEmployeeId(e.id); setEmployeeOpen(false) }} className="cursor-pointer">
                        <Check className={cn('w-4 h-4 shrink-0 mr-2', employeeId === e.id ? 'opacity-100' : 'opacity-0')} />
                        <div className="min-w-0">
                          <p className="truncate">{e.fullName}</p>
                          <p className="text-xs text-muted-foreground truncate">{e.employeeNumber}{e.department ? ` · ${e.department}` : ''}</p>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Vessel */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vessel / Location <span className="text-red-500">*</span></label>
          <select
            className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
            value={locationId} onChange={e => setLocationId(e.target.value)}
          >
            <option value="">Select vessel or location…</option>
            {renderLocationOptions(locations, { topLevelOnly: true })}
          </select>
        </div>

        {/* Purpose */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Purpose <span className="text-red-500">*</span></label>
          <div className="inline-flex gap-1 bg-muted rounded-lg p-1 w-full">
            <button type="button" onClick={() => setPurpose('STOCK_INVENTORY')}
              className={cn('flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors', purpose === 'STOCK_INVENTORY' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              Stock & Inventory
            </button>
            <button type="button" onClick={() => setPurpose('TRIP')}
              className={cn('flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors', purpose === 'TRIP' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              Trip
            </button>
          </div>
          {purpose === 'TRIP' && (
            <TripCombobox value={tripBookingId} valueLabel={tripBookingLabel} trips={trips} onChange={setTripBooking} />
          )}
        </div>

        {/* Division — routes this request to the right Purchasing person */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What is this for? <span className="text-red-500">*</span></label>
          <div className={cn('inline-flex gap-1 bg-muted rounded-lg p-1 w-full', !division && submitError && 'ring-1 ring-red-400')}>
            <button type="button" onClick={() => setDivision('BOAT_OPERATION')}
              className={cn('flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors', division === 'BOAT_OPERATION' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              Boat Operation
            </button>
            <button type="button" onClick={() => setDivision('BUILDING_MATERIAL')}
              className={cn('flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors', division === 'BUILDING_MATERIAL' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              Building Material
            </button>
          </div>
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
            <div className="space-y-2">
              {cart.map(line => (
                <div key={line.key} className="flex items-center gap-2.5 border rounded-lg p-2">
                  <div className="relative w-10 h-10 rounded-md bg-muted/50 shrink-0 overflow-hidden flex items-center justify-center">
                    {line.imageKeys[0] ? <img src={line.imageKeys[0]} alt={line.itemName} className="w-full h-full object-cover" /> : <Package className="h-4 w-4 text-muted-foreground/40" />}
                    {line.imageKeys.length > 1 && (
                      <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] font-semibold px-1 rounded-tl">+{line.imageKeys.length - 1}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{line.itemName}</p>
                    <p className="text-[10px] text-muted-foreground">{line.isCustom ? 'Custom request' : `${line.category} · ${line.unit}`}</p>
                  </div>
                  {line.isCustom ? (
                    <span className="text-xs font-semibold tabular-nums shrink-0">{line.quantity} {line.unit}</span>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => changeQty(line.key, -1)} className="w-5 h-5 rounded border flex items-center justify-center hover:bg-muted"><Minus className="h-3 w-3" /></button>
                      <span className="text-xs font-semibold tabular-nums w-4 text-center">{line.quantity}</span>
                      <button onClick={() => changeQty(line.key, 1)} className="w-5 h-5 rounded border flex items-center justify-center hover:bg-muted"><Plus className="h-3 w-3" /></button>
                    </div>
                  )}
                  <button onClick={() => removeLine(line.key)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
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
            rows={2} placeholder="Anything else purchasing should know..."
            value={notes} onChange={e => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="p-5 border-t shrink-0">
        <button
          onClick={submit} disabled={submitting || cart.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
        >
          {submitting ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="h-4 w-4" />}
          {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
      </div>
    </div>
  )
}
