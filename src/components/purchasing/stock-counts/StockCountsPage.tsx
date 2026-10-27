'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { Plus, X, ChevronRight, CheckCircle2, ClipboardList, AlertTriangle, Trash2, CheckCheck, Camera } from 'lucide-react'
import { useFileDrop } from '@/hooks/useFileDrop'
import { PhotoSourceMenu } from '@/components/ui/file-preview'
import { renderLocationOptions } from '@/components/purchasing/LocationOptions'
import { formatMoney, formatDate } from '@/lib/format'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { displayQty, hasPurchaseUnit, qtyLabel } from '@/lib/purchasing/units'
import { StockQty } from '@/components/purchasing/StockQty'

interface Location { id: string; name: string; type: string; parentId: string | null }
interface CountItem {
  id: string; itemName: string; systemQty: number; countedQty: number; reason: string | null
  item: { id: string; sku: string; name: string; baseUnit: string; purchaseUnit: string; conversionFactor: number; standardCost: number } | null
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

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  DRAFT:       { label: 'Draft',       tone: 'neutral' },
  IN_PROGRESS: { label: 'In Progress', tone: 'info' },
  COMPLETED:   { label: 'Completed',   tone: 'warning' },
  APPROVED:    { label: 'Approved',    tone: 'success' },
}

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
  const [menuOpen, setMenuOpen] = useState(false)
  async function handleFiles(files: File[]) {
    if (files[0]) onChange(await compressPhoto(files[0]))
  }
  const { isDragging, dropProps } = useFileDrop(handleFiles)
  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative inline-block">
          <img src={value} className="h-28 w-28 object-cover rounded-lg border" alt="count photo" />
          <button onClick={() => onChange('')} className="absolute -top-2 -right-2 bg-card border rounded-full p-0.5 shadow text-muted-foreground hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <button onClick={() => setMenuOpen(o => !o)} {...dropProps} className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-5 px-8 transition-colors w-full ${
            isDragging ? 'border-warning bg-warning/10 text-warning' : 'text-muted-foreground hover:bg-muted/30'
          }`}>
            <Camera className="h-5 w-5" />
            <span className="text-sm">{isDragging ? 'Drop to upload' : 'Upload or drag count photo'}</span>
          </button>
          <PhotoSourceMenu open={menuOpen} onClose={() => setMenuOpen(false)} onFiles={handleFiles} />
        </div>
      )}
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
      if (!photo) { setSaveError('Count photo is required before approving'); return }
      const missingReason = detail.items?.filter(i => i.countedQty !== i.systemQty && !i.reason?.trim())
      if (missingReason?.length) { setSaveError(`Please enter a reason for ${missingReason.length} item(s) with variance`); return }
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
      setSaveError(err.error ?? 'Failed to save')
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
          <StatusBadge tone={STATUS[detail.status]?.tone}>{STATUS[detail.status]?.label}</StatusBadge>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Stock Count — {detail.location.name}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {formatDate(detail.createdAt)} · {detail.countedBy.name}
              {detail.approvedBy && ` · Approved by ${detail.approvedBy.name}`}
            </p>
          </div>
          {!isApproved && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => save()} disabled={saving}
                className="px-4 py-2 text-sm border rounded-md hover:bg-muted disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => save('APPROVED')} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-success hover:bg-success/90 text-success-foreground rounded-md disabled:opacity-50 font-medium transition-colors">
                <CheckCheck className="h-4 w-4" /> Approve & Apply
              </button>
            </div>
          )}
        </div>

        {saveError && (
          <div className="flex items-center gap-2 text-sm bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {saveError}
          </div>
        )}

        {/* Variance summary */}
        {!detailLoading && varianceItems.length > 0 && (
          <div className="flex items-start gap-3 bg-warning/10 border border-warning/30 rounded-lg px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="text-sm text-warning">
              <span className="font-semibold">{varianceItems.length} item{varianceItems.length !== 1 ? 's' : ''}</span> have a variance.
              {totalVarianceValue > 0 && <span className="ml-1">Total value at risk: <span className="font-semibold">{formatMoney(totalVarianceValue)}</span>.</span>}
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
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Item</th>
                  <th className="text-right px-4 py-2.5 font-medium">System</th>
                  <th className="text-right px-4 py-2.5 font-medium">Counted</th>
                  <th className="text-right px-4 py-2.5 font-medium">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {detailLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(4)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 rounded bg-muted animate-pulse" /></td>)}
                    </tr>
                  ))
                ) : detail.items?.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-10 text-muted-foreground text-sm">No stock at this location.</td></tr>
                ) : detail.items?.map(ci => {
                  const variance = ci.countedQty - ci.systemQty
                  const units = ci.item ?? { baseUnit: '' }
                  // Counted in the purchase unit (bottles, 2.5 for a half-used one); stored in base units (ml).
                  const conv = ci.item && hasPurchaseUnit(ci.item) ? ci.item.conversionFactor : 1
                  const unit = displayQty(units, 0).unit
                  const hasVariance = variance !== 0
                  return (
                    <Fragment key={ci.id}>
                      <tr className={`${hasVariance ? 'bg-warning/5' : ''} hover:bg-muted/10`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-sm">{ci.itemName}</p>
                          {ci.item && <p className="text-xs text-muted-foreground font-mono mt-0.5">{ci.item.sku}</p>}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground tabular-nums text-sm"><StockQty item={units} qty={ci.systemQty} /></td>
                        <td className="px-4 py-3 text-right">
                          {isApproved ? (
                            <StockQty item={units} qty={ci.countedQty} className="font-medium tabular-nums text-sm" />
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="number" min={0} step="any"
                                value={Math.round((ci.countedQty / conv) * 1000) / 1000}
                                onChange={e => updateQty(ci.id, Number(e.target.value) * conv)}
                                className="w-20 border rounded-md px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <span className="text-xs text-muted-foreground shrink-0 min-w-6">{unit}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {hasVariance ? (
                            <span className={`font-semibold text-sm ${variance > 0 ? 'text-success' : 'text-destructive'}`}>
                              {variance > 0 ? '+' : ''}{qtyLabel(units, variance)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-sm">—</span>
                          )}
                        </td>
                      </tr>
                      {hasVariance && !isApproved && (
                        <tr className="bg-warning/5">
                          <td colSpan={4} className="px-4 py-2">
                            <textarea
                              rows={2}
                              placeholder="Reason for variance (required) *"
                              value={ci.reason ?? ''}
                              onChange={e => updateReason(ci.id, e.target.value)}
                              className={`w-full border rounded-md px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring ${!ci.reason?.trim() ? 'border-warning/30 bg-warning/10' : 'bg-background'}`}
                            />
                          </td>
                        </tr>
                      )}
                      {hasVariance && isApproved && ci.reason && (
                        <tr className="bg-muted/10">
                          <td colSpan={4} className="px-4 pt-1 pb-3 text-xs text-muted-foreground italic">
                            Reason: {ci.reason}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table></div>
          </div>

          {/* Right panel: photo + notes */}
          <div className="space-y-4">
            <div className="rounded-xl border overflow-hidden">
              <div className="px-4 py-3 bg-muted/40 border-b">
                <p className="text-sm font-semibold">Count Photo <span className="text-destructive">*</span></p>
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
              <div className="rounded-xl border border-success/30 bg-success/10 p-4 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-success">Approved & Applied</p>
                  <p className="text-xs text-success mt-0.5">Stock adjusted. {varianceItems.length > 0 ? `${varianceItems.length} exception(s) created.` : 'No variance.'}</p>
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
          className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium px-4 py-2 rounded-md transition-colors">
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
          <div className="overflow-x-auto"><table className="w-full text-sm">
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
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(count.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{count.countedBy.name}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{count._count?.items ?? 0}</td>
                  <td className="px-4 py-3 text-center">
                    {count.photoKey
                      ? <CheckCircle2 className="h-4 w-4 text-success inline" />
                      : <span className="text-xs text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge tone={STATUS[count.status]?.tone}>
                      {STATUS[count.status]?.label}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    {count.status !== 'APPROVED'
                      ? <button onClick={() => doDelete(count)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                      : <CheckCircle2 className="h-4 w-4 text-success inline" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Create Modal */}
      {createOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-lg">New Stock Count</h3>
              </div>
              <button onClick={() => setCreateOpen(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Location *</label>
                <select
                  className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring bg-card"
                  value={createLocationId} onChange={e => setCreateLocationId(e.target.value)}>
                  {renderLocationOptions(locations, { renderLabel: l => `${l.name} (${l.type})` })}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Counted By *</label>
                <select
                  className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring bg-card"
                  value={createCountedById} onChange={e => setCreateCountedById(e.target.value)}>
                  {team.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Notes</label>
                <input
                  className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring"
                  placeholder="Optional…"
                  value={createNotes} onChange={e => setCreateNotes(e.target.value)} />
              </div>
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5">
                The system will load all current stock at the selected location as the reference for the count.
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
              <button onClick={createCount} disabled={creating || !createLocationId || !createCountedById}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary-hover disabled:opacity-50 font-medium">
                {creating ? 'Creating…' : 'Create Count'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
