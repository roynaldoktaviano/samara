'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, ChevronRight, X, ArrowRight, Package, Trash2, Search, Camera, AlertTriangle, CheckCircle2, ArrowLeftRight } from 'lucide-react'
import { useFileDrop } from '@/hooks/useFileDrop'

interface StockLocation { id: string; name: string; type: string }
// Normalized picker row — flattens /api/purchasing/stock's discriminated
// {kind:'stock', item:{...}} / {kind:'non-stock', itemName, sourcePoId, ...}
// response into one shape the picker can key/filter/render uniformly. A
// non-stock row's own id (its StockLot id) is what breaks the collision bug
// stock items don't have: two different custom items at the same location
// used to both synthesize to the same `item.id: null`.
interface StockPickerRow {
  kind: 'stock' | 'non-stock'
  id: string
  name: string
  sku: string
  baseUnit: string
  purchaseUnit: string | null
  conversionFactor: number
  qty: number
  sourcePoId?: string | null
  poNumber?: string | null
}
interface TeamUser { id: string; name: string; role: string }
interface TransferItem { id: string; itemId: string | null; itemName: string; baseUnit: string | null; purchaseUnit: string | null; conversionFactor: number; requestedQty: number; dispatchedQty: number; receivedQty: number; availableQty?: number | null; unitCost?: number; requestedValue?: number; dispatchedValue?: number; receivedValue?: number }
interface StockTransfer {
  id: string; transferNumber: string; status: string; notes: string | null
  fromLocationId: string; toLocationId: string
  fromLocation: StockLocation | null; toLocation: StockLocation | null
  itemCount: number; contents: string | null
  totalValue?: number
  hasDispatchPhoto: boolean; hasReceivePhoto: boolean
  dispatchPhotoKey?: string | null; receivePhotoKey?: string | null
  dispatchedBy?: { id: string; name: string } | null
  receivedBy?: { id: string; name: string } | null
  expectedReceivedBy?: { id: string; name: string } | null
  createdAt: string; dispatchedAt: string | null; receivedAt: string | null
  // Set when this transfer is one auto-chained leg of a PO's shipping route — see
  // src/lib/purchasing/transitChain.ts.
  purchaseOrderId?: string | null
  legSequence?: number | null
  purchaseOrder?: { id: string; poNumber: string } | null
}
interface TransferDetail extends StockTransfer { items: TransferItem[]; expectedReceiverName?: string | null; receivedByName?: string | null }

const STATUS_LABEL: Record<string, string> = { PENDING: 'Pending', DISPATCHED: 'In Transit', RECEIVED: 'Received', CANCELLED: 'Cancelled' }
const STATUS_COLOR: Record<string, string> = { PENDING: 'bg-muted text-muted-foreground', DISPATCHED: 'bg-amber-100 text-amber-700', RECEIVED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700' }
const fmtDate = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtTime = (s: string) => new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n))

