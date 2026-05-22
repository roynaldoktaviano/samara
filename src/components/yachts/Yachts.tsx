'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { Plus, Search, Anchor, ChevronDown, ChevronUp, Trash2, BedDouble, ChevronRight, Pencil, RotateCw } from 'lucide-react'

interface PricingTier { nights: number; price: number }

interface CabinRecord {
  id: string
  name: string
  capacity: number
  price: number
  deck?: string
  bedType?: string
  extraBeds: number
  pricingTiers: PricingTier[]
}

interface YachtRecord {
  id: string
  name: string
  model?: string
  year?: number
  capacity: number
  cabinCount: number
  length?: number
  hourlyRate: number
  dailyRate: number
  extraBedTiers: PricingTier[]
  canDiving: boolean
  status: string
  description?: string
  cabins: CabinRecord[]
  _count: { bookings: number; crew: number }
}

interface TierInput { nights: number; price: string }

interface RoomInput {
  tempId: string
  id?: string
  name: string
  deck: string
  bedType: string
  capacity: string
  price: string      // per-night fallback
  extraBeds: string
  pricingTiers: TierInput[]
}

const BED_TYPES = ['Single', 'Double', 'Twin', 'Queen', 'King', 'Bunk']
const DECKS     = ['Upper Deck', 'Main Deck', 'Lower Deck', 'Flybridge']


const ACCENT = '#bdac7e'
const STEPS  = ['Boat Info', 'Rooms & Cabins']

