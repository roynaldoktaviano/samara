'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { Plus, X, ChevronRight, CheckCircle2, ClipboardList, AlertTriangle, Trash2, CheckCheck, Camera } from 'lucide-react'

interface Location { id: string; name: string; type: string }
interface CountItem {
  id: string; itemName: string; systemQty: number; countedQty: number; reason: string | null
  item: { id: string; sku: string; name: string; baseUnit: string; standardCost: number } | null
}
interface StockCount {
  id: string; countNumber: string; status: string; notes: string | null; photoKey: string | null; createdAt: string
  location: Location
  countedBy: { id: string; name: string }
  approvedBy: { id: string; name: string } | null
  approvedAt: string | null
  items?: CountItem[]
  _count?: { items: number }
}

const STATUS_LABEL: Record<string, string> = { DRAFT: 'Draft', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed', APPROVED: 'Approved' }
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
}
const fmtDate = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
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

function PhotoUpload({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    onChange(await compressPhoto(file))
  }
  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative inline-block">
          <img src={value} className="h-28 w-28 object-cover rounded-lg border" alt="count photo" />
          <button onClick={() => onChange('')} className="absolute -top-2 -right-2 bg-white border rounded-full p-0.5 shadow text-muted-foreground hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button onClick={() => ref.current?.click()} className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-5 px-8 text-muted-foreground hover:bg-muted/30 transition-colors w-full">
          <Camera className="h-5 w-5" />
          <span className="text-sm">Upload count photo</span>
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
    </div>
  )
}