function compressPhoto(file: File): Promise<string> {
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

function PhotoUpload({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const b64 = await compressPhoto(f)
    onChange(b64)
  }
  const { isDragging, dropProps } = useFileDrop(async files => { if (files[0]) onChange(await compressPhoto(files[0])) })
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label} <span className="text-destructive">*</span></label>
      {value ? (
        <div className="relative rounded-lg overflow-hidden border">
          <img src={value} className="w-full max-h-40 object-cover" />
          <button onClick={() => onChange('')} className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <button onClick={() => ref.current?.click()} {...dropProps} className={`w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-6 transition-colors ${
          isDragging ? 'border-amber-400 bg-amber-50 text-amber-700' : 'text-muted-foreground hover:bg-muted/30'
        }`}>
          <Camera className="h-6 w-6" />
          <span className="text-sm">{isDragging ? 'Drop to upload' : 'Tap or drag to upload photo'}</span>
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
    </div>
  )
}

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([])
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [detail, setDetail] = useState<TransferDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [warehouseStock, setWarehouseStock] = useState<StockPickerRow[]>([])

  // Create form
  const [fromLoc, setFromLoc] = useState('')
  const [toLoc, setToLoc] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<{ itemId: string; itemName: string; baseUnit: string; purchaseUnit: string | null; conversionFactor: number; inputQty: number; usePurchaseUnit: boolean; availableQty: number }[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Item picker modal
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set())
  // Non-stock (custom PO) items are traceable to the PO that delivered them —
  // this lets "pick items from a specific delivered PO" work as a filter over
  // the same location-scoped list, instead of a separate PO-browsing flow.
  const [pickerPoFilter, setPickerPoFilter] = useState('')

  // Dispatch modal
  const [dispatchModal, setDispatchModal] = useState(false)
  const [dispatchLines, setDispatchLines] = useState<{ itemId: string; itemName: string; baseUnit: string; purchaseUnit: string | null; conversionFactor: number; max: number; qty: number; originalQty: number; editing: boolean; usePurchaseUnit: boolean }[]>([])
  const [dispatchPhoto, setDispatchPhoto] = useState('')
  const [expectedReceiverName, setExpectedReceiverName] = useState('')
  const [dispatchSaving, setDispatchSaving] = useState(false)
  const [dispatchError, setDispatchError] = useState('')

  // Receive modal
  const [receiveModal, setReceiveModal] = useState(false)
  const [receiveLines, setReceiveLines] = useState<{ itemId: string; itemName: string; baseUnit: string; purchaseUnit: string | null; conversionFactor: number; max: number; qty: number; originalQty: number; editing: boolean; usePurchaseUnit: boolean }[]>([])
  const [receivePhoto, setReceivePhoto] = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [receiverNameEditing, setReceiverNameEditing] = useState(false)
  const [receiverNameOriginal, setReceiverNameOriginal] = useState('')
  const [receiveSaving, setReceiveSaving] = useState(false)
  const [receiveError, setReceiveError] = useState('')

  // Crew receive link — no-login link crew can open to confirm receiving this transfer
  // themselves, see src/app/crew-receive/[token]/page.tsx.
  const [crewLinkModal, setCrewLinkModal] = useState(false)
  const [crewLink, setCrewLink] = useState('')
  const [crewLinkLoading, setCrewLinkLoading] = useState(false)
  const [crewLinkError, setCrewLinkError] = useState('')
  const [crewLinkCopied, setCrewLinkCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [tRes, lRes, uRes] = await Promise.all([
      fetch('/api/purchasing/transfers'),
      fetch('/api/purchasing/locations'),
      fetch('/api/purchasing/team'),
    ])
    if (tRes.ok) setTransfers(await tRes.json())
    if (lRes.ok) setLocations((await lRes.json()).filter((l: StockLocation & { isActive?: boolean }) => l.isActive !== false))
    if (uRes.ok) setTeamUsers(await uRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function loadWarehouseStock(locId: string) {
    if (!locId) { setWarehouseStock([]); setLines([]); return }
    const res = await fetch('/api/purchasing/stock')
    if (!res.ok) return
    const data = await res.json()
    const locData = data.locations.find((l: { location: StockLocation; rows: unknown[] }) => l.location.id === locId)
    const rows: StockPickerRow[] = (locData?.rows ?? []).map((r: any) => r.kind === 'non-stock'
      ? { kind: 'non-stock', id: r.id, name: r.itemName, sku: '', baseUnit: r.unit ?? '', purchaseUnit: null, conversionFactor: 1, qty: r.qty, sourcePoId: r.sourcePoId, poNumber: r.poNumber }
      : { kind: 'stock', id: r.item.id, name: r.item.name, sku: r.item.sku, baseUnit: r.item.baseUnit, purchaseUnit: r.item.purchaseUnit, conversionFactor: r.item.conversionFactor, qty: r.qty }
    )
    setWarehouseStock(rows)
    setLines([])
  }

  function openPicker() {
    setPickerSearch(''); setPickerPoFilter('')
    setPickerSelected(new Set(lines.map(l => l.itemId || `name:${l.itemName}`)))
    setPickerOpen(true)
  }

  function confirmPicker() {
    const existing = new Map(lines.map(l => [l.itemId || `name:${l.itemName}`, l]))
    const next = [...pickerSelected].map(key => {
      if (existing.has(key)) return existing.get(key)!
      const s = warehouseStock.find(s => (s.kind === 'stock' ? s.id : `name:${s.name}`) === key)!
      const hasPurchaseUnit = s.kind === 'stock' && !!(s.purchaseUnit && s.purchaseUnit !== s.baseUnit && s.conversionFactor > 1)
      return {
        itemId: s.kind === 'stock' ? s.id : '',
        itemName: s.name,
        baseUnit: s.baseUnit,
        purchaseUnit: s.purchaseUnit,
        conversionFactor: s.conversionFactor,
        inputQty: 1,
        usePurchaseUnit: hasPurchaseUnit,
        availableQty: s.qty,
      }
    })
    setLines(next)
    setPickerOpen(false)
  }

  async function openDetail(t: StockTransfer) {
    setView('detail'); setDetailLoading(true)
    const res = await fetch(`/api/purchasing/transfers/${t.id}`)
    if (res.ok) setDetail(await res.json())
    setDetailLoading(false)
  }

  async function submit() {
    setSaving(true); setSaveError('')
    if (!fromLoc || !toLoc) { setSaveError('Pilih lokasi asal dan tujuan'); setSaving(false); return }
    const validLines = lines.filter(l => l.itemId && l.inputQty > 0)
    if (!validLines.length) { setSaveError('Tambahkan minimal 1 item'); setSaving(false); return }
    const res = await fetch('/api/purchasing/transfers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromLocationId: fromLoc, toLocationId: toLoc, notes, items: validLines.map(l => ({
        itemId: l.itemId,
        itemName: l.itemName,
        requestedQty: l.usePurchaseUnit ? l.inputQty * l.conversionFactor : l.inputQty,
      })) }),
    })
    const data = await res.json()
    if (!res.ok) { setSaveError(data.error ?? 'Gagal menyimpan'); setSaving(false); return }
    setSaving(false); setView('list')
    setFromLoc(''); setToLoc(''); setNotes(''); setLines([])
    load()
  }

  function openDispatch() {
    if (!detail) return
    setDispatchLines(detail.items.map(i => {
      const hasPU = !!(i.purchaseUnit && i.purchaseUnit !== i.baseUnit && i.conversionFactor > 1)
      const cf = i.conversionFactor ?? 1
      const initQty = hasPU ? i.requestedQty / cf : i.requestedQty
      return { itemId: i.itemId ?? '', itemName: i.itemName, baseUnit: i.baseUnit ?? '', purchaseUnit: i.purchaseUnit ?? null, conversionFactor: cf, max: i.requestedQty, qty: initQty, originalQty: initQty, editing: false, usePurchaseUnit: hasPU }
    }))
    setDispatchPhoto(''); setExpectedReceiverName(''); setDispatchError(''); setDispatchModal(true)
  }

  function openReceive() {
    if (!detail) return
    setReceiveLines(detail.items.map(i => {
      const hasPU = !!(i.purchaseUnit && i.purchaseUnit !== i.baseUnit && i.conversionFactor > 1)
      const cf = i.conversionFactor ?? 1
      const initQty = hasPU ? i.dispatchedQty / cf : i.dispatchedQty
      return { itemId: i.itemId ?? '', itemName: i.itemName, baseUnit: i.baseUnit ?? '', purchaseUnit: i.purchaseUnit ?? null, conversionFactor: cf, max: i.dispatchedQty, qty: initQty, originalQty: initQty, editing: false, usePurchaseUnit: hasPU }
    }))
    const prefill = detail.expectedReceiverName ?? detail.expectedReceivedBy?.name ?? ''
    setReceivePhoto(''); setReceiverName(prefill); setReceiverNameOriginal(prefill); setReceiverNameEditing(false); setReceiveError(''); setReceiveModal(true)
  }

  async function openCrewLink() {
    if (!detail) return
    setCrewLink(''); setCrewLinkError(''); setCrewLinkCopied(false); setCrewLinkLoading(true); setCrewLinkModal(true)
    const res = await fetch(`/api/purchasing/transfers/${detail.id}/receive-link`, { method: 'POST' })
    const data = await res.json()
    setCrewLinkLoading(false)
    if (!res.ok) { setCrewLinkError(data.error ?? 'Gagal membuat link'); return }
    setCrewLink(data.link)
  }

  async function submitDispatch() {
    if (!detail) return
    if (!dispatchPhoto) { setDispatchError('Foto dispatch wajib diupload'); return }
    setDispatchSaving(true); setDispatchError('')
    const res = await fetch(`/api/purchasing/transfers/${detail.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'dispatch',
        dispatchPhotoKey: dispatchPhoto,
        expectedReceiverName: expectedReceiverName || null,
        items: dispatchLines.map(l => ({ itemId: l.itemId, itemName: l.itemName, dispatchedQty: l.usePurchaseUnit ? l.qty * l.conversionFactor : l.qty })),
      }),
    })
    const data = await res.json()
    if (!res.ok) { setDispatchError(data.error ?? 'Gagal'); setDispatchSaving(false); return }
    setDispatchSaving(false); setDispatchModal(false)
    openDetail(detail); load()
  }

  async function submitReceive() {
    if (!detail) return
    if (!receivePhoto) { setReceiveError('Foto penerimaan wajib diupload'); return }
    setReceiveSaving(true); setReceiveError('')
    const res = await fetch(`/api/purchasing/transfers/${detail.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'receive',
        receivePhotoKey: receivePhoto,
        receivedByName: receiverName || null,
        items: receiveLines.map(l => ({ itemId: l.itemId, itemName: l.itemName, receivedQty: l.usePurchaseUnit ? l.qty * l.conversionFactor : l.qty })),
      }),
    })
    const data = await res.json()
    if (!res.ok) { setReceiveError(data.error ?? 'Gagal'); setReceiveSaving(false); return }
    setReceiveSaving(false); setReceiveModal(false)
    openDetail(detail); load()
  }

  // ── List ──
  if (view === 'list') return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Stock Transfers</h2>
        <p className="text-muted-foreground text-sm mt-1">Move inventory between locations</p>
      </div>
      <div className="flex justify-end">
        <button onClick={() => { setFromLoc(''); setToLoc(''); setLines([]); setWarehouseStock([]); setView('create') }} className="flex items-center gap-2 bg-[#bdac7e] hover:bg-[#a89860] text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> Create Transfer
        </button>
      </div>
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Transfer No.</th>
              <th className="text-left px-4 py-3 font-medium">Route</th>
              <th className="text-left px-4 py-3 font-medium">Contents</th>
              <th className="text-right px-4 py-3 font-medium">Value</th>
              <th className="text-left px-4 py-3 font-medium">Photo</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i} className="border-t">
                  {[...Array(8)].map((_, j) => <td key={j} className="px-4 py-3.5"><div className="h-3.5 rounded bg-muted animate-pulse" style={{ width: j === 0 ? 100 : j === 7 ? 16 : 80 }} /></td>)}
                </tr>
              ))
            ) : transfers.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-sm text-muted-foreground">No transfers yet.</td></tr>
            ) : transfers.map(t => (
              <tr key={t.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(t)}>
                <td className="px-4 py-3 font-mono text-sm font-medium">
                  {t.transferNumber}
                  {t.purchaseOrder && (
                    <p className="font-sans text-[10px] text-muted-foreground font-normal mt-0.5">
                      PO {t.purchaseOrder.poNumber}{t.legSequence ? ` · Leg ${t.legSequence}` : ''}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-muted-foreground truncate max-w-[80px]">{t.fromLocation?.name ?? '—'}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate max-w-[80px]">{t.toLocation?.name ?? '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs max-w-[140px] truncate">{t.contents ?? `${t.itemCount} items`}</td>
                <td className="px-4 py-3 text-right text-xs font-medium tabular-nums whitespace-nowrap">{t.totalValue ? fmtMoney(t.totalValue) : '—'}</td>
                <td className="px-4 py-3">
                  {t.status === 'PENDING' ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : t.status === 'DISPATCHED' ? (
                    t.hasDispatchPhoto
                      ? <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> OK</span>
                      : <span className="flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> Missing</span>
                  ) : t.status === 'RECEIVED' ? (
                    <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> Both</span>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[t.status] ?? ''}`}>{STATUS_LABEL[t.status] ?? t.status}</span></td>
                <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  )

  // ── Create ──
  if (view === 'create') {
    const poOptions = Array.from(
      new Map(warehouseStock.filter(s => s.sourcePoId && s.poNumber).map(s => [s.sourcePoId!, s.poNumber!])).entries()
    ).map(([id, number]) => ({ id, number }))
    const pickerRows = warehouseStock.filter(s =>
      (s.name.toLowerCase().includes(pickerSearch.toLowerCase()) || s.sku.toLowerCase().includes(pickerSearch.toLowerCase()))
      && (!pickerPoFilter || s.sourcePoId === pickerPoFilter)
    )
    return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="text-muted-foreground hover:text-foreground text-sm">← Back</button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Create Transfer</h2>
            <p className="text-muted-foreground text-sm mt-0.5">Kirim stok antar lokasi</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setView('list')} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-6 py-2 text-sm bg-[#bdac7e] text-white rounded-md hover:bg-[#a89860] disabled:opacity-50 font-medium">{saving ? 'Menyimpan...' : 'Create Transfer'}</button>
        </div>
      </div>

      {saveError && <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">{saveError}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left: Route + Notes */}
        <div className="space-y-4">
          <div className="rounded-xl border overflow-hidden">
            <div className="px-5 py-3 bg-muted/40 border-b">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Route</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From <span className="text-destructive">*</span></label>
                <select className="w-full h-9 border rounded-md px-3 text-sm bg-background focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] outline-none transition" value={fromLoc} onChange={e => { setFromLoc(e.target.value); loadWarehouseStock(e.target.value) }}>
                  <option value="">Pilih lokasi asal...</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <div className="flex items-center justify-center w-7 h-7 rounded-full border bg-muted/40">
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">To <span className="text-destructive">*</span></label>
                <select className="w-full h-9 border rounded-md px-3 text-sm bg-background focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] outline-none transition" value={toLoc} onChange={e => setToLoc(e.target.value)}>
                  <option value="">Pilih lokasi tujuan...</option>
                  {locations.filter(l => l.id !== fromLoc).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="rounded-xl border overflow-hidden">
            <div className="px-5 py-3 bg-muted/40 border-b">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</h3>
            </div>
            <div className="p-5">
              <textarea className="w-full border rounded-md px-3 py-2 text-sm resize-none bg-background focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] outline-none transition" rows={3} placeholder="Catatan opsional..." value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Right: Items table */}
        <div className="xl:col-span-2 rounded-xl border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 bg-muted/40 border-b">
            <h3 className="font-semibold text-sm">Items to Ship</h3>
            <button
              onClick={openPicker}
              disabled={!fromLoc}
              className="flex items-center gap-1.5 text-sm font-medium text-[#bdac7e] hover:text-[#a89860] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <Plus className="h-4 w-4" /> Add Item
            </button>
          </div>

          {!fromLoc ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Package className="h-8 w-8 opacity-20" />
              <p className="text-sm">Pilih lokasi asal untuk melihat stok tersedia</p>
            </div>
          ) : lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Package className="h-8 w-8 opacity-20" />
              <p className="text-sm">Belum ada item</p>
              <button onClick={openPicker} className="text-sm text-[#bdac7e] hover:text-[#a89860] font-medium">+ Pilih item dari stok</button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground bg-muted/20 border-b">
                  <tr>
                    <th className="text-left px-5 py-2.5 font-medium">Item</th>
                    <th className="text-right px-5 py-2.5 font-medium w-36">Stok Tersedia</th>
                    <th className="text-right px-5 py-2.5 font-medium w-32">Qty to Ship</th>
                    <th className="w-10 px-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((line, idx) => (
                    <tr key={line.itemId} className="hover:bg-muted/20">
                      <td className="px-5 py-3">
                        <p className="font-medium text-sm">{line.itemName}</p>
                        <p className="text-xs text-muted-foreground">{line.baseUnit}</p>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-sm">
                        <span className="font-medium">{line.availableQty}</span>
                        <span className="text-xs text-muted-foreground ml-1">{line.baseUnit}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number" min={1}
                              className="w-20 border rounded-md px-2.5 py-1.5 text-sm text-right tabular-nums focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] outline-none transition"
                              value={line.inputQty}
                              onChange={e => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, inputQty: Number(e.target.value) }))}
                            />
                            {line.purchaseUnit && line.purchaseUnit !== line.baseUnit && line.conversionFactor > 1 ? (
                              <button
                                title="Klik untuk ganti satuan"
                                onClick={() => setLines(l => l.map((li, i) => i !== idx ? li : { ...li, usePurchaseUnit: !li.usePurchaseUnit }))}
                                className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors shrink-0 cursor-pointer ${line.usePurchaseUnit ? 'bg-[#bdac7e] text-white border-[#bdac7e]' : 'text-muted-foreground border-dashed border-[#bdac7e]/60 hover:border-[#bdac7e] hover:text-[#bdac7e]'}`}
                              >
                                {line.usePurchaseUnit ? line.purchaseUnit : line.baseUnit}
                                <ArrowLeftRight className="h-2.5 w-2.5 opacity-70" />
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground shrink-0">{line.baseUnit}</span>
                            )}
                          </div>
                          {line.purchaseUnit && line.purchaseUnit !== line.baseUnit && line.conversionFactor > 1 && line.usePurchaseUnit && (
                            <p className="text-xs text-muted-foreground tabular-nums">
                              = {(line.inputQty * line.conversionFactor).toLocaleString()} {line.baseUnit}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => setLines(l => l.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <div className="px-5 py-2.5 border-t bg-muted/20">
                <button onClick={openPicker} className="text-xs text-[#bdac7e] hover:text-[#a89860] font-medium">+ Tambah / ubah item</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Item Picker Modal ── */}
      {pickerOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="font-semibold text-base">Pilih Item</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{pickerSelected.size} item dipilih</p>
              </div>
              <button onClick={() => setPickerOpen(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="px-5 py-3 border-b space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  className="w-full pl-9 pr-3 h-9 border rounded-md text-sm focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] outline-none"
                  placeholder="Cari nama item..."
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {poOptions.length > 0 && (
                <select
                  className="w-full h-8 border rounded-md px-2 text-xs bg-white focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] outline-none"
                  value={pickerPoFilter}
                  onChange={e => setPickerPoFilter(e.target.value)}
                >
                  <option value="">Semua sumber (stok &amp; PO manapun)</option>
                  {poOptions.map(po => <option key={po.id} value={po.id}>Dari PO {po.number}</option>)}
                </select>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto divide-y">
              {pickerRows.map(s => {
                  const key = s.kind === 'stock' ? s.id : `name:${s.name}`
                  const checked = pickerSelected.has(key)
                  return (
                    <button key={s.id}
                      onClick={() => setPickerSelected(prev => {
                        const next = new Set(prev)
                        checked ? next.delete(key) : next.add(key)
                        return next
                      })}
                      className={`w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/30 transition-colors ${checked ? 'bg-[#bdac7e]/6' : ''}`}>
                      <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${checked ? 'bg-[#bdac7e] border-[#bdac7e]' : 'border-muted-foreground/40'}`}>
                        {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.kind === 'stock' ? s.sku : (s.poNumber ? `Non-stock · PO ${s.poNumber}` : 'Non-stock')}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums shrink-0">{s.qty} <span className="text-xs font-normal text-muted-foreground">{s.baseUnit}</span></span>
                    </button>
                  )
                })}
              {pickerRows.length === 0 && (
                <div className="py-10 text-center text-sm text-muted-foreground">Item tidak ditemukan</div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t bg-muted/20">
              <button onClick={() => setPickerOpen(false)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Batal</button>
              <button onClick={confirmPicker} className="px-5 py-2 text-sm bg-[#bdac7e] text-white rounded-md hover:bg-[#a89860] font-medium">
                Konfirmasi ({pickerSelected.size} item)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    )
  }

  // ── Detail ──
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setView('list')} className="text-muted-foreground hover:text-foreground text-sm">← Back</button>
        {detail && (
          <div className="flex-1 flex items-center justify-between">
            <div><h2 className="text-xl font-bold">{detail.transferNumber}</h2>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                <span>{detail.fromLocation?.name}</span><ArrowRight className="h-3.5 w-3.5" /><span>{detail.toLocation?.name}</span>
              </div>
              {detail.purchaseOrder && (
                <p className="text-xs text-muted-foreground mt-1">
                  Auto-created from PO <span className="font-medium text-foreground">{detail.purchaseOrder.poNumber}</span>
                  {detail.legSequence ? ` — leg ${detail.legSequence}` : ''}
                </p>
              )}
              {!!detail.totalValue && (
                <p className="text-xs text-muted-foreground mt-1">
                  {detail.status === 'DISPATCHED' ? 'Nilai barang in transit: ' : detail.status === 'RECEIVED' ? 'Nilai barang diterima: ' : 'Nilai barang: '}
                  <span className="font-semibold text-foreground">{fmtMoney(detail.totalValue)}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLOR[detail.status] ?? ''}`}>{STATUS_LABEL[detail.status] ?? detail.status}</span>
              {detail.status === 'PENDING' && <button onClick={openDispatch} className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-md hover:bg-amber-700 font-medium">Dispatch</button>}
              {detail.status === 'DISPATCHED' && <button onClick={openReceive} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 font-medium">Receive</button>}
              {detail.status === 'DISPATCHED' && (
                <button onClick={openCrewLink} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted font-medium">Get Crew Link</button>
              )}
              {detail.status === 'PENDING' && (
                <button onClick={async () => { await fetch(`/api/purchasing/transfers/${detail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }) }); setView('list'); load() }} className="px-3 py-1.5 text-sm border text-muted-foreground rounded-md hover:bg-muted">Cancel</button>
              )}
            </div>
          </div>
        )}
      </div>

      {detailLoading || !detail ? (
        <div className="space-y-4 animate-pulse">
          <div className="rounded-lg border p-5 h-20 bg-muted/30" />
          <div className="rounded-lg border overflow-hidden h-40 bg-muted/30" />
        </div>
      ) : (
        <>
          {/* Progress Tracker */}
          {(() => {
            const cancelled = detail.status === 'CANCELLED'
            const steps = [
              { label: 'Created', sublabel: 'Transfer requested', done: true, active: detail.status === 'PENDING', date: fmtDate(detail.createdAt), time: fmtTime(detail.createdAt), by: null },
              { label: 'Dispatched', sublabel: 'In transit', done: !!detail.dispatchedAt, active: detail.status === 'DISPATCHED', date: detail.dispatchedAt ? fmtDate(detail.dispatchedAt) : null, time: detail.dispatchedAt ? fmtTime(detail.dispatchedAt) : null, by: detail.dispatchedBy?.name ?? null },
              { label: 'Received', sublabel: 'Completed', done: !!detail.receivedAt, active: false, date: detail.receivedAt ? fmtDate(detail.receivedAt) : null, time: detail.receivedAt ? fmtTime(detail.receivedAt) : null, by: detail.receivedByName ?? detail.receivedBy?.name ?? null },
            ]
            return (
              <div className="rounded-xl border overflow-hidden">
                {cancelled && (
                  <div className="px-5 py-2.5 bg-red-50 border-b">
                    <p className="text-xs font-semibold text-red-600 uppercase tracking-widest">Transfer Cancelled</p>
                  </div>
                )}
                <div className={`px-6 py-5 ${cancelled ? 'opacity-40' : ''}`}>
                  <div className="flex items-start">
                    {steps.map((step, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center relative">
                        {i < steps.length - 1 && (
                          <div className="absolute top-[15px] left-1/2 w-full h-[2px]" style={{ zIndex: 0 }}>
                            <div className={`h-full ${step.done && steps[i + 1].done ? 'bg-green-400' : step.done ? 'bg-green-200' : 'bg-muted'}`} />
                          </div>
                        )}
                        <div className={`relative z-10 w-[30px] h-[30px] rounded-full flex items-center justify-center transition-all ${
                          step.done ? 'bg-green-500 shadow-sm shadow-green-200' : step.active ? 'bg-white ring-2 ring-[#bdac7e]' : 'bg-muted'
                        }`}>
                          {step.done ? (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 16 16"><path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          ) : (
                            <span className={`text-[10px] font-bold ${step.active ? 'text-[#bdac7e]' : 'text-muted-foreground'}`}>{i + 1}</span>
                          )}
                        </div>
                        <div className="mt-3 text-center px-2 w-full">
                          <p className={`text-xs font-semibold tracking-wide ${step.done ? 'text-green-600' : step.active ? 'text-[#bdac7e]' : 'text-muted-foreground/60'}`}>{step.label}</p>
                          {step.date ? (
                            <>
                              <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{step.date}</p>
                              <p className="text-[11px] text-muted-foreground/70 leading-tight">{step.time}</p>
                              {step.by && <p className="text-[11px] font-medium text-foreground mt-1">{step.by}</p>}
                            </>
                          ) : (
                            <p className="text-[11px] text-muted-foreground/40 mt-1">{step.sublabel}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Photo thumbnails */}
          {(detail.dispatchPhotoKey || detail.receivePhotoKey) && (
            <div className="flex gap-3">
              {detail.dispatchPhotoKey && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Dispatch Photo</p>
                  <img src={detail.dispatchPhotoKey} className="w-32 h-24 object-cover rounded-lg border" />
                </div>
              )}
              {detail.receivePhotoKey && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Receive Photo</p>
                  <img src={detail.receivePhotoKey} className="w-32 h-24 object-cover rounded-lg border" />
                </div>
              )}
            </div>
          )}

          {/* Items table */}
          <div className="rounded-lg border overflow-hidden">
            <div className="px-5 py-3 bg-muted/50 text-xs font-medium text-muted-foreground uppercase">Item List</div>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium">Item</th>
                  <th className="text-right px-5 py-2.5 font-medium">Requested</th>
                  <th className="text-right px-5 py-2.5 font-medium">Dispatched</th>
                  <th className="text-right px-5 py-2.5 font-medium">Received</th>
                  <th className="text-right px-5 py-2.5 font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {detail.items.map((it, i) => {
                  const hasDiscrepancy = it.receivedQty > 0 && it.receivedQty !== it.dispatchedQty
                  const hasPU = !!(it.purchaseUnit && it.purchaseUnit !== it.baseUnit && it.conversionFactor > 1)
                  const fmtQty = (baseQty: number) => {
                    if (!hasPU || baseQty <= 0) return <span className="tabular-nums">{baseQty} <span className="text-xs font-normal text-muted-foreground">{it.baseUnit}</span></span>
                    const puQty = baseQty / it.conversionFactor
                    return (
                      <span className="tabular-nums">
                        {Number.isInteger(puQty) ? puQty : puQty.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">{it.purchaseUnit}</span>
                        <span className="block text-xs font-normal text-muted-foreground/70">= {baseQty} {it.baseUnit}</span>
                      </span>
                    )
                  }
                  const lineValue = detail.status === 'PENDING' ? it.requestedValue : detail.status === 'DISPATCHED' ? it.dispatchedValue : it.receivedValue
                  return (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-5 py-3">
                        <p className="font-medium">{it.itemName}</p>
                        {it.baseUnit && <p className="text-xs text-muted-foreground">{it.baseUnit}</p>}
                      </td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{fmtQty(it.requestedQty)}</td>
                      <td className="px-5 py-3 text-right">{it.dispatchedQty > 0 ? fmtQty(it.dispatchedQty) : '—'}</td>
                      <td className={`px-5 py-3 text-right font-medium ${hasDiscrepancy ? 'text-red-600' : it.receivedQty >= it.requestedQty && it.receivedQty > 0 ? 'text-green-600' : ''}`}>
                        {it.receivedQty > 0 ? fmtQty(it.receivedQty) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{lineValue ? fmtMoney(lineValue) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              {!!detail.totalValue && (
                <tfoot>
                  <tr className="border-t bg-muted/20">
                    <td className="px-5 py-2.5 font-medium text-xs text-muted-foreground uppercase" colSpan={4}>Total Value</td>
                    <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{fmtMoney(detail.totalValue)}</td>
                  </tr>
                </tfoot>
              )}
            </table></div>
          </div>
          {detail.notes && <p className="text-sm text-muted-foreground">Notes: {detail.notes}</p>}
        </>
      )}

      {/* ── Dispatch Modal ── */}
      {dispatchModal && detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
              <h3 className="font-semibold text-lg">Dispatch Items</h3>
              <button onClick={() => setDispatchModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-4">
              {dispatchError && <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{dispatchError}</div>}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Expected Receiver</label>
                <input type="text" className="w-full border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] outline-none transition"
                  placeholder="Nama penerima..." value={expectedReceiverName} onChange={e => setExpectedReceiverName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Qty Dispatched</label>
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 font-medium">Item</th>
                      <th className="text-right py-2 font-medium w-28">Max (base)</th>
                      <th className="text-right py-2 font-medium w-40">Qty</th>
                      <th className="w-14" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dispatchLines.map((line, i) => {
                      const hasPU = !!(line.purchaseUnit && line.purchaseUnit !== line.baseUnit && line.conversionFactor > 1)
                      const displayQty = line.usePurchaseUnit ? line.qty * line.conversionFactor : line.qty
                      const displayUnit = line.usePurchaseUnit ? line.purchaseUnit! : line.baseUnit
                      return (
                        <tr key={i}>
                          <td className="py-2.5 pr-3">
                            <p className="font-medium">{line.itemName}</p>
                            <p className="text-xs text-muted-foreground">{line.baseUnit}</p>
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground tabular-nums pr-3">
                            {line.max} <span className="text-xs">{line.baseUnit}</span>
                          </td>
                          <td className="py-2.5 text-right">
                            {line.editing ? (
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1.5">
                                  <input type="number" min={0} autoFocus
                                    className="w-20 border rounded px-2 py-1 text-sm text-center focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] outline-none"
                                    value={line.qty}
                                    onChange={e => setDispatchLines(l => l.map((li, idx) => idx !== i ? li : { ...li, qty: Number(e.target.value) }))} />
                                  {hasPU ? (
                                    <button onClick={() => setDispatchLines(l => l.map((li, idx) => idx !== i ? li : { ...li, usePurchaseUnit: !li.usePurchaseUnit, qty: 1 }))}
                                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded border shrink-0 ${line.usePurchaseUnit ? 'bg-[#bdac7e] text-white border-[#bdac7e]' : 'border-dashed border-[#bdac7e]/60 text-muted-foreground hover:border-[#bdac7e]'}`}>
                                      {displayUnit} <ArrowLeftRight className="h-2.5 w-2.5" />
                                    </button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">{line.baseUnit}</span>
                                  )}
                                </div>
                                {hasPU && line.usePurchaseUnit && (
                                  <span className="text-xs text-muted-foreground">= {line.qty * line.conversionFactor} {line.baseUnit}</span>
                                )}
                              </div>
                            ) : (
                              <span className="tabular-nums font-medium">
                                {hasPU && line.usePurchaseUnit ? (
                                  <>
                                    {Number.isInteger(line.qty) ? line.qty : line.qty.toFixed(2)}
                                    <span className="text-xs font-normal text-muted-foreground ml-1">{line.purchaseUnit}</span>
                                    <span className="block text-xs font-normal text-muted-foreground/70">= {line.qty * line.conversionFactor} {line.baseUnit}</span>
                                  </>
                                ) : hasPU ? (
                                  <>
                                    {line.qty} <span className="text-xs font-normal text-muted-foreground">{line.baseUnit}</span>
                                    <span className="block text-xs font-normal text-muted-foreground/70">= {Number.isInteger(line.qty / line.conversionFactor) ? line.qty / line.conversionFactor : (line.qty / line.conversionFactor).toFixed(2)} {line.purchaseUnit}</span>
                                  </>
                                ) : (
                                  <>{line.qty} <span className="text-xs font-normal text-muted-foreground">{line.baseUnit}</span></>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pl-2 text-right">
                            {line.editing ? (
                              <div className="flex flex-col gap-1 items-end">
                                <button onClick={() => setDispatchLines(l => l.map((li, idx) => idx !== i ? li : { ...li, editing: false, originalQty: li.qty }))}
                                  className="text-xs px-2.5 py-1 border rounded bg-foreground text-background hover:bg-foreground/80 transition-colors font-medium">
                                  Done
                                </button>
                                <button onClick={() => setDispatchLines(l => l.map((li, idx) => idx !== i ? li : { ...li, editing: false, qty: li.originalQty }))}
                                  className="text-xs px-2.5 py-1 border rounded hover:bg-muted text-muted-foreground transition-colors">
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setDispatchLines(l => l.map((li, idx) => idx !== i ? li : { ...li, editing: true, originalQty: li.qty }))}
                                className="text-xs px-2.5 py-1 border rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table></div>
              </div>
              <PhotoUpload label="Dispatch Photo" value={dispatchPhoto} onChange={setDispatchPhoto} />
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t bg-muted/30">
              <button onClick={() => setDispatchModal(false)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
              <button onClick={submitDispatch} disabled={dispatchSaving} className="px-4 py-2 text-sm text-white rounded-md font-medium disabled:opacity-50 bg-amber-600 hover:bg-amber-700">
                {dispatchSaving ? 'Menyimpan...' : 'Confirm Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Receive Modal ── */}
      {receiveModal && detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
              <h3 className="font-semibold text-lg">Receive Items</h3>
              <button onClick={() => setReceiveModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-4">
              {receiveError && <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{receiveError}</div>}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Received By</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    disabled={!receiverNameEditing}
                    className={`flex-1 border rounded-md px-3 py-2 text-sm outline-none transition ${receiverNameEditing ? 'focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e]' : 'bg-muted/30 text-muted-foreground cursor-default'}`}
                    value={receiverName}
                    onChange={e => setReceiverName(e.target.value)}
                  />
                  {receiverNameEditing ? (
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => { setReceiverNameOriginal(receiverName); setReceiverNameEditing(false) }}
                        className="text-xs px-2.5 py-1.5 border rounded bg-foreground text-background hover:bg-foreground/80 font-medium transition-colors">Done</button>
                      <button onClick={() => { setReceiverName(receiverNameOriginal); setReceiverNameEditing(false) }}
                        className="text-xs px-2.5 py-1.5 border rounded hover:bg-muted text-muted-foreground transition-colors">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => { setReceiverNameOriginal(receiverName); setReceiverNameEditing(true) }}
                      className="text-xs px-2.5 py-1.5 border rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0">Edit</button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Qty Received</label>
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 font-medium">Item</th>
                      <th className="text-right py-2 font-medium w-28">Dispatched</th>
                      <th className="text-right py-2 font-medium w-40">Received</th>
                      <th className="w-14" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {receiveLines.map((line, i) => {
                      const hasPU = !!(line.purchaseUnit && line.purchaseUnit !== line.baseUnit && line.conversionFactor > 1)
                      const displayQty = line.usePurchaseUnit ? line.qty * line.conversionFactor : line.qty
                      const displayUnit = line.usePurchaseUnit ? line.purchaseUnit! : line.baseUnit
                      return (
                        <tr key={i}>
                          <td className="py-2.5 pr-3">
                            <p className="font-medium">{line.itemName}</p>
                            <p className="text-xs text-muted-foreground">{line.baseUnit}</p>
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground tabular-nums pr-3">
                            {line.max} <span className="text-xs">{line.baseUnit}</span>
                          </td>
                          <td className="py-2.5 text-right">
                            {line.editing ? (
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1.5">
                                  <input type="number" min={0} autoFocus
                                    className="w-20 border rounded px-2 py-1 text-sm text-center focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] outline-none"
                                    value={line.qty}
                                    onChange={e => setReceiveLines(l => l.map((li, idx) => idx !== i ? li : { ...li, qty: Number(e.target.value) }))} />
                                  {hasPU ? (
                                    <button onClick={() => setReceiveLines(l => l.map((li, idx) => idx !== i ? li : { ...li, usePurchaseUnit: !li.usePurchaseUnit, qty: 1 }))}
                                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded border shrink-0 ${line.usePurchaseUnit ? 'bg-[#bdac7e] text-white border-[#bdac7e]' : 'border-dashed border-[#bdac7e]/60 text-muted-foreground hover:border-[#bdac7e]'}`}>
                                      {displayUnit} <ArrowLeftRight className="h-2.5 w-2.5" />
                                    </button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">{line.baseUnit}</span>
                                  )}
                                </div>
                                {hasPU && line.usePurchaseUnit && (
                                  <span className="text-xs text-muted-foreground">= {line.qty * line.conversionFactor} {line.baseUnit}</span>
                                )}
                              </div>
                            ) : (
                              <span className="tabular-nums font-medium">
                                {hasPU && line.usePurchaseUnit ? (
                                  <>
                                    {Number.isInteger(line.qty) ? line.qty : line.qty.toFixed(2)}
                                    <span className="text-xs font-normal text-muted-foreground ml-1">{line.purchaseUnit}</span>
                                    <span className="block text-xs font-normal text-muted-foreground/70">= {line.qty * line.conversionFactor} {line.baseUnit}</span>
                                  </>
                                ) : hasPU ? (
                                  <>
                                    {line.qty} <span className="text-xs font-normal text-muted-foreground">{line.baseUnit}</span>
                                    <span className="block text-xs font-normal text-muted-foreground/70">= {Number.isInteger(line.qty / line.conversionFactor) ? line.qty / line.conversionFactor : (line.qty / line.conversionFactor).toFixed(2)} {line.purchaseUnit}</span>
                                  </>
                                ) : (
                                  <>{line.qty} <span className="text-xs font-normal text-muted-foreground">{line.baseUnit}</span></>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pl-2 text-right">
                            {line.editing ? (
                              <div className="flex flex-col gap-1 items-end">
                                <button onClick={() => setReceiveLines(l => l.map((li, idx) => idx !== i ? li : { ...li, editing: false, originalQty: li.qty }))}
                                  className="text-xs px-2.5 py-1 border rounded bg-foreground text-background hover:bg-foreground/80 transition-colors font-medium">
                                  Done
                                </button>
                                <button onClick={() => setReceiveLines(l => l.map((li, idx) => idx !== i ? li : { ...li, editing: false, qty: li.originalQty }))}
                                  className="text-xs px-2.5 py-1 border rounded hover:bg-muted text-muted-foreground transition-colors">
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setReceiveLines(l => l.map((li, idx) => idx !== i ? li : { ...li, editing: true, originalQty: li.qty }))}
                                className="text-xs px-2.5 py-1 border rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table></div>
                <p className="text-xs text-muted-foreground pt-1">Jika qty berbeda dari yang dikirim, exception Transfer Discrepancy akan dibuat otomatis.</p>
              </div>
              <PhotoUpload label="Receive Photo" value={receivePhoto} onChange={setReceivePhoto} />
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t bg-muted/30">
              <button onClick={() => setReceiveModal(false)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
              <button onClick={submitReceive} disabled={receiveSaving} className="px-4 py-2 text-sm text-white rounded-md font-medium disabled:opacity-50 bg-green-600 hover:bg-green-700">
                {receiveSaving ? 'Menyimpan...' : 'Confirm Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {crewLinkModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-semibold text-lg">Crew Receive Link</h3>
              <button onClick={() => setCrewLinkModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Kirim link ini ke crew (misal via WhatsApp) — mereka bisa konfirmasi penerimaan barang langsung tanpa login ke ERP. Berlaku 14 hari.
              </p>
              {crewLinkError && <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{crewLinkError}</div>}
              {crewLinkLoading ? (
                <div className="text-sm text-muted-foreground py-4 text-center">Membuat link...</div>
              ) : crewLink && (
                <>
                  <div className="border rounded-md px-3 py-2.5 text-sm font-mono bg-muted/30 break-all">{crewLink}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { navigator.clipboard.writeText(crewLink); setCrewLinkCopied(true); setTimeout(() => setCrewLinkCopied(false), 2000) }}
                      className="flex-1 px-4 py-2 text-sm border rounded-md hover:bg-muted font-medium">
                      {crewLinkCopied ? 'Tersalin!' : 'Copy Link'}
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`Tolong konfirmasi penerimaan barang ${detail?.transferNumber ?? ''} di sini: ${crewLink}`)}`}
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
      )}
    </div>
  )
}
