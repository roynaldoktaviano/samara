'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { formatDate, formatMoney } from '@/lib/format'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Search, Ship, MapPin, Calendar, Users, FileText, Anchor, Navigation, Edit, Trash2, Download, Upload, CheckCircle2, XCircle, Loader2, RotateCw, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { toast } from 'sonner'

interface CabinInfo { id: string; name: string; capacity: number; deck?: string; bedType?: string }
interface YachtOption { id: string; name: string; model?: string; cabinCount: number; cabins: CabinInfo[] }
interface DestinationOption { id: string; name: string; region: string | null }
interface OpenTripRecord {
  id: string
  title: string
  description?: string
  yachtId: string
  startDate: string
  endDate: string
  destination: string
  destinationId?: string | null
  region?: string
  departurePort?: string
  arrivalPort?: string
  pricePerCabin: number
  maxCapacity: number
  tripNumber?: number | null
  status: string
  closedReason?: string | null
  spotsAvailable: number
  spotsBooked: number
  yacht: { name: string; model?: string }
  _count: { bookings: number }
}

const ACCENT = 'var(--primary)'

const STATUS_CONFIG: Record<string, { tone: StatusTone; border: string; label: string }> = {
  open:      { tone: 'success',     border: 'border-l-success',               label: 'Open'      },
  full:      { tone: 'destructive', border: 'border-l-destructive',           label: 'Sold Out'  },
  closed:    { tone: 'neutral',     border: 'border-l-muted-foreground/40',   label: 'Closed'    },
  cancelled: { tone: 'neutral',     border: 'border-l-destructive',           label: 'Cancelled' },
}

