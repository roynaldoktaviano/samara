'use client'

import { useState, useEffect, useCallback } from 'react'
import { Ship, DoorOpen, Star, Camera, CheckCircle2, AlertTriangle, ClipboardList, ArrowLeft, Loader2 } from 'lucide-react'
import { renderLocationOptions } from '@/components/purchasing/LocationOptions'
import { PhotoSourceMenu, FilePreview } from '@/components/ui/file-preview'
import { readUploadFile } from '@/lib/fileUpload'

interface StockLocation { id: string; name: string; type: string; parentId: string | null }
interface Room { id: string; name: string; locationId: string }

interface OpnameEntry {
  id: string; unitIndex: number; rating: number | null; photoKey: string | null; notes: string | null
  item: { id: string; itemNumber: string; name: string; unitPrice: number; photoKeys: string[] }
  replacementRequestItem: { id: string; request: { id: string; prNumber: string; status: string } } | null
}
interface Opname {
  id: string; opnameNumber: string; status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED'
  location: { id: string; name: string }; room: { id: string; name: string }
  entries: OpnameEntry[]
}
interface OpnameListRow {
  id: string; opnameNumber: string; status: string; createdAt: string
  location: { name: string }; room: { name: string }; countedBy: { name: string | null }
  _count: { entries: number }
}

