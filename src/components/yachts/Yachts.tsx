'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Search, Edit, Anchor, ChevronDown, ChevronUp, Trash2, BedDouble } from 'lucide-react'

interface CabinRecord {
  id: string
  name: string
  capacity: number
  deck?: string
  bedType?: string
  extraBeds: number
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
  status: string
  description?: string
  cabins: CabinRecord[]
  _count: { bookings: number; crew: number }
}

interface RoomInput {
  tempId: string
  name: string
  deck: string
  bedType: string
  capacity: string
  extraBeds: string
}

const BED_TYPES = ['Single', 'Double', 'Twin', 'Queen', 'King', 'Bunk']
const DECKS     = ['Upper Deck', 'Main Deck', 'Lower Deck', 'Flybridge']

const STATUS_STYLE: Record<string, string> = {
  available:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  booked:      'bg-amber-100   text-amber-700   border-amber-200',
  maintenance: 'bg-red-100     text-red-700     border-red-200',
}

const ACCENT = '#bdac7e'

export default function Yachts() {
  const [yachts,      setYachts]      = useState<YachtRecord[]>([])
  const [loading,     setLoading]     = useState(true)
  const [searchTerm,  setSearch]      = useState('')
  const [dialogOpen,  setDialogOpen]  = useState(false)
  const [expandedId,  setExpandedId]  = useState<string | null>(null)
  const [submitting,  setSubmitting]  = useState(false)

  /* form state */
  const [name,        setName]        = useState('')
  const [model,       setModel]       = useState('')
  const [year,        setYear]        = useState('')
  const [capacity,    setCapacity]    = useState('')
  const [length,      setLength]      = useState('')
  const [hourlyRate,  setHourly]      = useState('')
  const [dailyRate,   setDaily]       = useState('')
  const [description, setDesc]        = useState('')
  const [rooms,       setRooms]       = useState<RoomInput[]>([])

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
    setName(''); setModel(''); setYear(''); setCapacity(''); setLength('')
    setHourly(''); setDaily(''); setDesc(''); setRooms([])
  }

  const addRoom = () => setRooms(r => [...r, {
    tempId: Date.now().toString(), name: '', deck: '', bedType: '', capacity: '2', extraBeds: '0',
  }])

  const removeRoom = (id: string) => setRooms(r => r.filter(x => x.tempId !== id))

  const updateRoom = (id: string, patch: Partial<RoomInput>) =>
    setRooms(r => r.map(x => x.tempId === id ? { ...x, ...patch } : x))

  const handleSubmit = async () => {
    if (!name || !capacity || !hourlyRate || !dailyRate) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/yachts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, model, year, capacity, length, hourlyRate, dailyRate, description,
          rooms: rooms.filter(r => r.name.trim()).map(r => ({
            name: r.name, deck: r.deck, bedType: r.bedType,
            capacity: r.capacity, extraBeds: r.extraBeds,
          })),
        }),
      })
      if (res.ok) {
        await fetchYachts()
        setDialogOpen(false)
        resetForm()
      }
    } catch (e) { console.error(e) }
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
          <h3 className="text-2xl font-bold tracking-tight">Yachts</h3>
          <p className="text-sm text-muted-foreground">Manage your fleet and cabins</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) resetForm() }}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
              <Plus className="mr-2 h-4 w-4" /> Add Yacht
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl flex flex-col max-h-[92vh] overflow-hidden">
            <DialogHeader className="shrink-0 border-b pb-3">
              <DialogTitle>Add New Yacht</DialogTitle>
            </DialogHeader>
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-6">

                {/* Basic info */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Boat Info</h4>
                  <div className="space-y-1.5">
                    <Label>Boat Name <span className="text-destructive">*</span></Label>
                    <Input placeholder="e.g. Samara I" value={name} onChange={e => setName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
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
                      <Input type="number" placeholder="27" value={length} onChange={e => setLength(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label>Max Capacity (pax) <span className="text-destructive">*</span></Label>
                      <Input type="number" placeholder="12" value={capacity} onChange={e => setCapacity(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Hourly Rate (USD) <span className="text-destructive">*</span></Label>
                      <Input type="number" placeholder="350" value={hourlyRate} onChange={e => setHourly(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Daily Rate (USD) <span className="text-destructive">*</span></Label>
                      <Input type="number" placeholder="3500" value={dailyRate} onChange={e => setDaily(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description</Label>
                    <Textarea placeholder="About this yacht..." value={description} onChange={e => setDesc(e.target.value)} rows={2} />
                  </div>
                </div>

                <Separator />

                {/* Rooms / Cabins */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      Rooms / Cabins <span className="normal-case font-normal ml-1">({rooms.length})</span>
                    </h4>
                    <Button type="button" variant="outline" size="sm" onClick={addRoom}>
                      <Plus className="w-3 h-3 mr-1" /> Add Room
                    </Button>
                  </div>

                  {rooms.length === 0 && (
                    <div className="border-2 border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
                      No rooms added yet. Click "Add Room" to define cabins.
                    </div>
                  )}

                  <div className="space-y-3">
                    {rooms.map((r, idx) => (
                      <div key={r.tempId} className="border rounded-lg p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Room {idx + 1}</span>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => removeRoom(r.tempId)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Room Name <span className="text-destructive">*</span></Label>
                            <Input
                              className="h-8 text-sm"
                              placeholder="e.g. Master Suite"
                              value={r.name}
                              onChange={e => updateRoom(r.tempId, { name: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Deck</Label>
                            <Select value={r.deck} onValueChange={v => updateRoom(r.tempId, { deck: v })}>
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Select deck" />
                              </SelectTrigger>
                              <SelectContent>
                                {DECKS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Bed Type</Label>
                            <Select value={r.bedType} onValueChange={v => updateRoom(r.tempId, { bedType: v })}>
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Select bed type" />
                              </SelectTrigger>
                              <SelectContent>
                                {BED_TYPES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Capacity</Label>
                              <Input
                                className="h-8 text-sm"
                                type="number" min="1"
                                value={r.capacity}
                                onChange={e => updateRoom(r.tempId, { capacity: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Extra Beds</Label>
                              <Input
                                className="h-8 text-sm"
                                type="number" min="0"
                                value={r.extraBeds}
                                onChange={e => updateRoom(r.tempId, { extraBeds: e.target.value })}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-3 px-4 border-t shrink-0">
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>Cancel</Button>
              <Button
                disabled={!name || !capacity || !hourlyRate || !dailyRate || submitting}
                onClick={handleSubmit}
                style={{ backgroundColor: ACCENT, color: 'white' }}
                className="hover:opacity-90"
              >
                {submitting ? 'Saving...' : 'Save Yacht'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Fleet</CardTitle>
              <CardDescription>
                {loading ? 'Loading...' : `${filtered.length} yacht${filtered.length !== 1 ? 's' : ''}`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Search by name or model..."
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
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rooms</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      {yachts.length === 0
                        ? 'No yachts yet — add your first yacht.'
                        : 'No yachts match the search.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(y => (
                    <>
                      <TableRow key={y.id} className="cursor-pointer hover:bg-muted/30">
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
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLE[y.status] ?? 'bg-muted text-muted-foreground'}`}>
                            {y.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => setExpandedId(expandedId === y.id ? null : y.id)}
                          >
                            <BedDouble className="w-3.5 h-3.5" />
                            {y.cabins.length} rooms
                            {expandedId === y.id
                              ? <ChevronUp className="w-3 h-3" />
                              : <ChevronDown className="w-3 h-3" />}
                          </Button>
                        </TableCell>
                      </TableRow>

                      {/* Expanded cabin rows */}
                      {expandedId === y.id && (
                        <TableRow key={`${y.id}-cabins`}>
                          <TableCell colSpan={9} className="bg-muted/20 p-0">
                            {y.cabins.length === 0 ? (
                              <div className="px-8 py-4 text-sm text-muted-foreground">
                                No rooms defined yet for this yacht.
                              </div>
                            ) : (
                              <div className="px-8 py-3">
                                <div className="grid grid-cols-5 gap-3">
                                  {y.cabins.map(c => (
                                    <div key={c.id} className="rounded-lg border bg-card p-3 space-y-1">
                                      <div className="font-medium text-sm">{c.name}</div>
                                      {c.deck && <div className="text-xs text-muted-foreground">{c.deck}</div>}
                                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                        {c.bedType && (
                                          <Badge variant="outline" className="text-xs px-1.5 py-0">
                                            {c.bedType}
                                          </Badge>
                                        )}
                                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                                          {c.capacity} pax
                                        </Badge>
                                        {c.extraBeds > 0 && (
                                          <Badge variant="outline" className="text-xs px-1.5 py-0">
                                            +{c.extraBeds} extra
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
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
