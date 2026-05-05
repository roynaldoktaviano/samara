'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Search, Ship, MapPin, Calendar, Users, DollarSign } from 'lucide-react'

interface CabinInfo { id: string; name: string; capacity: number; deck?: string; bedType?: string }
interface YachtOption { id: string; name: string; model?: string; cabinCount: number; cabins: CabinInfo[] }
interface OpenTripRecord {
  id: string
  title: string
  description?: string
  yachtId: string
  startDate: string
  endDate: string
  destination: string
  pricePerCabin: number
  maxCapacity: number
  status: string
  spotsAvailable: number
  spotsBooked: number
  yacht: { name: string; model?: string }
  _count: { bookings: number }
}

const ACCENT = '#bdac7e'

const STATUS_STYLE: Record<string, string> = {
  open:      'bg-emerald-100 text-emerald-700 border-emerald-200',
  full:      'bg-red-100     text-red-700     border-red-200',
  closed:    'bg-gray-100    text-gray-600    border-gray-200',
  cancelled: 'bg-red-100     text-red-700     border-red-200',
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

const getDays = (s: string, e: string) =>
  Math.max(1, Math.ceil((new Date(e).getTime() - new Date(s).getTime()) / 86400000))

export default function OpenTrips() {
  const [trips,       setTrips]       = useState<OpenTripRecord[]>([])
  const [yachts,      setYachts]      = useState<YachtOption[]>([])
  const [loading,     setLoading]     = useState(true)
  const [searchTerm,  setSearch]      = useState('')
  const [statusFilter,setStatus]      = useState('all')
  const [dialogOpen,  setDialogOpen]  = useState(false)
  const [submitting,  setSubmitting]  = useState(false)

  /* form */
  const [title,        setTitle]       = useState('')
  const [description,  setDesc]        = useState('')
  const [yachtId,      setYachtId]     = useState('')
  const [startDate,    setStart]       = useState('')
  const [endDate,      setEnd]         = useState('')
  const [destination,  setDest]        = useState('')
  const [pricePerCabin,setPrice]       = useState('')
  const [maxCapacity,  setMaxCap]      = useState('')

  const selectedYacht = yachts.find(y => y.id === yachtId)

  const fetchTrips = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/open-trips').then(r => r.json())
      setTrips(Array.isArray(data) ? data : [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchTrips()
    fetch('/api/yachts').then(r => r.json()).then(d => setYachts(Array.isArray(d) ? d : []))
  }, [fetchTrips])

  /* auto-fill maxCapacity from yacht cabin count */
  useEffect(() => {
    const y = yachts.find(y => y.id === yachtId)
    if (y) setMaxCap(String(y.cabinCount || y.cabins?.length || ''))
  }, [yachtId, yachts])

  const resetForm = () => {
    setTitle(''); setDesc(''); setYachtId(''); setStart(''); setEnd('')
    setDest(''); setPrice(''); setMaxCap('')
  }

  const handleSubmit = async () => {
    if (!title || !yachtId || !startDate || !endDate || !destination || !pricePerCabin || !maxCapacity) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/open-trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, description, yachtId, startDate, endDate,
          destination, pricePerCabin, maxCapacity,
        }),
      })
      if (res.ok) {
        await fetchTrips()
        setDialogOpen(false)
        resetForm()
      }
    } catch (e) { console.error(e) }
    finally { setSubmitting(false) }
  }

  const filtered = trips.filter(t => {
    const q = searchTerm.toLowerCase()
    const matchSearch = t.title.toLowerCase().includes(q) ||
      t.destination.toLowerCase().includes(q) ||
      t.yacht.name.toLowerCase().includes(q)
    const matchStatus = statusFilter === 'all' || t.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Open Trips</h3>
          <p className="text-sm text-muted-foreground">Manage pre-scheduled shared trips sold per cabin</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) resetForm() }}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
              <Plus className="mr-2 h-4 w-4" /> Schedule Trip
            </Button>
          </DialogTrigger>
          <DialogContent className="w-240 max-w-[100vw] flex flex-col max-h-[92vh] overflow-hidden">
            <DialogHeader className="shrink-0 border-b pb-3">
              <DialogTitle>Schedule New Open Trip</DialogTitle>
            </DialogHeader>
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-4">

                <div className="space-y-1.5">
                  <Label>Trip Title <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. Komodo Explorer — June 2026" value={title} onChange={e => setTitle(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label>Yacht <span className="text-destructive">*</span></Label>
                  <Select value={yachtId} onValueChange={setYachtId}>
                    <SelectTrigger><SelectValue placeholder="Select yacht" /></SelectTrigger>
                    <SelectContent>
                      {yachts.map(y => (
                        <SelectItem key={y.id} value={y.id}>
                          {y.name}{y.model ? ` (${y.model})` : ''} — {y.cabinCount} cabins
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Show yacht cabins */}
                {selectedYacht && selectedYacht.cabins?.length > 0 && (
                  <div className="rounded-lg border p-3 space-y-2"
                    style={{ borderColor: `${ACCENT}40`, backgroundColor: `${ACCENT}08` }}>
                    <p className="text-xs font-medium text-muted-foreground">Cabins on {selectedYacht.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedYacht.cabins.map(c => (
                        <Badge key={c.id} variant="outline" className="text-xs">
                          {c.name}{c.bedType ? ` · ${c.bedType}` : ''}{c.deck ? ` · ${c.deck}` : ''}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start Date <span className="text-destructive">*</span></Label>
                    <Input type="date" value={startDate} onChange={e => setStart(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End Date <span className="text-destructive">*</span></Label>
                    <Input type="date" value={endDate} min={startDate} onChange={e => setEnd(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Destination <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. Komodo National Park" value={destination} onChange={e => setDest(e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Price per Cabin (USD) <span className="text-destructive">*</span></Label>
                    <Input type="number" min="0" step="50" placeholder="1500" value={pricePerCabin} onChange={e => setPrice(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max Cabins to Sell <span className="text-destructive">*</span></Label>
                    <Input type="number" min="1" placeholder="auto from yacht" value={maxCapacity} onChange={e => setMaxCap(e.target.value)} />
                    {selectedYacht && (
                      <p className="text-xs text-muted-foreground">{selectedYacht.cabinCount} cabins on {selectedYacht.name}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea placeholder="Trip itinerary, inclusions, notes..." value={description} onChange={e => setDesc(e.target.value)} rows={3} />
                </div>

                {/* Price summary */}
                {pricePerCabin && maxCapacity && (
                  <div className="rounded-lg p-3 text-sm space-y-1" style={{ backgroundColor: `${ACCENT}0d` }}>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Revenue if full</span>
                      <span className="font-semibold" style={{ color: ACCENT }}>
                        ${(parseFloat(pricePerCabin) * parseInt(maxCapacity)).toLocaleString()}
                      </span>
                    </div>
                    {startDate && endDate && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Duration</span>
                        <span>{getDays(startDate, endDate)} days</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="flex justify-end gap-2 pt-3 px-4 border-t shrink-0">
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>Cancel</Button>
              <Button
                disabled={!title || !yachtId || !startDate || !endDate || !destination || !pricePerCabin || !maxCapacity || submitting}
                onClick={handleSubmit}
                style={{ backgroundColor: ACCENT, color: 'white' }}
                className="hover:opacity-90"
              >
                {submitting ? 'Saving...' : 'Schedule Trip'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Trips',     value: trips.length,                                            color: ACCENT },
          { label: 'Open',            value: trips.filter(t => t.status === 'open').length,           color: '#4a9f6e' },
          { label: 'Full',            value: trips.filter(t => t.status === 'full').length,           color: '#e8547a' },
          { label: 'Cabins Sold',     value: trips.reduce((s, t) => s + t.spotsBooked, 0),            color: '#4b8bca' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
              </div>
              <div className="text-2xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters + List */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Scheduled Trips</CardTitle>
              <CardDescription>{loading ? 'Loading...' : `${filtered.length} trip${filtered.length !== 1 ? 's' : ''}`}</CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatus}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="full">Full</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Search by title, destination, yacht..."
              value={searchTerm}
              onChange={e => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              {trips.length === 0
                ? 'No trips scheduled yet — click "Schedule Trip" to create one.'
                : 'No trips match the current filters.'}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(t => {
                const pct = t.maxCapacity > 0 ? (t.spotsBooked / t.maxCapacity) * 100 : 0
                const isFull = t.spotsAvailable === 0

                return (
                  <div key={t.id} className="border rounded-xl p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left info */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{t.title}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLE[t.status] ?? 'bg-muted text-muted-foreground'}`}>
                            {t.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Ship className="w-3.5 h-3.5 shrink-0" />
                            {t.yacht.name}{t.yacht.model ? ` (${t.yacht.model})` : ''}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            {t.destination}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            {fmtDate(t.startDate)} → {fmtDate(t.endDate)}
                            <span className="ml-1">({getDays(t.startDate, t.endDate)}d)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <DollarSign className="w-3.5 h-3.5 shrink-0" />
                            ${t.pricePerCabin.toLocaleString()}/cabin
                          </div>
                        </div>

                        {/* Cabin occupancy bar */}
                        <div className="space-y-1 pt-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                              <span className="font-medium text-foreground">{t.spotsBooked}</span> / {t.maxCapacity} cabins booked
                            </span>
                            <span style={{ color: isFull ? '#e8547a' : '#4a9f6e' }} className="font-medium">
                              {isFull ? 'Full' : `${t.spotsAvailable} available`}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: isFull ? '#e8547a' : '#4a9f6e',
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Right — revenue */}
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">Revenue</div>
                        <div className="font-bold text-base" style={{ color: ACCENT }}>
                          ${(t.pricePerCabin * t.spotsBooked).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          of ${(t.pricePerCabin * t.maxCapacity).toLocaleString()} potential
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