export default function OpnamePage() {
  const [view, setView] = useState<'list' | 'start' | 'session'>('list')

  const [list, setList] = useState<OpnameListRow[]>([])
  const [listLoading, setListLoading] = useState(true)

  const [locations, setLocations] = useState<StockLocation[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [startLocationId, setStartLocationId] = useState('')
  const [startRoomId, setStartRoomId] = useState('')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')

  const [opname, setOpname] = useState<Opname | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [photoMenuFor, setPhotoMenuFor] = useState<string | null>(null)
  const [savingEntry, setSavingEntry] = useState<string | null>(null)
  const [requestingFor, setRequestingFor] = useState<string | null>(null)
  const [completeError, setCompleteError] = useState('')
  const [completing, setCompleting] = useState(false)

  const loadList = useCallback(async () => {
    setListLoading(true)
    const res = await fetch('/api/inventory/opnames')
    if (res.ok) setList(await res.json())
    setListLoading(false)
  }, [])

  useEffect(() => { if (view === 'list') loadList() }, [view, loadList])

  useEffect(() => {
    fetch('/api/purchasing/locations').then(r => r.json()).then(setLocations)
  }, [])

  useEffect(() => {
    if (!startLocationId) { setRooms([]); setStartRoomId(''); return }
    fetch(`/api/inventory/rooms?locationId=${startLocationId}`).then(r => r.json()).then(setRooms)
    setStartRoomId('')
  }, [startLocationId])

  async function loadSession(id: string) {
    setSessionLoading(true)
    const res = await fetch(`/api/inventory/opnames/${id}`)
    if (res.ok) setOpname(await res.json())
    setSessionLoading(false)
  }

  function openStart() { setStartLocationId(''); setStartRoomId(''); setStartError(''); setView('start') }

  async function startOpname() {
    if (!startLocationId || !startRoomId) return
    setStarting(true); setStartError('')
    const res = await fetch('/api/inventory/opnames', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId: startLocationId, roomId: startRoomId }),
    })
    const data = await res.json()
    setStarting(false)
    if (!res.ok) { setStartError(data.error ?? 'Failed to start opname'); return }
    setOpname(data)
    setView('session')
  }

  async function openExisting(id: string) {
    setView('session')
    await loadSession(id)
  }

  async function saveEntry(entryId: string, patch: { rating?: number; photoKey?: string; notes?: string }) {
    if (!opname) return
    setSavingEntry(entryId)
    const res = await fetch(`/api/inventory/opnames/${opname.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [{ id: entryId, ...patch }] }),
    })
    if (res.ok) setOpname(await res.json())
    setSavingEntry(null)
  }

  async function handlePhoto(entryId: string, files: File[]) {
    if (!files.length) return
    const dataUrl = await readUploadFile(files[0])
    saveEntry(entryId, { photoKey: dataUrl })
  }

  async function requestReplacement(entryId: string) {
    if (!opname) return
    setRequestingFor(entryId)
    const res = await fetch(`/api/inventory/opnames/${opname.id}/entries/${entryId}/replacement-request`, { method: 'POST' })
    const data = await res.json()
    setRequestingFor(null)
    if (!res.ok) { alert(data.error ?? 'Failed to request replacement'); return }
    loadSession(opname.id)
  }

  async function completeOpname() {
    if (!opname) return
    setCompleting(true); setCompleteError('')
    const res = await fetch(`/api/inventory/opnames/${opname.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    })
    const data = await res.json()
    setCompleting(false)
    if (!res.ok) { setCompleteError(data.error ?? 'Failed to complete opname'); return }
    setOpname(data)
  }

  const STATUS_LABEL: Record<string, string> = { DRAFT: 'Draft', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed' }
  const STATUS_COLOR: Record<string, string> = { DRAFT: 'bg-blue-100 text-blue-700', IN_PROGRESS: 'bg-amber-100 text-amber-700', COMPLETED: 'bg-green-100 text-green-700' }

  if (view === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Stock Opname</h2>
            <p className="text-muted-foreground text-sm mt-1">Check the physical condition of inventory items per room</p>
          </div>
          <button onClick={openStart} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
            <ClipboardList className="h-4 w-4" /> Start Opname
          </button>
        </div>

        {listLoading ? (
          <div className="rounded-lg border overflow-hidden animate-pulse">
            <div className="h-10 bg-muted/50 border-b" />
            {[...Array(3)].map((_, i) => <div key={i} className="px-5 py-4 border-t h-4 bg-muted/30" />)}
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Opname No.</th>
                  <th className="text-left px-4 py-3 font-medium">Place / Room</th>
                  <th className="text-left px-4 py-3 font-medium">Counted By</th>
                  <th className="text-right px-4 py-3 font-medium">Unit</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                    <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    No opname sessions yet.
                  </td></tr>
                ) : list.map(o => (
                  <tr key={o.id} onClick={() => openExisting(o.id)} className="hover:bg-muted/30 transition-colors cursor-pointer">
                    <td className="px-4 py-3 font-mono text-xs">{o.opnameNumber}</td>
                    <td className="px-4 py-3">{o.location.name} · {o.room.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{o.countedBy.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{o._count.entries}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[o.status] ?? ''}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}
      </div>
    )
  }

  if (view === 'start') {
    return (
      <div className="space-y-6 max-w-md">
        <button onClick={() => setView('list')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Start Stock Opname</h2>
          <p className="text-muted-foreground text-sm mt-1">Select the ship/place, then the room you want to check</p>
        </div>

        {startError && (
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {startError}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Ship className="h-3.5 w-3.5" /> Select Ship / Place</label>
          <select className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            value={startLocationId} onChange={e => setStartLocationId(e.target.value)}>
            <option value="">— Select —</option>
            {renderLocationOptions(locations, { topLevelOnly: true })}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><DoorOpen className="h-3.5 w-3.5" /> Select Room</label>
          <select className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
            value={startRoomId} onChange={e => setStartRoomId(e.target.value)} disabled={!startLocationId}>
            <option value="">— Select —</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <button onClick={startOpname} disabled={!startLocationId || !startRoomId || starting}
          className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50 transition-colors">
          {starting ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting...</> : 'Start Opname'}
        </button>
      </div>
    )
  }

  // Session view
  if (sessionLoading || !opname) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading opname session...</div>
  }

  const ratedCount = opname.entries.filter(e => e.rating !== null).length
  const allRated = ratedCount === opname.entries.length

  return (
    <div className="space-y-6">
      <button onClick={() => setView('list')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to list
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{opname.opnameNumber}</h2>
          <p className="text-muted-foreground text-sm mt-1">{opname.location.name} · {opname.room.name} · {ratedCount}/{opname.entries.length} units rated</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[opname.status]}`}>{STATUS_LABEL[opname.status]}</span>
      </div>

      {completeError && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {completeError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {opname.entries.map(entry => {
          const damaged = entry.rating !== null && entry.rating <= 2
          return (
            <div key={entry.id} className={`rounded-xl border p-4 space-y-3 ${damaged ? 'border-red-200 bg-red-50/30' : ''}`}>
              <div>
                <p className="text-xs text-muted-foreground font-mono">{entry.item.itemNumber} · Unit #{entry.unitIndex}</p>
                <p className="text-sm font-semibold">{entry.item.name}</p>
              </div>

              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }, (_, i) => {
                  const starValue = i + 1
                  const filled = entry.rating !== null && starValue <= entry.rating
                  return (
                    <button key={i} type="button" disabled={opname.status === 'COMPLETED'}
                      onClick={() => saveEntry(entry.id, { rating: starValue })}
                      className="disabled:cursor-not-allowed">
                      <Star className={`h-6 w-6 transition-colors ${filled ? 'fill-amber-400 text-amber-400' : 'text-gray-200 hover:text-amber-200'}`} />
                    </button>
                  )
                })}
                {savingEntry === entry.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
              </div>

              {entry.photoKey ? (
                <FilePreview src={entry.photoKey} alt="Item condition" className="w-full h-28 object-cover rounded-lg" />
              ) : (
                <button type="button" disabled={opname.status === 'COMPLETED'}
                  onClick={() => setPhotoMenuFor(entry.id)}
                  className="w-full h-20 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-amber-400 hover:text-amber-700 transition-colors disabled:opacity-50">
                  <Camera className="h-4 w-4" />
                  <span className="text-xs">Condition Photo</span>
                </button>
              )}
              <PhotoSourceMenu open={photoMenuFor === entry.id} onClose={() => setPhotoMenuFor(null)} onFiles={files => handlePhoto(entry.id, files)} />

              {damaged && (
                entry.replacementRequestItem ? (
                  <div className="flex items-center justify-between text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg px-2.5 py-1.5">
                    <span>{entry.replacementRequestItem.request.prNumber} submitted</span>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </div>
                ) : (
                  <button type="button" onClick={() => requestReplacement(entry.id)} disabled={requestingFor === entry.id}
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 disabled:opacity-50">
                    {requestingFor === entry.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    Request for Replacement
                  </button>
                )
              )}
            </div>
          )
        })}
      </div>

      {opname.status !== 'COMPLETED' && (
        <div className="flex justify-end">
          <button onClick={completeOpname} disabled={!allRated || completing}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-50 transition-colors">
            {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Complete Opname
          </button>
        </div>
      )}
    </div>
  )
}