export default function StockCountsPage() {
  const [counts, setCounts] = useState<StockCount[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [team, setTeam] = useState<{ id: string; name: string; role: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<StockCount | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [photo, setPhoto] = useState('')

  // Create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [createLocationId, setCreateLocationId] = useState('')
  const [createCountedById, setCreateCountedById] = useState('')
  const [createNotes, setCreateNotes] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [cRes, lRes, tRes] = await Promise.all([
      fetch('/api/purchasing/stock-counts'),
      fetch('/api/purchasing/locations'),
      fetch('/api/purchasing/team'),
    ])
    if (cRes.ok) setCounts(await cRes.json())
    if (lRes.ok) {
      const locs: Location[] = await lRes.json()
      setLocations(locs)
      if (locs.length && !createLocationId) setCreateLocationId(locs[0].id)
    }
    if (tRes.ok) {
      const members = await tRes.json()
      setTeam(members)
      if (members.length && !createCountedById) setCreateCountedById(members[0].id)
    }
    setLoading(false)
  }, [createLocationId, createCountedById])

  useEffect(() => { load() }, [load])

  async function openDetail(count: StockCount) {
    setDetailLoading(true)
    setDetail(count)
    setSaveError('')
    const res = await fetch(`/api/purchasing/stock-counts/${count.id}`)
    if (res.ok) {
      const d = await res.json()
      setDetail(d)
      setPhoto(d.photoKey ?? '')
    }
    setDetailLoading(false)
  }

  async function createCount() {
    setCreating(true)
    const res = await fetch('/api/purchasing/stock-counts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId: createLocationId, notes: createNotes, countedById: createCountedById || undefined }),
    })
    if (res.ok) {
      const newCount = await res.json()
      setCreateOpen(false); setCreateNotes('')
      load()
      openDetail(newCount)
    }
    setCreating(false)
  }

  function updateQty(itemId: string, val: number) {
    setDetail(d => d ? ({ ...d, items: d.items?.map(i => i.id === itemId ? { ...i, countedQty: val } : i) }) : null)
  }

  function updateReason(itemId: string, val: string) {
    setDetail(d => d ? ({ ...d, items: d.items?.map(i => i.id === itemId ? { ...i, reason: val } : i) }) : null)
  }

  async function save(nextStatus?: string) {
    if (!detail) return
    setSaveError('')

    // Validate: items with variance need a reason before approve
    if (nextStatus === 'APPROVED') {
      if (!photo) { setSaveError('Foto wajib diupload sebelum approve'); return }
      const missingReason = detail.items?.filter(i => i.countedQty !== i.systemQty && !i.reason?.trim())
      if (missingReason?.length) { setSaveError(`Isi reason untuk ${missingReason.length} item yang variance`); return }
    }

    setSaving(true)
    const res = await fetch(`/api/purchasing/stock-counts/${detail.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: detail.items?.map(i => ({ id: i.id, countedQty: i.countedQty, reason: i.reason })),
        status: nextStatus,
        photoKey: photo || null,
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setDetail(updated)
      setPhoto(updated.photoKey ?? '')
      load()
    } else {
      const err = await res.json()
      setSaveError(err.error ?? 'Gagal menyimpan')
    }
    setSaving(false)
  }

  async function doDelete(count: StockCount) {
    if (!confirm(`Delete stock count ${count.countNumber}?`)) return
    await fetch(`/api/purchasing/stock-counts/${count.id}`, { method: 'DELETE' })
    if (detail?.id === count.id) setDetail(null)
    load()
  }

  const varianceItems = detail?.items?.filter(i => i.countedQty !== i.systemQty) ?? []
  const totalVarianceValue = varianceItems.reduce((s, i) => s + Math.abs(i.countedQty - i.systemQty) * (i.item?.standardCost ?? 0), 0)

  if (detail) {
    const isApproved = detail.status === 'APPROVED'
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setDetail(null)} className="text-muted-foreground hover:text-foreground text-sm">← Back</button>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-mono font-medium">{detail.countNumber}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[detail.status]}`}>{STATUS_LABEL[detail.status]}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Stock Count — {detail.location.name}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {fmtDate(detail.createdAt)} · {detail.countedBy.name}
              {detail.approvedBy && ` · Approved by ${detail.approvedBy.name}`}
            </p>
          </div>
          {!isApproved && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => save()} disabled={saving}
                className="px-4 py-2 text-sm border rounded-md hover:bg-muted disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => save('APPROVED')} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 font-medium transition-colors">
                <CheckCheck className="h-4 w-4" /> Approve & Apply
              </button>
            </div>
          )}
        </div>

        {saveError && (
          <div className="flex items-center gap-2 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {saveError}
          </div>
        )}

        {/* Variance summary */}
        {!detailLoading && varianceItems.length > 0 && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <span className="font-semibold">{varianceItems.length} item{varianceItems.length !== 1 ? 's' : ''}</span> have a variance.
              {totalVarianceValue > 0 && <span className="ml-1">Total value at risk: <span className="font-semibold">{fmtMoney(totalVarianceValue)}</span>.</span>}
              {!isApproved && <span className="ml-1">Fill in reason for each, then "Approve & Apply".</span>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Items table */}
          <div className="xl:col-span-2 rounded-xl border overflow-hidden">
            <div className="px-5 py-3 bg-muted/40 border-b">
              <h3 className="text-sm font-semibold">Item Count</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Item</th>
                  <th className="text-right px-4 py-2.5 font-medium">System</th>
                  <th className="text-right px-4 py-2.5 font-medium">Counted</th>
                  <th className="text-right px-4 py-2.5 font-medium">Variance</th>
                  <th className="text-right px-4 py-2.5 font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {detailLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(5)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 rounded bg-muted animate-pulse" /></td>)}
                    </tr>
                  ))
                ) : detail.items?.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">No stock at this location.</td></tr>
                ) : detail.items?.map(ci => {
                  const variance = ci.countedQty - ci.systemQty
                  const unit = ci.item?.baseUnit ?? ''
                  const varianceRp = variance * (ci.item?.standardCost ?? 0)
                  const hasVariance = variance !== 0
                  return (
                    <Fragment key={ci.id}>
                      <tr className={`${hasVariance ? 'bg-amber-50/30' : ''} hover:bg-muted/10`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-sm">{ci.itemName}</p>
                          {ci.item && <p className="text-xs text-muted-foreground font-mono mt-0.5">{ci.item.sku}</p>}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground tabular-nums text-sm">{ci.systemQty} <span className="text-xs">{unit}</span></td>
                        <td className="px-4 py-3 text-right">
                          {isApproved ? (
                            <span className="font-medium tabular-nums text-sm">{ci.countedQty} <span className="text-xs text-muted-foreground">{unit}</span></span>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="number" min={0} step="any"
                                value={ci.countedQty}
                                onChange={e => updateQty(ci.id, Number(e.target.value))}
                                className="w-20 border rounded-md px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <span className="text-xs text-muted-foreground shrink-0 w-6">{unit}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {hasVariance ? (
                            <span className={`font-semibold text-sm ${variance > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {variance > 0 ? '+' : ''}{variance} <span className="text-xs font-normal">{unit}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {hasVariance
                            ? (
                              <span className={`font-semibold text-sm ${varianceRp < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {varianceRp > 0 ? '+' : ''}{fmtMoney(varianceRp)}
                              </span>
                            )
                            : <span className="text-muted-foreground/40 text-sm">—</span>}
                        </td>
                      </tr>
                      {hasVariance && !isApproved && (
                        <tr className="bg-amber-50/20">
                          <td colSpan={5} className="px-4 py-2">
                            <textarea
                              rows={2}
                              placeholder="Reason for variance (required) *"
                              value={ci.reason ?? ''}
                              onChange={e => updateReason(ci.id, e.target.value)}
                              className={`w-full border rounded-md px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] ${!ci.reason?.trim() ? 'border-amber-300 bg-amber-50/80' : 'bg-background'}`}
                            />
                          </td>
                        </tr>
                      )}
                      {hasVariance && isApproved && ci.reason && (
                        <tr className="bg-muted/10">
                          <td colSpan={5} className="px-4 pt-1 pb-3 text-xs text-muted-foreground italic">
                            Reason: {ci.reason}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Right panel: photo + notes */}
          <div className="space-y-4">
            <div className="rounded-xl border overflow-hidden">
              <div className="px-4 py-3 bg-muted/40 border-b">
                <p className="text-sm font-semibold">Count Photo <span className="text-red-500">*</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">Required before approving</p>
              </div>
              <div className="p-4">
                {isApproved ? (
                  detail.photoKey
                    ? <img src={detail.photoKey} className="w-full rounded-lg border object-cover max-h-48" alt="count photo" />
                    : <p className="text-sm text-muted-foreground">No photo</p>
                ) : (
                  <PhotoUpload value={photo} onChange={setPhoto} />
                )}
              </div>
            </div>

            {detail.notes && (
              <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground mb-1.5">Notes</p>
                {detail.notes}
              </div>
            )}

            {isApproved && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Approved & Applied</p>
                  <p className="text-xs text-green-700 mt-0.5">Stock adjusted. {varianceItems.length > 0 ? `${varianceItems.length} exception(s) created.` : 'No variance.'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Stock Counts</h2>
          <p className="text-muted-foreground text-sm mt-1">Physical stock counts and reconciliation with system records</p>
        </div>
        <button onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-[#bdac7e] hover:bg-[#a89860] text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> New Stock Count
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border overflow-hidden animate-pulse">
          <div className="h-10 bg-muted/50 border-b" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-t flex items-center justify-between">
              <div className="space-y-1.5"><div className="h-4 w-32 rounded bg-muted" /><div className="h-3 w-48 rounded bg-muted" /></div>
              <div className="h-6 w-20 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : counts.length === 0 ? (
        <div className="rounded-xl border border-dashed p-14 text-center">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium text-muted-foreground">No stock counts yet</p>
          <p className="text-xs text-muted-foreground mt-1">Click "New Stock Count" to start counting physical stock.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Count No.</th>
                <th className="text-left px-4 py-3 font-medium">Location</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Counted By</th>
                <th className="text-center px-4 py-3 font-medium">Items</th>
                <th className="text-center px-4 py-3 font-medium">Photo</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {counts.map(count => (
                <tr key={count.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => openDetail(count)}>
                  <td className="px-4 py-3 font-mono font-medium text-xs">{count.countNumber}</td>
                  <td className="px-4 py-3 font-medium">{count.location.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(count.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{count.countedBy.name}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{count._count?.items ?? 0}</td>
                  <td className="px-4 py-3 text-center">
                    {count.photoKey
                      ? <CheckCircle2 className="h-4 w-4 text-green-500 inline" />
                      : <span className="text-xs text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[count.status]}`}>
                      {STATUS_LABEL[count.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    {count.status !== 'APPROVED'
                      ? <button onClick={() => doDelete(count)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                      : <CheckCircle2 className="h-4 w-4 text-green-500 inline" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {createOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-[#bdac7e]" />
                <h3 className="font-semibold text-lg">New Stock Count</h3>
              </div>
              <button onClick={() => setCreateOpen(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Location *</label>
                <select
                  className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] bg-white"
                  value={createLocationId} onChange={e => setCreateLocationId(e.target.value)}>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Counted By *</label>
                <select
                  className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] bg-white"
                  value={createCountedById} onChange={e => setCreateCountedById(e.target.value)}>
                  {team.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Notes</label>
                <input
                  className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e]"
                  placeholder="Optional..."
                  value={createNotes} onChange={e => setCreateNotes(e.target.value)} />
              </div>
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5">
                The system will load all current stock at the selected location as the reference for the count.
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
              <button onClick={createCount} disabled={creating || !createLocationId || !createCountedById}
                className="px-4 py-2 text-sm bg-[#bdac7e] text-white rounded-md hover:bg-[#a89860] disabled:opacity-50 font-medium">
                {creating ? 'Creating...' : 'Create Count'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
