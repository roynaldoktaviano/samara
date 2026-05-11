'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
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
  salesperson?: string
}

interface CabinStatus {
  id: string
  name: string
  bookingStatus: string | null  // null = available, 'pending' = yellow, 'partially_paid'/'fully_paid'/'confirmed'/'completed' = red
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
  cabinStatuses: CabinStatus[]
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

const LANE_H    = 28   /* px per event lane */
const DAY_H     = 36   /* px for day-number row — extra space below date number */
const MIN_ROW_H = 160  /* minimum row height — guaranteed space for 4 event lanes */

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES   = ['SUN','MON','TUE','WED','THU','FRI','SAT']

// ─── Single-month grid ───────────────────────────────────────────────────────
function MonthGrid({
  year, month, bookings, openTrips, yachtColorMap, yachtFilter, onDateClick, onBookingClick, onOpenTripClick, isInFilterRange,
}: {
  year: number; month: number
  bookings: BookingEvent[]; openTrips: OpenTripEvent[]
  yachtColorMap: Record<string, string>
  yachtFilter: string
  onDateClick: (d: string) => void
  onBookingClick: (b: BookingEvent) => void
  onOpenTripClick: (t: OpenTripEvent) => void
  isInFilterRange: (dateStr: string) => boolean
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
      tooltip: string; bookingRef?: BookingEvent; openTripRef?: OpenTripEvent
      lane: number; laneSpan: number
    }

    const raw: Omit<Seg, 'lane' | 'laneSpan'>[] = []

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
      const isClosed = t.status === 'closed'
      const isFull   = t.status === 'full' || (t.status !== 'closed' && t.spotsAvailable === 0)
      const otColor  = isClosed ? '#94a3b8' : isFull ? '#ef4444' : '#22c55e'
      const tooltip  = isClosed ? 'CLOSED' : isFull ? 'SOLD OUT' : `${t.spotsAvailable}/${t.maxCapacity} spots`
      addSegs(
        t.id, t.title, otColor, true, isFull,
        new Date(t.startDate + 'T00:00:00'), new Date(t.endDate + 'T00:00:00'),
        `[Open Trip] ${t.title} · ${t.yacht.name} — ${tooltip}`,
        undefined, t,
      )
    })

    /* Assign lanes — open trips occupy 2 consecutive lanes */
    const result: Seg[][] = weeks.map(() => [])
    weeks.forEach((_, wi) => {
      const segs = raw
        .filter(s => s.weekIdx === wi)
        .sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol))
      const laneEnds: number[] = []
      segs.forEach(seg => {
        const span = seg.isStripe ? 2 : 1
        let lane = -1
        outer: for (let l = 0; l <= laneEnds.length; l++) {
          for (let s = 0; s < span; s++) {
            if ((laneEnds[l + s] ?? -1) >= seg.startCol) continue outer
          }
          lane = l; break
        }
        if (lane === -1) lane = laneEnds.length
        for (let s = 0; s < span; s++) {
          while (laneEnds.length <= lane + s) laneEnds.push(-1)
          laneEnds[lane + s] = seg.endCol
        }
        result[wi].push({ ...seg, lane, laneSpan: span })
      })
    })
    return result
  }, [bookings, openTrips, yachtColorMap, year, month, weeks])

  return (
    <div className="flex-1 min-w-0">
      <div className="text-center mb-3">
        <p className="text-sm font-semibold text-foreground">
          {MONTH_FULL[month]} {year}
        </p>
        {yachtFilter !== 'all' && (
          <p className="text-xs font-medium mt-0.5" style={{ color: yachtColorMap[yachtFilter] ?? '#64748b' }}>
            {yachtFilter}
          </p>
        )}
      </div>
      <div className="grid grid-cols-7">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1.5">{d}</div>
        ))}
      </div>

      <div className="border-t border-l border-border">
        {weeks.map((week, wi) => {
          const maxLaneEnd = segsByWeek[wi].length > 0 ? Math.max(...segsByWeek[wi].map(s => s.lane + s.laneSpan)) : 0
          const rowH = Math.max(MIN_ROW_H, DAY_H + maxLaneEnd * LANE_H + 8)

          return (
            <div key={wi} className="relative" style={{ height: rowH }}>

              {/* ── Day cell background layer ── */}
              <div className="absolute inset-0 grid grid-cols-7">
                {week.map((day, col) => {
                  const dateStr    = day > 0 ? `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}` : ''
                  const todayCell  = day > 0 && isToday(day)
                  const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0)
                  const isPast     = day > 0 && new Date(dateStr) <= todayMidnight
                  const inRange    = day > 0 && isInFilterRange(dateStr)
                  return (
                    <div
                      key={col}
                      onClick={() => day > 0 && !isPast && onDateClick(dateStr)}
                      className={cn(
                        'border-r border-b border-border p-1.5 transition-colors',
                        day === 0   ? 'bg-muted/20' :
                        inRange     ? 'bg-[#bdac7e]/10 cursor-pointer hover:bg-[#bdac7e]/20' :
                        isPast      ? 'bg-muted/10 cursor-not-allowed' :
                                      'cursor-pointer hover:bg-muted/40',
                        todayCell   ? 'ring-2 ring-inset ring-[#bdac7e]' : '',
                      )}
                    >
                      {day > 0 && (
                        <span className={cn(
                          'text-xs font-semibold leading-none',
                          todayCell ? 'text-[#bdac7e]' :
                          inRange   ? 'text-[#8a7a55]' :
                          isPast    ? 'text-muted-foreground/40' :
                                      'text-foreground'
                        )}>
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
                  height: seg.laneSpan * LANE_H - 3,
                  borderRadius: seg.isRealStart && seg.isRealEnd ? 4
                    : seg.isRealStart ? '4px 0 0 4px'
                    : seg.isRealEnd   ? '0 4px 4px 0'
                    : 0,
                  color: 'white',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: seg.isStripe ? 'flex-start' : 'center',
                  zIndex: 10,
                  cursor: 'pointer',
                }

                if (seg.isStripe) {
                  const gap = `${seg.color}44`
                  style.background    = `repeating-linear-gradient(45deg,${seg.color} 0px,${seg.color} 3px,${gap} 3px,${gap} 8px)`
                  style.outline       = `1.5px solid ${seg.color}`
                  style.outlineOffset = '-1px'
                } else {
                  style.backgroundColor = seg.color
                }

                /* ── Open trip extra info ── */
                const ot = seg.openTripRef
                const nights = ot
                  ? Math.round((new Date(ot.endDate).getTime() - new Date(ot.startDate).getTime()) / 86400000)
                  : 0
                const days = nights + 1

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
                      seg.isStripe && ot ? (
                        /* Open trip pill — 2-row white overlay */
                        <div style={{
                          margin: '2px 4px',
                          backgroundColor: 'rgba(255,255,255,0.93)',
                          borderRadius: 4,
                          padding: '3px 6px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                          maxWidth: 'calc(100% - 8px)',
                          overflow: 'hidden',
                          alignSelf: 'flex-start',
                        }}>
                          {/* Row 1: Title + Yacht + Days + Status badge */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                            <span style={{
                              color: '#111827', fontSize: 11, fontWeight: 700,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              flexShrink: 1, minWidth: 0,
                            }}>
                              {ot.title}
                            </span>
                            <span style={{ color: '#475569', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {ot.yacht.name}
                            </span>
                            <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {days}D/{nights}N
                            </span>
                            {ot.status === 'closed' && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', backgroundColor: '#64748b', borderRadius: 3, padding: '1px 4px', whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: 0.5 }}>
                                CLOSED
                              </span>
                            )}
                            {ot.status === 'full' && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', backgroundColor: '#ef4444', borderRadius: 3, padding: '1px 4px', whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: 0.5 }}>
                                FULL
                              </span>
                            )}
                          </div>
                          {/* Row 2: Per-cabin dots */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px' }}>
                            {(ot.cabinStatuses ?? []).map(c => {
                              const isPaid    = c.bookingStatus === 'partially_paid' || c.bookingStatus === 'fully_paid' || c.bookingStatus === 'confirmed' || c.bookingStatus === 'completed'
                              const isPending = c.bookingStatus !== null && !isPaid
                              const dotColor  = isPaid ? '#ef4444' : isPending ? '#f59e0b' : '#22c55e'
                              return (
                                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0 }} />
                                  <span style={{ fontSize: 9, color: '#334155', whiteSpace: 'nowrap', fontWeight: 600 }}>{c.name}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        /* Regular booking — white text on solid bar */
                        <span style={{
                          fontSize: 9, fontWeight: 600, color: 'white',
                          padding: '0 6px', overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          textShadow: '0 1px 2px rgba(0,0,0,0.35)',
                        }}>
                          {seg.label}
                        </span>
                      )
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

/* ── date filter helpers ── */
const todayStr = () => new Date().toISOString().split('T')[0]

function getPreset(preset: string): [string, string] {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (preset === 'today') { const t = fmt(now); return [t, t] }
  if (preset === 'week') {
    const day = now.getDay()
    const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return [fmt(mon), fmt(sun)]
  }
  if (preset === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return [fmt(first), fmt(last)]
  }
  const end = new Date(now); end.setDate(now.getDate() + 30)
  return [fmt(now), fmt(end)]
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function CalendarView() {
  const { data: session } = useSession()
  const canEdit = ['ADMIN', 'SALES'].includes((session?.user as { role?: string })?.role ?? '')

  const [currentDate, setCurrentDate]   = useState(new Date())
  const [viewMode, setViewMode]         = useState<'calendar' | 'list'>('calendar')
  const [bookings, setBookings]         = useState<BookingEvent[]>([])
  const [yachts, setYachts]             = useState<DbYacht[]>([])
  const [loading, setLoading]           = useState(true)
  const [openTrips, setOpenTrips]       = useState<OpenTripEvent[]>([])
  const [tripFilter, setTripFilter]     = useState<'all' | 'PRIVATE_CHARTER' | 'OPEN_TRIP'>('all')
  const [yachtFilter, setYachtFilter]   = useState<string>('Samara I')

  /* date filter */
  const [filterMode, setFilterMode]     = useState<'single' | 'range'>('single')
  const [filterFrom, setFilterFrom]     = useState(todayStr())
  const [filterTo,   setFilterTo]       = useState(todayStr())
  const [filterActive, setFilterActive] = useState(false)
  const [selectedBooking, setSelectedBooking]   = useState<BookingEvent | null>(null)
  const [isDetailOpen, setIsDetailOpen]         = useState(false)
  const [wizardOpen, setWizardOpen]             = useState(false)
  const [selectedDate, setSelectedDate]         = useState('')
  const [wizardOpenTripId, setWizardOpenTripId] = useState<string | undefined>(undefined)
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
            totalPrice: b.totalPrice, depositAmount: b.depositPaid, notes: b.notes ?? undefined, salesperson: b.salesperson ?? undefined,
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
              startDate:     t.startDate.split('T')[0],
              endDate:       t.endDate.split('T')[0],
              cabinStatuses: t.cabinStatuses ?? [],
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
        fetch('/api/yachts').then(r => r.json()).then((d: any) =>
          setYachts(Array.isArray(d) ? d.map(y => ({ id: y.id, name: y.name, dailyRate: y.dailyRate })) : [])),
      ])
      setLoading(false)
    }
    load()
  }, [fetchBookings, fetchOpenTrips])

  useEffect(() => {
    const handler = () => { fetchBookings(); fetchOpenTrips() }
    window.addEventListener('booking-created', handler)
    return () => window.removeEventListener('booking-created', handler)
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

  /* apply date filter — switch to list view, show all yachts */
  const applyDateFilter = (from: string, to: string) => {
    setFilterFrom(from)
    setFilterTo(to)
    setFilterActive(true)
    setViewMode('list')
  }
  const clearDateFilter = () => {
    setFilterActive(false)
    setFilterFrom(todayStr())
    setFilterTo(todayStr())
    setFilterMode('single')
  }
  const handlePreset = (preset: string) => {
    const [f, t] = getPreset(preset)
    setFilterFrom(f)
    setFilterTo(t)
    setFilterMode(f === t ? 'single' : 'range')
    applyDateFilter(f, t)
  }
  const handleFilterApply = () => {
    const to = filterMode === 'single' ? filterFrom : filterTo
    applyDateFilter(filterFrom, to)
  }

  /* date overlap check */
  const filterOverlaps = (b: BookingEvent) => {
    const bStart = b.startDate.split('T')[0]
    const bEnd   = b.endDate.split('T')[0]
    const fTo    = filterMode === 'single' ? filterFrom : filterTo
    return bStart <= fTo && bEnd >= filterFrom
  }

  /* highlight check for calendar cells */
  const isInFilterRange = (dateStr: string) => {
    if (!filterActive) return false
    const fTo = filterMode === 'single' ? filterFrom : filterTo
    return dateStr >= filterFrom && dateStr <= fTo
  }

  const handleDateClick = (dateStr: string) => {
    const today = new Date(); today.setHours(0,0,0,0)
    if (new Date(dateStr) <= today) return
    setSelectedDate(dateStr)
    setWizardOpen(true)
  }

  const getDays = (s: string, e: string) =>
    Math.ceil((new Date(e).getTime() - new Date(s).getTime()) / 86400000)

  const upcomingBookings = useMemo(() => {
    const monthStart = new Date(leftYear, leftMonth, 1)
    const monthEnd   = new Date(leftYear, leftMonth + 1, 0)
    return [...bookings]
      .filter(b => {
        if (b.status === 'cancelled') return false
        // when date filter active: ignore month + yacht restrictions, just match date overlap
        if (filterActive) {
          return filterOverlaps(b)
            && (tripFilter === 'all' || b.tripType === tripFilter)
        }
        const s = new Date(b.startDate)
        const e = new Date(b.endDate)
        if (s > monthEnd || e < monthStart) return false
        if (tripFilter !== 'all' && b.tripType !== tripFilter) return false
        if (yachtFilter !== 'all' && b.yachtName !== yachtFilter) return false
        return true
      })
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, leftYear, leftMonth, tripFilter, yachtFilter, filterActive, filterFrom, filterTo, filterMode])

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
        {canEdit && (
          <Button
            onClick={() => { setSelectedDate(''); setWizardOpen(true) }}
            className="bg-[#bdac7e] hover:bg-[#a89660] text-white shadow-sm"
          >
            <Plus className="mr-2 h-4 w-4" /> New Booking
          </Button>
        )}
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

        {/* Legend + Filters */}
        <div className="border-b">
          {/* Row 1: legend swatches */}
          <div className="flex items-center gap-4 px-5 py-2 flex-wrap">
            {/* Charter per-yacht colors */}
            {[...yachts].sort((a, b) => a.name.localeCompare(b.name)).map(y => {
              const color = yachtColorMap[y.name] ?? '#64748b'
              return (
                <div key={y.id} className="flex items-center gap-1.5">
                  <span className="w-6 h-3 rounded-sm shrink-0 inline-block" style={{ backgroundColor: color }} />
                  <span className="text-[11px] text-muted-foreground font-semibold">{y.name}</span>
                </div>
              )
            })}
            <div className="border-l border-border pl-3 flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-6 h-3 rounded-sm inline-block" style={{ ...stripeStyle('#22c55e'), outline: '1.5px solid #22c55e', outlineOffset: -1 }} />
                <span className="text-[10px] text-muted-foreground">Open Trip (tersedia)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-6 h-3 rounded-sm inline-block" style={{ ...stripeStyle('#ef4444'), outline: '1.5px solid #ef4444', outlineOffset: -1 }} />
                <span className="text-[10px] text-muted-foreground">Open Trip (penuh)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-6 h-3 rounded-sm inline-block" style={{ ...stripeStyle('#94a3b8'), outline: '1.5px solid #94a3b8', outlineOffset: -1 }} />
                <span className="text-[10px] text-muted-foreground">Open Trip (closed)</span>
              </div>
            </div>
          </div>

          {/* Row 2: Date filter */}
          <div className="flex items-center gap-2 px-5 py-2 border-t flex-wrap">
            <span className="text-[11px] text-muted-foreground font-medium shrink-0">Tanggal:</span>
            {/* Presets */}
            {(['today','week','month'] as const).map(p => (
              <button key={p} onClick={() => handlePreset(p)}
                className="text-[11px] px-2 py-1 rounded-lg border transition-colors hover:bg-muted"
                style={filterActive && (p === 'today' ? filterFrom === todayStr() && filterTo === todayStr() : false)
                  ? { backgroundColor: '#bdac7e', borderColor: '#bdac7e', color: 'white' } : {}}>
                {p === 'today' ? 'Hari Ini' : p === 'week' ? 'Minggu Ini' : 'Bulan Ini'}
              </button>
            ))}
            <div className="w-px h-4 bg-border mx-1" />
            {/* Mode toggle */}
            <div className="flex rounded-lg border overflow-hidden text-[11px]">
              {(['single','range'] as const).map(m => (
                <button key={m} onClick={() => { setFilterMode(m); if (m === 'single') setFilterTo(filterFrom) }}
                  className="px-2.5 py-1 transition-colors"
                  style={filterMode === m ? { backgroundColor: '#bdac7e', color: 'white' } : { color: '#6b7280' }}>
                  {m === 'single' ? 'Tanggal' : 'Rentang'}
                </button>
              ))}
            </div>
            {/* Inputs */}
            <input type="date" value={filterFrom}
              onChange={e => { setFilterFrom(e.target.value); if (filterMode === 'single') setFilterTo(e.target.value) }}
              className="h-7 text-[11px] border rounded-lg px-2 bg-background" />
            {filterMode === 'range' && (<>
              <span className="text-muted-foreground text-[11px]">–</span>
              <input type="date" value={filterTo} min={filterFrom}
                onChange={e => setFilterTo(e.target.value)}
                className="h-7 text-[11px] border rounded-lg px-2 bg-background" />
            </>)}
            <button onClick={handleFilterApply}
              className="h-7 px-3 text-[11px] font-semibold rounded-lg text-white transition-colors"
              style={{ backgroundColor: '#bdac7e' }}>
              Tampilkan
            </button>
            {filterActive && (
              <button onClick={clearDateFilter}
                className="h-7 w-7 flex items-center justify-center rounded-lg border hover:bg-muted text-muted-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
            {filterActive && (
              <span className="text-[11px] text-[#bdac7e] font-semibold ml-1">
                {filterFrom === filterTo
                  ? new Date(filterFrom + 'T00:00:00').toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' })
                  : `${new Date(filterFrom+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short'})} – ${new Date(filterTo+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}`}
              </span>
            )}
          </div>

          {/* Row 3: trip type filter + yacht filter */}
          <div className="flex items-center justify-between gap-4 px-5 py-2 border-t flex-wrap">
            {/* Trip type */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground mr-1.5 font-medium">Tipe:</span>
              {(['all', 'PRIVATE_CHARTER', 'OPEN_TRIP'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setTripFilter(f)}
                  className={[
                    'px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
                    tripFilter === f ? 'bg-[#bdac7e] text-white' : 'text-muted-foreground hover:bg-muted',
                  ].join(' ')}
                >
                  {f === 'all' ? 'Semua' : f === 'PRIVATE_CHARTER' ? 'Private Charter' : 'Open Trip'}
                </button>
              ))}
            </div>

            {/* Yacht filter */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground mr-1.5 font-medium">Kapal:</span>
              {(() => {
                const ORDER = ['Samara I', 'Samara II', 'Mischief', 'Otium']
                const sorted = [...yachts].sort((a, b) => {
                  const ai = ORDER.indexOf(a.name); const bi = ORDER.indexOf(b.name)
                  if (ai === -1 && bi === -1) return a.name.localeCompare(b.name)
                  if (ai === -1) return 1
                  if (bi === -1) return -1
                  return ai - bi
                })
                return sorted.map(y => {
                  const color = yachtColorMap[y.name] ?? '#64748b'
                  const active = yachtFilter === y.name
                  return (
                    <button
                      key={y.id}
                      onClick={() => setYachtFilter(y.name)}
                      className={[
                        'px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border',
                        active ? 'text-white border-transparent' : 'text-muted-foreground border-border hover:bg-muted',
                      ].join(' ')}
                      style={active ? { backgroundColor: color, borderColor: color } : {}}
                    >
                      {y.name}
                    </button>
                  )
                })
              })()}
            </div>
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

              {/* Single month — full width */}
              <MonthGrid
                year={leftYear} month={leftMonth}
                yachtFilter={yachtFilter}
                bookings={
                  (tripFilter === 'OPEN_TRIP' ? [] : tripFilter === 'PRIVATE_CHARTER'
                    ? bookings.filter(b => b.tripType === 'PRIVATE_CHARTER')
                    : bookings.filter(b => b.tripType !== 'OPEN_TRIP')
                  ).filter(b => yachtFilter === 'all' || b.yachtName === yachtFilter)
                }
                openTrips={
                  (tripFilter === 'PRIVATE_CHARTER' ? [] : openTrips)
                    .filter(t => yachtFilter === 'all' || t.yacht.name === yachtFilter)
                }
                yachtColorMap={yachtColorMap}
                onDateClick={handleDateClick}
                onBookingClick={b => { setSelectedBooking(b); setIsDetailOpen(true) }}
                onOpenTripClick={handleOpenTripClick}
                isInFilterRange={isInFilterRange}
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
              {filterActive && (
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{upcomingBookings.length} trip</span> ditemukan
                    {' · '}
                    <span style={{ color: '#bdac7e' }} className="font-semibold">
                      {filterFrom === filterTo
                        ? new Date(filterFrom + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
                        : `${new Date(filterFrom+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})} – ${new Date(filterTo+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}`}
                    </span>
                    {' · semua kapal'}
                  </p>
                </div>
              )}
              {(() => {
                const listItems = upcomingBookings
                return listItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  {filterActive
                    ? 'Tidak ada trip yang aktif di tanggal ini.'
                    : `Tidak ada booking di ${MONTH_FULL[leftMonth]} ${leftYear}.`}
                </div>
              ) : (
                listItems.map(b => (
                  <button
                    key={b.id}
                    onClick={() => { setSelectedBooking(b); setIsDetailOpen(true) }}
                    className="w-full flex items-center gap-4 rounded-lg border border-border px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_CONFIG[b.status]?.color ?? '#e8547a' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold truncate">{b.yachtName || b.customerName}</span>
                        {b.bookingCode && <span className="font-mono text-[10px] text-muted-foreground">{b.bookingCode}</span>}
                        {b.customerName && b.yachtName && <span className="text-xs text-muted-foreground truncate">{b.customerName}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(b.startDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
                        {' – '}
                        {new Date(b.endDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
                        {' · '}{getDays(b.startDate, b.endDate)} hari
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
              )
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Booking Detail Dialog ── */}
      <Dialog open={isDetailOpen} onOpenChange={v => { setIsDetailOpen(v); if (!v) setIsBookingEditing(false) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle className="sr-only">{selectedBooking?.yachtName ?? 'Booking Detail'}</DialogTitle>
          {selectedBooking && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-semibold">{selectedBooking.yachtName}</p>
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
                  {(selectedBooking.salesperson || selectedBooking.notes) && (
                    <div className="grid gap-3" style={{ gridTemplateColumns: selectedBooking.salesperson && selectedBooking.notes ? '1fr 1fr' : '1fr' }}>
                      {selectedBooking.salesperson && (
                        <div className="rounded-lg border p-3">
                          <div className="text-[11px] text-muted-foreground mb-1">Salesperson</div>
                          <p className="text-sm font-semibold">{selectedBooking.salesperson}</p>
                        </div>
                      )}
                      {selectedBooking.notes && (
                        <div className="rounded-lg border p-3">
                          <div className="text-[11px] text-muted-foreground mb-1">Notes</div>
                          <p className="text-sm">{selectedBooking.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                  <DialogFooter className="gap-2 pt-1">
                    <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Close</Button>
                    {new Date(selectedBooking.endDate) >= new Date(new Date().toDateString()) && (
                      <Button onClick={startBookingEdit} className="bg-[#1a5f6e] hover:bg-[#145260] text-white">
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Edit Booking
                      </Button>
                    )}
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
                  {/* ── Capacity bar ── */}
                  {(() => {
                    const total    = otDetail.cabins?.length ?? 0
                    const paid     = otDetail.cabins?.filter((c: any) => c.bookingStatus === 'partially_paid' || c.bookingStatus === 'fully_paid' || c.bookingStatus === 'completed' || c.bookingStatus === 'confirmed').length ?? 0
                    const pending  = otDetail.cabins?.filter((c: any) => c.isFull && c.bookingStatus === 'pending').length ?? 0
                    const avail    = total - paid - pending
                    const paidPct  = total ? (paid    / total) * 100 : 0
                    const pendPct  = total ? (pending / total) * 100 : 0
                    const availPct = total ? (avail   / total) * 100 : 100
                    return (
                      <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                        {/* Numbers row */}
                        <div className="grid grid-cols-4 divide-x text-center">
                          {[
                            { label: 'Total',      val: total,   color: 'text-foreground',     bg: '' },
                            { label: 'Available',  val: avail,   color: 'text-emerald-600',    bg: '' },
                            { label: 'Waiting for Payment',val: pending, color: 'text-amber-500',      bg: '' },
                            { label: 'Booked',   val: paid,    color: 'text-red-500',        bg: '' },
                          ].map(s => (
                            <div key={s.label} className="px-3">
                              <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
                              <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.label}</div>
                            </div>
                          ))}
                        </div>
                        {/* Progress bar */}
                        <div className="h-2.5 rounded-full overflow-hidden bg-muted flex">
                          {paid    > 0 && <div className="h-full bg-red-400 transition-all"    style={{ width: `${paidPct}%` }} />}
                          {pending > 0 && <div className="h-full bg-amber-400 transition-all"  style={{ width: `${pendPct}%` }} />}
                          {avail   > 0 && <div className="h-full bg-emerald-400 transition-all"style={{ width: `${availPct}%` }} />}
                        </div>
                        {/* Legend */}
                        <div className="flex items-center gap-4">
                          {[
                            { dot: 'bg-emerald-400', label: 'Available' },
                            { dot: 'bg-amber-400',   label: 'Waiting for Payment' },
                            { dot: 'bg-red-400',     label: 'Booked' },
                          ].map(l => (
                            <div key={l.label} className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${l.dot} shrink-0`} />
                              <span className="text-[10px] text-muted-foreground">{l.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {/* ── Cabin list ── */}
                  <div className="rounded-xl border overflow-hidden">
                    <div className="bg-muted/40 px-4 py-2 border-b">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Cabin Details</p>
                    </div>
                    <div className="divide-y">
                      {otDetail.cabins?.map((c: any) => {
                        const isPaid    = c.isFull && (c.bookingStatus === 'partially_paid' || c.bookingStatus === 'fully_paid' || c.bookingStatus === 'completed' || c.bookingStatus === 'confirmed')
                        const isPending = c.isFull && !isPaid
                        const dotCls    = isPaid    ? 'bg-red-400'     : isPending ? 'bg-amber-400'   : 'bg-emerald-400'
                        const badgeCls  = isPaid    ? 'bg-red-100 text-red-700'   : isPending ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                        const badgeLabel= isPaid    ? 'Booked'       : isPending ? 'Waiting for Payment'    : 'Available'
                        return (
                          <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                            {/* Status dot */}
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotCls}`} />
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm">{c.name}</span>
                                {c.deck    && <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-px">{c.deck}</span>}
                                {c.bedType && <span className="text-[10px] text-muted-foreground">{c.bedType}</span>}
                              </div>
                              {c.guests?.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {c.guests.map((g: { id: string; name: string }) => (
                                    <button key={g.id} onClick={() => setEditGuestId(g.id)}
                                      className="text-[10px] bg-muted border rounded px-1.5 py-px text-foreground hover:bg-background hover:border-foreground/30 transition-colors">
                                      {g.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* Badge */}
                            <span className={cn('text-[10px] font-semibold rounded-full px-2.5 py-1 shrink-0 whitespace-nowrap', badgeCls)}>
                              {badgeLabel}
                            </span>
                          </div>
                        )
                      })}
                      {(!otDetail.cabins || otDetail.cabins.length === 0) && (
                        <p className="text-sm text-muted-foreground text-center py-8">No cabins found for this yacht.</p>
                      )}
                    </div>
                  </div>

                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setOtDetailOpen(false)}>Close</Button>
                    {canEdit && otDetail.status === 'open' && (
                      <Button
                        onClick={() => {
                          setOtDetailOpen(false)
                          setWizardOpenTripId(otDetail.id)
                          setWizardOpen(true)
                        }}
                        className="bg-[#bdac7e] hover:bg-[#a89660] text-white"
                      >
                        <Plus className="w-3.5 h-3.5 mr-2" /> Book This Trip
                      </Button>
                    )}
                    {canEdit && new Date(otDetail.endDate) >= new Date(new Date().toDateString()) && (
                      <Button onClick={startOtEdit} className="bg-[#1a5f6e] hover:bg-[#145260] text-white">
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Edit Trip
                      </Button>
                    )}
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
        open={!!editGuestId}
        guestId={editGuestId}
        onClose={() => setEditGuestId(null)}
      />

      {/* ── New Booking Wizard ── */}
      <BookingWizard
        open={wizardOpen}
        onOpenChange={v => { setWizardOpen(v); if (!v) setWizardOpenTripId(undefined) }}
        onSuccess={() => { fetchBookings(); fetchOpenTrips() }}
        preselectedDate={selectedDate}
        preselectedOpenTripId={wizardOpenTripId}
      />

    </div>
  )
}
