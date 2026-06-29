'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, ChevronRight, Trash2, Package, Search, FileText, ChevronDown, Check, Building2, MapPin, CheckCircle2 } from 'lucide-react'

interface PurchaseItem { id: string; name: string; sku: string; baseUnit: string; purchaseUnit: string; avgPrice: number; isActive: boolean }
interface SupplierLocation { city: string; address: string }
interface Supplier { id: string; name: string; locations: SupplierLocation[]; contact: string | null; phone: string | null }
interface StockLocation { id: string; name: string; type: string; managedBy: string; isActive: boolean }
interface RequestLine { itemId: string; itemName: string; baseUnit: string; purchaseUnit: string; itemUnit: string; unit?: string; quantity: number; estimatedCost: number; supplierId: string; supplierName: string; supplierSearch: string; supplierOpen: boolean; notes: string; search: string; open: boolean; currentStock?: number | null; minStock?: number | null; conversionFactor?: number | null }
interface PurchaseRequest {
  id: string
  prNumber: string
  status: string
  deliveryLocationId: string | null
  deliveryLocation: { id: string; name: string; type: string; managedBy: string } | null
  itemCount: number
  totalBudget: number
  notes: string | null
  createdAt: string
  requestedBy: { name: string } | null
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', SENT: 'Requested', APPROVED: 'Approved', REJECTED: 'Rejected',
  ORDERED: 'Ordered', PARTIALLY_RECEIVED: 'Partially Received', RECEIVED: 'Received', CANCELLED: 'Cancelled',
}
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground', SENT: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700',
  ORDERED: 'bg-amber-100 text-amber-700', PARTIALLY_RECEIVED: 'bg-orange-100 text-orange-700',
  RECEIVED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700',
}
const FILTER_TABS = [
  { key: 'ALL', label: 'All' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SENT', label: 'Requested' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'ORDERED', label: 'Ordered' },
]

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([])
  const [items, setItems] = useState<PurchaseItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [selected, setSelected] = useState<PurchaseRequest | null>(null)
  const [detail, setDetail] = useState<(PurchaseRequest & { items: RequestLine[] }) | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Form state
  const [deliveryLocationId, setDeliveryLocationId] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<RequestLine[]>([{ itemId: '', itemName: '', baseUnit: '', purchaseUnit: '', itemUnit: '', quantity: 1, estimatedCost: 0, supplierId: '', supplierName: '', supplierSearch: '', supplierOpen: false, notes: '', search: '', open: false }])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [supplierModal, setSupplierModal] = useState<{ idx: number } | null>(null)
  const [supplierModalSearch, setSupplierModalSearch] = useState('')
  const [supplierFilterCity, setSupplierFilterCity] = useState('All')
  const [itemModal, setItemModal] = useState(false)
  const [itemModalSearch, setItemModalSearch] = useState('')
  const [itemModalSelected, setItemModalSelected] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const [rRes, iRes, sRes, lRes] = await Promise.all([
      fetch('/api/purchasing/requests'),
      fetch('/api/purchasing/items'),
      fetch('/api/purchasing/suppliers'),
      fetch('/api/purchasing/locations'),
    ])
    if (rRes.ok) setRequests(await rRes.json())
    if (iRes.ok) setItems((await iRes.json()).filter((i: PurchaseItem & { isActive: boolean }) => i.isActive))
    if (sRes.ok) setSuppliers((await sRes.json()).filter((s: Supplier & { isActive: boolean }) => s.isActive))
    if (lRes.ok) setLocations((await lRes.json()).filter((l: StockLocation) => l.isActive))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function openDetail(req: PurchaseRequest) {
    setSelected(req)
    setView('detail')
    setDetailLoading(true)
    const res = await fetch(`/api/purchasing/requests/${req.id}`)
    if (res.ok) setDetail(await res.json())
    setDetailLoading(false)
  }

  function addLine() {
    setLines(l => [...l, { itemId: '', itemName: '', baseUnit: '', purchaseUnit: '', itemUnit: '', quantity: 1, estimatedCost: 0, supplierId: '', supplierName: '', supplierSearch: '', supplierOpen: false, notes: '', search: '', open: false }])
  }

  function removeLine(i: number) {
    setLines(l => l.filter((_, idx) => idx !== i))
  }

  function pickItem(lineIdx: number, item: PurchaseItem) {
    setLines(l => l.map((line, i) => i !== lineIdx ? line : {
      ...line,
      itemId: item.id, itemName: item.name,
      baseUnit: item.baseUnit, purchaseUnit: item.purchaseUnit,
      itemUnit: item.purchaseUnit,
      estimatedCost: item.avgPrice > 0 ? item.avgPrice : line.estimatedCost,
      search: '', open: false,
      supplierName: line.supplierName,
    }))
  }

  function updateLine(idx: number, field: keyof RequestLine, value: string | number | boolean) {
    setLines(l => l.map((line, i) => i !== idx ? line : { ...line, [field]: value }))
  }

  async function quickAddSupplier(idx: number, name: string) {
    const res = await fetch('/api/purchasing/suppliers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) return
    const s: Supplier = await res.json()
    setSuppliers(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)))
    setLines(l => l.map((li, i) => i !== idx ? li : { ...li, supplierId: s.id, supplierName: s.name, supplierSearch: '', supplierOpen: false }))
  }

  async function submit() {
    setSaving(true)
    setSaveError('')
    const invalid = lines.find(l => !l.itemName || !l.quantity || l.quantity <= 0)
    if (invalid) { setSaveError('Fill in name and quantity for all rows'); setSaving(false); return }
    const res = await fetch('/api/purchasing/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliveryLocationId: deliveryLocationId || undefined, notes, items: lines.map(l => ({ ...l, unit: l.itemUnit || l.baseUnit || 'pcs', supplierId: l.supplierId || null, supplierName: l.supplierName || null })) }),
    })
    const data = await res.json()
    if (!res.ok) { setSaveError(data.error ?? 'An error occurred'); setSaving(false); return }
    setSaving(false)
    setView('list')
    setDeliveryLocationId(''); setNotes(''); setLines([{ itemId: '', itemName: '', baseUnit: '', purchaseUnit: '', itemUnit: '', quantity: 1, estimatedCost: 0, supplierId: '', supplierName: '', supplierSearch: '', supplierOpen: false, notes: '', search: '', open: false }])
    load()
  }

  async function changeStatus(id: string, status: string) {
    const res = await fetch(`/api/purchasing/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Failed to update status'); return }
    setSelected(s => s?.id === id ? { ...s, status } : s)
    load()
  }

  async function deleteReq(req: PurchaseRequest) {
    if (!confirm(`Delete ${req.prNumber}?`)) return
    const res = await fetch(`/api/purchasing/requests/${req.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Failed to delete'); return }
    setView('list'); load()
  }

  // ── List view ──
  if (view === 'list') {
    const filtered = filterStatus === 'ALL' ? requests : requests.filter(r => r.status === filterStatus)
    const counts = FILTER_TABS.reduce<Record<string, number>>((acc, t) => {
      acc[t.key] = t.key === 'ALL' ? requests.length : requests.filter(r => r.status === t.key).length
      return acc
    }, {})
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

      {/* Filter tabs */}
      <div className="flex gap-1 border-b">
        {FILTER_TABS.filter(t => t.key === 'ALL' || counts[t.key] > 0).map(t => (
          <button key={t.key} onClick={() => setFilterStatus(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
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

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
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
                {requests.length === 0 ? 'No PRs yet. Click "New PR" to get started.' : `No PRs with status "${STATUS_LABEL[filterStatus] ?? filterStatus}".`}
              </td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(r)}>
                <td className="px-4 py-3 font-mono text-sm font-medium">{r.prNumber}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {r.deliveryLocation ? (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />{r.deliveryLocation.name}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.requestedBy?.name ?? '—'}</td>
                <td className="px-4 py-3 text-center text-muted-foreground">{r.itemCount}</td>
                <td className="px-4 py-3 text-right tabular-nums text-sm">
                  {r.totalBudget > 0
                    ? <span className="font-medium">Rp {new Intl.NumberFormat('id-ID').format(r.totalBudget)}</span>
                    : <span className="text-muted-foreground/40">—</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.createdAt)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status] ?? ''}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                </td>
                <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                  {r.status === 'SENT' ? (
                    <button
                      onClick={() => changeStatus(r.id, 'APPROVED')}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors whitespace-nowrap">
                      <CheckCircle2 className="h-3 w-3" /> Approve
                    </button>
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
  }

  // ── Create view ──
  if (view === 'create') {
    const total = lines.reduce((s, l) => s + l.quantity * l.estimatedCost, 0)
    const inp = 'w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white transition-colors'
    const numInp = `${inp} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-right`
    return (
      <div className="space-y-6">

        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Back</button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">Create Purchase Request</span>
        </div>

        {saveError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{saveError}</div>}

        {/* Request Info */}
        <div className="rounded-xl border bg-white">
          <div className="px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">Request Info</h3>
          </div>
          <div className="p-5 grid grid-cols-2 gap-4 items-start">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Delivery Location</label>
                {deliveryLocationId && (() => {
                  const loc = locations.find(l => l.id === deliveryLocationId)
                  return loc ? (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {loc.managedBy === 'PURCHASING' ? 'Purchasing' : 'Warehouse'} team
                    </span>
                  ) : null
                })()}
              </div>
              <select className={inp} value={deliveryLocationId} onChange={e => setDeliveryLocationId(e.target.value)}>
                <option value="">— Select location —</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Notes <span className="font-normal">(optional)</span></label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white resize-none transition-colors"
                rows={2} placeholder="Additional notes for the purchasing team..."
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">Items</h3>
            <div className="flex gap-2">
              <button onClick={() => { setItemModal(true); setItemModalSearch(''); setItemModalSelected(new Set()) }}
                className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 border border-amber-200 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add Items
              </button>
              <button onClick={addLine}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border px-3 py-1.5 rounded-lg transition-colors">
                + Empty Row
              </button>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/30">
              <tr>
                <th className="text-center w-8 px-3 py-2.5 font-medium">#</th>
                <th className="text-left px-3 py-2.5 font-medium">Item</th>
                <th className="text-left px-3 py-2.5 font-medium w-44">Qty / Unit</th>
                <th className="text-left px-3 py-2.5 font-medium">Supplier</th>
                <th className="text-left px-3 py-2.5 font-medium w-40">Est. Unit Price</th>
                <th className="text-right px-4 py-2.5 font-medium w-32">Subtotal</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((line, idx) => {
                const subtotal = line.quantity * line.estimatedCost
                return (
                  <tr key={idx} className="group hover:bg-muted/20 transition-colors">
                    <td className="text-center px-3 py-3 text-xs text-muted-foreground">{idx + 1}</td>

                    {/* Item picker — opens modal */}
                    <td className="px-2 py-2.5">
                      <button
                        onClick={() => { setItemModal(true); setItemModalSearch(''); setItemModalSelected(new Set()) }}
                        className={`${inp} text-left flex items-center gap-2 ${!line.itemName ? 'text-muted-foreground' : ''}`}>
                        {line.itemName
                          ? <><Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="flex-1 truncate">{line.itemName}</span></>
                          : <><Search className="h-3.5 w-3.5 shrink-0" /><span>Select item...</span></>
                        }
                      </button>
                    </td>

                    {/* Qty + Unit inline */}
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <input type="number" min={0.01} step="any"
                          style={{ width: 72 }}
                          className="h-9 shrink-0 border rounded-md px-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={line.quantity}
                          onChange={e => updateLine(idx, 'quantity', Number(e.target.value))} />
                        {line.baseUnit ? (
                          line.baseUnit === line.purchaseUnit ? (
                            <span className="h-9 inline-flex items-center text-xs text-muted-foreground bg-muted px-2.5 rounded-md border whitespace-nowrap">{line.baseUnit}</span>
                          ) : (
                            <div className="flex rounded-md border overflow-hidden h-9 shrink-0">
                              {[line.purchaseUnit, line.baseUnit].map(u => (
                                <button key={u} onClick={() => updateLine(idx, 'itemUnit', u)}
                                  className={`h-9 text-xs font-medium px-2.5 transition-colors whitespace-nowrap ${line.itemUnit === u ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:bg-muted'}`}>
                                  {u}
                                </button>
                              ))}
                            </div>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>

                    {/* Supplier — opens modal */}
                    <td className="px-2 py-2.5">
                      <button onClick={() => { setSupplierModal({ idx }); setSupplierModalSearch('') }}
                        className={`${inp} text-left flex items-center gap-2 ${!line.supplierName ? 'text-muted-foreground' : ''}`}>
                        {line.supplierName
                          ? <><Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="flex-1 truncate">{line.supplierName}</span></>
                          : <><Search className="h-3.5 w-3.5 shrink-0" /><span>Select supplier...</span></>
                        }
                      </button>
                    </td>

                    {/* Est. Price */}
                    <td className="px-2 py-2.5">
                      <input type="number" min={0} step="any" className={numInp} value={line.estimatedCost}
                        onChange={e => updateLine(idx, 'estimatedCost', Number(e.target.value))} />
                    </td>

                    <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                      {subtotal > 0 ? `Rp ${new Intl.NumberFormat('id-ID').format(subtotal)}` : <span className="text-muted-foreground font-normal">—</span>}
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
              <span className="text-sm text-muted-foreground">Estimated Total</span>
              <span className="text-lg font-bold">Rp {new Intl.NumberFormat('id-ID').format(total)}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pb-4">
          <button onClick={() => setView('list')} className="px-5 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex items-center gap-2 px-6 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 font-semibold transition-colors">
            {saving ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</> : 'Save as Draft'}
          </button>
        </div>

        {/* ── Supplier picker modal ── */}
        {supplierModal && (() => {
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
                        placeholder="Search supplier..." value={supplierModalSearch} onChange={e => setSupplierModalSearch(e.target.value)} />
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
                    {filtered.map(s => (
                      <button key={s.id} onClick={() => { setLines(l => l.map((li, i) => i !== supplierModal.idx ? li : { ...li, supplierId: s.id, supplierName: s.name })); setSupplierModal(null) }}
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
                        {lines[supplierModal.idx]?.supplierId === s.id && <Check className="h-4 w-4 text-amber-600 shrink-0" />}
                      </button>
                    ))}
                    {supplierModalSearch.trim() && !suppliers.some(s => s.name.toLowerCase() === supplierModalSearch.toLowerCase()) && (
                      <button onClick={() => quickAddSupplier(supplierModal.idx, supplierModalSearch.trim()).then(() => setSupplierModal(null))}
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

        {/* ── Item multi-select modal ── */}
        {itemModal && (() => {
          const q = itemModalSearch.toLowerCase()
          const filteredItems = items.filter(i => i.isActive && (!q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)))
          const toggle = (id: string) => setItemModalSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
          const addSelected = () => {
            const toAdd = items.filter(i => itemModalSelected.has(i.id))
            const newLines = toAdd.map(item => ({
              itemId: item.id, itemName: item.name, baseUnit: item.baseUnit, purchaseUnit: item.purchaseUnit,
              itemUnit: item.purchaseUnit, quantity: 1, estimatedCost: item.avgPrice > 0 ? item.avgPrice : 0,
              supplierId: '', supplierName: '', supplierSearch: '', supplierOpen: false, notes: '', search: '', open: false,
            }))
            setLines(l => {
              const hasEmpty = l.length === 1 && !l[0].itemId
              return hasEmpty ? newLines : [...l, ...newLines]
            })
            setItemModal(false)
          }
          return (
            <>
              <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setItemModal(false)} />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[82vh]">
                  <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
                    <h3 className="font-semibold text-base">Add Items</h3>
                    <button onClick={() => setItemModal(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
                  </div>
                  <div className="px-4 py-3 border-b shrink-0">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <input autoFocus className="w-full h-10 border rounded-lg pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="Search item name or SKU..." value={itemModalSearch} onChange={e => setItemModalSearch(e.target.value)} />
                    </div>
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {filteredItems.map(item => (
                      <label key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-amber-50 border-b last:border-0 cursor-pointer transition-colors">
                        <input type="checkbox" checked={itemModalSelected.has(item.id)} onChange={() => toggle(item.id)}
                          className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 accent-amber-500" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.sku} · {item.purchaseUnit}{item.purchaseUnit !== item.baseUnit ? ` / ${item.baseUnit}` : ''}</p>
                        </div>
                        {item.avgPrice > 0 && (
                          <span className="text-sm text-amber-700 font-medium shrink-0">Rp {new Intl.NumberFormat('id-ID').format(item.avgPrice)}</span>
                        )}
                      </label>
                    ))}
                    {filteredItems.length === 0 && (
                      <p className="px-5 py-8 text-sm text-muted-foreground text-center">No items found.</p>
                    )}
                  </div>
                  <div className="px-5 py-4 border-t shrink-0 flex items-center justify-between bg-muted/20">
                    <span className="text-sm text-muted-foreground">
                      {itemModalSelected.size > 0 ? `${itemModalSelected.size} item selected` : 'Select items above'}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => setItemModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                      <button onClick={addSelected} disabled={itemModalSelected.size === 0}
                        className="px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 font-semibold transition-colors">
                        Add {itemModalSelected.size > 0 ? itemModalSelected.size : ''} Item{itemModalSelected.size !== 1 ? 's' : ''}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )
        })()}
      </div>
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
            <h2 className="text-2xl font-bold tracking-tight">{selected.prNumber}</h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              {fmtDate(selected.createdAt)} · by {selected.requestedBy?.name ?? '—'} ·{' '}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[selected.status] ?? ''}`}>
                {STATUS_LABEL[selected.status] ?? selected.status}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-1">
            {selected.status === 'DRAFT' && (
              <>
                <button onClick={() => changeStatus(selected.id, 'SENT')}
                  className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium transition-colors">
                  Submit Request
                </button>
                <button onClick={() => deleteReq(selected)}
                  className="px-4 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                  Delete
                </button>
              </>
            )}
            {selected.status === 'SENT' && (
              <>
                <button onClick={() => changeStatus(selected.id, 'APPROVED')}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors">
                  Approve
                </button>
                <button onClick={() => changeStatus(selected.id, 'REJECTED')}
                  className="px-4 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                  Reject
                </button>
              </>
            )}
            {selected.status === 'APPROVED' && (
              <span className="text-sm text-muted-foreground italic">Ready to be ordered</span>
            )}
            {selected.status === 'REJECTED' && (
              <button onClick={() => changeStatus(selected.id, 'DRAFT')}
                className="px-4 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-muted transition-colors">
                Revert to Draft
              </button>
            )}
          </div>
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
              {detail.notes && <div><p className="text-xs text-muted-foreground">Notes</p><p>{detail.notes}</p></div>}
            </div>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <div className="px-5 py-3 bg-muted/50 border-b">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Item List</p>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b text-xs text-muted-foreground bg-muted/20">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium">Item</th>
                  <th className="text-left px-5 py-2.5 font-medium">Supplier</th>
                  <th className="text-right px-5 py-2.5 font-medium">Requested</th>
                  <th className="text-right px-5 py-2.5 font-medium">Current Stock</th>
                  <th className="text-right px-5 py-2.5 font-medium">Est. Price</th>
                  <th className="text-right px-5 py-2.5 font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {detail.items.map((item, i) => {
                  const stock = item.currentStock ?? null
                  const min = item.minStock ?? 0
                  const stockColor = stock === null ? '' : stock === 0 ? 'text-red-600 font-semibold' : stock < min ? 'text-orange-500 font-semibold' : 'text-green-700'
                  return (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-5 py-3">
                        <p className="font-medium">{item.itemName}</p>
                        {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{item.supplierName ?? <span className="text-muted-foreground/50 italic">—</span>}</td>
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
                      <td className="px-5 py-3 text-right text-muted-foreground">Rp {new Intl.NumberFormat('id-ID').format(item.estimatedCost)}</td>
                      <td className="px-5 py-3 text-right font-medium">Rp {new Intl.NumberFormat('id-ID').format(item.quantity * item.estimatedCost)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-muted/30 border-t">
                <tr>
                  <td colSpan={5} className="px-5 py-3 text-sm font-semibold text-right">Estimated Total</td>
                  <td className="px-5 py-3 text-right font-bold">
                    Rp {new Intl.NumberFormat('id-ID').format(detail.items.reduce((s, i) => s + i.quantity * i.estimatedCost, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
