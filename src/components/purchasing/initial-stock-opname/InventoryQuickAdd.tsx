'use client'

// Inventory branch of Stock Opname Awal — see memory project-initial-stock-opname-temporary.
// Unlike the Stock Barang branch, this isn't a session with a draft/finalize lifecycle:
// InventoryItem/InventoryCategory/InventoryRoom are permanent catalog rows managed
// through the existing Inventory API (src/app/api/inventory/*), so every add here is
// applied immediately. No quantity/value is asked — items are physical assets rated by
// condition later via Inventory > Stock Opname, not counted by stock quantity.

import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, Plus, X, Boxes } from 'lucide-react'

interface Room { id: string; name: string; locationId: string }
interface InvCategory { id: string; name: string; roomId: string }
interface InvItem { id: string; itemNumber: string; name: string; categoryId: string }

const NEW_CATEGORY = '__new__'

function AddInventoryItemModal({ roomId, categories, onClose, onAdded, onCategoryAdded }: {
  roomId: string; categories: InvCategory[]
  onClose: () => void
  onAdded: (item: InvItem) => void
  onCategoryAdded: (cat: InvCategory) => void
}) {
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? (categories.length ? '' : NEW_CATEGORY))
  const [newCategoryName, setNewCategoryName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const usingNewCategory = categoryId === NEW_CATEGORY || categories.length === 0

  async function submit() {
    setError('')
    setSaving(true)
    let finalCategoryId = categoryId
    if (usingNewCategory) {
      if (!newCategoryName.trim()) { setError('Nama kategori wajib diisi'); setSaving(false); return }
      const catRes = await fetch('/api/inventory/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCategoryName, roomId }),
      })
      if (!catRes.ok) { const err = await catRes.json(); setError(err.error ?? 'Gagal menambah kategori'); setSaving(false); return }
      const newCat = await catRes.json()
      onCategoryAdded(newCat)
      finalCategoryId = newCat.id
    }

    const res = await fetch('/api/inventory/items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, categoryId: finalCategoryId }),
    })
    if (res.ok) {
      onAdded(await res.json())
      onClose()
    } else {
      const err = await res.json()
      setError(err.error ?? 'Gagal menambah barang')
    }
    setSaving(false)
  }

  const canSubmit = name.trim() && (usingNewCategory ? newCategoryName.trim() : categoryId)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="font-semibold text-lg">Tambah Barang</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nama Barang *</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e]" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Kategori *</label>
            {categories.length > 0 && !usingNewCategory && (
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] bg-white">
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value={NEW_CATEGORY}>+ Kategori baru...</option>
              </select>
            )}
            {(usingNewCategory) && (
              <div className="space-y-1.5">
                <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="Nama kategori baru"
                  className="w-full h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e]" />
                {categories.length > 0 && (
                  <button onClick={() => setCategoryId(categories[0].id)} className="text-xs text-muted-foreground hover:underline">Batal, pilih dari yang sudah ada</button>
                )}
              </div>
            )}
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