export default function Yachts() {
  const { data: session } = useSession()
  const canEdit = session?.user?.role === 'SUPER_ADMIN' || session?.user?.role === 'ADMIN'

  const [yachts,       setYachts]       = useState<YachtRecord[]>([])
  const [loading,      setLoading]      = useState(true)
  const [searchTerm,   setSearch]       = useState('')
  const [dialogOpen,   setDialogOpen]   = useState(false)
  const [editTarget,   setEditTarget]   = useState<YachtRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<YachtRecord | null>(null)
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [submitting,   setSubmitting]   = useState(false)
  const [formStep,     setFormStep]     = useState(1)
  const [error,        setError]        = useState('')

  /* form state */
  const [name,        setName]    = useState('')
  const [model,       setModel]   = useState('')
  const [year,        setYear]    = useState('')
  const [capacity,    setCap]     = useState('')
  const [length,      setLen]     = useState('')
  const [dailyRate,     setDaily]         = useState('')
  const [extraBedTiers, setExtraBedTiers] = useState<{ nights: number; price: string }[]>([
    { nights: 2, price: '' }, { nights: 3, price: '' }, { nights: 4, price: '' },
  ])
  const [canDiving,     setCanDiving]     = useState(false)
  const [description,   setDesc]          = useState('')
  const [rooms,          setRooms]        = useState<RoomInput[]>([])
  const [formTiers,      setFormTiers]    = useState<number[]>([2, 3, 4])
  const [addingTier,     setAddingTier]   = useState(false)
  const [newTierDays,    setNewTierDays]  = useState('')

  const fetchYachts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/yachts').then(r => r.json())
      setYachts(Array.isArray(data) ? data : [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchYachts() }, [fetchYachts])

  const resetForm = () => {
    setName(''); setModel(''); setYear(''); setCap(''); setLen('')
    setDaily(''); setCanDiving(false); setDesc('')
    setFormTiers([2, 3, 4])
    setExtraBedTiers([{ nights: 2, price: '' }, { nights: 3, price: '' }, { nights: 4, price: '' }])
    setRooms([]); setFormStep(1); setEditTarget(null); setError('')
    setAddingTier(false); setNewTierDays('')
  }

  const addTier = () => {
    const days = parseInt(newTierDays)
    if (!days || days < 2) return
    const nights = days - 1
    if (formTiers.includes(nights)) { setAddingTier(false); setNewTierDays(''); return }
    const newTiers = [...formTiers, nights].sort((a, b) => a - b)
    setFormTiers(newTiers)
    setRooms(r => r.map(room => ({
      ...room,
      pricingTiers: newTiers.map(n => ({
        nights: n,
        price: room.pricingTiers.find(t => t.nights === n)?.price ?? '',
      })),
    })))
    setExtraBedTiers(prev => {
      if (prev.find(t => t.nights === nights)) return prev
      return [...prev, { nights, price: '' }].sort((a, b) => a.nights - b.nights)
    })
    setNewTierDays(''); setAddingTier(false)
  }

  const removeTier = (nights: number) => {
    if (formTiers.length <= 1) return
    const newTiers = formTiers.filter(n => n !== nights)
    setFormTiers(newTiers)
    setRooms(r => r.map(room => ({
      ...room,
      pricingTiers: room.pricingTiers.filter(t => t.nights !== nights),
    })))
    setExtraBedTiers(prev => prev.filter(t => t.nights !== nights))
  }

  const openAdd = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEdit = (y: YachtRecord) => {
    setEditTarget(y)
    setName(y.name)
    setModel(y.model ?? '')
    setYear(y.year?.toString() ?? '')
    setCap(y.capacity.toString())
    setLen(y.length?.toString() ?? '')
    setDaily(y.dailyRate.toString())
    const existingNights = y.extraBedTiers?.length
      ? [...new Set(y.extraBedTiers.map((t: PricingTier) => t.nights))].sort((a, b) => a - b)
      : y.cabins[0]?.pricingTiers?.length
        ? [...new Set(y.cabins[0].pricingTiers.map(t => t.nights))].sort((a, b) => a - b)
        : [2, 3, 4]
    setFormTiers(existingNights)
    setExtraBedTiers(existingNights.map(n => ({
      nights: n,
      price: ((y.extraBedTiers ?? []).find((t: PricingTier) => t.nights === n)?.price ?? 0).toString(),
    })))
    setCanDiving(y.canDiving ?? false)
    setDesc(y.description ?? '')
    setRooms(y.cabins.map(c => ({
      tempId: c.id,
      id: c.id,
      name: c.name,
      deck: c.deck ?? '',
      bedType: c.bedType ?? '',
      capacity: (c.capacity ?? 0).toString(),
      price: (c.price ?? 0).toString(),
      extraBeds: (c.extraBeds ?? 0).toString(),
      pricingTiers: existingNights.map(n => ({
        nights: n,
        price: (c.pricingTiers?.find(t => t.nights === n)?.price ?? 0).toString(),
      })),
    })))
    setFormStep(1)
    setError('')
    setDialogOpen(true)
  }

  const addRoom = () => setRooms(r => [...r, {
    tempId: Date.now().toString(), name: '', deck: '', bedType: '', capacity: '2', price: '0', extraBeds: '0',
    pricingTiers: formTiers.map(n => ({ nights: n, price: '' })),
  }])

  const removeRoom = (tempId: string) => setRooms(r => r.filter(x => x.tempId !== tempId))

  const updateRoom = (tempId: string, patch: Partial<RoomInput>) =>
    setRooms(r => r.map(x => x.tempId === tempId ? { ...x, ...patch } : x))

  const maxCap         = parseInt(capacity) || 0
  const totalCabinCap  = rooms.reduce((s, r) => s + (parseInt(r.capacity)  || 0), 0)
  const totalExtraBeds = rooms.reduce((s, r) => s + (parseInt(r.extraBeds) || 0), 0)
  const cabinCapExceeded = maxCap > 0 && totalCabinCap > maxCap
  const extraBedOverflow = maxCap > 0 && (totalCabinCap + totalExtraBeds) > maxCap

  const step1Valid = !!name && !!capacity && !!dailyRate

  const handleSubmit = async () => {
    if (!step1Valid || cabinCapExceeded || extraBedOverflow) return
    setSubmitting(true)
    setError('')
    try {
      const payload = {
        name, model, year, capacity, length, hourlyRate: '0', dailyRate, canDiving, description,
        extraBedTiers: extraBedTiers.filter(t => t.price && parseFloat(t.price) > 0).map(t => ({ nights: t.nights, price: parseFloat(t.price) })),
        rooms: rooms.filter(r => r.name.trim()).map(r => ({
          id: r.id,
          name: r.name, deck: r.deck, bedType: r.bedType,
          capacity: r.capacity, extraBeds: r.extraBeds,
          pricingTiers: r.pricingTiers
            .filter(t => t.price && parseFloat(t.price) > 0)
            .map(t => ({ nights: t.nights, price: parseFloat(t.price) })),
        })),
      }
      const url    = editTarget ? `/api/yachts/${editTarget.id}` : '/api/yachts'
      const method = editTarget ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        await fetchYachts()
        setDialogOpen(false)
        resetForm()
      } else {
        const j = await res.json()
        setError(j.error ?? 'Save failed')
      }
    } catch (e) { setError('Network error'); console.error(e) }
    finally { setSubmitting(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/yachts/${deleteTarget.id}`, { method: 'DELETE' })
      if (res.ok) {
        await fetchYachts()
        setDeleteTarget(null)
      } else {
        const j = await res.json()
        alert(j.error ?? 'Delete failed')
      }
    } catch { alert('Network error') }
    finally { setSubmitting(false) }
  }

  const filtered = yachts.filter(y =>
    y.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (y.model ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-2xl font-bold tracking-tight">Yachts</h3>
            <button onClick={() => fetchYachts()} title="Refresh" className="text-muted-foreground hover:text-foreground transition-colors mt-0.5">
              <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">Manage your fleet and cabins</p>
        </div>
        {canEdit && (
          <Button style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add Yacht
          </Button>
        )}
      </div>

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) resetForm() }}>
        <DialogContent className="sm:max-w-5xl flex flex-col max-h-[92vh] overflow-hidden gap-0 p-0">
          <DialogHeader className="shrink-0 px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-lg">{editTarget ? `Edit — ${editTarget.name}` : 'Add New Yacht'}</DialogTitle>

            {/* Step indicator */}
            <div className="flex items-center gap-0 mt-3">
              {STEPS.map((label, i) => {
                const n = i + 1
                const done   = formStep > n
                const active = formStep === n
                return (
                  <Fragment key={n}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors"
                        style={{
                          backgroundColor: done || active ? ACCENT : undefined,
                          border: `2px solid ${done || active ? ACCENT : '#d1d5db'}`,
                          color:  done || active ? 'white' : '#9ca3af',
                        }}
                      >
                        {n}
                      </div>
                      <span className={`text-sm font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <ChevronRight className="w-4 h-4 text-muted-foreground mx-3 shrink-0" />
                    )}
                  </Fragment>
                )
              })}
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-5">

              {/* ── Step 1: Boat Info ── */}
              {formStep === 1 && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <Label>Boat Name <span className="text-destructive">*</span></Label>
                    <Input placeholder="e.g. Samara I" value={name} onChange={e => setName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Model / Type</Label>
                    <Input placeholder="e.g. Custom Phinisi" value={model} onChange={e => setModel(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Build Year</Label>
                    <Input type="number" placeholder="2020" value={year} onChange={e => setYear(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Length (m)</Label>
                    <Input type="number" placeholder="27" value={length} onChange={e => setLen(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max Capacity (pax) <span className="text-destructive">*</span></Label>
                    <Input type="number" placeholder="12" value={capacity} onChange={e => setCap(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Private Charter Rate (USD/day) <span className="text-destructive">*</span></Label>
                    <Input type="number" placeholder="3500" value={dailyRate} onChange={e => setDaily(e.target.value)} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>Description</Label>
                    <Textarea placeholder="About this yacht..." value={description} onChange={e => setDesc(e.target.value)} rows={3} />
                  </div>
                  <div className="col-span-2 flex items-center justify-between rounded-lg border px-4 py-3">
                    <div>
                      <Label>Can Diving</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Kapal ini bisa digunakan untuk kegiatan diving</p>
                    </div>
                    <Switch checked={canDiving} onCheckedChange={setCanDiving} />
                  </div>
                </div>
              )}

              {/* ── Step 2: Rooms / Cabins ── */}
              {formStep === 2 && (() => {
                const gridCols = `28px minmax(70px,0.6fr) 90px 84px 48px 48px ${formTiers.map(() => '68px').join(' ')} 32px`
                return (
                <div className="space-y-4">
                  {/* Section header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Rooms &amp; Cabins</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Set per-cabin price, bed type, and capacity for <span className="font-semibold">{name}</span>.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {addingTier ? (
                        <div className="flex items-center gap-1.5 border rounded-lg px-2 py-1 bg-muted/30">
                          <span className="text-[11px] text-muted-foreground shrink-0">Days:</span>
                          <Input
                            autoFocus
                            className="h-6 w-12 text-xs border-0 shadow-none focus-visible:ring-0 bg-transparent px-1 text-center"
                            type="number" min="2" placeholder="6"
                            value={newTierDays}
                            onChange={e => setNewTierDays(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') addTier(); if (e.key === 'Escape') { setAddingTier(false); setNewTierDays('') } }}
                          />
                          <button type="button" onClick={addTier} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#bdac7e] text-white hover:opacity-90">Add</button>
                          <button type="button" onClick={() => { setAddingTier(false); setNewTierDays('') }} className="text-[11px] text-muted-foreground hover:text-foreground px-1">✕</button>
                        </div>
                      ) : (
                        <Button type="button" variant="outline" size="sm" onClick={() => setAddingTier(true)}>
                          <Plus className="w-3.5 h-3.5 mr-1" /> Duration
                        </Button>
                      )}
                      <Button type="button" variant="outline" size="sm" onClick={addRoom}>
                        <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Room
                      </Button>
                    </div>
                  </div>

                  {rooms.length === 0 ? (
                    <div className="border-2 border-dashed rounded-xl py-10 flex flex-col items-center gap-3 text-muted-foreground">
                      <BedDouble className="w-7 h-7 opacity-30" />
                      <p className="text-sm">No rooms added yet.</p>
                      <Button type="button" variant="outline" size="sm" onClick={addRoom}>
                        <Plus className="w-3.5 h-3.5 mr-1.5" /> Add First Room
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-xl border overflow-hidden">
                      {/* Column headers */}
                      <div className="grid gap-0 bg-muted/40 border-b" style={{ gridTemplateColumns: gridCols }}>
                        {['#', 'Cabin Name', 'Deck', 'Bed Type', 'Cap', 'Extra'].map((h, i) => (
                          <div key={h} className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</div>
                        ))}
                        {formTiers.map(n => (
                          <div key={n} className="px-1 py-1.5 flex items-center gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: ACCENT }}>{n + 1}D/{n}N</span>
                            {formTiers.length > 1 && (
                              <button type="button" onClick={() => removeTier(n)} className="w-3.5 h-3.5 flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                                <span className="text-[9px] leading-none">✕</span>
                              </button>
                            )}
                          </div>
                        ))}
                        <div />
                      </div>

                      {/* Cabin rows */}
                      <div className="divide-y">
                        {rooms.map((r, idx) => (
                          <div key={r.tempId} className="grid items-center gap-0 hover:bg-muted/10 transition-colors" style={{ gridTemplateColumns: gridCols }}>
                            <div className="px-2 py-2 text-xs font-medium text-muted-foreground text-center">{idx + 1}</div>
                            <div className="px-1 py-1 border-l">
                              <Input className="h-7 text-sm border-0 shadow-none focus-visible:ring-0 bg-transparent px-1 placeholder:text-muted-foreground/40" placeholder="Name…" value={r.name} onChange={e => updateRoom(r.tempId, { name: e.target.value })} />
                            </div>
                            <div className="px-1 py-1 border-l">
                              <Select value={r.deck} onValueChange={v => updateRoom(r.tempId, { deck: v })}>
                                <SelectTrigger className="h-7 text-xs border-0 shadow-none focus:ring-0 bg-transparent px-1"><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent>{DECKS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div className="px-1 py-1 border-l">
                              <Select value={r.bedType} onValueChange={v => updateRoom(r.tempId, { bedType: v })}>
                                <SelectTrigger className="h-7 text-xs border-0 shadow-none focus:ring-0 bg-transparent px-1"><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent>{BED_TYPES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div className="px-1 py-1 border-l">
                              <Input className="h-7 text-xs text-center border-0 shadow-none focus-visible:ring-0 bg-transparent px-0" type="number" min="1" value={r.capacity}
                                onChange={e => updateRoom(r.tempId, { capacity: (Math.max(1, parseInt(e.target.value) || 1)).toString() })} />
                            </div>
                            <div className="px-1 py-1 border-l">
                              <Input className="h-7 text-xs text-center border-0 shadow-none focus-visible:ring-0 bg-transparent px-0" type="number" min="0" value={r.extraBeds}
                                onChange={e => {
                                  const thisExtra = parseInt(r.extraBeds) || 0
                                  const maxExtra = maxCap > 0 ? Math.max(0, maxCap - totalCabinCap - (totalExtraBeds - thisExtra)) : 9999
                                  updateRoom(r.tempId, { extraBeds: Math.min(maxExtra, Math.max(0, parseInt(e.target.value) || 0)).toString() })
                                }} />
                            </div>
                            {r.pricingTiers.map(t => (
                              <div key={t.nights} className="px-1 py-1 border-l">
                                <div className="flex items-center">
                                  <span className="text-xs text-muted-foreground shrink-0 ml-1">$</span>
                                  <Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 bg-transparent px-1 font-medium" type="number" min="0" step="50" placeholder="—" value={t.price}
                                    onChange={e => updateRoom(r.tempId, { pricingTiers: r.pricingTiers.map(x => x.nights === t.nights ? { ...x, price: e.target.value } : x) })} />
                                </div>
                              </div>
                            ))}
                            <div className="flex items-center justify-center border-l">
                              <button type="button" onClick={() => removeRoom(r.tempId)} className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* Extra Bed row */}
                        <div className="grid items-center gap-0 border-t bg-muted/30" style={{ gridTemplateColumns: gridCols }}>
                          <div className="px-2 py-2 text-xs text-muted-foreground text-center">—</div>
                          <div className="px-2 py-2 text-xs font-semibold border-l" style={{ color: ACCENT }}>Extra Bed</div>
                          <div className="border-l" /><div className="border-l" /><div className="border-l" /><div className="border-l" />
                          {extraBedTiers.map(t => (
                            <div key={t.nights} className="px-1 py-1 border-l">
                              <div className="flex items-center">
                                <span className="text-xs text-muted-foreground shrink-0 ml-1">$</span>
                                <Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 bg-transparent px-1 font-medium" type="number" min="0" step="50" placeholder="—" value={t.price}
                                  onChange={e => setExtraBedTiers(prev => prev.map(x => x.nights === t.nights ? { ...x, price: e.target.value } : x))} />
                              </div>
                            </div>
                          ))}
                          <div />
                        </div>
                      </div>
                    </div>
                  )}

                  {rooms.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {rooms.filter(r => r.name.trim()).length} of {rooms.length} rooms have a name and will be saved.
                    </p>
                  )}
                  {cabinCapExceeded && (
                    <p className="text-xs text-destructive font-medium">
                      Total cabin capacity ({totalCabinCap} pax) exceeds yacht max capacity ({maxCap} pax).
                    </p>
                  )}
                  {!cabinCapExceeded && extraBedOverflow && (
                    <p className="text-xs text-destructive font-medium">
                      Total capacity + extra beds ({totalCabinCap + totalExtraBeds} pax) exceeds yacht max capacity ({maxCap} pax).
                    </p>
                  )}
                </div>
                )
              })()}

            </div>
          </ScrollArea>

          {error && (
            <p className="px-6 py-2 text-sm text-destructive bg-destructive/5 border-t">{error}</p>
          )}

          <div className="shrink-0 flex items-center justify-between gap-2 px-6 py-4 border-t bg-muted/20">
            <Button
              variant="outline"
              onClick={() => { if (formStep === 1) { setDialogOpen(false); resetForm() } else { setFormStep(1) } }}
            >
              {formStep === 1 ? 'Cancel' : '← Back'}
            </Button>
            {formStep === 1 ? (
              <Button
                disabled={!step1Valid}
                onClick={() => setFormStep(2)}
                style={{ backgroundColor: ACCENT, color: 'white' }}
                className="hover:opacity-90 min-w-32"
              >
                Next: Rooms →
              </Button>
            ) : (
              <Button
                disabled={submitting}
                onClick={handleSubmit}
                style={{ backgroundColor: ACCENT, color: 'white' }}
                className="hover:opacity-90 min-w-32"
              >
                {submitting ? 'Saving…' : editTarget ? 'Save Changes' : 'Save Yacht'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The yacht and all its cabin definitions will be permanently removed.
              Existing bookings referencing this yacht will block deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Fleet table ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Fleet</CardTitle>
              <CardDescription>
                {loading ? 'Loading…' : `${filtered.length} yacht${filtered.length !== 1 ? 's' : ''}`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Search by name or model…"
              value={searchTerm}
              onChange={e => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Boat Name</TableHead>
                  <TableHead>Model / Type</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Cabins</TableHead>
                  <TableHead>Daily Rate</TableHead>
                  <TableHead>Bookings</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      {yachts.length === 0 ? 'No yachts yet — add your first yacht.' : 'No yachts match the search.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(y => (
                    <Fragment key={y.id}>
                      <TableRow className="hover:bg-muted/30">
                        <TableCell className="font-semibold">
                          <div className="flex items-center gap-2">
                            <Anchor className="w-4 h-4 text-muted-foreground shrink-0" />
                            {y.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{y.model ?? '—'}</TableCell>
                        <TableCell className="text-sm">{y.year ?? '—'}</TableCell>
                        <TableCell className="text-sm">{y.capacity} pax</TableCell>
                        <TableCell className="text-sm">{y.cabinCount}</TableCell>
                        <TableCell className="text-sm">${y.dailyRate.toLocaleString()}/day</TableCell>
                        <TableCell className="text-sm">{y._count.bookings}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                              onClick={() => setExpandedId(expandedId === y.id ? null : y.id)}
                            >
                              <BedDouble className="w-3.5 h-3.5" />
                              {y.cabins.length} rooms
                              {expandedId === y.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </Button>
                            {canEdit && (
                              <>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  onClick={() => openEdit(y)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => setDeleteTarget(y)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {expandedId === y.id && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/20 p-0">
                            {y.cabins.length === 0 ? (
                              <div className="px-8 py-4 text-sm text-muted-foreground">No rooms defined yet for this yacht.</div>
                            ) : (
                              <div className="px-8 py-3">
                                <div className="grid grid-cols-5 gap-3">
                                  {y.cabins.map(c => (
                                    <div key={c.id} className="rounded-lg border bg-card p-3 space-y-1.5">
                                      <div className="font-medium text-sm">{c.name}</div>
                                      {c.deck && <div className="text-xs text-muted-foreground">{c.deck}</div>}
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {c.bedType && <Badge variant="outline" className="text-xs px-1.5 py-0">{c.bedType}</Badge>}
                                        <Badge variant="outline" className="text-xs px-1.5 py-0">{c.capacity} pax</Badge>
                                        {c.extraBeds > 0 && <Badge variant="outline" className="text-xs px-1.5 py-0">+{c.extraBeds} extra bed</Badge>}
                                      </div>
                                      {c.pricingTiers?.length > 0 && (
                                        <div className="pt-1 space-y-0.5">
                                          {c.pricingTiers.map(t => (
                                            <div key={t.nights} className="flex justify-between text-xs">
                                              <span className="text-muted-foreground">{t.nights + 1}D/{t.nights}N</span>
                                              <span className="font-semibold" style={{ color: ACCENT }}>${t.price.toLocaleString()}</span>
                                            </div>
                                          ))}
                                          {(y.extraBedTiers ?? []).filter((t: PricingTier) => t.price > 0).length > 0 && (
                                            <div className="flex justify-between text-xs border-t pt-0.5 mt-0.5">
                                              <span className="text-muted-foreground">Extra Bed</span>
                                              <div className="flex gap-1">
                                                {(y.extraBedTiers as PricingTier[]).filter(t => t.price > 0).map(t => (
                                                  <span key={t.nights} className="font-semibold" style={{ color: '#e07b54' }}>${t.price.toLocaleString()}</span>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
