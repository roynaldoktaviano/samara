'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, X, Package, Search, AlertTriangle, History, Star, ExternalLink } from 'lucide-react'
import { renderLocationOptions } from '@/components/purchasing/LocationOptions'
import { MultiFilePicker, FilePreview } from '@/components/ui/file-preview'

interface StockLocation { id: string; name: string; type: string; parentId: string | null }
interface Room { id: string; name: string; locationId: string }
interface Category { id: string; name: string; roomId: string }
interface PurchaseOrder { id: string; poNumber: string; supplierName: string | null; orderedAt: string }

interface InventoryItem {
  id: string; itemNumber: string; name: string; categoryId: string; brand: string | null
  purchaseDate: string | null; webLink: string | null; phone: string | null; vendorName: string | null
  quantity: number; unitPrice: number; total: number; notes: string | null
  photoKeys: string[]; isActive: boolean
  roomId: string; locationId: string; sourcePoId: string | null
  category: { id: string; name: string }; room: { id: string; name: string }; location: { id: string; name: string; type: string }
  _count: { opnameEntries: number }
}

interface OpnameHistoryEntry {
  id: string; unitIndex: number; rating: number | null; photoKey: string | null; notes: string | null
  opname: { id: string; opnameNumber: string; createdAt: string; room: { name: string } }
}
interface ReplacementRequest {
  id: string; quantity: number; notes: string | null
  request: { id: string; prNumber: string; status: string; createdAt: string }
}
interface ItemDetail extends InventoryItem {
  opnameEntries: OpnameHistoryEntry[]
  replacementRequests: ReplacementRequest[]
}

const PR_STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: 'Pending Approval', DRAFT: 'Draft', ON_PROCESS: 'On Process', CONVERTED: 'Converted', REJECTED: 'Rejected', CANCELLED: 'Cancelled',
}
const PR_STATUS_COLOR: Record<string, string> = {
  PENDING_APPROVAL: 'bg-purple-100 text-purple-700', DRAFT: 'bg-blue-100 text-blue-700', ON_PROCESS: 'bg-amber-100 text-amber-700', CONVERTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700', CANCELLED: 'bg-muted text-muted-foreground',
}

const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const BLANK_FORM = {
  name: '', categoryId: '', brand: '', purchaseDate: '', webLink: '', phone: '', vendorName: '',
  quantity: '1', unitPrice: '0', notes: '', photoKeys: [] as string[], sourcePoId: '',
}

