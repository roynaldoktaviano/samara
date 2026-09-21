'use client'

// Temporary onboarding-only feature — see memory project-initial-stock-opname-temporary.
// Sets the very first baseline stock per location (gudang & kapal). No approval step
// (Admin/Finance Director finalize directly), items can be freely added/removed while
// still a draft, and a completed opname can only be corrected by whoever created it.

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, X, ChevronRight, CheckCircle2, PackagePlus, AlertTriangle, Trash2, CheckCheck, Search } from 'lucide-react'
import { renderLocationOptions } from '@/components/purchasing/LocationOptions'
import InventoryQuickAdd from './InventoryQuickAdd'

interface Location { id: string; name: string; type: string; parentId: string | null }
interface InventoryRoomOption { id: string; name: string; locationId: string }
interface CatalogItem { id: string; sku: string; name: string; baseUnit: string; purchaseUnit: string; category: string }
interface OpnameItem {
  id: string; itemName: string; systemQty: number; countedQty: number
  item: CatalogItem | null
}
interface Opname {
  id: string; countNumber: string; status: string; notes: string | null; createdAt: string
  location: Location
  countedBy: { id: string; name: string }
  items?: OpnameItem[]
  _count?: { items: number }
}

const STATUS_LABEL: Record<string, string> = { DRAFT: 'Draft', COMPLETED: 'Selesai' }
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  COMPLETED: 'bg-green-100 text-green-700',
}
const fmtDate = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

