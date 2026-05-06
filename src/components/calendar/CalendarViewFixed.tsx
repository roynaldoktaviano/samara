'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Calendar as CalendarIcon, List, ChevronLeft, ChevronRight, Plus, Clock, DollarSign, Pencil, X, Loader2, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { BookingWizard } from '@/components/bookings/BookingWizard'
import GuestEditSheet from '@/components/customers/GuestEditSheet'
import { cn } from '@/lib/utils'

interface BookingEvent {
  id: string
  yachtName: string
  startDate: string
  endDate: string
  status: 'confirmed' | 'pending' | 'completed' | 'cancelled'
  tripType?: 'PRIVATE_CHARTER' | 'OPEN_TRIP'
  customerName?: string
  bookingCode?: string
  totalPrice?: number
  depositAmount?: number
  notes?: string
}

interface OpenTripEvent {
  id: string
  title: string
  startDate: string
  endDate: string
  destination: string
  pricePerCabin: number
  maxCapacity: number
  spotsAvailable: number
  status: string
  yacht: { name: string }
}

type DbYacht = { id: string; name: string; dailyRate: number }

const STATUS_CONFIG = {
  confirmed:  { label: 'Confirmed',  color: '#22c55e' },
  pending:    { label: 'Pending',    color: '#f59e0b' },
  completed:  { label: 'Completed', color: '#3b82f6' },
  cancelled:  { label: 'Cancelled', color: '#ef4444' },
} as const

/* One stable color per yacht (sorted alphabetically) */
const YACHT_PALETTE = ['#3b82f6','#f97316','#8b5cf6','#10b981','#ec4899','#06b6d4','#eab308','#ef4444']

function buildYachtColorMap(yachts: DbYacht[]): Record<string, string> {
  const sorted = [...yachts].sort((a, b) => a.name.localeCompare(b.name))
  const map: Record<string, string> = {}
  sorted.forEach((y, i) => { map[y.name] = YACHT_PALETTE[i % YACHT_PALETTE.length] })
  return map
}

/* diagonal stripe CSS for Open Trip bars */
function stripeStyle(color: string, full = false): React.CSSProperties {
  const gap = full ? `${color}99` : `${color}28`
  return { background: `repeating-linear-gradient(45deg,${color} 0px,${color} 3px,${gap} 3px,${gap} 8px)` }
}

const LANE_H    = 22   /* px per event lane */
const DAY_H     = 24   /* px for day-number row */
const MIN_ROW_H = 88   /* minimum row height — keeps all rows the same base size */

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES   = ['SUN','MON','TUE','WED','THU','FRI','SAT']

