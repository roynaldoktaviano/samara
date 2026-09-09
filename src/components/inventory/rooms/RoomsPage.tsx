'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, X, DoorOpen, Tag, Ship, AlertTriangle, ChevronRight } from 'lucide-react'
import { renderLocationOptions } from '@/components/purchasing/LocationOptions'

interface StockLocation { id: string; name: string; type: string; parentId: string | null }
interface Room { id: string; name: string; locationId: string; isActive: boolean; _count: { categories: number; items: number } }
interface Category { id: string; name: string; roomId: string; isActive: boolean; _count: { items: number } }

export default function RoomsPage() {
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [locationId, setLocationId] = useState('')

  const [rooms, setRooms] = useState<Room[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)

  const [roomModal, setRoomModal] = useState<{ open: boolean; editing: Room | null; name: string; error: string; saving: boolean }>({ open: false, editing: null, name: '', error: '', saving: false })
  const [categoryModal, setCategoryModal] = useState<{ open: boolean; editing: Category | null; name: string; error: string; saving: boolean }>({ open: false, editing: null, name: '', error: '', saving: false })
  const [deleteConfirm, setDeleteConfirm] = useState<{ kind: 'room' | 'category'; id: string; name: string } | null>(null)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    fetch('/api/purchasing/locations').then(r => r.json()).then((data: StockLocation[]) => {
      setLocations(data)
      if (!locationId && data.length) setLocationId(data.find(l => !l.parentId)?.id ?? data[0].id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadRooms = useCallback(async () => {
    if (!locationId) { setRooms([]); return }
    setRoomsLoading(true)
    const res = await fetch(`/api/inventory/rooms?locationId=${locationId}`)
    if (res.ok) setRooms(await res.json())
    setRoomsLoading(false)
  }, [locationId])

  useEffect(() => { loadRooms(); setSelectedRoomId(null); setCategories([]) }, [loadRooms])

  const loadCategories = useCallback(async () => {
    if (!selectedRoomId) { setCategories([]); return }
    setCategoriesLoading(true)
    const res = await fetch(`/api/inventory/categories?roomId=${selectedRoomId}`)
    if (res.ok) setCategories(await res.json())
    setCategoriesLoading(false)
  }, [selectedRoomId])

  useEffect(() => { loadCategories() }, [loadCategories])

  const selectedRoom = rooms.find(r => r.id === selectedRoomId) ?? null

  function openAddRoom() { setRoomModal({ open: true, editing: null, name: '', error: '', saving: false }) }
  function openEditRoom(r: Room) { setRoomModal({ open: true, editing: r, name: r.name, error: '', saving: false }) }
  async function saveRoom() {
    setRoomModal(m => ({ ...m, saving: true, error: '' }))
    const url = roomModal.editing ? `/api/inventory/rooms/${roomModal.editing.id}` : '/api/inventory/rooms'
    const method = roomModal.editing ? 'PUT' : 'POST'
    const body = roomModal.editing ? { name: roomModal.name } : { name: roomModal.name, locationId }
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (!res.ok) { setRoomModal(m => ({ ...m, saving: false, error: data.error ?? 'Failed to save' })); return }
    setRoomModal({ open: false, editing: null, name: '', error: '', saving: false })
    loadRooms()
  }

  function openAddCategory() { setCategoryModal({ open: true, editing: null, name: '', error: '', saving: false }) }
  function openEditCategory(c: Category) { setCategoryModal({ open: true, editing: c, name: c.name, error: '', saving: false }) }
  async function saveCategory() {
    if (!selectedRoomId) return
    setCategoryModal(m => ({ ...m, saving: true, error: '' }))
    const url = categoryModal.editing ? `/api/inventory/categories/${categoryModal.editing.id}` : '/api/inventory/categories'
    const method = categoryModal.editing ? 'PUT' : 'POST'
    const body = categoryModal.editing ? { name: categoryModal.name } : { name: categoryModal.name, roomId: selectedRoomId }
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (!res.ok) { setCategoryModal(m => ({ ...m, saving: false, error: data.error ?? 'Failed to save' })); return }
    setCategoryModal({ open: false, editing: null, name: '', error: '', saving: false })
    loadCategories()
    loadRooms()
  }

  async function doDelete() {
    if (!deleteConfirm) return
    setDeleteError('')
    const url = deleteConfirm.kind === 'room' ? `/api/inventory/rooms/${deleteConfirm.id}` : `/api/inventory/categories/${deleteConfirm.id}`
    const res = await fetch(url, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); setDeleteError(d.error ?? 'Failed to delete'); return }
    if (deleteConfirm.kind === 'room') { if (selectedRoomId === deleteConfirm.id) setSelectedRoomId(null); loadRooms() }
    else loadCategories()
    setDeleteConfirm(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Rooms & Categories</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage rooms and item categories for each place (ship/warehouse)</p>
      </div>

      {/* Location picker */}
      <div className="flex items-center gap-2">
        <Ship className="h-4 w-4 text-muted-foreground" />
        <select
          className="border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-amber-500 min-w-64"
          value={locationId} onChange={e => setLocationId(e.target.value)}>
          {renderLocationOptions(locations, { topLevelOnly: true })}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Rooms panel */}
        <div className="rounded-xl border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2"><DoorOpen className="h-4 w-4" /> Rooms</h3>
            <button onClick={openAddRoom} className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
          <div className="divide-y max-h-[28rem] overflow-y-auto">
            {roomsLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
            ) : rooms.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <DoorOpen className="h-7 w-7 mx-auto mb-2 opacity-20" />
                No rooms yet at this place.
              </div>
            ) : rooms.map(r => (
              <button key={r.id} onClick={() => setSelectedRoomId(r.id)}
                className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors ${selectedRoomId === r.id ? 'bg-amber-50' : ''}`}>
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r._count.categories} categories · {r._count.items} items</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span onClick={e => { e.stopPropagation(); openEditRoom(r) }} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </span>
                  <span onClick={e => { e.stopPropagation(); setDeleteConfirm({ kind: 'room', id: r.id, name: r.name }); setDeleteError('') }} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Categories panel */}
        <div className="rounded-xl border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Tag className="h-4 w-4" /> Item Categories
              {selectedRoom && <span className="text-xs font-normal text-muted-foreground">— {selectedRoom.name}</span>}
            </h3>
            {selectedRoomId && (
              <button onClick={openAddCategory} className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900">
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            )}
          </div>
          <div className="divide-y max-h-[28rem] overflow-y-auto">
            {!selectedRoomId ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Select a room first.</div>
            ) : categoriesLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
            ) : categories.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <Tag className="h-7 w-7 mx-auto mb-2 opacity-20" />
                No categories yet in this room.
              </div>
            ) : categories.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{c._count.items} items</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEditCategory(c)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => { setDeleteConfirm({ kind: 'category', id: c.id, name: c.name }); setDeleteError('') }} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Room modal */}
      {roomModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{roomModal.editing ? 'Edit Room' : 'Add Room'}</h3>
              <button onClick={() => setRoomModal(m => ({ ...m, open: false }))}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            {roomModal.error && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {roomModal.error}
              </div>
            )}
            <input autoFocus
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 mb-4"
              placeholder="e.g. Kitchen, WheelHouse"
              value={roomModal.name} onChange={e => setRoomModal(m => ({ ...m, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && saveRoom()} />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRoomModal(m => ({ ...m, open: false }))} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
              <button onClick={saveRoom} disabled={roomModal.saving || !roomModal.name.trim()} className="px-4 py-2 text-sm bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50">
                {roomModal.saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category modal */}
      {categoryModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{categoryModal.editing ? 'Edit Category' : 'Add Category'}</h3>
              <button onClick={() => setCategoryModal(m => ({ ...m, open: false }))}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            {categoryModal.error && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {categoryModal.error}
              </div>
            )}
            <input autoFocus
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 mb-4"
              placeholder="e.g. Cooking Equipment, Navigation"
              value={categoryModal.name} onChange={e => setCategoryModal(m => ({ ...m, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && saveCategory()} />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setCategoryModal(m => ({ ...m, open: false }))} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
              <button onClick={saveCategory} disabled={categoryModal.saving || !categoryModal.name.trim()} className="px-4 py-2 text-sm bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50">
                {categoryModal.saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-2">Delete {deleteConfirm.kind === 'room' ? 'Room' : 'Category'}?</h3>
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
              <button onClick={doDelete} className="px-4 py-2 text-sm bg-destructive text-white rounded-md hover:bg-destructive/90">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