export default function InventoryItemsPage() {
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])

  const [filterLocationId, setFilterLocationId] = useState('')
  const [filterRoomId, setFilterRoomId] = useState('')
  const [filterCategoryId, setFilterCategoryId] = useState('')
  const [search, setSearch] = useState('')

  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [form, setForm] = useState({ ...BLANK_FORM })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [poSearch, setPoSearch] = useState('')

  const [deleteConfirm, setDeleteConfirm] = useState<InventoryItem | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const [detail, setDetail] = useState<ItemDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    fetch('/api/purchasing/locations').then(r => r.json()).then(setLocations)
    fetch('/api/purchasing/orders').then(r => r.ok ? r.json() : []).then((data: PurchaseOrder[]) => setOrders(Array.isArray(data) ? data : []))
  }, [])

  useEffect(() => {
    if (!filterLocationId) { setRooms([]); setFilterRoomId(''); return }
    fetch(`/api/inventory/rooms?locationId=${filterLocationId}`).then(r => r.json()).then(setRooms)
    setFilterRoomId('')
  }, [filterLocationId])

  useEffect(() => {
    if (!filterRoomId) { setCategories([]); setFilterCategoryId(''); return }
    fetch(`/api/inventory/categories?roomId=${filterRoomId}`).then(r => r.json()).then(setCategories)
    setFilterCategoryId('')
  }, [filterRoomId])

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterLocationId) params.set('locationId', filterLocationId)
    if (filterRoomId) params.set('roomId', filterRoomId)
    if (filterCategoryId) params.set('categoryId', filterCategoryId)
    if (search.trim()) params.set('search', search.trim())
    const res = await fetch(`/api/inventory/items?${params.toString()}`)
    if (res.ok) setItems(await res.json())
    setLoading(false)
  }, [filterLocationId, filterRoomId, filterCategoryId, search])

  useEffect(() => { load() }, [load])

  // Form-scoped room/category pickers — independent of the list filters above.
  const [formLocationId, setFormLocationId] = useState('')
  const [formRooms, setFormRooms] = useState<Room[]>([])
  const [formRoomId, setFormRoomId] = useState('')
  const [formCategories, setFormCategories] = useState<Category[]>([])

  useEffect(() => {
    if (!formLocationId) { setFormRooms([]); return }
    fetch(`/api/inventory/rooms?locationId=${formLocationId}`).then(r => r.json()).then(setFormRooms)
  }, [formLocationId])
  useEffect(() => {
    if (!formRoomId) { setFormCategories([]); return }
    fetch(`/api/inventory/categories?roomId=${formRoomId}`).then(r => r.json()).then(setFormCategories)
  }, [formRoomId])

  function openAdd() {
    setForm({ ...BLANK_FORM })
    setFormLocationId(filterLocationId || '')
    setFormRoomId(filterRoomId || '')
    setPoSearch('')
    setEditing(null); setFormError(''); setModal(true)
  }
  function openEdit(item: InventoryItem) {
    setForm({
      name: item.name, categoryId: item.categoryId, brand: item.brand ?? '',
      purchaseDate: item.purchaseDate ? item.purchaseDate.slice(0, 10) : '',
      webLink: item.webLink ?? '', phone: item.phone ?? '', vendorName: item.vendorName ?? '',
      quantity: String(item.quantity), unitPrice: String(item.unitPrice), notes: item.notes ?? '',
      photoKeys: item.photoKeys ?? [], sourcePoId: item.sourcePoId ?? '',
    })
    setFormLocationId(item.locationId)
    setFormRoomId(item.roomId)
    setPoSearch('')
    setEditing(item); setFormError(''); setModal(true)
  }

  function pickPo(po: PurchaseOrder | null) {
    setForm(f => ({
      ...f,
      sourcePoId: po?.id ?? '',
      vendorName: po?.supplierName || f.vendorName,
      purchaseDate: po ? po.orderedAt.slice(0, 10) : f.purchaseDate,
    }))
    setPoSearch('')
  }

  async function save() {
    if (!form.name.trim()) { setFormError('Item Name is required'); return }
    if (!form.categoryId) { setFormError('Item Category is required'); return }
    setSaving(true); setFormError('')
    const payload = {
      name: form.name, categoryId: form.categoryId, brand: form.brand || undefined,
      purchaseDate: form.purchaseDate || undefined, webLink: form.webLink || undefined, phone: form.phone || undefined,
      vendorName: form.vendorName || undefined, quantity: Number(form.quantity) || 1, unitPrice: Number(form.unitPrice) || 0,
      notes: form.notes || undefined, photoKeys: form.photoKeys, sourcePoId: form.sourcePoId || undefined,
    }
    const url = editing ? `/api/inventory/items/${editing.id}` : '/api/inventory/items'
    const method = editing ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'Failed to save'); setSaving(false); return }
    setModal(false); setSaving(false); load()
  }

  async function doDelete(item: InventoryItem) {
    setDeleteError('')
    const res = await fetch(`/api/inventory/items/${item.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); setDeleteError(d.error ?? 'Failed to delete'); return }
    setDeleteConfirm(null); load()
  }

  async function openDetail(item: InventoryItem) {
    setDetail(null); setDetailLoading(true)
    const res = await fetch(`/api/inventory/items/${item.id}`)
    if (res.ok) setDetail(await res.json())
    setDetailLoading(false)
  }

  const filteredPos = useMemo(() => {
    if (!poSearch.trim()) return orders.slice(0, 8)
    const q = poSearch.trim().toLowerCase()
    return orders.filter(po => po.poNumber.toLowerCase().includes(q) || (po.supplierName ?? '').toLowerCase().includes(q)).slice(0, 8)
  }, [orders, poSearch])

  const selectedPo = orders.find(o => o.id === form.sourcePoId) ?? null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inventory Items</h2>
          <p className="text-muted-foreground text-sm mt-1">Inventory items per place, room, and category</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> Add Item
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
          value={filterLocationId} onChange={e => setFilterLocationId(e.target.value)}>
          <option value="">All Places</option>
          {renderLocationOptions(locations, { topLevelOnly: true })}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
          value={filterRoomId} onChange={e => setFilterRoomId(e.target.value)} disabled={!filterLocationId}>
          <option value="">All Rooms</option>
          {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
          value={filterCategoryId} onChange={e => setFilterCategoryId(e.target.value)} disabled={!filterRoomId}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input className="border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 w-56"
            placeholder="Search Item No/Name..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-lg border overflow-hidden animate-pulse">
          <div className="h-10 bg-muted/50 border-b" />
          {[...Array(4)].map((_, i) => <div key={i} className="px-5 py-4 border-t flex gap-4"><div className="h-4 w-40 rounded bg-muted" /><div className="h-4 w-20 rounded bg-muted" /></div>)}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Item No.</th>
                <th className="text-left px-4 py-3 font-medium">Item Name</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Brand</th>
                <th className="text-right px-4 py-3 font-medium">Qty</th>
                <th className="text-right px-4 py-3 font-medium">Price</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-left px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  No items found.
                </td></tr>
              ) : items.map(item => (
                <tr key={item.id} className={`hover:bg-muted/30 transition-colors ${!item.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs">{item.itemNumber}</td>
                  <td className="px-4 py-3 font-medium">
                    {item.name}
                    <p className="text-[11px] text-muted-foreground font-normal mt-0.5">{item.location.name} · {item.room.name}</p>
                  </td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">{item.category.name}</span></td>
                  <td className="px-4 py-3 text-muted-foreground">{item.brand || '—'}</td>
                  <td className="px-4 py-3 text-right">{item.quantity}</td>
                  <td className="px-4 py-3 text-right">{fmtMoney(item.unitPrice)}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmtMoney(item.total)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{item.vendorName || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openDetail(item)} title="Stock Opname History"
                        className="p-1.5 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <History className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => openEdit(item)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => { setDeleteConfirm(item); setDeleteError('') }} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Add/Edit modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <h3 className="font-bold text-lg">{editing ? 'Edit Item' : 'Add Item'}</h3>
              <button onClick={() => setModal(false)} className="p-1.5 hover:bg-muted rounded-lg"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Item Name *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Place *</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={formLocationId} onChange={e => { setFormLocationId(e.target.value); setFormRoomId(''); setForm(f => ({ ...f, categoryId: '' })) }}>
                    <option value="">— Select —</option>
                    {renderLocationOptions(locations, { topLevelOnly: true })}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Room *</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                    value={formRoomId} onChange={e => { setFormRoomId(e.target.value); setForm(f => ({ ...f, categoryId: '' })) }} disabled={!formLocationId}>
                    <option value="">— Select —</option>
                    {formRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Item Category *</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                    value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} disabled={!formRoomId}>
                    <option value="">— Select —</option>
                    {formCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Brand</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Purchase Date</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.purchaseDate} onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))} />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Quantity</label>
                  <input type="number" min={1} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Price</label>
                  <input type="number" min={0} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} />
                </div>
                <div className="col-span-2 text-xs text-muted-foreground">
                  Total: <span className="font-semibold text-foreground">{fmtMoney((Number(form.quantity) || 0) * (Number(form.unitPrice) || 0))}</span>
                </div>

                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Link to Purchase Order (optional — auto-fills Vendor & Purchase Date)</label>
                  {selectedPo ? (
                    <div className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm bg-amber-50">
                      <span>{selectedPo.poNumber} — {selectedPo.supplierName ?? 'No supplier'}</span>
                      <button type="button" onClick={() => pickPo(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                        placeholder="Search PO number or vendor name..." value={poSearch} onChange={e => setPoSearch(e.target.value)} />
                      {poSearch && filteredPos.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {filteredPos.map(po => (
                            <button key={po.id} type="button" onClick={() => pickPo(po)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 border-b last:border-0">
                              <span className="font-medium">{po.poNumber}</span> — {po.supplierName ?? 'No supplier'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Vendor</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Phone</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Web Link</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="https://..." value={form.webLink} onChange={e => setForm(f => ({ ...f, webLink: e.target.value }))} />
                </div>

                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Notes</label>
                  <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                    value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Photo</label>
                  <MultiFilePicker files={form.photoKeys} onChange={photoKeys => setForm(f => ({ ...f, photoKeys }))} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50/80 shrink-0">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border rounded-lg hover:bg-white">Cancel</button>
              <button onClick={save} disabled={saving} className="px-6 py-2.5 text-sm text-white rounded-lg font-semibold disabled:opacity-50 bg-amber-600 hover:bg-amber-700">
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-2">Delete Item?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-medium text-foreground">{deleteConfirm.name}</span> will be permanently deleted.
            </p>
            {deleteError && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {deleteError}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
              <button onClick={() => doDelete(deleteConfirm)} className="px-4 py-2 text-sm bg-destructive text-white rounded-md hover:bg-destructive/90">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* History / detail modal */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <h3 className="font-bold text-lg">{detail ? detail.name : 'Loading...'}</h3>
              <button onClick={() => setDetail(null)} className="p-1.5 hover:bg-muted rounded-lg"><X className="h-4 w-4" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              {detailLoading || !detail ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Loading history...</div>
              ) : (
                <>
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><History className="h-4 w-4" /> Stock Opname History</h4>
                    {detail.opnameEntries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Never counted yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {detail.opnameEntries.map(e => (
                          <div key={e.id} className="flex items-center gap-3 border rounded-lg px-3 py-2">
                            {e.photoKey && <FilePreview src={e.photoKey} alt="Condition" className="w-12 h-12 object-cover rounded-md shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-muted-foreground">{e.opname.opnameNumber} · {e.opname.room.name} · Unit #{e.unitIndex} · {fmtDate(e.opname.createdAt)}</p>
                              {e.notes && <p className="text-xs mt-0.5">{e.notes}</p>}
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {e.rating === null ? <span className="text-xs text-muted-foreground">Not rated yet</span> : Array.from({ length: 5 }, (_, i) => (
                                <Star key={i} className={`h-3.5 w-3.5 ${i < e.rating! ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><ExternalLink className="h-4 w-4" /> Replacement Requests</h4>
                    {detail.replacementRequests.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No replacement requests yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {detail.replacementRequests.map(r => (
                          <div key={r.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                            <span className="font-medium">{r.request.prNumber}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PR_STATUS_COLOR[r.request.status] ?? ''}`}>{PR_STATUS_LABEL[r.request.status] ?? r.request.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
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