// ─── Single-month grid ───────────────────────────────────────────────────────
function MonthGrid({
  year, month, bookings, openTrips, yachtColorMap, onDateClick, onBookingClick, onOpenTripClick,
}: {
  year: number; month: number
  bookings: BookingEvent[]; openTrips: OpenTripEvent[]
  yachtColorMap: Record<string, string>
  onDateClick: (d: string) => void
  onBookingClick: (b: BookingEvent) => void
  onOpenTripClick: (t: OpenTripEvent) => void
}) {
  const today = new Date()
  const isToday = (d: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === d

  /* Build week rows */
  const weeks = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay()
    const total    = new Date(year, month + 1, 0).getDate()
    const cells: number[] = []
    for (let i = 0; i < firstDay; i++) cells.push(0)
    for (let d = 1; d <= total; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(0)
    const rows: number[][] = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
    return rows
  }, [year, month])

  /* Compute event segments per week row with lane assignment */
  const segsByWeek = useMemo(() => {
    type Seg = {
      key: string; weekIdx: number; startCol: number; endCol: number
      isRealStart: boolean; isRealEnd: boolean
      label: string; color: string; isStripe: boolean; isFull: boolean
      tooltip: string; bookingRef?: BookingEvent; openTripRef?: OpenTripEvent; lane: number
    }

    const raw: Omit<Seg, 'lane'>[] = []

    const addSegs = (
      id: string, label: string, color: string, isStripe: boolean, isFull: boolean,
      eStart: Date, eEnd: Date, tooltip: string,
      bookingRef?: BookingEvent, openTripRef?: OpenTripEvent
    ) => {
      weeks.forEach((week, wi) => {
        const actual = week.map((d, col) => d > 0 ? { d, col } : null).filter(Boolean) as { d: number; col: number }[]
        if (!actual.length) return
        const wStart = new Date(year, month, actual[0].d)
        const wEnd   = new Date(year, month, actual[actual.length - 1].d)
        if (eEnd < wStart || eStart > wEnd) return
        const sDate    = eStart > wStart ? eStart : wStart
        const eDate    = eEnd   < wEnd   ? eEnd   : wEnd
        const startCol = week.indexOf(sDate.getDate())
        const endCol   = week.indexOf(eDate.getDate())
        if (startCol === -1 || endCol === -1) return
        raw.push({
          key: `${id}-w${wi}`, weekIdx: wi, startCol, endCol,
          isRealStart: eStart.getTime() === sDate.getTime(),
          isRealEnd:   eEnd.getTime()   === eDate.getTime(),
          label, color, isStripe, isFull, tooltip, bookingRef, openTripRef,
        })
      })
    }

    bookings.forEach(b => addSegs(
      b.id, b.yachtName, yachtColorMap[b.yachtName] ?? '#64748b', false, false,
      new Date(b.startDate + 'T00:00:00'), new Date(b.endDate + 'T00:00:00'),
      `[Charter] ${b.yachtName}${b.bookingCode ? ` · ${b.bookingCode}` : ''}${b.customerName ? ` · ${b.customerName}` : ''}`,
      b, undefined,
    ))

    openTrips.forEach(t => {
      const isFull = t.spotsAvailable === 0
      addSegs(
        t.id, t.title, yachtColorMap[t.yacht.name] ?? '#64748b', true, isFull,
        new Date(t.startDate + 'T00:00:00'), new Date(t.endDate + 'T00:00:00'),
        `[Open Trip] ${t.title} · ${t.yacht.name} — ${isFull ? 'SOLD OUT' : `${t.spotsAvailable}/${t.maxCapacity} spots`}`,
        undefined, t,
      )
    })

    /* Assign lanes within each week row */
    const result: Seg[][] = weeks.map(() => [])
    weeks.forEach((_, wi) => {
      const segs = raw
        .filter(s => s.weekIdx === wi)
        .sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol))
      const laneEnds: number[] = []
      segs.forEach(seg => {
        let lane = laneEnds.findIndex(end => end < seg.startCol)
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(seg.endCol) }
        else laneEnds[lane] = seg.endCol
        result[wi].push({ ...seg, lane })
      })
    })
    return result
  }, [bookings, openTrips, yachtColorMap, year, month, weeks])

  return (
    <div className="flex-1 min-w-0">
      <p className="text-center text-sm font-semibold text-foreground mb-3">
        {MONTH_FULL[month]} {year}
      </p>
      <div className="grid grid-cols-7">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1.5">{d}</div>
        ))}
      </div>

      <div className="border-t border-l border-border">
        {weeks.map((week, wi) => {
          const maxLanes = segsByWeek[wi].length > 0 ? Math.max(...segsByWeek[wi].map(s => s.lane)) + 1 : 0
          const rowH = Math.max(MIN_ROW_H, DAY_H + maxLanes * LANE_H + 8)

          return (
            <div key={wi} className="relative" style={{ height: rowH }}>

              {/* ── Day cell background layer ── */}
              <div className="absolute inset-0 grid grid-cols-7">
                {week.map((day, col) => {
                  const dateStr  = day > 0 ? `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}` : ''
                  const todayCell = day > 0 && isToday(day)
                  return (
                    <div
                      key={col}
                      onClick={() => day > 0 && onDateClick(dateStr)}
                      className={cn(
                        'border-r border-b border-border p-1.5 transition-colors',
                        day > 0 ? 'cursor-pointer hover:bg-muted/40' : 'bg-muted/20',
                        todayCell ? 'ring-2 ring-inset ring-[#bdac7e]' : '',
                      )}
                    >
                      {day > 0 && (
                        <span className={cn('text-xs font-semibold leading-none', todayCell ? 'text-[#bdac7e]' : 'text-foreground')}>
                          {day}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* ── Event bar layer ── */}
              {segsByWeek[wi].map(seg => {
                const lPct = (seg.startCol / 7) * 100
                const wPct = ((seg.endCol - seg.startCol + 1) / 7) * 100
                const lOff = seg.isRealStart ? 3 : 0
                const rOff = seg.isRealEnd   ? 3 : 0
                const top  = DAY_H + seg.lane * LANE_H

                const style: React.CSSProperties = {
                  position: 'absolute',
                  top,
                  left:   `calc(${lPct}% + ${lOff}px)`,
                  width:  `calc(${wPct}% - ${lOff + rOff}px)`,
                  height: LANE_H - 3,
                  borderRadius: seg.isRealStart && seg.isRealEnd ? 4
                    : seg.isRealStart ? '4px 0 0 4px'
                    : seg.isRealEnd   ? '0 4px 4px 0'
                    : 0,
                  color: 'white',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  zIndex: 10,
                  cursor: 'pointer',
                }

                if (seg.isStripe) {
                  const gap = seg.isFull ? `${seg.color}99` : `${seg.color}28`
                  style.background     = `repeating-linear-gradient(45deg,${seg.color} 0px,${seg.color} 3px,${gap} 3px,${gap} 8px)`
                  style.outline        = `1.5px solid ${seg.color}`
                  style.outlineOffset  = '-1px'
                } else {
                  style.backgroundColor = seg.color
                }

                return (
                  <div
                    key={seg.key}
                    style={style}
                    title={seg.tooltip}
                    onClick={e => {
                      e.stopPropagation()
                      if (seg.bookingRef) onBookingClick(seg.bookingRef)
                      else if (seg.openTripRef) onOpenTripClick(seg.openTripRef)
                    }}
                  >
                    {seg.isRealStart && (
                      <span className="text-[9px] font-semibold px-1.5 truncate leading-none drop-shadow-sm whitespace-nowrap">
                        {seg.label}
                      </span>
                    )}
                  </div>
                )
              })}

            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function CalendarView() {
  const [currentDate, setCurrentDate]   = useState(new Date())
  const [viewMode, setViewMode]         = useState<'calendar' | 'list'>('calendar')
  const [bookings, setBookings]         = useState<BookingEvent[]>([])
  const [yachts, setYachts]             = useState<DbYacht[]>([])
  const [loading, setLoading]           = useState(true)
  const [openTrips, setOpenTrips]       = useState<OpenTripEvent[]>([])
  const [tripFilter, setTripFilter]     = useState<'all' | 'PRIVATE_CHARTER' | 'OPEN_TRIP'>('all')
  const [selectedBooking, setSelectedBooking]   = useState<BookingEvent | null>(null)
  const [isDetailOpen, setIsDetailOpen]         = useState(false)
  const [wizardOpen, setWizardOpen]             = useState(false)
  const [selectedDate, setSelectedDate]         = useState('')
  const [otDetailOpen, setOtDetailOpen]         = useState(false)
  const [otDetail, setOtDetail]                 = useState<any>(null)
  const [otDetailLoading, setOtDetailLoading]   = useState(false)
  const [editGuestId, setEditGuestId]           = useState<string | null>(null)

  // Booking edit state
  const [isBookingEditing, setIsBookingEditing] = useState(false)
  const [bookingEditForm, setBookingEditForm]   = useState({ status: '', totalPrice: '', depositPaid: '', notes: '' })
  const [bookingSaving, setBookingSaving]       = useState(false)

  // Open trip edit state
  const [isOtEditing, setIsOtEditing]           = useState(false)
  const [otEditForm, setOtEditForm]             = useState({ title: '', description: '', destination: '', region: '', departurePort: '', arrivalPort: '', status: '', pricePerCabin: '' })
  const [otSaving, setOtSaving]                 = useState(false)

  const handleOpenTripClick = useCallback(async (t: OpenTripEvent) => {
    setOtDetailOpen(true)
    setOtDetailLoading(true)
    setIsOtEditing(false)
    try {
      const data = await fetch(`/api/open-trips/${t.id}`).then(r => r.json())
      setOtDetail(data)
    } finally {
      setOtDetailLoading(false)
    }
  }, [])

  const startBookingEdit = useCallback(() => {
    if (!selectedBooking) return
    setBookingEditForm({
      status:      selectedBooking.status,
      totalPrice:  String(selectedBooking.totalPrice ?? ''),
      depositPaid: String(selectedBooking.depositAmount ?? ''),
      notes:       selectedBooking.notes ?? '',
    })
    setIsBookingEditing(true)
  }, [selectedBooking])

  const saveBooking = useCallback(async () => {
    if (!selectedBooking) return
    setBookingSaving(true)
    try {
      const res = await fetch(`/api/bookings/${selectedBooking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status:      bookingEditForm.status,
          totalPrice:  bookingEditForm.totalPrice,
          depositPaid: bookingEditForm.depositPaid,
          notes:       bookingEditForm.notes,
        }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setSelectedBooking(prev => prev ? { ...prev, status: updated.status, totalPrice: updated.totalPrice, depositAmount: updated.depositPaid, notes: updated.notes } : prev)
      setIsBookingEditing(false)
      toast.success('Booking updated')
      fetchBookings()
    } catch {
      toast.error('Failed to save booking')
    } finally {
      setBookingSaving(false)
    }
  }, [selectedBooking, bookingEditForm])

  const startOtEdit = useCallback(() => {
    if (!otDetail) return
    setOtEditForm({
      title:         otDetail.title         ?? '',
      description:   otDetail.description   ?? '',
      destination:   otDetail.destination   ?? '',
      region:        otDetail.region        ?? '',
      departurePort: otDetail.departurePort ?? '',
      arrivalPort:   otDetail.arrivalPort   ?? '',
      status:        otDetail.status        ?? 'open',
      pricePerCabin: String(otDetail.pricePerCabin ?? ''),
    })
    setIsOtEditing(true)
  }, [otDetail])

  const saveOt = useCallback(async () => {
    if (!otDetail) return
    setOtSaving(true)
    try {
      const res = await fetch(`/api/open-trips/${otDetail.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(otEditForm),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setOtDetail((prev: any) => ({ ...prev, ...updated }))
      setIsOtEditing(false)
      toast.success('Open trip updated')
      fetchOpenTrips()
    } catch {
      toast.error('Failed to save trip')
    } finally {
      setOtSaving(false)
    }
  }, [otDetail, otEditForm])

  const fetchBookings = useCallback(async () => {
    try {
      const data = await fetch('/api/bookings').then(r => r.json())
      setBookings(
        (Array.isArray(data) ? data : [])
          .filter((b: any) => b.status !== 'cancelled')
          .map((b: any) => ({
            id: b.id, yachtName: b.yacht?.name ?? '',
            startDate: b.startDate.split('T')[0], endDate: b.endDate.split('T')[0],
            status: b.status, tripType: b.tripType,
            customerName: b.customer?.name, bookingCode: b.bookingCode,
            totalPrice: b.totalPrice, depositAmount: b.depositPaid, notes: b.notes ?? undefined,
          }))
      )
    } catch (e) { console.error('Failed to fetch bookings', e) }
  }, [])

  const fetchOpenTrips = useCallback(async () => {
    try {
      const data = await fetch('/api/open-trips').then(r => r.json())
      setOpenTrips(
        Array.isArray(data)
          ? data.map((t: any) => ({
              ...t,
              startDate: t.startDate.split('T')[0],
              endDate:   t.endDate.split('T')[0],
            }))
          : []
      )
    } catch (e) { console.error('Failed to fetch open trips', e) }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([
        fetchBookings(),
        fetchOpenTrips(),
        fetch('/api/yachts').then(r => r.json()).then((d: any[]) =>
          setYachts(d.map(y => ({ id: y.id, name: y.name, dailyRate: y.dailyRate })))),
      ])
      setLoading(false)
    }
    load()
  }, [fetchBookings, fetchOpenTrips])

  const navigate = (dir: 'prev' | 'next') =>
    setCurrentDate(prev => {
      const d = new Date(prev)
      d.setMonth(prev.getMonth() + (dir === 'next' ? 1 : -1))
      return d
    })

  const jumpToMonth = (m: number) =>
    setCurrentDate(new Date(currentDate.getFullYear(), m, 1))

  const jumpYear = (dir: 'prev' | 'next') =>
    setCurrentDate(prev => new Date(prev.getFullYear() + (dir === 'next' ? 1 : -1), prev.getMonth(), 1))

  const yachtColorMap = useMemo(() => buildYachtColorMap(yachts), [yachts])

  const leftYear  = currentDate.getFullYear()
  const leftMonth = currentDate.getMonth()
  const rightDate  = new Date(leftYear, leftMonth + 1, 1)
  const rightYear  = rightDate.getFullYear()
  const rightMonth = rightDate.getMonth()

  const handleDateClick = (dateStr: string) => {
    setSelectedDate(dateStr)
    setWizardOpen(true)
  }

  const getDays = (s: string, e: string) =>
    Math.ceil((new Date(e).getTime() - new Date(s).getTime()) / 86400000)

  const upcomingBookings = useMemo(() =>
    [...bookings]
      .filter(b => b.status !== 'cancelled')
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
    [bookings])

  if (loading) {
    return (
      <div className="space-y-5 w-full">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-36 rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-64 rounded-lg bg-muted animate-pulse" />
          </div>
          <div className="h-9 w-36 rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4 space-y-2">
              <div className="h-3 w-28 rounded bg-muted animate-pulse" />
              <div className="h-8 w-14 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border overflow-hidden">
          <div className="h-12 bg-muted/40 animate-pulse border-b" />
          <div className="h-10 bg-muted/20 animate-pulse border-b" />
          <div className="grid grid-cols-7">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="border-r border-b border-border min-h-24 p-2 space-y-1.5">
                <div className="h-3 w-5 rounded bg-muted animate-pulse" />
                {i % 4 === 0 && <div className="h-3 w-full rounded bg-muted/60 animate-pulse" />}
                {i % 7 === 2 && <div className="h-3 w-3/4 rounded bg-muted/40 animate-pulse" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 w-full">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Dashboard</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your yacht bookings and schedule</p>
        </div>
        <Button
          onClick={() => { setSelectedDate(''); setWizardOpen(true) }}
          className="bg-[#bdac7e] hover:bg-[#a89660] text-white shadow-sm"
        >
          <Plus className="mr-2 h-4 w-4" /> New Booking
        </Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Active Bookings',  value: bookings.filter(b => b.status === 'confirmed' || b.status === 'pending').length, dot: '#e8547a' },
          { label: 'Available Yachts', value: yachts.length, dot: '#f5a623' },
          { label: 'Completed Trips',  value: bookings.filter(b => b.status === 'completed').length, dot: '#4a9f6e' },
          { label: 'Total Revenue',    value: `$${bookings.reduce((s, b) => s + (b.totalPrice ?? 0), 0).toLocaleString()}`, dot: '#4b8bca' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.dot }} />
                <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
              </div>
              <div className="text-2xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Calendar card ── */}
      <Card className="w-full">
        {/* Top nav */}
        <div className="flex items-center gap-3 px-5 py-3 border-b">
          {/* Year selector */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => jumpYear('prev')}
              className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="bg-[#bdac7e] text-white text-xs font-semibold px-3 py-1 rounded-full min-w-13 text-center select-none">
              {currentDate.getFullYear()}
            </span>
            <button
              onClick={() => jumpYear('next')}
              className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Month tabs */}
          <div className="flex flex-1 gap-0.5 overflow-x-auto">
            {MONTH_SHORT.map((m, i) => (
              <button
                key={m}
                onClick={() => jumpToMonth(i)}
                className={[
                  'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                  leftMonth === i
                    ? 'bg-[#bdac7e] text-white'
                    : 'text-muted-foreground hover:bg-muted',
                ].join(' ')}
              >
                {m}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex gap-1 shrink-0">
            {([['calendar', CalendarIcon], ['list', List]] as const).map(([mode, Icon]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={[
                  'p-1.5 rounded-full border transition-colors',
                  viewMode === mode
                    ? 'bg-[#bdac7e] text-white border-[#bdac7e]'
                    : 'border-border text-muted-foreground hover:bg-muted',
                ].join(' ')}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>

        {/* Legend + Trip Filter */}
        <div className="flex items-center justify-between gap-4 px-5 py-2.5 border-b flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Per-yacht color swatches */}
            {[...yachts].sort((a, b) => a.name.localeCompare(b.name)).map(y => {
              const color = yachtColorMap[y.name] ?? '#64748b'
              return (
                <div key={y.id} className="flex items-center gap-1.5">
                  {/* solid = charter */}
                  <span className="w-9 h-3 rounded-sm shrink-0 inline-block" style={{ backgroundColor: color }} />
                  {/* striped = open trip */}
                  <span className="w-9 h-3 rounded-sm shrink-0 inline-block" style={{ ...stripeStyle(color), outline: `1.5px solid ${color}`, outlineOffset: -1 }} />
                  <span className="text-[11px] text-muted-foreground font-semibold">{y.name}</span>
                </div>
              )
            })}
            {/* Type key */}
            <div className="border-l border-border pl-3 flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="w-5 h-3 rounded-sm bg-[#64748b] inline-block" />
                <span className="text-[10px] text-muted-foreground">Charter</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-5 h-3 rounded-sm inline-block" style={{ ...stripeStyle('#64748b'), outline: '1.5px solid #64748b', outlineOffset: -1 }} />
                <span className="text-[10px] text-muted-foreground">Open Trip</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {(['all', 'PRIVATE_CHARTER', 'OPEN_TRIP'] as const).map(f => (
              <button
                key={f}
                onClick={() => setTripFilter(f)}
                className={[
                  'px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
                  tripFilter === f
                    ? 'bg-[#bdac7e] text-white'
                    : 'text-muted-foreground hover:bg-muted',
                ].join(' ')}
              >
                {f === 'all' ? 'All' : f === 'PRIVATE_CHARTER' ? 'Private Charter' : 'Open Trip'}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <CardContent className="p-0">
          {viewMode === 'calendar' ? (
            <div className="flex items-start w-full px-4 py-5 gap-2">
              {/* Prev */}
              <button
                onClick={() => navigate('prev')}
                className="mt-8 p-2 rounded-full hover:bg-muted text-muted-foreground shrink-0 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {/* Left month */}
              <MonthGrid
                year={leftYear} month={leftMonth}
                bookings={tripFilter === 'OPEN_TRIP' ? [] : tripFilter === 'PRIVATE_CHARTER' ? bookings.filter(b => b.tripType === 'PRIVATE_CHARTER') : bookings.filter(b => b.tripType !== 'OPEN_TRIP')}
                openTrips={tripFilter === 'PRIVATE_CHARTER' ? [] : openTrips}
                yachtColorMap={yachtColorMap}
                onDateClick={handleDateClick}
                onBookingClick={b => { setSelectedBooking(b); setIsDetailOpen(true) }}
                onOpenTripClick={handleOpenTripClick}
              />

              {/* Divider */}
              <div className="w-px bg-border self-stretch mx-3 mt-8" />

              {/* Right month */}
              <MonthGrid
                year={rightYear} month={rightMonth}
                bookings={tripFilter === 'OPEN_TRIP' ? [] : tripFilter === 'PRIVATE_CHARTER' ? bookings.filter(b => b.tripType === 'PRIVATE_CHARTER') : bookings.filter(b => b.tripType !== 'OPEN_TRIP')}
                openTrips={tripFilter === 'PRIVATE_CHARTER' ? [] : openTrips}
                yachtColorMap={yachtColorMap}
                onDateClick={handleDateClick}
                onBookingClick={b => { setSelectedBooking(b); setIsDetailOpen(true) }}
                onOpenTripClick={handleOpenTripClick}
              />

              {/* Next */}
              <button
                onClick={() => navigate('next')}
                className="mt-8 p-2 rounded-full hover:bg-muted text-muted-foreground shrink-0 transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          ) : (
            /* List view */
            <div className="px-5 py-4 space-y-2">
              {upcomingBookings.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">No bookings found.</div>
              ) : (
                upcomingBookings.map(b => (
                  <button
                    key={b.id}
                    onClick={() => { setSelectedBooking(b); setIsDetailOpen(true) }}
                    className="w-full flex items-center gap-4 rounded-lg border border-border px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_CONFIG[b.status]?.color ?? '#e8547a' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{b.yachtName}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(b.startDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
                        {' – '}
                        {new Date(b.endDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
                        {' · '}{getDays(b.startDate, b.endDate)} days
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold">USD {b.totalPrice?.toLocaleString() ?? '–'}</div>
                      <span
                        className="text-[10px] font-semibold rounded-full px-2 py-0.5 mt-0.5 inline-block"
                        style={{ backgroundColor: STATUS_CONFIG[b.status]?.color + '22', color: STATUS_CONFIG[b.status]?.color }}
                      >
                        {STATUS_CONFIG[b.status]?.label}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Booking Detail Dialog ── */}
      <Dialog open={isDetailOpen} onOpenChange={v => { setIsDetailOpen(v); if (!v) setIsBookingEditing(false) }}>
        <DialogContent className="sm:max-w-2xl">
          {selectedBooking && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle className="text-xl">{selectedBooking.yachtName}</DialogTitle>
                    <DialogDescription>{selectedBooking.bookingCode} · {selectedBooking.customerName}</DialogDescription>
                  </div>
                  {!isBookingEditing && (
                    <span className="text-xs font-semibold rounded-full px-3 py-1 shrink-0"
                      style={{ backgroundColor: STATUS_CONFIG[selectedBooking.status]?.color + '22', color: STATUS_CONFIG[selectedBooking.status]?.color }}>
                      {STATUS_CONFIG[selectedBooking.status]?.label}
                    </span>
                  )}
                </div>
              </DialogHeader>

              {/* ── View mode ── */}
              {!isBookingEditing ? (
                <div className="space-y-3 py-2">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Check-in',  val: new Date(selectedBooking.startDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) },
                      { label: 'Check-out', val: new Date(selectedBooking.endDate).toLocaleDateString('en-GB',   { day:'numeric', month:'short', year:'numeric' }) },
                    ].map(r => (
                      <div key={r.label} className="rounded-lg border p-3">
                        <div className="text-[11px] text-muted-foreground mb-1">{r.label}</div>
                        <div className="text-sm font-semibold">{r.val}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1"><Clock className="w-3 h-3" /> Duration</div>
                      <div className="text-sm font-semibold">{getDays(selectedBooking.startDate, selectedBooking.endDate)} days</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1"><DollarSign className="w-3 h-3" /> Total Price</div>
                      <div className="text-sm font-semibold">USD {selectedBooking.totalPrice?.toLocaleString() ?? '–'}</div>
                    </div>
                  </div>
                  {selectedBooking.notes && (
                    <div className="rounded-lg border p-3">
                      <div className="text-[11px] text-muted-foreground mb-1">Notes</div>
                      <p className="text-sm">{selectedBooking.notes}</p>
                    </div>
                  )}
                  <DialogFooter className="gap-2 pt-1">
                    <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Close</Button>
                    <Button onClick={startBookingEdit} className="bg-[#1a5f6e] hover:bg-[#145260] text-white">
                      <Pencil className="w-3.5 h-3.5 mr-2" /> Edit Booking
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                /* ── Edit mode ── */
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <Select value={bookingEditForm.status} onValueChange={v => setBookingEditForm(p => ({ ...p, status: v }))}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Total Price (USD)</Label>
                      <Input className="h-9" type="number" value={bookingEditForm.totalPrice} onChange={e => setBookingEditForm(p => ({ ...p, totalPrice: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Deposit Paid (USD)</Label>
                    <Input className="h-9" type="number" value={bookingEditForm.depositPaid} onChange={e => setBookingEditForm(p => ({ ...p, depositPaid: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <Textarea rows={3} className="resize-none text-sm" value={bookingEditForm.notes} onChange={e => setBookingEditForm(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                  <DialogFooter className="gap-2 pt-1">
                    <Button variant="outline" onClick={() => setIsBookingEditing(false)} disabled={bookingSaving}>
                      <X className="w-3.5 h-3.5 mr-2" /> Cancel
                    </Button>
                    <Button onClick={saveBooking} disabled={bookingSaving} className="bg-[#1a5f6e] hover:bg-[#145260] text-white">
                      {bookingSaving ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-2" />}
                      Save Changes
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Open Trip Detail Dialog ── */}
      <Dialog open={otDetailOpen} onOpenChange={v => { setOtDetailOpen(v); if (!v) setIsOtEditing(false) }}>
        <DialogContent className="sm:max-w-4xl max-h-[88vh] overflow-y-auto">
          {otDetailLoading || !otDetail ? (
            <>
              <DialogHeader><DialogTitle>Open Trip</DialogTitle></DialogHeader>
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle className="text-lg">{otDetail.title}</DialogTitle>
                    <DialogDescription>
                      {otDetail.yacht?.name} · {otDetail.destination} ·{' '}
                      {new Date(otDetail.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' – '}
                      {new Date(otDetail.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </DialogDescription>
                  </div>
                  <span className={cn('text-[10px] font-semibold rounded-full px-2.5 py-1 shrink-0',
                    otDetail.status === 'open' ? 'bg-green-100 text-green-700' :
                    otDetail.status === 'full' ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'
                  )}>{otDetail.status?.toUpperCase()}</span>
                </div>
              </DialogHeader>

              {/* ── View mode ── */}
              {!isOtEditing ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Total Cabins', val: otDetail.cabins?.length ?? 0, color: '#64748b' },
                      { label: 'Available',    val: otDetail.cabins?.filter((c: any) => !c.isFull).length ?? 0, color: '#22c55e' },
                      { label: 'Sold Out',     val: otDetail.cabins?.filter((c: any) => c.isFull).length ?? 0, color: '#ef4444' },
                    ].map(s => (
                      <div key={s.label} className="rounded-lg border p-3 text-center">
                        <div className="text-2xl font-bold" style={{ color: s.color }}>{s.val}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Cabin Availability</p>
                    <div className="space-y-2">
                      {otDetail.cabins?.map((c: any) => (
                        <div key={c.id} className={cn(
                          'rounded-lg border p-3 flex items-start justify-between gap-3',
                          c.isFull ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                        )}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{c.name}</span>
                              {c.deck && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{c.deck}</span>}
                              {c.bedType && <span className="text-[10px] text-muted-foreground">{c.bedType}</span>}
                            </div>
                            {c.guests.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {c.guests.map((g: { id: string; name: string }) => (
                                  <button key={g.id} onClick={() => setEditGuestId(g.id)}
                                    className="text-[10px] bg-white border rounded px-1.5 py-0.5 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer">
                                    {g.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <span className={cn('text-[11px] font-semibold rounded-full px-2.5 py-1',
                              c.isFull ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')}>
                              {c.isFull ? 'SOLD OUT' : `${c.spotsLeft} spot${c.spotsLeft !== 1 ? 's' : ''} left`}
                            </span>
                            <div className="text-[10px] text-muted-foreground mt-1">{c.occupied}/{c.capacity} pax</div>
                          </div>
                        </div>
                      ))}
                      {(!otDetail.cabins || otDetail.cabins.length === 0) && (
                        <p className="text-sm text-muted-foreground text-center py-6">No cabins found for this yacht.</p>
                      )}
                    </div>
                  </div>

                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setOtDetailOpen(false)}>Close</Button>
                    <Button onClick={startOtEdit} className="bg-[#1a5f6e] hover:bg-[#145260] text-white">
                      <Pencil className="w-3.5 h-3.5 mr-2" /> Edit Trip
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                /* ── Edit mode ── */
                <>
                  <Separator />
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Trip Title</Label>
                      <Input className="h-9" value={otEditForm.title} onChange={e => setOtEditForm(p => ({ ...p, title: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Status</Label>
                        <Select value={otEditForm.status} onValueChange={v => setOtEditForm(p => ({ ...p, status: v }))}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="full">Full</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Price per Cabin (USD)</Label>
                        <Input className="h-9" type="number" value={otEditForm.pricePerCabin} onChange={e => setOtEditForm(p => ({ ...p, pricePerCabin: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Destination</Label>
                        <Input className="h-9" value={otEditForm.destination} onChange={e => setOtEditForm(p => ({ ...p, destination: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Region</Label>
                        <Input className="h-9" value={otEditForm.region} onChange={e => setOtEditForm(p => ({ ...p, region: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Departure Port</Label>
                        <Input className="h-9" value={otEditForm.departurePort} onChange={e => setOtEditForm(p => ({ ...p, departurePort: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Arrival Port</Label>
                        <Input className="h-9" value={otEditForm.arrivalPort} onChange={e => setOtEditForm(p => ({ ...p, arrivalPort: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Description</Label>
                      <Textarea rows={3} className="resize-none text-sm" value={otEditForm.description} onChange={e => setOtEditForm(p => ({ ...p, description: e.target.value }))} />
                    </div>
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setIsOtEditing(false)} disabled={otSaving}>
                      <X className="w-3.5 h-3.5 mr-2" /> Cancel
                    </Button>
                    <Button onClick={saveOt} disabled={otSaving || !otEditForm.title.trim()} className="bg-[#1a5f6e] hover:bg-[#145260] text-white">
                      {otSaving ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-2" />}
                      Save Changes
                    </Button>
                  </DialogFooter>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Guest Edit Sheet ── */}
      <GuestEditSheet
        guestId={editGuestId}
        onClose={() => setEditGuestId(null)}
      />

      {/* ── New Booking Wizard ── */}
      <BookingWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSuccess={fetchBookings}
        preselectedDate={selectedDate}
      />

    </div>
  )
}