export default function InventoryQuickAdd({ locationId, locationName, initialRoomId, initialRoomName, onBack }: {
  locationId: string; locationName: string; initialRoomId: string; initialRoomName: string; onBack: () => void
}) {
  const [rooms, setRooms] = useState<Room[]>([{ id: initialRoomId, name: initialRoomName, locationId }])
  const [roomId, setRoomId] = useState(initialRoomId)
  const [categories, setCategories] = useState<InvCategory[]>([])
  const [items, setItems] = useState<InvItem[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [addingRoom, setAddingRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [savingRoom, setSavingRoom] = useState(false)

  const currentRoom = rooms.find(r => r.id === roomId)

  const loadRoomData = useCallback(async (rid: string) => {
    setLoading(true)
    const [cRes, iRes] = await Promise.all([
      fetch(`/api/inventory/categories?roomId=${rid}`),
      fetch(`/api/inventory/items?roomId=${rid}`),
    ])
    setCategories(cRes.ok ? await cRes.json() : [])
    setItems(iRes.ok ? await iRes.json() : [])
    setLoading(false)
  }, [])

  const loadRooms = useCallback(async () => {
    const res = await fetch(`/api/inventory/rooms?locationId=${locationId}`)
    if (res.ok) setRooms(await res.json())
  }, [locationId])

  useEffect(() => { loadRooms(); loadRoomData(initialRoomId) }, [loadRooms, loadRoomData, initialRoomId])

  function switchRoom(rid: string) {
    setRoomId(rid)
    loadRoomData(rid)
  }

  async function addRoom() {
    if (!newRoomName.trim()) return
    setSavingRoom(true)
    const res = await fetch('/api/inventory/rooms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newRoomName, locationId }),
    })
    if (res.ok) {
      const room = await res.json()
      setRooms(r => [...r, room])
      setNewRoomName('')
      setAddingRoom(false)
      switchRoom(room.id)
    }
    setSavingRoom(false)
  }

  const itemsByCategory = new Map<string, InvItem[]>()
  for (const item of items) {
    const list = itemsByCategory.get(item.categoryId) ?? []
    list.push(item)
    itemsByCategory.set(item.categoryId, list)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground text-sm">← Kembali</button>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Inventory — {locationName}</span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">{currentRoom?.name ?? '...'}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Tambah barang & kategori awal untuk ruangan ini — tanpa perlu jumlah stok</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select value={roomId} onChange={e => switchRoom(e.target.value)}
            className="h-9 border rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] bg-white">
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#bdac7e] hover:bg-[#a89860] text-white rounded-md font-medium transition-colors">
            <Plus className="h-4 w-4" /> Tambah Barang
          </button>
        </div>
      </div>

      {!addingRoom ? (
        <button onClick={() => setAddingRoom(true)} className="text-xs text-[#bdac7e] hover:underline">+ Ruangan baru di lokasi ini</button>
      ) : (
        <div className="flex items-center gap-2">
          <input value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder="Nama ruangan baru"
            className="h-9 border rounded-md px-3 text-sm w-56 focus:outline-none focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e]" />
          <button onClick={addRoom} disabled={!newRoomName.trim() || savingRoom} className="px-3 py-1.5 text-sm bg-[#bdac7e] text-white rounded-md hover:bg-[#a89860] disabled:opacity-50">
            {savingRoom ? 'Menambah...' : 'Tambah'}
          </button>
          <button onClick={() => { setAddingRoom(false); setNewRoomName('') }} className="text-sm text-muted-foreground hover:underline">Batal</button>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-3 animate-pulse">
            {[...Array(3)].map((_, i) => <div key={i} className="h-4 rounded bg-muted w-1/3" />)}
          </div>
        ) : categories.length === 0 ? (
          <div className="p-10 text-center">
            <Boxes className="h-8 w-8 mx-auto mb-3 opacity-20" />
            <p className="text-sm text-muted-foreground">Belum ada kategori di ruangan ini. Klik "Tambah Barang" untuk mulai — kategori baru bisa dibuat langsung dari situ.</p>
          </div>
        ) : (
          <div className="divide-y">
            {categories.map(cat => (
              <div key={cat.id} className="px-5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{cat.name}</p>
                {(itemsByCategory.get(cat.id) ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground/60 italic">Belum ada barang</p>
                ) : (
                  <div className="space-y-1">
                    {(itemsByCategory.get(cat.id) ?? []).map(item => (
                      <div key={item.id} className="flex items-center gap-2 text-sm py-1">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">{item.itemNumber}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {addOpen && (
        <AddInventoryItemModal
          roomId={roomId}
          categories={categories}
          onClose={() => setAddOpen(false)}
          onAdded={item => setItems(prev => [...prev, item])}
          onCategoryAdded={cat => setCategories(prev => [...prev, cat])}
        />
      )}
    </div>
  )
}