const getDays = (s: string, e: string) =>
  Math.max(1, Math.round((new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1)

const emptyForm = () => ({
  title: '', description: '', yachtId: '', startDate: '', endDate: '',
  destination: '', destinationId: '', region: '', departurePort: '', arrivalPort: '', pricePerCabin: '',
})

export default function OpenTrips() {
  const [trips,        setTrips]       = useState<OpenTripRecord[]>([])
  const [yachts,       setYachts]      = useState<YachtOption[]>([])
  const [destinations, setDestinations] = useState<DestinationOption[]>([])
  const [loading,      setLoading]     = useState(true)
  const [searchTerm,   setSearch]      = useState('')
  const [statusFilter, setStatus]      = useState('all')
  const [yearFilter,   setYearFilter]  = useState('all')
  const [monthFilter,  setMonthFilter] = useState('all')
  const [yachtFilter,  setYachtFilter] = useState('all')
  const [page,         setPage]        = useState(1)
  const PAGE_SIZE = 10

  const [dialogOpen,   setDialogOpen]  = useState(false)
  const [editTrip,     setEditTrip]    = useState<OpenTripRecord | null>(null)
  const [submitting,   setSubmitting]  = useState(false)
  const [form,         setForm]        = useState(emptyForm())

  const [deleteTarget,      setDeleteTarget]      = useState<OpenTripRecord | null>(null)
  const [deleting,          setDeleting]          = useState(false)
  const [cancelledCabins,   setCancelledCabins]   = useState(0)

  // CSV import state
  const [importOpen,     setImportOpen]     = useState(false)
  const [importing,      setImporting]      = useState(false)
  const [importResults,  setImportResults]  = useState<{ created: number; errors: number; results: { row: number; status: string; title?: string; error?: string }[] } | null>(null)

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const selectedYacht = yachts.find(y => y.id === form.yachtId)

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
    fetch('/api/destinations').then(r => r.json()).then(d => setDestinations(Array.isArray(d) ? d : []))
    fetch('/api/bookings?status=cancelled&tripType=OPEN_TRIP')
      .then(r => r.json())
      .then((d: any[]) => Array.isArray(d) && setCancelledCabins(d.reduce((s, b) => s + (b.guestCount ?? 1), 0)))
      .catch(() => {})
  }, [fetchTrips])

  useEffect(() => { setPage(1) }, [searchTerm, statusFilter, yearFilter, monthFilter, yachtFilter])

  const openAdd = () => {
    setEditTrip(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  const openEdit = (t: OpenTripRecord) => {
    setEditTrip(t)
    setForm({
      title:         t.title,
      description:   t.description ?? '',
      yachtId:       t.yachtId,
      startDate:     t.startDate.split('T')[0],
      endDate:       t.endDate.split('T')[0],
      destination:   t.destination,
      destinationId: t.destinationId ?? '',
      region:        t.region ?? '',
      departurePort: t.departurePort ?? '',
      arrivalPort:   t.arrivalPort ?? '',
      pricePerCabin: t.pricePerCabin > 0 ? String(t.pricePerCabin) : '',
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.title || !form.yachtId || !form.startDate || !form.endDate || !form.destination) return
    setSubmitting(true)
    try {
      const payload = {
        title:         form.title,
        description:   form.description,
        yachtId:       form.yachtId,
        startDate:     form.startDate,
        endDate:       form.endDate,
        destination:   form.destination,
        destinationId: form.destinationId,
        region:        form.region,
        departurePort: form.departurePort,
        arrivalPort:   form.arrivalPort,
        pricePerCabin: form.pricePerCabin,
      }
      const res = editTrip
        ? await fetch(`/api/open-trips/${editTrip.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/open-trips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Failed to save trip')
        return
      }
      await fetchTrips()
      setDialogOpen(false)
    } catch (e) { console.error(e); toast.error('Network error — failed to save trip') }
    finally { setSubmitting(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/open-trips/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Failed to delete trip')
        return
      }
      await fetchTrips()
      setDeleteTarget(null)
    } catch (e) { console.error(e); toast.error('Network error — failed to delete trip') }
    finally { setDeleting(false) }
  }

  const downloadTemplate = () => {
    window.location.href = '/api/open-trips/import'
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResults(null)
    try {
      const text = await file.text()
      const res  = await fetch('/api/open-trips/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: text,
      })
      const data = await res.json()
      setImportResults(data)
      if (data.created > 0) await fetchTrips()
    } catch (e) { console.error(e) }
    finally { setImporting(false); e.target.value = '' }
  }

  const today = new Date(); today.setHours(0,0,0,0)
  const isActiveTrip = (t: OpenTripRecord) =>
    new Date(t.startDate) > today && t.status !== 'closed' && t.status !== 'cancelled'

  const tripYachts = [...new Map(trips.map(t => [t.yachtId, t.yacht.name])).entries()]
  const tripYears  = [...new Set(trips.map(t => new Date(t.startDate).getFullYear()))].sort((a, b) => b - a)

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const hasFilters = statusFilter !== 'all' || yearFilter !== 'all' || monthFilter !== 'all' || yachtFilter !== 'all' || searchTerm !== ''

  const filtered = trips
    .filter(t => {
      const q = searchTerm.toLowerCase()
      const matchSearch = !q || t.title.toLowerCase().includes(q) ||
        t.destination.toLowerCase().includes(q) ||
        t.yacht.name.toLowerCase().includes(q)

      const active = isActiveTrip(t)
      const matchStatus =
        statusFilter === 'all'    ? true :
        statusFilter === 'active' ? active :
        statusFilter === 'closed' ? !active :
        t.status === statusFilter

      const matchYear  = yearFilter  === 'all' || new Date(t.startDate).getFullYear().toString() === yearFilter
      const matchMonth = monthFilter === 'all' || (new Date(t.startDate).getMonth() + 1).toString() === monthFilter
      const matchYacht = yachtFilter === 'all' || t.yachtId === yachtFilter

      return matchSearch && matchStatus && matchYear && matchMonth && matchYacht
    })
    .sort((a, b) => {
      const aActive = isActiveTrip(a), bActive = isActiveTrip(b)
      if (aActive !== bActive) return aActive ? -1 : 1
      if (aActive) return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="text-2xl font-bold tracking-tight">Open Trips</h3>
            <Button type="button" variant="ghost" size="icon" onClick={() => fetchTrips()} title="Refresh" aria-label="Refresh" className="size-8 text-muted-foreground hover:text-foreground">
              <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Manage pre-scheduled shared trips sold per cabin</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Download template */}
          <Button variant="outline" onClick={downloadTemplate} className="gap-2">
            <Download className="h-4 w-4" /> Download Template
          </Button>
          {/* Import CSV */}
          <label className="cursor-pointer">
            <input type="file" accept=".csv" className="hidden" onChange={e => { setImportOpen(true); handleImportFile(e) }} />
            <Button variant="outline" className="gap-2 pointer-events-none" asChild>
              <span>{importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import CSV</span>
            </Button>
          </label>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" /> Schedule Trip
          </Button>
        </div>
      </div>

      {/* Stats */}
      {(() => {
        const today = new Date(); today.setHours(0,0,0,0)
        const activeTrips = trips.filter(t => new Date(t.startDate) > today && t.status !== 'closed' && t.status !== 'cancelled')
        const closedTrips = trips.filter(t => new Date(t.startDate) <= today || t.status === 'closed' || t.status === 'cancelled')
        const totalCabins     = trips.reduce((s, t) => s + t.maxCapacity, 0)
        const activeCabins    = activeTrips.reduce((s, t) => s + t.spotsAvailable, 0)
        const bookedCabins    = trips.reduce((s, t) => s + t.spotsBooked, 0)
        const rawLostCabins   = closedTrips.reduce((s, t) => s + t.spotsAvailable, 0)
        const lostCabins      = Math.max(0, rawLostCabins - cancelledCabins)

        const tripStats = [
          { label: 'Total',  value: trips.length,       color: 'var(--muted-foreground)' },
          { label: 'Active', value: activeTrips.length, color: 'var(--success)' },
        ]
        const cabinStats = [
          { label: 'Total',       value: totalCabins,      color: ACCENT,     sub: undefined },
          { label: 'Available',   value: activeCabins,     color: 'var(--info)',  sub: undefined },
          { label: 'Booked',      value: bookedCabins,     color: '#8b5cf6',  sub: undefined },
          { label: 'Cancelled',   value: cancelledCabins,  color: 'var(--warning)',  sub: 'was booked' },
          { label: 'Lost',        value: lostCabins,       color: 'var(--destructive)',  sub: 'never booked' },
        ]

        return (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x">

                {/* Trips group */}
                <div className="sm:w-56 shrink-0 px-5 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                    Trips
                  </p>
                  <div className="flex gap-6">
                    {loading
                      ? tripStats.map(s => (
                          <div key={s.label} className="space-y-1.5">
                            <Skeleton className="h-7 w-10" />
                            <Skeleton className="h-3 w-10" />
                          </div>
                        ))
                      : tripStats.map(s => (
                          <div key={s.label}>
                            <div className="text-2xl font-bold leading-none" style={{ color: s.color }}>
                              {s.value}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1.5">{s.label}</div>
                          </div>
                        ))
                    }
                  </div>
                </div>

                {/* Cabins group */}
                <div className="flex-1 px-5 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                    Cabins
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-3">
                    {loading
                      ? cabinStats.map(s => (
                          <div key={s.label} className="space-y-1.5">
                            <Skeleton className="h-7 w-12" />
                            <Skeleton className="h-3 w-14" />
                          </div>
                        ))
                      : cabinStats.map(s => (
                          <div key={s.label}>
                            <div className="text-2xl font-bold leading-none" style={{ color: s.color }}>
                              {s.value}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                              <span>{s.label}</span>
                            </div>
                            {s.sub && (
                              <div className="text-[10px] text-muted-foreground/60 mt-0.5 pl-3">{s.sub}</div>
                            )}
                          </div>
                        ))
                    }
                  </div>
                </div>

              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* Filters + List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Scheduled Trips</CardTitle>
              <CardDescription>
                {loading ? 'Loading…' : `${filtered.length} trip${filtered.length !== 1 ? 's' : ''}${hasFilters ? ' (filtered)' : ''}`}
              </CardDescription>
            </div>
            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(''); setStatus('all'); setYearFilter('all'); setMonthFilter('all'); setYachtFilter('all') }}
                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" /> Clear filters
              </Button>
            )}
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 pt-1">
            {/* Search */}
            <div className="relative flex-1 min-w-40">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                aria-label="Search trips"
                placeholder="Search title, destination, yacht…"
                value={searchTerm}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            {/* Status */}
            <Select value={statusFilter} onValueChange={setStatus}>
              <SelectTrigger aria-label="Filter by status" className="h-8 w-32 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="closed">Closed/Past</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="full">Sold Out</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            {/* Year */}
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger aria-label="Filter by year" className="h-8 w-28 text-sm"><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {tripYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Month */}
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger aria-label="Filter by month" className="h-8 w-28 text-sm"><SelectValue placeholder="Month" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Yacht */}
            <Select value={yachtFilter} onValueChange={setYachtFilter}>
              <SelectTrigger aria-label="Filter by yacht" className="h-8 w-36 text-sm"><SelectValue placeholder="Yacht" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Yachts</SelectItem>
                {tripYachts.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              {trips.length === 0
                ? 'No trips scheduled yet — click "Schedule Trip" to create one.'
                : 'No trips match the current filters.'}
            </div>
          ) : (
            <div className="space-y-3">
              {paginated.map(t => {
                const pct    = t.maxCapacity > 0 ? (t.spotsBooked / t.maxCapacity) * 100 : 0
                const isFull = t.spotsAvailable === 0

                return (
                  (() => {
                    const isPrivatePC = t.status === 'closed' && t.closedReason?.includes('Private Charter')
                    const cfg = STATUS_CONFIG[t.status] ?? { tone: 'neutral' as StatusTone, border: 'border-l-border', label: t.status }
                    const borderColor = isPrivatePC ? 'border-l-violet-500' : cfg.border
                    return (
                  <div key={t.id} className={`border border-l-4 ${borderColor} rounded-xl p-3 sm:p-4 hover:shadow-sm transition-shadow`}>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      {/* Left info */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {t.tripNumber != null && (
                            <span className="text-xs font-mono text-muted-foreground shrink-0">
                              #{t.tripNumber}/{new Date(t.endDate).getFullYear()}
                            </span>
                          )}
                          <span className="font-semibold">{t.title}</span>
                          {isPrivatePC ? (
                            <StatusBadge tone="purple">
                              → Private Charter
                            </StatusBadge>
                          ) : (
                            <StatusBadge tone={cfg.tone}>
                              {cfg.label}
                            </StatusBadge>
                          )}
                          {t.pricePerCabin > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {formatMoney(t.pricePerCabin, { currency: 'USD', decimals: 0 })} / cabin
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
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
                            {formatDate(t.startDate, 'medium', { utc: true })} → {formatDate(t.endDate, 'medium', { utc: true })}
                            <span className="ml-1">({getDays(t.startDate, t.endDate)}d)</span>
                          </div>
                          {t.region && (
                            <div className="flex items-center gap-1.5">
                              <Navigation className="w-3.5 h-3.5 shrink-0" />
                              {t.region}
                            </div>
                          )}
                          {t.departurePort && (
                            <div className="flex items-center gap-1.5">
                              <Anchor className="w-3.5 h-3.5 shrink-0" />
                              Dep: {t.departurePort}
                            </div>
                          )}
                          {t.arrivalPort && (
                            <div className="flex items-center gap-1.5">
                              <Anchor className="w-3.5 h-3.5 shrink-0" />
                              Arr: {t.arrivalPort}
                            </div>
                          )}
                        </div>

                        {/* Cabin occupancy bar */}
                        {(() => {
                          const isPrivatePC = t.status === 'closed' && t.closedReason?.includes('Private Charter')
                          return (
                            <div className="space-y-1 pt-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">
                                  <span className="font-medium text-foreground">{t.spotsBooked}</span> / {t.maxCapacity} cabins booked
                                </span>
                                {isPrivatePC ? (
                                  <span className="font-medium text-muted-foreground italic">Switched to Private Charter</span>
                                ) : (
                                  <span style={{ color: isFull ? 'var(--destructive)' : 'var(--success)' }} className="font-medium">
                                    {isFull ? 'Sold Out' : `${t.spotsAvailable} available`}
                                  </span>
                                )}
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${pct}%`, backgroundColor: isPrivatePC ? 'var(--muted-foreground)' : isFull ? 'var(--destructive)' : 'var(--success)' }}
                                />
                              </div>
                            </div>
                          )
                        })()}

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 pt-2 border-t mt-2 flex-wrap">
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => window.open(`/print/manifest/${t.id}`, '_blank')}>
                            <FileText className="w-3 h-3 mr-1.5" /> Harbormaster Manifest
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => window.open(`/print/crew-sheet/${t.id}`, '_blank')}>
                            <Users className="w-3 h-3 mr-1.5" /> Crew Guest Sheet
                          </Button>
                        </div>
                      </div>

                      {/* Right — spot count + actions */}
                      <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Bookings</div>
                          <div className="font-bold text-2xl" style={{ color: ACCENT }}>{t.spotsBooked}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">of {t.maxCapacity} cabins</div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(t)} aria-label="Edit trip" title="Edit trip">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(t)}
                            aria-label="Delete trip"
                            title="Delete trip"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                    )
                  })()
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="icon" className="size-7"
                  aria-label="Previous page"
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | '…')[]>((acc, p, i, arr) => {
                    if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, i) =>
                    p === '…'
                      ? <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                      : <Button
                          key={p}
                          variant={page === p ? 'default' : 'outline'}
                          size="icon" className="size-7 text-xs"
                          aria-label={`Page ${p}`}
                          aria-current={page === p ? 'page' : undefined}
                          onClick={() => setPage(p as number)}
                        >
                          {p}
                        </Button>
                  )
                }
                <Button
                  variant="outline" size="icon" className="size-7"
                  aria-label="Next page"
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) setEditTrip(null) }}>
        <DialogContent className="sm:max-w-2xl flex flex-col max-h-[90vh] overflow-hidden" aria-describedby={undefined} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="shrink-0 border-b pb-3">
            <DialogTitle>{editTrip ? 'Edit Open Trip' : 'Schedule New Open Trip'}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ot-title">Trip Title <span className="text-destructive">*</span></Label>
                <Input id="ot-title" placeholder="e.g. Komodo Explorer — June 2026" value={form.title} onChange={e => set('title', e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={editTrip ? undefined : 'ot-yacht'}>Yacht <span className="text-destructive">*</span></Label>
                {editTrip ? (
                  <div className="flex items-center gap-2 h-9 px-3 border rounded-md bg-muted/40 text-sm text-muted-foreground">
                    <Ship className="w-4 h-4" />
                    {editTrip.yacht.name}
                    <span className="text-xs ml-1">(cannot change after creation)</span>
                  </div>
                ) : (
                  <Select value={form.yachtId} onValueChange={v => set('yachtId', v)}>
                    <SelectTrigger id="ot-yacht" className="w-full"><SelectValue placeholder="Select yacht" /></SelectTrigger>
                    <SelectContent>
                      {yachts.map(y => (
                        <SelectItem key={y.id} value={y.id}>
                          {y.name}{y.model ? ` (${y.model})` : ''} — {y.cabinCount} cabins
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Cabin preview (create mode) */}
              {!editTrip && selectedYacht && selectedYacht.cabins?.length > 0 && (
                <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'color-mix(in srgb, var(--primary) 25%, transparent)', backgroundColor: 'color-mix(in srgb, var(--primary) 3%, transparent)' }}>
                  <p className="text-xs font-medium text-muted-foreground">
                    Cabins on {selectedYacht.name} ({selectedYacht.cabinCount} total)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedYacht.cabins.map(c => (
                      <Badge key={c.id} variant="outline" className="text-xs">
                        {c.name}{c.bedType ? ` · ${c.bedType}` : ''}{c.deck ? ` · ${c.deck}` : ''}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ot-start-date">Start Date <span className="text-destructive">*</span></Label>
                  <Input id="ot-start-date" type="date" value={form.startDate} min={new Date().toISOString().split('T')[0]} onChange={e => set('startDate', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ot-end-date">End Date <span className="text-destructive">*</span></Label>
                  <Input id="ot-end-date" type="date" value={form.endDate} min={form.startDate || new Date().toISOString().split('T')[0]} onChange={e => set('endDate', e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ot-destination">Destination <span className="text-destructive">*</span></Label>
                <Select
                  value={form.destinationId}
                  onValueChange={v => {
                    set('destinationId', v)
                    set('destination', destinations.find(d => d.id === v)?.name ?? '')
                  }}
                >
                  <SelectTrigger id="ot-destination" className="w-full"><SelectValue placeholder="Select destination…" /></SelectTrigger>
                  <SelectContent>
                    {destinations.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}{d.region ? ` — ${d.region}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ot-region">Region</Label>
                <Input id="ot-region" placeholder="e.g. East Nusa Tenggara, Raja Ampat" value={form.region} onChange={e => set('region', e.target.value)} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ot-departure-port">Departure Port</Label>
                  <Input id="ot-departure-port" placeholder="e.g. Labuan Bajo" value={form.departurePort} onChange={e => set('departurePort', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ot-arrival-port">Arrival Port</Label>
                  <Input id="ot-arrival-port" placeholder="e.g. Lombok Harbor" value={form.arrivalPort} onChange={e => set('arrivalPort', e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ot-description">Description</Label>
                <Textarea id="ot-description" placeholder="Trip itinerary, inclusions, notes…" value={form.description} onChange={e => set('description', e.target.value)} rows={3} />
              </div>

              {/* Summary */}
              {form.startDate && form.endDate && (
                <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 5%, transparent)' }}>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span>{getDays(form.startDate, form.endDate)} days</span>
                  </div>
                  {!editTrip && selectedYacht && (
                    <div className="flex justify-between mt-1">
                      <span className="text-muted-foreground">Max capacity</span>
                      <span>{selectedYacht.cabinCount} cabins (auto from yacht)</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t px-4 pt-3 gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.title || !form.yachtId || !form.startDate || !form.endDate || !form.destination}
              loading={submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Saving…' : editTrip ? 'Save Changes' : 'Schedule Trip'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Open Trip</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.title}</strong>?
              This will also remove all associated bookings and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? 'Deleting…' : 'Delete Trip'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import results dialog */}
      <Dialog open={importOpen && !importing && !!importResults} onOpenChange={open => { if (!open) { setImportOpen(false); setImportResults(null) } }}>
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Import Results</DialogTitle>
          </DialogHeader>
          {importResults && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex gap-3">
                <div className="flex-1 rounded-xl bg-success/10 border border-success/30 p-3 text-center">
                  <div className="text-2xl font-bold text-success">{importResults.created}</div>
                  <div className="text-xs text-success font-medium mt-0.5">Trips Created</div>
                </div>
                <div className="flex-1 rounded-xl bg-destructive/10 border border-destructive/30 p-3 text-center">
                  <div className="text-2xl font-bold text-destructive">{importResults.errors}</div>
                  <div className="text-xs text-destructive font-medium mt-0.5">Errors</div>
                </div>
              </div>
              {/* Row details */}
              {importResults.results.length > 0 && (
                <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-lg border p-2">
                  {importResults.results.map(r => (
                    <div key={r.row} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${r.status === 'created' ? 'bg-success/10' : 'bg-destructive/10'}`}>
                      {r.status === 'created'
                        ? <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                        : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{r.title ?? `Row ${r.row}`}</span>
                        {r.error && <p className="text-xs text-destructive mt-0.5">{r.error}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">row {r.row}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => { setImportOpen(false); setImportResults(null) }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