function AddItemModal({ opnameId, existingItemIds, onClose, onAdded }: {
  opnameId: string; existingItemIds: Set<string>; onClose: () => void; onAdded: (item: OpnameItem) => void
}) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [qty, setQty] = useState('')
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newBaseUnit, setNewBaseUnit] = useState('')
  const [newPurchaseUnit, setNewPurchaseUnit] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/purchasing/items').then(r => r.ok ? r.json() : []).then((items: CatalogItem[]) => setCatalog(items))
  }, [])

  const filtered = catalog.filter(i => !existingItemIds.has(i.id) && (i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase())))

  async function submit() {
    setError('')
    const qtyNum = Number(qty) || 0
    setSaving(true)
    const body = mode === 'existing'
      ? { itemId: selectedId, qty: qtyNum }
      : { name: newName, category: newCategory, baseUnit: newBaseUnit, purchaseUnit: newPurchaseUnit, qty: qtyNum }
    const res = await fetch(`/api/purchasing/initial-stock-opname/${opnameId}/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (res.ok) {
      onAdded(await res.json())
      onClose()
    } else {
      const err = await res.json()
      setError(err.error ?? 'Gagal menambah produk')
    }
    setSaving(false)
  }

  const canSubmit = mode === 'existing' ? !!selectedId && qty !== '' : !!(newName.trim() && newCategory.trim() && newBaseUnit.trim() && newPurchaseUnit.trim()) && qty !== ''

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="font-semibold text-lg">Tambah Produk</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex gap-1.5 bg-muted/50 rounded-lg p-1">
            <button onClick={() => setMode('existing')} className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${mode === 'existing' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'}`}>Dari Katalog</button>
            <button onClick={() => setMode('new')} className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${mode === 'new' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'}`}>Produk Baru</button>
          </div>

          {mode === 'existing' ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari produk..."
                  className="w-full h-9 border rounded-md pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e]" />
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Tidak ada produk</p>
                ) : filtered.map(i => (
                  <button key={i.id} onClick={() => setSelectedId(i.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/40 ${selectedId === i.id ? 'bg-[#bdac7e]/10' : ''}`}>
                    <p className="font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{i.sku} · {i.category}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nama Produk *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e]" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Kategori *</label>
                <input value={newCategory} onChange={e => setNewCategory(e.target.value)} className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Purchase Unit *</label>
                  <input value={newPurchaseUnit} onChange={e => setNewPurchaseUnit(e.target.value)} placeholder="e.g. Dus" className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Base Unit *</label>
                  <input value={newBaseUnit} onChange={e => setNewBaseUnit(e.target.value)} placeholder="e.g. Pcs" className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e]" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">SKU dibuat otomatis. Supplier & harga bisa dilengkapi belakangan di Items & Pricing.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Stok Sekarang *</label>
            <input type="number" min={0} step="any" value={qty} onChange={e => setQty(e.target.value)}
              className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] tabular-nums" />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-muted/30">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Batal</button>
          <button onClick={submit} disabled={!canSubmit || saving}
            className="px-4 py-2 text-sm bg-[#bdac7e] text-white rounded-md hover:bg-[#a89860] disabled:opacity-50 font-medium">
            {saving ? 'Menambah...' : 'Tambah'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function InitialStockOpnamePage() {
  const { data: session } = useSession()
  const currentUserId = (session?.user as { id?: string })?.id

  const [opnames, setOpnames] = useState<Opname[]>([])
  const [completedLocationIds, setCompletedLocationIds] = useState<string[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<Opname | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [addItemOpen, setAddItemOpen] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [createMode, setCreateMode] = useState<'STOCK' | 'INVENTORY'>('STOCK')
  const [createLocationId, setCreateLocationId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createRooms, setCreateRooms] = useState<InventoryRoomOption[]>([])
  const [createRoomId, setCreateRoomId] = useState('')
  const [addingRoom, setAddingRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [savingRoom, setSavingRoom] = useState(false)
  const [inventoryView, setInventoryView] = useState<{ locationId: string; locationName: string; roomId: string; roomName: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [oRes, lRes] = await Promise.all([
      fetch('/api/purchasing/initial-stock-opname'),
      fetch('/api/purchasing/locations'),
    ])
    if (oRes.ok) {
      const data = await oRes.json()
      setOpnames(data.opnames)
      setCompletedLocationIds(data.completedLocationIds)
    }
    if (lRes.ok) setLocations(await lRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Locations already fully set up don't need to appear in the picker — a resumable
  // draft is reached by clicking its row in the list instead.
  const inProgressLocationIds = new Set(opnames.filter(o => o.status !== 'COMPLETED').map(o => o.location.id))
  const eligibleLocations = locations.filter(l => !completedLocationIds.includes(l.id) && !inProgressLocationIds.has(l.id))

  function openCreate() {
    setCreateMode('STOCK')
    setCreateLocationId(eligibleLocations[0]?.id ?? '')
    setCreateRooms([]); setCreateRoomId(''); setAddingRoom(false); setNewRoomName('')
    setCreateOpen(true)
  }

  async function loadRoomsForLocation(locationId: string) {
    setCreateRooms([]); setCreateRoomId('')
    if (!locationId) return
    const res = await fetch(`/api/inventory/rooms?locationId=${locationId}`)
    if (res.ok) {
      const rooms = await res.json()
      setCreateRooms(rooms)
      if (rooms.length) setCreateRoomId(rooms[0].id)
    }
  }

  function switchCreateMode(mode: 'STOCK' | 'INVENTORY') {
    setCreateMode(mode)
    setAddingRoom(false); setNewRoomName('')
    if (mode === 'STOCK') {
      setCreateLocationId(eligibleLocations[0]?.id ?? '')
    } else {
      const locationId = locations[0]?.id ?? ''
      setCreateLocationId(locationId)
      loadRoomsForLocation(locationId)
    }
  }

  function changeCreateLocation(locationId: string) {
    setCreateLocationId(locationId)
    if (createMode === 'INVENTORY') loadRoomsForLocation(locationId)
  }

  async function addCreateRoom() {
    if (!newRoomName.trim() || !createLocationId) return
    setSavingRoom(true)
    const res = await fetch('/api/inventory/rooms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newRoomName, locationId: createLocationId }),
    })
    if (res.ok) {
      const room = await res.json()
      setCreateRooms(r => [...r, room])
      setCreateRoomId(room.id)
      setNewRoomName('')
      setAddingRoom(false)
    }
    setSavingRoom(false)
  }

  function submitCreate() {
    if (createMode === 'STOCK') { createOpname(); return }
    const loc = locations.find(l => l.id === createLocationId)
    const room = createRooms.find(r => r.id === createRoomId)
    if (!loc || !room) return
    setInventoryView({ locationId: loc.id, locationName: loc.name, roomId: room.id, roomName: room.name })
    setCreateOpen(false)
  }

  async function openDetail(opname: Opname) {
    setDetailLoading(true)
    setDetail(opname)
    setSaveError('')
    const res = await fetch(`/api/purchasing/initial-stock-opname/${opname.id}`)
    if (res.ok) setDetail(await res.json())
    setDetailLoading(false)
  }

  async function createOpname() {
    setCreating(true)
    const res = await fetch('/api/purchasing/initial-stock-opname', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locationId: createLocationId }),
    })
    if (res.ok) {
      const created = await res.json()
      setCreateOpen(false); setCreateLocationId('')
      load()
      openDetail(created)
    }
    setCreating(false)
  }

  function updateQty(itemId: string, val: number) {
    setDetail(d => d ? ({ ...d, items: d.items?.map(i => i.id === itemId ? { ...i, countedQty: val } : i) }) : null)
  }

  async function removeItem(itemId: string) {
    if (!detail) return
    setDetail(d => d ? ({ ...d, items: d.items?.filter(i => i.id !== itemId) }) : null)
    await fetch(`/api/purchasing/initial-stock-opname/${detail.id}/items/${itemId}`, { method: 'DELETE' })
  }

  async function save(finalize = false) {
    if (!detail) return
    setSaveError('')
    if (finalize && !confirm('Selesaikan Stock Opname Awal ini? Stok akan langsung diterapkan ke sistem.')) return
    setSaving(true)
    const res = await fetch(`/api/purchasing/initial-stock-opname/${detail.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: detail.items?.map(i => ({ id: i.id, countedQty: i.countedQty })),
        status: finalize ? 'COMPLETED' : undefined,
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setDetail(updated)
      load()
    } else {
      const err = await res.json()
      setSaveError(err.error ?? 'Gagal menyimpan')
    }
    setSaving(false)
  }

  async function doDelete(opname: Opname) {
    if (!confirm(`Hapus Stock Opname Awal ${opname.countNumber}?`)) return
    await fetch(`/api/purchasing/initial-stock-opname/${opname.id}`, { method: 'DELETE' })
    if (detail?.id === opname.id) setDetail(null)
    load()
  }

  if (inventoryView) {
    return (
      <InventoryQuickAdd
        locationId={inventoryView.locationId}
        locationName={inventoryView.locationName}
        initialRoomId={inventoryView.roomId}
        initialRoomName={inventoryView.roomName}
        onBack={() => setInventoryView(null)}
      />
    )
  }

  if (detail) {
    const isCompleted = detail.status === 'COMPLETED'
    const isCreator = currentUserId === detail.countedBy.id
    const readOnly = isCompleted && !isCreator
    const existingItemIds = new Set((detail.items ?? []).filter(i => i.item).map(i => i.item!.id))

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setDetail(null)} className="text-muted-foreground hover:text-foreground text-sm">← Kembali</button>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-mono font-medium">{detail.countNumber}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[detail.status]}`}>{STATUS_LABEL[detail.status]}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Stock Opname Awal — {detail.location.name}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{fmtDate(detail.createdAt)} · Dibuat oleh {detail.countedBy.name}</p>
          </div>
          {!readOnly && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setAddItemOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm border rounded-md hover:bg-muted transition-colors">
                <Plus className="h-4 w-4" /> Tambah Produk
              </button>
              <button onClick={() => save(false)} disabled={saving}
                className="px-4 py-2 text-sm border rounded-md hover:bg-muted disabled:opacity-50 transition-colors">
                {saving ? 'Menyimpan...' : 'Simpan Draft'}
              </button>
              <button onClick={() => save(true)} disabled={saving || !detail.items?.length}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 font-medium transition-colors">
                <CheckCheck className="h-4 w-4" /> Selesaikan Opname
              </button>
            </div>
          )}
        </div>

        {isCompleted && isCreator && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">Opname ini sudah selesai. Karena Anda pembuatnya, Anda masih bisa mengoreksi data di bawah — perubahan langsung diterapkan ke stok.</p>
          </div>
        )}
        {readOnly && (
          <div className="flex items-start gap-3 bg-muted/40 border rounded-lg px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">Opname ini sudah selesai dan diterapkan ke stok. Hanya <span className="font-medium">{detail.countedBy.name}</span> yang bisa mengoreksinya.</p>
          </div>
        )}
        {saveError && (
          <div className="flex items-center gap-2 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {saveError}
          </div>
        )}

        <div className="rounded-xl border overflow-hidden">
          <div className="px-5 py-3 bg-muted/40 border-b">
            <h3 className="text-sm font-semibold">Daftar Produk</h3>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Produk</th>
                <th className="text-left px-4 py-2.5 font-medium">Kategori</th>
                <th className="text-right px-4 py-2.5 font-medium">Stok Sekarang</th>
                {!readOnly && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {detailLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}>{[...Array(4)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 rounded bg-muted animate-pulse" /></td>)}</tr>
                ))
              ) : !detail.items?.length ? (
                <tr><td colSpan={4} className="text-center py-10 text-muted-foreground text-sm">Belum ada produk. Klik "Tambah Produk" untuk mulai.</td></tr>
              ) : detail.items.map(ci => {
                const unit = ci.item?.baseUnit ?? ''
                return (
                  <tr key={ci.id} className="hover:bg-muted/10">
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm">{ci.itemName}</p>
                      {ci.item && <p className="text-xs text-muted-foreground font-mono mt-0.5">{ci.item.sku}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm">{ci.item?.category ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {readOnly ? (
                        <span className="font-medium tabular-nums text-sm">{ci.countedQty} <span className="text-xs text-muted-foreground">{unit}</span></span>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <input type="number" min={0} step="any" value={ci.countedQty} onChange={e => updateQty(ci.id, Number(e.target.value))}
                            className="w-24 border rounded-md px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          <span className="text-xs text-muted-foreground shrink-0 w-8">{unit}</span>
                        </div>
                      )}
                    </td>
                    {!readOnly && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => removeItem(ci.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        </div>

        {addItemOpen && (
          <AddItemModal
            opnameId={detail.id}
            existingItemIds={existingItemIds}
            onClose={() => setAddItemOpen(false)}
            onAdded={item => setDetail(d => d ? ({ ...d, items: [...(d.items ?? []), item] }) : null)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Stock Opname Awal</h2>
          <p className="text-muted-foreground text-sm mt-1">Setup baseline stok atau inventory pertama kali per lokasi (gudang & kapal)</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-[#bdac7e] hover:bg-[#a89860] text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> Setup Awal Baru
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border overflow-hidden animate-pulse">
          <div className="h-10 bg-muted/50 border-b" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-t flex items-center justify-between">
              <div className="space-y-1.5"><div className="h-4 w-32 rounded bg-muted" /><div className="h-3 w-48 rounded bg-muted" /></div>
              <div className="h-6 w-20 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : opnames.length === 0 ? (
        <div className="rounded-xl border border-dashed p-14 text-center">
          <PackagePlus className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium text-muted-foreground">Belum ada Stock Opname Awal</p>
          <p className="text-xs text-muted-foreground mt-1">Klik "Setup Awal Baru" untuk mulai setup lokasi pertama kali.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">No. Opname</th>
                <th className="text-left px-4 py-3 font-medium">Lokasi</th>
                <th className="text-left px-4 py-3 font-medium">Tanggal</th>
                <th className="text-left px-4 py-3 font-medium">Dibuat oleh</th>
                <th className="text-center px-4 py-3 font-medium">Produk</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {opnames.map(o => (
                <tr key={o.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => openDetail(o)}>
                  <td className="px-4 py-3 font-mono font-medium text-xs">{o.countNumber}</td>
                  <td className="px-4 py-3 font-medium">{o.location.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(o.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{o.countedBy.name}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{o._count?.items ?? 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    {o.status !== 'COMPLETED' && (
                      <button onClick={() => doDelete(o)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center gap-2">
                <PackagePlus className="h-5 w-5 text-[#bdac7e]" />
                <h3 className="font-semibold text-lg">Setup Awal Baru</h3>
              </div>
              <button onClick={() => setCreateOpen(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-1.5 bg-muted/50 rounded-lg p-1">
                <button onClick={() => switchCreateMode('STOCK')} className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${createMode === 'STOCK' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'}`}>Stok Barang</button>
                <button onClick={() => switchCreateMode('INVENTORY')} className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${createMode === 'INVENTORY' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'}`}>Inventory</button>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Lokasi *</label>
                {createMode === 'STOCK' && eligibleLocations.length === 0 ? (
                  <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5">Semua lokasi sudah punya Stock Opname Awal (selesai atau sedang draft) — buka baris di list untuk lanjutkan drafnya.</p>
                ) : (
                  <select className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] bg-white"
                    value={createLocationId} onChange={e => changeCreateLocation(e.target.value)}>
                    {renderLocationOptions(createMode === 'STOCK' ? eligibleLocations : locations, { renderLabel: l => `${l.name} (${l.type})` })}
                  </select>
                )}
              </div>

              {createMode === 'STOCK' ? (
                <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5">
                  Produk yang sudah ada stoknya di lokasi ini akan otomatis muncul. Produk baru bisa ditambah langsung saat opname.
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Ruangan *</label>
                  {createRooms.length > 0 && (
                    <select className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] bg-white"
                      value={createRoomId} onChange={e => setCreateRoomId(e.target.value)}>
                      {createRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  )}
                  {createRooms.length === 0 && !addingRoom && (
                    <p className="text-xs text-muted-foreground">Belum ada ruangan di lokasi ini.</p>
                  )}
                  {!addingRoom ? (
                    <button onClick={() => setAddingRoom(true)} className="text-xs text-[#bdac7e] hover:underline">+ Ruangan baru</button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder="Nama ruangan baru"
                        className="flex-1 h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e]" />
                      <button onClick={addCreateRoom} disabled={!newRoomName.trim() || savingRoom} className="px-3 py-1.5 text-sm bg-[#bdac7e] text-white rounded-md hover:bg-[#a89860] disabled:opacity-50">
                        {savingRoom ? '...' : 'Tambah'}
                      </button>
                      <button onClick={() => { setAddingRoom(false); setNewRoomName('') }} className="text-xs text-muted-foreground hover:underline">Batal</button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5">Barang yang sudah ada di ruangan ini akan otomatis muncul. Tidak perlu isi jumlah stok — cukup nama & kategori barangnya.</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Batal</button>
              <button onClick={submitCreate} disabled={creating || !createLocationId || (createMode === 'INVENTORY' && !createRoomId)}
                className="px-4 py-2 text-sm bg-[#bdac7e] text-white rounded-md hover:bg-[#a89860] disabled:opacity-50 font-medium">
                {creating ? 'Membuat...' : createMode === 'STOCK' ? 'Buat Opname' : 'Mulai'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
