'use client'

import { useState, useEffect, useMemo, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Search, Plus, Minus, X, Trash2, ChevronsUpDown, Check, Camera,
  Package, ShoppingCart, Send, CheckCircle2, AlertTriangle, ImagePlus,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { ITEM_TYPES, ITEM_TYPE_LABELS, TYPE_CATEGORIES, type PurchaseItemType } from '@/lib/purchase-item-types'
import { useFileDrop } from '@/hooks/useFileDrop'

const GOLD = '#bdac7e'
const GOLD_DARK = '#a8956a'

interface CatalogItem { id: string; sku: string; name: string; type: PurchaseItemType; category: string; baseUnit: string; purchaseUnit: string | null; conversionFactor: number; imageKey: string | null }
interface EmployeeLite { id: string; fullName: string; employeeNumber: string; department: string | null }
interface LocationLite { id: string; name: string; type: string }
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

function capitalize(s: string) {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
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
  const tenantSlug = searchParams.get('tenant')
  const tenantQS = tenantSlug ? `?tenant=${encodeURIComponent(tenantSlug)}` : ''

  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [locations, setLocations] = useState<LocationLite[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [activeType, setActiveType] = useState<'All' | PurchaseItemType>('All')
  const [activeCat, setActiveCat] = useState('All')

  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)

  const [employeeId, setEmployeeId] = useState('')
  const [employeeOpen, setEmployeeOpen] = useState(false)
  const [locationId, setLocationId] = useState('')
  const [notes, setNotes] = useState('')

  const [customModal, setCustomModal] = useState(false)
  const [customForm, setCustomForm] = useState({ itemName: '', quantity: 1, unit: 'pcs', notes: '', images: [] as string[] })
  const customFileRef = useRef<HTMLInputElement>(null)
  const [compressingCustomImage, setCompressingCustomImage] = useState(false)
  const { isDragging: isDraggingCustomImage, dropProps: customImageDropProps } = useFileDrop(
    files => processCustomImages(Array.from(files)), compressingCustomImage
  )

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState<{ prNumber: string } | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/hr/request-orders/catalog${tenantQS}`).then(r => r.json()),
      fetch(`/api/hr/request-orders/employees${tenantQS}`).then(r => r.json()),
      fetch(`/api/hr/request-orders/locations${tenantQS}`).then(r => r.json()),
    ]).then(([c, e, l]) => {
      setCatalog(Array.isArray(c) ? c : [])
      setEmployees(Array.isArray(e) ? e : [])
      setLocations(Array.isArray(l) ? l : [])
      setLoading(false)
    })
  }, [tenantQS])

  const categories = useMemo(() => {
    const inType = activeType === 'All' ? catalog : catalog.filter(i => i.type === activeType)
    return ['All', ...Array.from(new Set(inType.map(i => i.category)))]
  }, [catalog, activeType])

  const filtered = useMemo(() => catalog.filter(i =>
    (activeType === 'All' || i.type === activeType) &&
    (activeCat === 'All' || i.category === activeCat) &&
    (!search || i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase()))
  ), [catalog, activeType, activeCat, search])

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
    if (cart.length === 0) { setSubmitError('Add at least one item to the request'); return }
    setSubmitting(true)
    const res = await fetch(`/api/hr/request-orders${tenantQS}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId, locationId: locationId || null, notes,
        items: cart.map(l => ({ itemId: l.itemId, itemName: l.itemName, quantity: l.quantity, unit: l.unit, notes: l.notes, imageKeys: l.imageKeys })),
      }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) { setSubmitError(data.error ?? 'Something went wrong'); return }
    setSuccess({ prNumber: data.prNumber })
  }

  function resetForm() {
    setCart([]); setEmployeeId(''); setLocationId(''); setNotes(''); setSuccess(null); setCartOpen(false)
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
          <button onClick={resetForm} className="mt-6 w-full py-2.5 rounded-lg text-white text-sm font-medium transition-colors" style={{ background: GOLD }}
            onMouseEnter={e => (e.currentTarget.style.background = GOLD_DARK)} onMouseLeave={e => (e.currentTarget.style.background = GOLD)}>
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Request Order</h1>
            <p className="text-muted-foreground text-xs mt-0.5">Request items for your vessel — no ERP login required</p>
          </div>
          <button
            onClick={() => setCartOpen(true)}
            className="lg:hidden relative flex items-center gap-2 border rounded-lg px-3 py-2 text-sm font-medium"
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
                className="w-full h-10 pl-9 pr-3 text-sm border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#bdac7e]"
                placeholder="Search item name or SKU..."
                value={search} onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button
              onClick={() => setCustomModal(true)}
              className="flex items-center justify-center gap-2 h-10 px-4 rounded-lg border-2 border-dashed text-sm font-medium transition-colors shrink-0"
              style={{ borderColor: GOLD, color: GOLD_DARK }}
            >
              <ImagePlus className="h-4 w-4" /> Custom Request
            </button>
          </div>

          <div className="bg-white border rounded-lg p-3">
            <div className="inline-flex gap-1 bg-muted rounded-md p-1 mb-2.5 flex-wrap">
              <button onClick={() => { setActiveType('All'); setActiveCat('All') }}
                className={cn('px-3 py-1.5 rounded text-xs font-semibold transition-colors', activeType === 'All' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground')}>
                All Items
              </button>
              {ITEM_TYPES.map(t => (
                <button key={t} onClick={() => { setActiveType(t); setActiveCat('All') }}
                  className={cn('px-3 py-1.5 rounded text-xs font-semibold transition-colors', activeType === t ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground')}>
                  {ITEM_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {categories.map(c => (
                <button key={c} onClick={() => setActiveCat(c)}
                  className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    activeCat === c ? 'text-white border-transparent' : 'bg-white text-muted-foreground')}
                  style={activeCat === c ? { background: GOLD } : undefined}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {[...Array(8)].map((_, i) => <div key={i} className="rounded-xl border bg-white h-52 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No items found. Try a different search or use Custom Request.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtered.map(item => {
                const hasPurchaseUnit = !!(item.purchaseUnit && item.purchaseUnit !== item.baseUnit && item.conversionFactor > 1)
                const baseLine = cart.find(l => l.key === `${item.id}-${item.baseUnit}`)
                const purchaseLine = hasPurchaseUnit ? cart.find(l => l.key === `${item.id}-${item.purchaseUnit}`) : undefined
                return (
                  <div key={item.id} className="bg-white rounded-xl border overflow-hidden flex flex-col">
                    <div className="aspect-square bg-muted/40 flex items-center justify-center overflow-hidden">
                      {item.imageKey ? <img src={item.imageKey} alt={item.name} className="w-full h-full object-cover" /> : <Package className="h-8 w-8 text-muted-foreground/30" />}
                    </div>
                    <div className="p-3 flex flex-col flex-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: GOLD_DARK }}>{item.category}</span>
                      <p className="text-sm font-medium leading-snug mt-0.5 line-clamp-2">{item.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {hasPurchaseUnit ? `${item.baseUnit} · ${item.purchaseUnit} (${item.conversionFactor}×)` : item.baseUnit}
                      </p>
                      <div className="mt-auto pt-2 space-y-1.5">
                        {baseLine ? (
                          <div className="flex items-center justify-between gap-1 bg-muted/50 rounded-lg p-1">
                            <button onClick={() => changeQty(baseLine.key, -1)} className="w-7 h-7 rounded-md bg-white shadow-sm flex items-center justify-center hover:bg-muted transition-colors">
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-xs font-semibold tabular-nums">{baseLine.quantity} {item.baseUnit}</span>
                            <button onClick={() => changeQty(baseLine.key, 1)} className="w-7 h-7 rounded-md bg-white shadow-sm flex items-center justify-center hover:bg-muted transition-colors">
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => addToCart(item, item.baseUnit)}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-white text-xs font-semibold transition-colors" style={{ background: GOLD }}
                            onMouseEnter={e => (e.currentTarget.style.background = GOLD_DARK)} onMouseLeave={e => (e.currentTarget.style.background = GOLD)}>
                            <Plus className="h-3.5 w-3.5" /> Add {capitalize(item.baseUnit)}
                          </button>
                        )}

                        {hasPurchaseUnit && (
                          purchaseLine ? (
                            <div className="flex items-center justify-between gap-1 bg-muted/50 rounded-lg p-1">
                              <button onClick={() => changeQty(purchaseLine.key, -1)} className="w-7 h-7 rounded-md bg-white shadow-sm flex items-center justify-center hover:bg-muted transition-colors">
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="text-xs font-semibold tabular-nums">{purchaseLine.quantity} {item.purchaseUnit}</span>
                              <button onClick={() => changeQty(purchaseLine.key, 1)} className="w-7 h-7 rounded-md bg-white shadow-sm flex items-center justify-center hover:bg-muted transition-colors">
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => addToCart(item, item.purchaseUnit!)}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors"
                              style={{ borderColor: GOLD, color: GOLD_DARK }}>
                              <Plus className="h-3.5 w-3.5" /> Add {capitalize(item.purchaseUnit!)}
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b">
              <div>
                <h3 className="font-bold text-lg">Custom Request</h3>
                <p className="text-xs text-muted-foreground mt-0.5">For items not in the catalog — this won't create a new catalog item, it's just added to your request for purchasing to review</p>
              </div>
              <button onClick={() => setCustomModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description <span className="text-red-500">*</span></label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#bdac7e]"
                  rows={3} placeholder="What do you need? Be as specific as possible..."
                  value={customForm.itemName} onChange={e => setCustomForm(f => ({ ...f, itemName: e.target.value }))} autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quantity</label>
                  <input type="number" min={1} className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]"
                    value={customForm.quantity} onChange={e => setCustomForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unit</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]" placeholder="pcs"
                    value={customForm.unit} onChange={e => setCustomForm(f => ({ ...f, unit: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#bdac7e]"
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
                  <button onClick={() => customFileRef.current?.click()} disabled={compressingCustomImage} {...customImageDropProps}
                    className={`aspect-square flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-lg transition-colors disabled:opacity-50 ${
                      isDraggingCustomImage ? 'border-[#bdac7e] bg-[#bdac7e]/10 text-[#8a7040]' : 'text-muted-foreground hover:bg-muted/30'
                    }`}>
                    <Camera className="h-5 w-5" />
                    <span className="text-[11px] text-center px-1">{compressingCustomImage ? 'Processing…' : isDraggingCustomImage ? 'Drop' : 'Add photo'}</span>
                  </button>
                </div>
                <input ref={customFileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleCustomImages} />
              </div>
            </div>
            <div className="flex gap-3 justify-end px-6 py-4 border-t bg-muted/20">
              <button onClick={() => setCustomModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted">Cancel</button>
              <button onClick={addCustomToCart} disabled={!customForm.itemName.trim()}
                className="px-5 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-40 transition-colors" style={{ background: GOLD }}>
                Add to Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RequestSidebar({
  cart, removeLine, changeQty,
  employees, employeeId, setEmployeeId, employeeOpen, setEmployeeOpen, selectedEmployee,
  locations, locationId, setLocationId,
  notes, setNotes,
  submit, submitting, submitError,
  embedded = false,
}: {
  cart: CartLine[]; removeLine: (key: string) => void; changeQty: (key: string, delta: number) => void
  employees: EmployeeLite[]; employeeId: string; setEmployeeId: (id: string) => void
  employeeOpen: boolean; setEmployeeOpen: (v: boolean) => void; selectedEmployee: EmployeeLite | null
  locations: LocationLite[]; locationId: string; setLocationId: (id: string) => void
  notes: string; setNotes: (v: string) => void
  submit: () => void; submitting: boolean; submitError: string
  embedded?: boolean
}) {
  return (
    <div className={cn('bg-white rounded-xl border flex flex-col', !embedded && 'max-h-[calc(100vh-104px)]')}>
      {!embedded && (
        <div className="flex items-center gap-2 px-5 py-4 border-b shrink-0">
          <ShoppingCart className="h-4 w-4" style={{ color: GOLD_DARK }} />
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
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vessel / Location</label>
          <select
            className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-[#bdac7e]"
            value={locationId} onChange={e => setLocationId(e.target.value)}
          >
            <option value="">Select vessel or location…</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
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

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</label>
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#bdac7e]"
            rows={2} placeholder="Anything else purchasing should know..."
            value={notes} onChange={e => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="p-5 border-t shrink-0">
        <button
          onClick={submit} disabled={submitting || cart.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-white text-sm font-semibold disabled:opacity-40 transition-colors"
          style={{ background: GOLD }}
          onMouseEnter={e => { if (!submitting && cart.length) e.currentTarget.style.background = GOLD_DARK }}
          onMouseLeave={e => (e.currentTarget.style.background = GOLD)}
        >
          <Send className="h-4 w-4" /> {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
      </div>
    </div>
  )
}
