'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Calendar as CalendarIcon, List, ChevronLeft, ChevronRight, Plus, Clock, DollarSign } from 'lucide-react'
import { BookingWizard } from '@/components/bookings/BookingWizard'

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
  confirmed:  { label: 'Guaranteed',     color: '#e8547a' },
  pending:    { label: 'Available',      color: '#f5a623' },
  completed:  { label: 'On request',     color: '#4a9f6e' },
  cancelled:  { label: 'Departing soon', color: '#4b8bca' },
} as const

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES   = ['SUN','MON','TUE','WED','THU','FRI','SAT']

// ─── Single-month grid ───────────────────────────────────────────────────────
function MonthGrid({
  year, month, bookings, openTrips, onDateClick, onBookingClick,
}: {
  year: number; month: number
  bookings: BookingEvent[]; openTrips: OpenTripEvent[]
  onDateClick: (d: string) => void; onBookingClick: (b: BookingEvent) => void
}) {
  const today    = new Date()
  const firstDay = new Date(year, month, 1).getDay()
  const total    = new Date(year, month + 1, 0).getDate()

  const cells: number[] = []
  for (let i = 0; i < firstDay; i++) cells.push(0)
  for (let d = 1; d <= total; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(0)

  const byDay = useMemo(() => {
    const map: Record<number, Array<{ booking: BookingEvent; isStart: boolean; isEnd: boolean }>> = {}
    bookings.forEach(b => {
      const start = new Date(b.startDate + 'T00:00:00')
      const end   = new Date(b.endDate   + 'T00:00:00')
      const cur   = new Date(start)
      while (cur <= end) {
        if (cur.getFullYear() === year && cur.getMonth() === month) {
          const d = cur.getDate()
          if (!map[d]) map[d] = []
          if (!map[d].some(x => x.booking.id === b.id)) {
            map[d].push({
              booking: b,
              isStart: cur.getTime() === start.getTime(),
              isEnd:   cur.getTime() === end.getTime(),
            })
          }
        }
        cur.setDate(cur.getDate() + 1)
      }
    })
    return map
  }, [bookings, year, month])

  const otByDay = useMemo(() => {
    const map: Record<number, Array<{ trip: OpenTripEvent; isStart: boolean; isEnd: boolean }>> = {}
    openTrips.forEach(t => {
      const start = new Date(t.startDate + 'T00:00:00')
      const end   = new Date(t.endDate   + 'T00:00:00')
      const cur   = new Date(start)
      while (cur <= end) {
        if (cur.getFullYear() === year && cur.getMonth() === month) {
          const d = cur.getDate()
          if (!map[d]) map[d] = []
          if (!map[d].some(x => x.trip.id === t.id)) {
            map[d].push({
              trip: t,
              isStart: cur.getTime() === start.getTime(),
              isEnd:   cur.getTime() === end.getTime(),
            })
          }
        }
        cur.setDate(cur.getDate() + 1)
      }
    })
    return map
  }, [openTrips, year, month])

  const isToday = (d: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === d

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
      <div className="grid grid-cols-7 border-t border-l border-border">
        {cells.map((day, idx) => {
          const dayBookings = day > 0 ? (byDay[day] ?? []) : []
          const dayOT: Array<{ trip: OpenTripEvent; isStart: boolean; isEnd: boolean }> = day > 0 ? (otByDay[day] ?? []) : []
          const todayCell   = day > 0 && isToday(day)
          const dateStr     = day > 0
            ? `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}` : ''

          return (
            <div
              key={idx}
              onClick={() => day > 0 && onDateClick(dateStr)}
              className={[
                'border-r border-b border-border min-h-24 p-1.5 relative transition-colors',
                day > 0 ? 'cursor-pointer hover:bg-muted/40' : 'bg-muted/20',
                todayCell ? 'ring-2 ring-inset ring-[#bdac7e]' : '',
              ].join(' ')}
            >
              {day > 0 && (
                <>
                  <div className="flex items-center gap-1 mb-1">
                    <span className={`text-xs font-semibold leading-none ${todayCell ? 'text-[#bdac7e]' : 'text-foreground'}`}>
                      {day}
                    </span>
                  </div>

                  {/* Private Charter booking markers — spanning bars */}
                  {dayBookings.map(({ booking: b, isStart, isEnd }) => {
                    const color = STATUS_CONFIG[b.status]?.color ?? '#e8547a'
                    return (
                      <button
                        key={b.id}
                        onClick={e => { e.stopPropagation(); onBookingClick(b) }}
                        title={`${b.yachtName}${b.bookingCode ? ` · ${b.bookingCode}` : ''}${b.customerName ? ` · ${b.customerName}` : ''}`}
                        className="mt-0.5 flex items-center h-4 overflow-hidden w-full text-left"
                        style={{
                          backgroundColor: color,
                          color: 'white',
                          marginLeft:  isStart ? 2 : -2,
                          marginRight: isEnd   ? 2 : -2,
                          borderRadius: isStart && isEnd ? 4
                            : isStart ? '4px 0 0 4px'
                            : isEnd   ? '0 4px 4px 0'
                            : 0,
                        }}
                      >
                        {isStart && (
                          <span className="text-[9px] font-semibold px-1.5 truncate leading-none">
                            {b.yachtName}
                          </span>
                        )}
                      </button>
                    )
                  })}

                  {/* Open Trip markers */}
                  {dayOT.map(({ trip: t, isStart, isEnd }) => {
                    const isFull = t.spotsAvailable === 0
                    const color  = isFull ? '#e8547a' : '#4a9f6e'
                    return (
                      <div
                        key={t.id}
                        title={`${t.title} · ${t.destination} — ${isFull ? 'Full' : `${t.spotsAvailable}/${t.maxCapacity} cabins left`}`}
                        className="mt-0.5 flex items-center h-4 overflow-hidden"
                        style={{
                          backgroundColor: color,
                          color: 'white',
                          marginLeft:  isStart ? 2 : -2,
                          marginRight: isEnd   ? 2 : -2,
                          borderRadius: isStart && isEnd ? 4
                            : isStart ? '4px 0 0 4px'
                            : isEnd   ? '0 4px 4px 0'
                            : 0,
                        }}
                      >
                        {isStart && (
                          <span className="text-[9px] font-semibold px-1.5 truncate leading-none">
                            {t.title}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
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
  const [selectedBooking, setSelectedBooking] = useState<BookingEvent | null>(null)
  const [isDetailOpen, setIsDetailOpen]       = useState(false)
  const [wizardOpen, setWizardOpen]           = useState(false)
  const [selectedDate, setSelectedDate]       = useState('')

  const fetchBookings = useCallback(async () => {
    try {
      const data = await fetch('/api/bookings').then(r => r.json())
      setBookings(data.map((b: any) => ({
        id: b.id, yachtName: b.yacht?.name ?? '',
        startDate: b.startDate.split('T')[0], endDate: b.endDate.split('T')[0],
        status: b.status, tripType: b.tripType,
        customerName: b.customer?.name, bookingCode: b.bookingCode,
        totalPrice: b.totalPrice, depositAmount: b.depositPaid, notes: b.notes ?? undefined,
      })))
    } catch (e) { console.error('Failed to fetch bookings', e) }
  }, [])

  const fetchOpenTrips = useCallback(async () => {
    try {
      const data = await fetch('/api/open-trips').then(r => r.json())
      setOpenTrips(Array.isArray(data) ? data : [])
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
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-muted-foreground">Loading calendar…</div>
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
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                <span className="text-[11px] text-muted-foreground font-medium">{cfg.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0 bg-[#4a9f6e]" />
              <span className="text-[11px] text-muted-foreground font-medium">Open Trip (available)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0 bg-[#e8547a]" />
              <span className="text-[11px] text-muted-foreground font-medium">Open Trip (full)</span>
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
                bookings={tripFilter === 'OPEN_TRIP' ? bookings.filter(b => b.tripType === 'OPEN_TRIP') : tripFilter === 'PRIVATE_CHARTER' ? bookings.filter(b => b.tripType === 'PRIVATE_CHARTER') : bookings}
                openTrips={tripFilter === 'PRIVATE_CHARTER' ? [] : openTrips}
                onDateClick={handleDateClick} onBookingClick={b => { setSelectedBooking(b); setIsDetailOpen(true) }}
              />

              {/* Divider */}
              <div className="w-px bg-border self-stretch mx-3 mt-8" />

              {/* Right month */}
              <MonthGrid
                year={rightYear} month={rightMonth}
                bookings={tripFilter === 'OPEN_TRIP' ? bookings.filter(b => b.tripType === 'OPEN_TRIP') : tripFilter === 'PRIVATE_CHARTER' ? bookings.filter(b => b.tripType === 'PRIVATE_CHARTER') : bookings}
                openTrips={tripFilter === 'PRIVATE_CHARTER' ? [] : openTrips}
                onDateClick={handleDateClick} onBookingClick={b => { setSelectedBooking(b); setIsDetailOpen(true) }}
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
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="w-240 max-w-[100vw]">
          {selectedBooking && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle className="text-xl">{selectedBooking.yachtName}</DialogTitle>
                    <DialogDescription>{selectedBooking.bookingCode} · {selectedBooking.customerName}</DialogDescription>
                  </div>
                  <span
                    className="text-xs font-semibold rounded-full px-3 py-1 shrink-0"
                    style={{ backgroundColor: STATUS_CONFIG[selectedBooking.status]?.color + '22', color: STATUS_CONFIG[selectedBooking.status]?.color }}
                  >
                    {STATUS_CONFIG[selectedBooking.status]?.label}
                  </span>
                </div>
              </DialogHeader>

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
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setIsDetailOpen(false)} className="flex-1">Close</Button>
                <Button className="flex-1 bg-[#bdac7e] hover:bg-[#a89660] text-white">Edit Booking</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

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
