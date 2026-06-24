'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Calendar as CalendarIcon, List, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Plus, Clock, DollarSign, Pencil, X, Loader2, Check, BookOpen, Anchor, CheckCircle, LayoutGrid, Waves, BedDouble, Crown, UserMinus, UserPlus, Search as SearchIcon, AlertCircle, Maximize2, Minimize2, Users, Trash2, ArrowRightLeft, Printer } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { BookingWizard } from '@/components/bookings/BookingWizard'
import GuestEditSheet from '@/components/customers/GuestEditSheet'
import WaitingListManager from '@/components/bookings/WaitingListManager'
import { cn } from '@/lib/utils'

interface BookingEvent {
  id: string
  yachtName: string
  startDate: string
  endDate: string
  status: 'confirmed' | 'pending' | 'completed' | 'cancelled' | 'on_hold' | 'partially_paid' | 'fully_paid'
  tripType?: 'PRIVATE_CHARTER' | 'OPEN_TRIP'
  customerName?: string
  bookingCode?: string
  totalPrice?: number
  depositAmount?: number
  notes?: string
  salesperson?: string
  salespersonUser?: { name: string | null } | null
  isOwnBooking?: boolean  // undefined = admin/manager (all own), false = SALES viewing others
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
  closedReason?: string | null
  yacht: { name: string }
  cabinStatuses: CabinStatus[]
}

type DbYacht = { id: string; name: string; dailyRate: number }

const STATUS_CONFIG = {
  on_hold:    { label: 'On Hold',    color: '#f97316' },
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

const LANE_H    = 36
const DAY_H     = 40
const MIN_ROW_H = 160

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES   = ['SUN','MON','TUE','WED','THU','FRI','SAT']

// ─── Single-month grid ───────────────────────────────────────────────────────
function MonthGrid({
  year, month, bookings, openTrips, allBookings, allOpenTrips, yachtColorMap, yachtFilter, onDateClick, onBookingClick, onOpenTripClick, isInFilterRange, onPrev, onNext, fillHeight,
}: {
  year: number; month: number
  bookings: BookingEvent[]; openTrips: OpenTripEvent[]
  allBookings?: BookingEvent[]; allOpenTrips?: OpenTripEvent[]
  yachtColorMap: Record<string, string>
  yachtFilter: string
  onDateClick: (d: string) => void
  onBookingClick: (b: BookingEvent) => void
  onOpenTripClick: (t: OpenTripEvent) => void
  isInFilterRange: (dateStr: string) => boolean
  onPrev?: () => void
  onNext?: () => void
  fillHeight?: boolean
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
      showDetails: boolean  // true on the widest segment of this event
    }

    const raw: Omit<Seg, 'lane' | 'laneSpan' | 'showDetails'>[] = []

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

    const bookingBarColor = (status: string) => {
      if (status === 'on_hold')                                                    return '#22c55e'  // green  — hold
      if (status === 'pending')                                                    return '#eab308'  // yellow — waiting payment
      if (['confirmed','partially_paid','fully_paid','completed'].includes(status)) return '#ef4444' // red    — booked/paid
      return '#94a3b8'  // grey — cancelled / unknown
    }

    bookings.forEach(b => addSegs(
      b.id,
      [b.yachtName, b.customerName, b.salespersonUser?.name || b.salesperson, b.status ? b.status.charAt(0).toUpperCase() + b.status.slice(1) : undefined].filter(Boolean).join('  ·  '),
      bookingBarColor(b.status), false, false,
      new Date(b.startDate + 'T00:00:00'), new Date(b.endDate + 'T00:00:00'),
      `[Charter] ${b.yachtName}${b.bookingCode ? ` · ${b.bookingCode}` : ''}${b.customerName ? ` · ${b.customerName}` : ''}${(b.salespersonUser?.name || b.salesperson) ? ` · Sales: ${b.salespersonUser?.name || b.salesperson}` : ''}`,
      b, undefined,
    ))

    openTrips.forEach(t => {
      const isClosed    = t.status === 'closed'
      const isPrivatePC = isClosed && t.closedReason?.includes('Private Charter')
      if (isPrivatePC) return
      const isFull      = t.status === 'full' || (t.status !== 'closed' && t.spotsAvailable === 0)
      const otColor     = isClosed ? '#94a3b8' : isFull ? '#ef4444' : '#22c55e'
      const tooltip     = isClosed ? 'CLOSED' : isFull ? 'SOLD OUT' : `${t.spotsAvailable}/${t.maxCapacity} spots`
      addSegs(
        t.id, t.title, otColor, true, isFull,
        new Date(t.startDate + 'T00:00:00'), new Date(t.endDate + 'T00:00:00'),
        `[Open Trip] ${t.title} · ${t.yacht.name} — ${tooltip}`,
        undefined, t,
      )
    })

    /* Pre-compute which raw segment key is the widest per event (for showDetails) */
    const widestKeyByEvent = new Map<string, string>()
    raw.forEach(seg => {
      const baseId = seg.key.replace(/-w\d+$/, '')
      const existingKey = widestKeyByEvent.get(baseId)
      if (!existingKey) {
        widestKeyByEvent.set(baseId, seg.key)
      } else {
        const existingSeg = raw.find(s => s.key === existingKey)!
        if ((seg.endCol - seg.startCol) > (existingSeg.endCol - existingSeg.startCol)) {
          widestKeyByEvent.set(baseId, seg.key)
        }
      }
    })

    /* Assign lanes — open trips occupy 2 consecutive lanes */
    const result: Seg[][] = weeks.map(() => [])
    weeks.forEach((_, wi) => {
      const segs = raw
        .filter(s => s.weekIdx === wi)
        .sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol))
      const laneEnds: number[] = []
      segs.forEach(seg => {
        const span = (seg.isStripe || !!seg.bookingRef) ? 2 : 1
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
        const baseId = seg.key.replace(/-w\d+$/, '')
        const showDetails = widestKeyByEvent.get(baseId) === seg.key
        result[wi].push({ ...seg, lane, laneSpan: span, showDetails })
      })
    })

    return result
  }, [bookings, openTrips, yachtColorMap, year, month, weeks])

  return (
    <div className={fillHeight ? 'h-full flex flex-col' : 'flex-1 min-w-0'}>
      {!fillHeight && (
        <div className="flex items-center justify-center gap-2 mb-3">
          {onPrev && (
            <button onClick={onPrev} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">
              {MONTH_FULL[month]} {year}
            </p>
            {yachtFilter !== 'all' && (
              <p className="text-xs font-medium mt-0.5" style={{ color: yachtColorMap[yachtFilter] ?? '#64748b' }}>
                {yachtFilter}
              </p>
            )}
          </div>
          {onNext && (
            <button onClick={onNext} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-7">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1.5">{d}</div>
        ))}
      </div>

      <div className={fillHeight ? 'flex-1 flex flex-col border-t border-l border-border overflow-hidden' : 'border-t border-l border-border'}>
        {weeks.map((week, wi) => {
          const maxLaneEnd = segsByWeek[wi].length > 0 ? Math.max(...segsByWeek[wi].map(s => s.lane + s.laneSpan)) : 0
          const rowH = Math.max(MIN_ROW_H, DAY_H + maxLaneEnd * LANE_H + 8)

          return (
            <div key={wi} className="relative" style={fillHeight ? { flex: 1, minHeight: DAY_H + maxLaneEnd * LANE_H + 8 } : { height: rowH }}>

              {/* ── Day cell background layer ── */}
              <div className="absolute inset-0 grid grid-cols-7">
                {week.map((day, col) => {
                  const dateStr    = day > 0 ? `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}` : ''
                  const todayCell  = day > 0 && isToday(day)
                  const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0)
                  const isPast     = day > 0 && new Date(dateStr) <= todayMidnight
                  const inRange    = day > 0 && isInFilterRange(dateStr)
                  // Block clicking on dates already occupied by this yacht's trips
                  // Use allBookings/allOpenTrips (unfiltered by type) so red bg shows regardless of type filter
                  const occupancyBookings  = allBookings  ?? bookings
                  const occupancyOpenTrips = allOpenTrips ?? openTrips
                  const isOccupied = day > 0 && !isPast && yachtFilter !== 'all' && (
                    occupancyBookings.some(b => dateStr >= b.startDate && dateStr <= b.endDate) ||
                    occupancyOpenTrips.some(t => dateStr >= t.startDate && dateStr <= t.endDate)
                  )
                  return (
                    <div
                      key={col}
                      onClick={() => day > 0 && !isPast && !isOccupied && onDateClick(dateStr)}
                      className={cn(
                        'border-r border-b border-border p-1.5 transition-colors',
                        day === 0    ? 'bg-muted/20' :
                        isOccupied  ? 'bg-red-50 dark:bg-red-950/20 cursor-not-allowed' :
                        inRange     ? 'bg-[#bdac7e]/10 cursor-pointer hover:bg-[#bdac7e]/20' :
                        isPast      ? 'bg-muted/10 cursor-not-allowed' :
                                      'cursor-pointer hover:bg-muted/40',
                        todayCell   ? 'ring-2 ring-inset ring-[#bdac7e]' : '',
                      )}
                    >
                      {day > 0 && (
                        <span className={cn(
                          'text-xs font-semibold leading-none',
                          todayCell  ? 'text-[#bdac7e]' :
                          isOccupied ? 'text-red-400' :
                          inRange    ? 'text-[#8a7a55]' :
                          isPast     ? 'text-muted-foreground/40' :
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
                  height: seg.laneSpan * LANE_H - 12,
                  borderRadius: seg.isRealStart && seg.isRealEnd ? 4
                    : seg.isRealStart ? '4px 0 0 4px'
                    : seg.isRealEnd   ? '0 4px 4px 0'
                    : 0,
                  color: 'white',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'flex-start',
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

                const isPrivatePCBar = !!seg.openTripRef && seg.openTripRef.status === 'closed' && seg.openTripRef.closedReason?.includes('Private Charter')
                const isOthersSalesBooking = seg.bookingRef?.isOwnBooking === false

                return (
                  <div
                    key={seg.key}
                    style={{
                      ...style,
                      cursor: (isPrivatePCBar || isOthersSalesBooking) ? 'default' : 'pointer',
                      opacity: isOthersSalesBooking ? 0.72 : 1,
                    }}
                    title={isOthersSalesBooking
                      ? `Booked by ${seg.bookingRef ? (seg.bookingRef.salespersonUser?.name || seg.bookingRef.salesperson) ?? 'other sales' : 'other sales'}`
                      : seg.tooltip
                    }
                    onClick={e => {
                      e.stopPropagation()
                      if (isPrivatePCBar || isOthersSalesBooking) return
                      if (seg.bookingRef) onBookingClick(seg.bookingRef)
                      else if (seg.openTripRef) onOpenTripClick(seg.openTripRef)
                    }}
                  >
                    {!seg.showDetails && (
                      /* Non-detail bar — show condensed label so user can identify the event */
                      seg.bookingRef ? (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 8px', overflow: 'hidden' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}>
                            {isOthersSalesBooking
                              ? `↳ Booked · ${(seg.bookingRef.salespersonUser?.name || seg.bookingRef.salesperson) ?? 'sales'}`
                              : `↳ ${seg.bookingRef.customerName || seg.bookingRef.yachtName}`
                            }
                          </span>
                        </div>
                      ) : seg.openTripRef ? (
                        <div style={{ margin: '2px 4px', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 4, padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 4, maxWidth: 'calc(100% - 8px)', overflow: 'hidden', alignSelf: 'flex-start' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            ↳ {seg.openTripRef.title}
                          </span>
                        </div>
                      ) : null
                    )}
                    {seg.showDetails && isOthersSalesBooking && (() => {
                      const bk = seg.bookingRef!
                      const STATUS_BADGE: Record<string, { bg: string; label: string }> = {
                        on_hold:        { bg: 'rgba(249,115,22,0.85)', label: 'ON HOLD'   },
                        pending:        { bg: 'rgba(234,179,8,0.85)',  label: 'PENDING'   },
                        confirmed:      { bg: 'rgba(34,197,94,0.85)',  label: 'CONFIRMED' },
                        partially_paid: { bg: 'rgba(59,130,246,0.85)', label: 'PARTIAL'   },
                        fully_paid:     { bg: 'rgba(16,185,129,0.85)', label: 'PAID'      },
                        completed:      { bg: 'rgba(139,92,246,0.85)', label: 'DONE'      },
                        cancelled:      { bg: 'rgba(239,68,68,0.85)',  label: 'CANCELLED' },
                      }
                      const sbadge = STATUS_BADGE[bk.status] ?? { bg: 'rgba(0,0,0,0.25)', label: bk.status.toUpperCase() }
                      return (
                        /* Non-owned booking: show "Booked by [salesperson]" + status — no customer details */
                        <div style={{
                          position: 'absolute', inset: 0,
                          display: 'flex', flexDirection: 'column', justifyContent: 'center',
                          padding: '0 10px', overflow: 'hidden',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.95)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              flexShrink: 1, minWidth: 0, textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                            }}>
                              🔒 Booked by {(bk.salespersonUser?.name || bk.salesperson) ?? 'Other Sales'}
                            </span>
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: 'white',
                              background: sbadge.bg, borderRadius: 3, padding: '1px 5px',
                              whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: 0.4,
                            }}>
                              {sbadge.label}
                            </span>
                          </div>
                          {bk.yachtName && (
                            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)', fontWeight: 500, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {bk.yachtName}
                            </span>
                          )}
                        </div>
                      )
                    })()}
                    {seg.showDetails && !isOthersSalesBooking && (
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
                            {ot.status === 'closed' && !ot.closedReason?.includes('Private Charter') && (
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
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px' }}>
                            {(ot.cabinStatuses ?? []).map(c => {
                              const isTripClosed = ot.status === 'closed'
                              // Dot color follows booking status legend
                              const bs = c.bookingStatus
                              const dotColor = bs === null
                                ? (isTripClosed ? '#94a3b8' : '#ffffff')                                         // empty: grey if closed, white if open
                                : bs === 'on_hold'
                                  ? '#22c55e'                                                                     // hold → green
                                  : bs === 'pending'
                                    ? '#eab308'                                                                   // waiting payment → yellow
                                    : '#ef4444'                                                                   // confirmed/paid → red
                              const dotBorder = dotColor === '#ffffff' ? '1.5px solid #475569' : 'none'
                              return (
                                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor, border: dotBorder, flexShrink: 0, boxSizing: 'border-box' }} />
                                  <span style={{ fontSize: 9, color: '#334155', whiteSpace: 'nowrap', fontWeight: 600 }}>{c.name.replace(/\s*cabin\s*$/i, '')}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        /* Private charter — white text on solid color bar */
                        (() => {
                          const bk = seg.bookingRef
                          if (!bk) return (
                            <span style={{ fontSize: 9, fontWeight: 600, color: 'white', padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {seg.label}
                            </span>
                          )
                          const STATUS_BADGE: Record<string, { bg: string; label: string }> = {
                            pending:         { bg: 'rgba(234,179,8,0.85)',   label: 'PENDING'   },
                            confirmed:       { bg: 'rgba(34,197,94,0.85)',   label: 'CONFIRMED' },
                            partially_paid:  { bg: 'rgba(59,130,246,0.85)',  label: 'PARTIAL'   },
                            fully_paid:      { bg: 'rgba(16,185,129,0.85)',  label: 'PAID'      },
                            completed:       { bg: 'rgba(139,92,246,0.85)',  label: 'DONE'      },
                            cancelled:       { bg: 'rgba(239,68,68,0.85)',   label: 'CANCELLED' },
                          }
                          const sbadge = STATUS_BADGE[bk.status] ?? { bg: 'rgba(0,0,0,0.25)', label: bk.status.toUpperCase() }
                          return (
                            <div style={{
                              position: 'absolute', inset: 0,
                              display: 'flex', flexDirection: 'column', justifyContent: 'center',
                              padding: '0 10px',
                              overflow: 'hidden',
                            }}>
                              {/* Row 1: Yacht name + status */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                                <span style={{
                                  fontSize: 11, fontWeight: 700, color: 'white',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  flexShrink: 1, minWidth: 0,
                                  textShadow: '0 1px 2px rgba(0,0,0,0.25)',
                                }}>
                                  {bk.customerName || bk.yachtName}
                                </span>
                                <span style={{
                                  fontSize: 9, fontWeight: 700,
                                  color: 'white',
                                  background: sbadge.bg,
                                  borderRadius: 3, padding: '1px 5px',
                                  whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: 0.4,
                                }}>
                                  {sbadge.label}
                                </span>
                              </div>
                              {/* Row 2: Yacht name + salesperson */}
                              {(bk.yachtName || bk.salespersonUser?.name || bk.salesperson) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, marginTop: 2 }}>
                                  {bk.yachtName && (
                                    <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>
                                      {bk.yachtName}
                                    </span>
                                  )}
                                  {bk.yachtName && (bk.salespersonUser?.name || bk.salesperson) && (
                                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, flexShrink: 0 }}>·</span>
                                  )}
                                  {(bk.salespersonUser?.name || bk.salesperson) && (
                                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>
                                      {bk.salespersonUser?.name || bk.salesperson}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })()
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
  const userRole = (session?.user as { role?: string })?.role ?? ''
  const userId   = (session?.user as { id?: string })?.id   ?? ''
  const isAdmin  = ['ADMIN', 'SUPER_ADMIN'].includes(userRole)
  const canEdit = ['ADMIN', 'SALES'].includes(userRole)

  const [currentDate, setCurrentDate]   = useState(new Date())
  const [viewMode, setViewMode]         = useState<'calendar' | 'list'>('calendar')
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    document.body.style.overflow = isFullscreen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isFullscreen])
  const [bookings, setBookings]         = useState<BookingEvent[]>([])
  const [cancelledOtCabins, setCancelledOtCabins] = useState<{ yachtName: string; count: number }[]>([])
  const [yachts, setYachts]             = useState<DbYacht[]>([])
  const [loading, setLoading]           = useState(true)
  const [openTrips, setOpenTrips]       = useState<OpenTripEvent[]>([])
  const [tripFilter, setTripFilter]     = useState<'all' | 'PRIVATE_CHARTER' | 'OPEN_TRIP'>('all')
  const [yachtFilter, setYachtFilter]   = useState<string>('Samara I')

  /* date filter */
  const [filterMode, setFilterMode]     = useState<'single' | 'range'>('single')
  const [filterFrom, setFilterFrom]     = useState(todayStr())
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false)
  const [dateBtnRect, setDateBtnRect] = useState<DOMRect | null>(null)
  const [filterTo,   setFilterTo]       = useState(todayStr())
  const [filterActive, setFilterActive] = useState(false)
  const [selectedBooking, setSelectedBooking]   = useState<BookingEvent | null>(null)
  const [isDetailOpen, setIsDetailOpen]         = useState(false)
  const [wizardOpen, setWizardOpen]             = useState(false)
  const [selectedDate, setSelectedDate]         = useState('')
  const [wizardOpenTripId, setWizardOpenTripId] = useState<string | undefined>(undefined)
  const [wizardYachtId, setWizardYachtId]       = useState<string | undefined>(undefined)
  const [completeBookingId, setCompleteBookingId] = useState<string | undefined>(undefined)
  const [otDetailOpen, setOtDetailOpen]         = useState(false)
  const [otDetail, setOtDetail]                 = useState<any>(null)
  const [otDetailLoading, setOtDetailLoading]   = useState(false)
  const [wlBooking, setWlBooking]               = useState<{ id: string; code: string; startDate: string; endDate: string; yachtId?: string; openTripId?: string } | null>(null)
  const [selectedCabinCtx, setSelectedCabinCtx] = useState<{ cabinId: string; bookingId: string; isFull: boolean; isOwnCabin: boolean } | null>(null)
  const [detailAddingGuest, setDetailAddingGuest] = useState(false)

  /* ── Print ── */
  const [printModalOpen,  setPrintModalOpen]  = useState(false)
  const [printYacht,      setPrintYacht]      = useState<string>('')
  const [printFromMonth,  setPrintFromMonth]  = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })
  const [printToMonth,    setPrintToMonth]    = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })

  // Booking edit state
  const [isBookingEditing, setIsBookingEditing] = useState(false)
  const [bookingEditForm, setBookingEditForm]   = useState({
    status: '', totalPrice: '', depositPaid: '', discount: '',
    notes: '', destination: '', salesperson: '', guestCount: '',
    startDate: '', endDate: '', depositDueDate: '', finalDueDate: '',
  })
  const [bookingFullDetail, setBookingFullDetail] = useState<any>(null)
  const [bookingDetailLoading, setBookingDetailLoading] = useState(false)
  const [bookingSaving, setBookingSaving]        = useState(false)
  // Guest management
  const [guestEditTarget, setGuestEditTarget]    = useState<any>(null)
  const [guestSheetOpen,  setGuestSheetOpen]     = useState(false)
  const [statsCollapsed,  setStatsCollapsed]     = useState(false)
  const [guestSearchQ,    setGuestSearchQ]       = useState('')
  const [guestSearchRes,  setGuestSearchRes]     = useState<any[]>([])
  const [guestSearching,  setGuestSearching]     = useState(false)
  const [addingGuest,     setAddingGuest]        = useState(false)

  const [otAddCabinId,    setOtAddCabinId]       = useState<string | null>(null)
  const [otAddBookingId,  setOtAddBookingId]     = useState<string | null>(null)
  const [otAddQ,          setOtAddQ]             = useState('')
  const [otAddResults,    setOtAddResults]       = useState<any[]>([])
  const [otAddSearching,  setOtAddSearching]     = useState(false)
  const [otAddSaving,     setOtAddSaving]        = useState(false)

  // Delete / replace guest
  const [deletingGuestId,  setDeletingGuestId]  = useState<string | null>(null)
  const [replacingGuestId, setReplacingGuestId] = useState<string | null>(null)
  const [replaceQ,         setReplaceQ]         = useState('')
  const [replaceResults,   setReplaceResults]   = useState<any[]>([])
  const [replaceSearching, setReplaceSearching] = useState(false)
  const [replaceSaving,    setReplaceSaving]    = useState(false)

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

  const handleCabinClick = useCallback(async (c: any) => {
    if (!c.bookingId) {
      // Available cabin — open booking wizard for this trip
      setWizardOpenTripId(otDetail?.id)
      setWizardOpen(true)
      return
    }
    // Booked cabin — show booking detail
    setSelectedBooking({
      id:          c.bookingId,
      yachtName:   otDetail?.yacht?.name ?? '',
      startDate:   otDetail?.startDate ?? '',
      endDate:     otDetail?.endDate   ?? '',
      status:      c.bookingStatus as BookingEvent['status'],
      tripType:    'OPEN_TRIP',
      customerName: c.guests?.[0]?.name ?? '—',
      bookingCode:  c.bookingCode ?? undefined,
      salesperson:  c.salesperson ?? undefined,
      isOwnBooking: isAdmin ? undefined : (c.salespersonId === userId),
    })
    setSelectedCabinCtx({
      cabinId:    c.id,
      bookingId:  c.bookingId,
      isFull:     !!c.isFull,
      isOwnCabin: isAdmin || !c.salespersonId || c.salespersonId === userId,
    })
    setDetailAddingGuest(false)
    setIsDetailOpen(true)
    setBookingDetailLoading(true)
    setBookingFullDetail(null)
    try {
      const data = await fetch(`/api/bookings/${c.bookingId}`).then(r => r.json())
      setBookingFullDetail(data)
      setSelectedBooking(prev => prev ? {
        ...prev,
        totalPrice:      data.totalPrice,
        depositAmount:   data.depositPaid,
        notes:           data.notes,
        salespersonUser: data.salespersonUser,
      } : prev)
    } finally {
      setBookingDetailLoading(false)
    }
  }, [otDetail])

  const startBookingEdit = useCallback(async () => {
    if (!selectedBooking) return
    setIsBookingEditing(true)
    setBookingDetailLoading(true)
    try {
      const data = await fetch(`/api/bookings/${selectedBooking.id}`).then(r => r.json())
      setBookingFullDetail(data)
      setBookingEditForm({
        status:        data.status ?? '',
        totalPrice:    String(data.totalPrice ?? ''),
        depositPaid:   String(data.depositPaid ?? ''),
        discount:      String(data.discount ?? '0'),
        notes:         data.notes ?? '',
        destination:   data.destination ?? '',
        salesperson:   data.salesperson ?? '',
        guestCount:    String(data.guestCount ?? ''),
        startDate:     data.startDate?.split('T')[0] ?? '',
        endDate:       data.endDate?.split('T')[0]   ?? '',
        depositDueDate: data.depositDueDate?.split('T')[0] ?? '',
        finalDueDate:   data.finalDueDate?.split('T')[0]   ?? '',
      })
    } finally {
      setBookingDetailLoading(false)
    }
  }, [selectedBooking])

  const saveBooking = useCallback(async () => {
    if (!selectedBooking) return
    setBookingSaving(true)
    try {
      const res = await fetch(`/api/bookings/${selectedBooking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status:         bookingEditForm.status,
          totalPrice:     bookingEditForm.totalPrice,
          discount:       bookingEditForm.discount,
          notes:          bookingEditForm.notes,
          destination:    bookingEditForm.destination,
          startDate:      bookingEditForm.startDate,
          endDate:        bookingEditForm.endDate,
          depositDueDate: bookingEditForm.depositDueDate || null,
          finalDueDate:   bookingEditForm.finalDueDate   || null,
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
      const data = await fetch('/api/bookings?view=calendar').then(r => r.json())
      const rawData = Array.isArray(data) ? data : []
      // Track cancelled open-trip cabins separately (filtered out below)
      setCancelledOtCabins(
        rawData
          .filter((b: any) => b.status === 'cancelled' && b.tripType === 'OPEN_TRIP')
          .map((b: any) => ({ yachtName: b.yacht?.name ?? '', count: b.guestCount ?? 1 }))
      )
      setBookings(
        rawData
          .filter((b: any) => b.status !== 'cancelled')
          .map((b: any) => ({
            id: b.id, yachtName: b.yacht?.name ?? '',
            startDate: b.startDate.split('T')[0], endDate: b.endDate.split('T')[0],
            status: b.status, tripType: b.tripType,
            customerName: b.customer?.name, bookingCode: b.bookingCode,
            totalPrice: b.totalPrice, depositAmount: b.depositPaid, notes: b.notes ?? undefined,
            salesperson: b.salesperson ?? undefined, salespersonUser: b.salespersonUser ?? null,
            isOwnBooking: b.isOwnBooking,  // undefined for admin/manager, true/false for SALES
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

  /* Auto switch to list view on small screens */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setViewMode('list') }
    if (mq.matches) setViewMode('list')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

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

  const handlePrint = () => {
    const [fy, fm] = printFromMonth.split('-').map(Number)
    const [ty, tm] = printToMonth.split('-').map(Number)
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

    // Build list of months to print
    const months: { year: number; month: number }[] = []
    let cy = fy, cm = fm - 1
    const endY = ty, endM = tm - 1
    while (cy < endY || (cy === endY && cm <= endM)) {
      months.push({ year: cy, month: cm })
      cm++; if (cm > 11) { cm = 0; cy++ }
    }

    if (!printYacht) { toast.error('Please select a vessel'); return }
    const filteredBookings = bookings.filter(b => b.yachtName === printYacht)
    const filteredTrips    = openTrips.filter(t => t.yacht.name === printYacht)

    const calendarHtml = months.map(({ year, month }) => {
      const firstDay = new Date(year, month, 1).getDay()
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const offset = (firstDay + 6) % 7 // Mon-start
      const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
      while (cells.length % 7 !== 0) cells.push(null)

      const weeks: (number | null)[][] = []
      for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

      const rows = weeks.map(week => {
        const tds = week.map(day => {
          if (!day) return '<td style="background:#f9fafb;"></td>'
          const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
          const evts  = filteredBookings.filter(b => b.startDate <= dateStr && b.endDate > dateStr)
          const trips = filteredTrips.filter(t => t.startDate <= dateStr && t.endDate > dateStr)
          const badges = [
            ...evts.map(b => {
              const color = yachtColorMap[b.yachtName] ?? '#64748b'
              const sales = b.salespersonUser?.name || b.salesperson
              const label = `${b.customerName || b.bookingCode || b.yachtName}${sales ? ` <span style="opacity:0.65;">by ${sales}</span>` : ''}`
              return `<div class="evt" style="background:${color}22;border-left:3px solid ${color};color:${color};">${label}</div>`
            }),
            ...trips.map(t => {
              const color = yachtColorMap[t.yacht.name] ?? '#8b5cf6'
              return `<div class="evt" style="background:${color}22;border-left:3px dashed ${color};color:${color};">[OT] ${t.title}</div>`
            }),
          ].join('')
          return `<td><div class="day-num">${day}</div>${badges}</td>`
        }).join('')
        return `<tr>${tds}</tr>`
      }).join('')

      return `
        <div class="month-page">
          <div class="page-header">
            <div class="page-header-left">
              <img src="https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png" alt="Samara" />
              <div>
                <div class="sub">Schedule</div>
                <h2>${MONTH_NAMES[month]} ${year} &mdash; ${printYacht}</h2>
              </div>
            </div>
            <div style="font-size:10px;color:#9ca3af;">Printed ${new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>
          </div>
          <table>
            <thead><tr>${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => `<th>${d}</th>`).join('')}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`
    }).join('')

    const w = window.open('', '_blank', 'width=1100,height=800')
    if (!w) { toast.error('Popup blocked — allow popups and try again'); return }
    w.document.write(`<!DOCTYPE html><html><head><title>Calendar Print</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; background: #fff; }
        .month-page { break-before: page; break-inside: avoid; display: flex; flex-direction: column; min-height: 100vh; padding: 10mm 14mm 8mm; }
        .month-page:first-child { break-before: avoid; }
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8mm; padding-bottom: 4mm; border-bottom: 2px solid #bdac7e; }
        .page-header-left { display: flex; align-items: center; gap: 12px; }
        .page-header img { height: 44px; object-fit: contain; }
        .page-header h2 { font-size: 17px; font-weight: 700; color: #1f2937; }
        .page-header .sub { font-size: 11px; color: #9ca3af; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; flex: 1; }
        th { border: 1px solid #e5e7eb; padding: 7px 4px; text-align: center; font-size: 11px; font-weight: 600; color: #6b7280; background: #f9fafb; }
        td { border: 1px solid #e5e7eb; padding: 6px; vertical-align: top; height: 80px; }
        .day-num { font-weight: 700; font-size: 12px; color: #374151; margin-bottom: 3px; }
        .evt { font-size: 9px; padding: 2px 5px; margin-top: 2px; border-radius: 3px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        @page { size: A4 landscape; margin: 0; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body>
      ${calendarHtml}
      <script>window.onload = function(){ window.print(); }<\/script>
    </body></html>`)
    w.document.close()
    setPrintModalOpen(false)
  }

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

    // Block if clicked date is occupied by a trip for the currently filtered yacht
    if (yachtFilter !== 'all') {
      const occupied =
        bookings.some(b =>
          b.yachtName === yachtFilter &&
          b.status !== 'cancelled' &&
          dateStr >= b.startDate.slice(0, 10) &&
          dateStr <= b.endDate.slice(0, 10)
        ) ||
        openTrips.some(t =>
          t.yacht?.name === yachtFilter &&
          t.status !== 'cancelled' &&
          dateStr >= t.startDate.slice(0, 10) &&
          dateStr <= t.endDate.slice(0, 10)
        )
      if (occupied) {
        toast.error(`${yachtFilter} already has a booking on this date.`)
        return
      }
    }

    setSelectedDate(dateStr)
    setWizardYachtId(yachtFilter !== 'all' ? (yachts.find(y => y.name === yachtFilter)?.id) : undefined)
    setWizardOpen(true)
  }

  const getDays = (s: string, e: string) =>
    Math.ceil((new Date(e).getTime() - new Date(s).getTime()) / 86400000)

  // ── Guest management helpers ─────────────────────────────────────────
  const reloadBookingDetail = useCallback(async () => {
    if (!selectedBooking) return
    const data = await fetch(`/api/bookings/${selectedBooking.id}`).then(r => r.json())
    setBookingFullDetail(data)
  }, [selectedBooking])

  const handleSetLead = useCallback((guestId: string) => {
    // Optimistic update — flip isLead instantly in local state
    setBookingFullDetail((prev: any) => {
      if (!prev) return prev
      return {
        ...prev,
        guests: prev.guests.map((g: any) => ({ ...g, isLead: g.id === guestId })),
      }
    })
    // Fire API in background
    fetch(`/api/guests/${guestId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isLead: true }),
    })
  }, [])

  const handleRemoveGuest = useCallback(async (guestId: string) => {
    await fetch(`/api/guests/${guestId}`, { method: 'DELETE' })
    await reloadBookingDetail()
  }, [reloadBookingDetail])

  const handleCabinChange = useCallback(async (guestId: string, cabinId: string) => {
    await fetch(`/api/guests/${guestId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cabinId: cabinId || null }),
    })
    await reloadBookingDetail()
  }, [reloadBookingDetail])

  const searchGuests = useCallback(async (q: string) => {
    if (!q.trim()) { setGuestSearchRes([]); return }
    setGuestSearching(true)
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}`).then(r => r.json())
      setGuestSearchRes(Array.isArray(res) ? res.slice(0, 8) : [])
    } finally { setGuestSearching(false) }
  }, [])

  const handleAddGuest = useCallback(async (customerId: string) => {
    if (!bookingFullDetail) return
    setAddingGuest(true)
    try {
      await fetch('/api/guests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: bookingFullDetail.id, customerId, isLead: false }),
      })
      await reloadBookingDetail()
      setGuestSearchQ('')
      setGuestSearchRes([])
    } finally { setAddingGuest(false) }
  }, [bookingFullDetail, reloadBookingDetail])

  const searchOtGuest = useCallback(async (q: string) => {
    setOtAddQ(q)
    if (!q.trim()) { setOtAddResults([]); return }
    setOtAddSearching(true)
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}`).then(r => r.json())
      setOtAddResults(Array.isArray(res) ? res.slice(0, 6) : [])
    } finally { setOtAddSearching(false) }
  }, [])

  const addGuestToOtBooking = useCallback(async (customerId: string) => {
    if (!otAddBookingId || !otAddCabinId || !otDetail) return
    setOtAddSaving(true)
    try {
      await fetch('/api/guests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: otAddBookingId, customerId, cabinId: otAddCabinId, isLead: false }),
      })
      const updated = await fetch(`/api/open-trips/${otDetail.id}`).then(r => r.json())
      setOtDetail(updated)
      setOtAddCabinId(null); setOtAddBookingId(null); setOtAddQ(''); setOtAddResults([])
    } finally { setOtAddSaving(false) }
  }, [otAddBookingId, otAddCabinId, otDetail])

  const handleDeleteGuest = useCallback(async (guestId: string, bookingId: string) => {
    setDeletingGuestId(guestId)
    try {
      await fetch(`/api/bookings/${bookingId}/guests`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingGuestId: guestId }),
      })
      const updated = await fetch(`/api/bookings/${bookingId}`).then(r => r.json())
      setBookingFullDetail(updated)
    } finally { setDeletingGuestId(null) }
  }, [])

  const searchReplaceGuest = useCallback(async (q: string) => {
    setReplaceQ(q)
    if (!q.trim()) { setReplaceResults([]); return }
    setReplaceSearching(true)
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}`).then(r => r.json())
      setReplaceResults(Array.isArray(res) ? res.slice(0, 6) : [])
    } finally { setReplaceSearching(false) }
  }, [])

  const handleReplaceGuest = useCallback(async (guestId: string, customerId: string, bookingId: string) => {
    setReplaceSaving(true)
    try {
      await fetch(`/api/guests/${guestId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId }),
      })
      const updated = await fetch(`/api/bookings/${bookingId}`).then(r => r.json())
      setBookingFullDetail(updated)
      setReplacingGuestId(null); setReplaceQ(''); setReplaceResults([])
    } finally { setReplaceSaving(false) }
  }, [])

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
      {(() => {
        const todayDate = new Date(); todayDate.setHours(0,0,0,0)
        const filterOtByYacht = (t: OpenTripEvent) => yachtFilter === 'all' || t.yacht?.name === yachtFilter
        const isNotPrivatePC = (t: OpenTripEvent) => !(t.status === 'closed' && t.closedReason?.toLowerCase().includes('private'))
        const activeTrips  = openTrips.filter(t => filterOtByYacht(t) && isNotPrivatePC(t) && new Date(t.startDate) > todayDate && t.status !== 'closed')
        const closedTrips  = openTrips.filter(t => filterOtByYacht(t) && isNotPrivatePC(t) && (new Date(t.startDate) <= todayDate || t.status === 'closed'))
        const filteredOt   = openTrips.filter(t => filterOtByYacht(t) && isNotPrivatePC(t))
        const activeCabins    = activeTrips.reduce((s, t) => s + t.spotsAvailable, 0)
        const cancelledCabins = cancelledOtCabins
          .filter(b => yachtFilter === 'all' || b.yachtName === yachtFilter)
          .reduce((s, b) => s + b.count, 0)
        const totalCabins     = filteredOt.reduce((s, t) => s + t.maxCapacity, 0)
        const bookedCabins    = filteredOt.reduce((s, t) => s + (t.maxCapacity - t.spotsAvailable), 0)
        const closedCabins    = Math.max(0, closedTrips.reduce((s, t) => s + t.spotsAvailable, 0) - cancelledCabins)
        const viewYear  = currentDate.getFullYear()
        const viewMonth = currentDate.getMonth()
        const yachtLabel = yachtFilter === 'all' ? 'All Yachts' : yachtFilter
        const yachtColor = yachtFilter !== 'all' ? (yachtColorMap[yachtFilter] ?? '#64748b') : '#64748b'
        const filterByYacht = (b: BookingEvent) => yachtFilter === 'all' || b.yachtName === yachtFilter
        const inViewMonth = (b: BookingEvent) => {
          const start = new Date(b.startDate + 'T00:00:00')
          const end   = new Date(b.endDate   + 'T00:00:00')
          const mStart = new Date(viewYear, viewMonth, 1)
          const mEnd   = new Date(viewYear, viewMonth + 1, 0)
          return start <= mEnd && end >= mStart
        }
        const isPC = (b: BookingEvent) => b.tripType === 'PRIVATE_CHARTER'
        const activeBookings = bookings.filter(b => filterByYacht(b) && isPC(b) && (b.status === 'confirmed' || b.status === 'pending') && inViewMonth(b)).length
        const completedTrips = bookings.filter(b => filterByYacht(b) && isPC(b) && b.status === 'completed' && inViewMonth(b)).length
        const yearBookings   = bookings.filter(b => {
          if (!filterByYacht(b) || !isPC(b) || b.status === 'cancelled') return false
          const s = new Date(b.startDate + 'T00:00:00')
          const e = new Date(b.endDate   + 'T00:00:00')
          return s.getFullYear() === viewYear || e.getFullYear() === viewYear
        }).length
        return (
          <div className="space-y-3">
            {/* Single unified stats row */}
            <div className="rounded-2xl overflow-hidden border bg-slate-50">
              {/* Header bar */}
              <button
                onClick={() => setStatsCollapsed(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3 border-b bg-white hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: yachtColor }} />
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Showing data for</span>
                  <span className="text-xs font-bold" style={{ color: yachtColor }}>{yachtLabel}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400">{MONTH_SHORT[viewMonth]} {viewYear}</span>
                  {statsCollapsed
                    ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    : <ChevronUp className="h-3.5 w-3.5 text-slate-400" />}
                </div>
              </button>

              {/* Stats body — collapsible */}
              {!statsCollapsed && <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 bg-white">
                {/* Active Bookings */}
                <div className="px-4 sm:px-6 py-4 sm:py-5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Private Charter</span>
                  </div>
                  <div className="flex items-center gap-2 mb-3 mt-2">
                    <BookOpen className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Active Bookings</span>
                  </div>
                  <p className="text-3xl sm:text-4xl font-black text-slate-800 leading-none">{activeBookings}</p>
                  <p className="text-[11px] text-slate-400 mt-2">confirmed & pending · {MONTH_SHORT[viewMonth]} {viewYear}</p>
                </div>
                {/* Total Bookings */}
                <div className="px-4 sm:px-6 py-4 sm:py-5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Private Charter</span>
                  </div>
                  <div className="flex items-center gap-2 mb-3 mt-2">
                    <Anchor className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Total Bookings</span>
                  </div>
                  <p className="text-3xl sm:text-4xl font-black text-slate-800 leading-none">{yearBookings}</p>
                  <p className="text-[11px] text-slate-400 mt-2">all of {viewYear}</p>
                </div>
                {/* Completed Trips */}
                <div className="px-4 sm:px-6 py-4 sm:py-5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Private Charter</span>
                  </div>
                  <div className="flex items-center gap-2 mb-3 mt-2">
                    <CheckCircle className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Completed Trips</span>
                  </div>
                  <p className="text-3xl sm:text-4xl font-black text-slate-800 leading-none">{completedTrips}</p>
                  <p className="text-[11px] text-slate-400 mt-2">{MONTH_SHORT[viewMonth]} {viewYear}</p>
                </div>
              </div>}

              {!statsCollapsed && <>
              {/* Divider */}
              <div className="border-t border-slate-200 mx-5" />

              {/* Open Trip Cabins sub-row */}
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <BedDouble className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Open Trip</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Cabin Overview</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <LayoutGrid className="h-3.5 w-3.5 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-medium">Total Cabins</p>
                      <p className="text-xl font-bold text-slate-700 leading-none">{totalCabins}</p>
                      <p className="text-[10px] text-slate-400">all open trips</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 xl:border-x xl:border-slate-200 xl:px-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <Waves className="h-3.5 w-3.5 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-medium">Available Cabins</p>
                      <p className="text-xl font-bold text-slate-700 leading-none">{activeCabins}</p>
                      <p className="text-[10px] text-slate-400">open to book</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 xl:border-r xl:border-slate-200 xl:pr-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <CheckCircle className="h-3.5 w-3.5 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-medium">Booked Cabins</p>
                      <p className="text-xl font-bold text-slate-700 leading-none">{bookedCabins}</p>
                      <p className="text-[10px] text-slate-400">confirmed / paid</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 xl:border-r xl:border-slate-200 xl:pr-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <BedDouble className="h-3.5 w-3.5 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-medium">Closed Cabins</p>
                      <p className="text-xl font-bold text-slate-700 leading-none">{closedCabins}</p>
                      <p className="text-[10px] text-slate-400">past / closed trips</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50">
                      <UserMinus className="h-3.5 w-3.5 text-red-400" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-medium">Cancelled Cabins</p>
                      <p className="text-xl font-bold leading-none" style={{ color: cancelledCabins > 0 ? '#ef4444' : '#cbd5e1' }}>{cancelledCabins}</p>
                      <p className="text-[10px] text-slate-400">was booked, now free</p>
                    </div>
                  </div>
                </div>
              </div>
              </>}
            </div>
          </div>
        )
      })()}

      {/* ── Calendar card ── */}
      <Card className="w-full">
        {/* Top nav — single row: year left · months center · icons right */}
        <div className="flex items-center gap-2 px-3 sm:px-5 py-2 border-b">

          {/* Year selector */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => jumpYear('prev')}
              className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="bg-[#bdac7e] text-white text-xs font-semibold px-3 py-1 rounded-full min-w-[52px] text-center select-none">
              {currentDate.getFullYear()}
            </span>
            <button onClick={() => jumpYear('next')}
              className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Month tabs — centered */}
          <div className="flex flex-1 justify-center gap-0.5 overflow-x-auto min-w-0">
            {MONTH_SHORT.map((m, i) => (
              <button key={m} onClick={() => jumpToMonth(i)}
                className={[
                  'px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                  leftMonth === i ? 'bg-[#bdac7e] text-white' : 'text-muted-foreground hover:bg-muted',
                ].join(' ')}>
                {m}
              </button>
            ))}
          </div>

          {/* View toggle + fullscreen */}
          <div className="flex items-center gap-1 shrink-0">
            {([['calendar', CalendarIcon], ['list', List]] as const).map(([mode, Icon]) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={[
                  'p-1.5 rounded-full border transition-colors',
                  viewMode === mode
                    ? 'bg-[#bdac7e] text-white border-[#bdac7e]'
                    : 'border-border text-muted-foreground hover:bg-muted',
                ].join(' ')}>
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
            <button onClick={() => setIsFullscreen(true)} title="Full screen"
              className="p-1.5 rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors">
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setPrintModalOpen(true)} title="Print calendar"
              className="p-1.5 rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors">
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

        {/* Toolbar — single compact bar */}
        <div className="border-b bg-white">
          <div className="flex items-center gap-0 px-3 sm:px-5 py-0 overflow-x-auto scrollbar-none divide-x divide-border">

            {/* Group: Yacht */}
            <div className="flex items-center gap-1.5 pr-4 py-2.5 shrink-0">
              <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mr-1 shrink-0">Yacht</span>
              {(() => {
                const ORDER = ['Samara I', 'Samara II', 'Mischief', 'Otium']
                return [...yachts].sort((a, b) => {
                  const ai = ORDER.indexOf(a.name), bi = ORDER.indexOf(b.name)
                  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
                }).map(y => {
                  const color  = yachtColorMap[y.name] ?? '#64748b'
                  const active = yachtFilter === y.name
                  return (
                    <button key={y.id} onClick={() => setYachtFilter(y.name)}
                      className={['h-6 flex items-center gap-1 px-2.5 rounded-full text-[11px] font-medium transition-all shrink-0 whitespace-nowrap',
                        active ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'].join(' ')}
                      style={active ? { backgroundColor: color } : {}}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: active ? 'rgba(255,255,255,0.7)' : color }} />
                      {y.name}
                    </button>
                  )
                })
              })()}
            </div>

            {/* Group: Type */}
            <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0">
              <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mr-1 shrink-0">Type</span>
              {([
                { val: 'all',             label: 'All' },
                { val: 'PRIVATE_CHARTER', label: 'Private Charter' },
                { val: 'OPEN_TRIP',       label: 'Open Trip' },
              ] as const).map(f => (
                <button key={f.val} onClick={() => setTripFilter(f.val)}
                  className={['h-6 px-2.5 rounded-full text-[11px] font-medium transition-all shrink-0 whitespace-nowrap',
                    tripFilter === f.val ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'].join(' ')}
                  style={tripFilter === f.val ? { backgroundColor: '#bdac7e' } : {}}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Group: Date — compact dropdown */}
            <div className="relative flex items-center px-4 py-2.5 shrink-0">
              <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mr-2 shrink-0">Date</span>
              <button
                onClick={e => { setDateBtnRect((e.currentTarget as HTMLButtonElement).getBoundingClientRect()); setDateDropdownOpen(v => !v) }}
                className={[
                  'h-6 flex items-center gap-1.5 px-2.5 rounded-full text-[11px] font-medium transition-all shrink-0 whitespace-nowrap',
                  filterActive ? 'text-white' : 'text-slate-500 hover:bg-slate-100',
                ].join(' ')}
                style={filterActive ? { backgroundColor: '#bdac7e' } : {}}
              >
                <CalendarIcon className="h-3 w-3" />
                {filterActive
                  ? (filterFrom === filterTo
                    ? new Date(filterFrom+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})
                    : `${new Date(filterFrom+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'})} – ${new Date(filterTo+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}`)
                  : 'Filter'}
                {filterActive
                  ? <span onClickCapture={e => { e.stopPropagation(); clearDateFilter() }} className="hover:opacity-70 flex items-center"><X className="h-3 w-3" /></span>
                  : <ChevronDown className="h-3 w-3 opacity-40" />}
              </button>

              {dateDropdownOpen && dateBtnRect && (
                <>
                  {/* Backdrop */}
                  <div className="fixed inset-0 z-40" onClick={() => setDateDropdownOpen(false)} />
                  {/* Dropdown panel — fixed so overflow-x-auto on parent doesn't clip it */}
                  <div className="fixed z-50 bg-white border border-border rounded-xl shadow-xl p-3 space-y-2.5 w-64"
                    style={{ top: dateBtnRect.bottom + 4, left: dateBtnRect.left }}
                  >
                    {/* Presets */}
                    <div className="flex gap-1.5 flex-wrap">
                      {(['today','week','month'] as const).map(p => (
                        <button key={p} onClick={() => { handlePreset(p); setDateDropdownOpen(false) }}
                          className="h-6 px-2.5 text-[11px] font-medium rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors whitespace-nowrap">
                          {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
                        </button>
                      ))}
                    </div>
                    {/* Mode toggle */}
                    <div className="flex rounded-full bg-slate-100 overflow-hidden text-[11px] w-fit">
                      {(['single','range'] as const).map(m => (
                        <button key={m} onClick={() => { setFilterMode(m); if (m === 'single') setFilterTo(filterFrom) }}
                          className="h-6 px-3 transition-all font-medium"
                          style={filterMode === m ? { backgroundColor: '#bdac7e', color: 'white', borderRadius: '9999px' } : { color: '#94a3b8' }}>
                          {m === 'single' ? 'Single' : 'Range'}
                        </button>
                      ))}
                    </div>
                    {/* Date inputs */}
                    <div className="flex items-center gap-2">
                      <input type="date" value={filterFrom}
                        onChange={e => { setFilterFrom(e.target.value); if (filterMode === 'single') setFilterTo(e.target.value) }}
                        className="h-7 text-[11px] border rounded-lg px-2 bg-slate-50 flex-1 min-w-0" />
                      {filterMode === 'range' && (<>
                        <span className="text-slate-400 text-[11px] shrink-0">–</span>
                        <input type="date" value={filterTo} min={filterFrom}
                          onChange={e => setFilterTo(e.target.value)}
                          className="h-7 text-[11px] border rounded-lg px-2 bg-slate-50 flex-1 min-w-0" />
                      </>)}
                    </div>
                    {/* Apply */}
                    <button
                      onClick={() => { handleFilterApply(); setDateDropdownOpen(false) }}
                      className="w-full h-7 text-[11px] font-semibold rounded-lg text-white hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: '#bdac7e' }}
                    >
                      Apply
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Legend — flush right */}
            <div className="hidden sm:flex items-center gap-3 ml-auto pl-4 py-2.5 shrink-0">
              {[
                { color: '#22c55e', label: 'Open' },
                { color: '#ef4444', label: 'Full' },
                { color: '#94a3b8', label: 'Closed' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <span className="w-4 h-2.5 rounded-sm shrink-0" style={{ ...stripeStyle(l.color), outline: `1px solid ${l.color}`, outlineOffset: -1 }} />
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">{l.label}</span>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* Fullscreen calendar overlay */}
        {isFullscreen && (
          <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
            {/* Minimal header: prev · Month Year · next · close */}
            <div className="flex items-center justify-between px-6 py-2.5 border-b shrink-0">
              <button onClick={() => navigate('prev')}
                className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-semibold text-foreground select-none">
                {MONTH_FULL[leftMonth]} {leftYear}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => navigate('next')}
                  className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors">
                  <ChevronRight className="w-5 h-5" />
                </button>
                <button onClick={() => setIsFullscreen(false)} title="Exit fullscreen"
                  className="p-1.5 rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors">
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Calendar grid — fills remaining height, no scroll */}
            <div className="flex-1 min-h-0 h-full px-4 py-2">
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
                allBookings={bookings.filter(b => yachtFilter === 'all' || b.yachtName === yachtFilter)}
                allOpenTrips={openTrips.filter(t => (yachtFilter === 'all' || t.yacht.name === yachtFilter) && !(t.status === 'closed' && t.closedReason?.includes('Private Charter')))}
                yachtColorMap={yachtColorMap}
                onDateClick={handleDateClick}
                onBookingClick={b => {
                  setIsFullscreen(false)
                  setSelectedBooking(b)
                  setIsDetailOpen(true)
                  setBookingDetailLoading(true)
                  fetch(`/api/bookings/${b.id}`).then(r => r.json()).then(data => {
                    setBookingFullDetail(data)
                    setBookingDetailLoading(false)
                  }).catch(() => setBookingDetailLoading(false))
                }}
                onOpenTripClick={t => { setIsFullscreen(false); handleOpenTripClick(t) }}
                isInFilterRange={isInFilterRange}
                fillHeight
              />
            </div>
          </div>
        )}

        {/* Body */}
        <CardContent className="p-0">
          {viewMode === 'calendar' ? (
            <div className="w-full px-1 sm:px-4 py-3 sm:py-5 overflow-x-auto">
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
                allBookings={bookings.filter(b => yachtFilter === 'all' || b.yachtName === yachtFilter)}
                allOpenTrips={openTrips.filter(t => (yachtFilter === 'all' || t.yacht.name === yachtFilter) && !(t.status === 'closed' && t.closedReason?.includes('Private Charter')))}
                yachtColorMap={yachtColorMap}
                onDateClick={handleDateClick}
                onBookingClick={b => {
                  setSelectedBooking(b)
                  setIsDetailOpen(true)
                  setBookingDetailLoading(true)
                  fetch(`/api/bookings/${b.id}`).then(r => r.json()).then(data => {
                    setBookingFullDetail(data)
                    setBookingDetailLoading(false)
                  }).catch(() => setBookingDetailLoading(false))
                }}
                onOpenTripClick={handleOpenTripClick}
                isInFilterRange={isInFilterRange}
                onPrev={() => navigate('prev')}
                onNext={() => navigate('next')}
              />
            </div>
          ) : (
            /* List view */
            <div className="px-3 sm:px-5 py-4 space-y-2">
              {filterActive && (
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{upcomingBookings.length} trip{upcomingBookings.length !== 1 ? 's' : ''}</span> found
                    {' · '}
                    <span style={{ color: '#bdac7e' }} className="font-semibold">
                      {filterFrom === filterTo
                        ? new Date(filterFrom + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
                        : `${new Date(filterFrom+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} – ${new Date(filterTo+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}`}
                    </span>
                    {' · all yachts'}
                  </p>
                </div>
              )}
              {(() => {
                const listItems = upcomingBookings
                return listItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  {filterActive
                    ? 'No trips found for the selected date range.'
                    : `No bookings in ${MONTH_FULL[leftMonth]} ${leftYear}.`}
                </div>
              ) : (
                listItems.map(b => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setSelectedBooking(b)
                      setIsDetailOpen(true)
                      setBookingDetailLoading(true)
                      fetch(`/api/bookings/${b.id}`).then(r => r.json()).then(data => {
                        setBookingFullDetail(data)
                        setBookingDetailLoading(false)
                      }).catch(() => setBookingDetailLoading(false))
                    }}
                    className="w-full flex items-center gap-3 rounded-lg border border-border px-3 sm:px-4 py-3 hover:bg-muted/40 transition-colors text-left"
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
              )
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Booking Detail Dialog ── */}
      <Dialog open={isDetailOpen} onOpenChange={v => { setIsDetailOpen(v); if (!v) { setIsBookingEditing(false); setBookingFullDetail(null); setSelectedCabinCtx(null); setDetailAddingGuest(false); setOtAddQ(''); setOtAddResults([]); setReplacingGuestId(null); setReplaceQ(''); setReplaceResults([]) } }}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  {selectedBooking.status === 'on_hold' && bookingFullDetail?.holdUntil && (() => {
                    const exp     = new Date(bookingFullDetail.holdUntil)
                    const expired = exp < new Date()
                    return (
                      <div className={`rounded-lg border p-3 ${expired ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                        <div className={`text-[11px] mb-1 font-medium ${expired ? 'text-red-600' : 'text-amber-700'}`}>
                          {expired ? '⚠ Hold Expired' : 'Hold Until'}
                        </div>
                        <p className={`text-sm font-semibold ${expired ? 'text-red-700' : 'text-amber-800'}`}>
                          {exp.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {' '}
                          {exp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    )
                  })()}
                  {((selectedBooking.salespersonUser?.name || selectedBooking.salesperson) || selectedBooking.notes) && (
                    <div className="grid gap-3" style={{ gridTemplateColumns: (selectedBooking.salespersonUser?.name || selectedBooking.salesperson) && selectedBooking.notes ? '1fr 1fr' : '1fr' }}>
                      {(selectedBooking.salespersonUser?.name || selectedBooking.salesperson) && (
                        <div className="rounded-lg border p-3">
                          <div className="text-[11px] text-muted-foreground mb-1">Salesperson</div>
                          <p className="text-sm font-semibold">{selectedBooking.salespersonUser?.name || selectedBooking.salesperson}</p>
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

                  {/* Guests */}
                  <div className="rounded-xl border overflow-hidden">
                    <div className="bg-muted/40 px-4 py-2 border-b flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Guests</p>
                      {selectedCabinCtx?.isOwnCabin && !selectedCabinCtx.isFull && !bookingDetailLoading && (
                        <button
                          onClick={() => { setDetailAddingGuest(v => !v); setOtAddQ(''); setOtAddResults([]) }}
                          className="text-[10px] font-semibold text-[#bdac7e] hover:text-[#a89660] flex items-center gap-1"
                        >
                          <Plus className="h-3 w-3" />
                          {detailAddingGuest ? 'Cancel' : 'Add Guest'}
                        </button>
                      )}
                    </div>
                    {bookingDetailLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        {bookingFullDetail?.guests?.length > 0 ? (
                          <div className="divide-y">
                            {bookingFullDetail.guests.map((g: any) => (
                              <div key={g.id}>
                                {/* Guest row */}
                                <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors group">
                                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-[11px] font-bold text-muted-foreground">
                                    {g.customer?.name?.[0] ?? '?'}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-sm font-medium">{g.customer?.name ?? '—'}</span>
                                      {g.isLead && (
                                        <span className="text-[9px] font-bold bg-amber-100 text-amber-700 rounded px-1.5 py-px">LEAD</span>
                                      )}
                                    </div>
                                    {g.cabin && (
                                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                                        <BedDouble className="w-3 h-3" />
                                        <span>{g.cabin.name}</span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {g.id && (
                                      <button
                                        onClick={() => window.open(`/print/guest-sheet/${g.id}`, '_blank')}
                                        className="p-1.5 rounded hover:bg-sky-50 text-sky-500"
                                        title="Guest Sheet"
                                      >
                                        <BookOpen className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => { setGuestEditTarget(g); setGuestSheetOpen(true) }}
                                      className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                                      title="Edit guest info"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    {selectedCabinCtx?.isOwnCabin && (
                                      <button
                                        onClick={() => {
                                          if (replacingGuestId === g.id) {
                                            setReplacingGuestId(null); setReplaceQ(''); setReplaceResults([])
                                          } else {
                                            setReplacingGuestId(g.id); setReplaceQ(''); setReplaceResults([])
                                          }
                                        }}
                                        className={`p-1.5 rounded transition-colors ${replacingGuestId === g.id ? 'bg-amber-50 text-amber-600' : 'hover:bg-amber-50 text-muted-foreground hover:text-amber-600'}`}
                                        title="Replace guest"
                                      >
                                        <ArrowRightLeft className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    {selectedCabinCtx?.isOwnCabin && !g.isLead && bookingFullDetail.guests.length > 1 && (
                                      <button
                                        disabled={deletingGuestId === g.id}
                                        onClick={() => handleDeleteGuest(g.id, selectedCabinCtx.bookingId)}
                                        className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                                        title="Remove guest"
                                      >
                                        {deletingGuestId === g.id
                                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          : <Trash2 className="h-3.5 w-3.5" />}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {/* Inline replace search */}
                                {replacingGuestId === g.id && selectedCabinCtx && (
                                  <div className="bg-amber-50/60 border-t px-4 py-2.5 space-y-1.5">
                                    <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Replace "{g.customer?.name}"</p>
                                    <div className="flex items-center gap-2">
                                      <input
                                        autoFocus
                                        className="flex-1 h-7 text-xs border rounded px-2 bg-background outline-none focus:ring-1 focus:ring-amber-400"
                                        placeholder="Search new guest by name..."
                                        value={replaceQ}
                                        onChange={e => searchReplaceGuest(e.target.value)}
                                      />
                                      {replaceSearching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
                                      <button
                                        onClick={() => { setReplacingGuestId(null); setReplaceQ(''); setReplaceResults([]) }}
                                        className="text-muted-foreground hover:text-foreground p-0.5"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                    {replaceResults.length > 0 && (
                                      <div className="border rounded-md bg-background divide-y max-h-40 overflow-y-auto">
                                        {replaceResults.map((r: any) => (
                                          <button
                                            key={r.id}
                                            disabled={replaceSaving}
                                            onClick={() => handleReplaceGuest(g.id, r.id, selectedCabinCtx.bookingId)}
                                            className="w-full flex items-center justify-between px-2.5 py-1.5 text-left hover:bg-muted/50 transition-colors"
                                          >
                                            <span className="text-xs font-medium">{r.name}</span>
                                            {replaceSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    {replaceQ.length > 0 && !replaceSearching && replaceResults.length === 0 && (
                                      <p className="text-[10px] text-muted-foreground px-1">No guests found.</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground text-center py-4">No guests registered</p>
                        )}
                        {/* Add guest inline form */}
                        {detailAddingGuest && selectedCabinCtx && (
                          <div className="border-t p-3 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus
                                className="flex-1 h-7 text-xs border rounded px-2 bg-background outline-none focus:ring-1 focus:ring-[#bdac7e]"
                                placeholder="Search guest by name..."
                                value={otAddQ}
                                onChange={e => { setOtAddCabinId(selectedCabinCtx.cabinId); setOtAddBookingId(selectedCabinCtx.bookingId); searchOtGuest(e.target.value) }}
                              />
                              {otAddSearching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
                            </div>
                            {otAddResults.length > 0 && (
                              <div className="border rounded-md bg-background divide-y max-h-40 overflow-y-auto">
                                {otAddResults.map((r: any) => (
                                  <button
                                    key={r.id}
                                    disabled={otAddSaving}
                                    onClick={async () => {
                                      await addGuestToOtBooking(r.id)
                                      setDetailAddingGuest(false)
                                      const updated = await fetch(`/api/bookings/${selectedCabinCtx.bookingId}`).then(res => res.json())
                                      setBookingFullDetail(updated)
                                    }}
                                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-left hover:bg-muted/50 transition-colors"
                                  >
                                    <span className="text-xs font-medium">{r.name}</span>
                                    {otAddSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 text-muted-foreground" />}
                                  </button>
                                ))}
                              </div>
                            )}
                            {otAddQ.length > 0 && !otAddSearching && otAddResults.length === 0 && (
                              <p className="text-[10px] text-muted-foreground px-1">No guests found.</p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <DialogFooter className="gap-2 pt-1 flex-wrap">
                    <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Close</Button>
                    {canEdit && selectedBooking.status !== 'cancelled' && (
                      <Button
                        variant="outline"
                        className="border-amber-300 text-amber-700 hover:bg-amber-50 gap-1.5"
                        onClick={() => {
                          setIsDetailOpen(false)
                          setWlBooking({
                            id:         selectedBooking.id,
                            code:       selectedBooking.bookingCode ?? selectedBooking.id,
                            startDate:  selectedBooking.startDate,
                            endDate:    selectedBooking.endDate,
                            openTripId: otDetail?.id,
                          })
                        }}
                      >
                        <Users className="h-4 w-4" /> Waiting List
                      </Button>
                    )}
                    {selectedBooking.isOwnBooking !== false && selectedBooking.status === 'on_hold' ? (
                      <Button
                        onClick={() => {
                          setIsDetailOpen(false)
                          setCompleteBookingId(selectedBooking.id)
                          setWizardOpen(true)
                        }}
                        className="bg-orange-500 hover:bg-orange-600 text-white"
                      >
                        <ChevronRight className="w-3.5 h-3.5 mr-2" /> Complete Booking
                      </Button>
                    ) : selectedBooking.status !== 'on_hold' ? (
                      <>
                        <Button
                          variant="outline"
                          className="border-sky-300 text-sky-700 hover:bg-sky-50"
                          onClick={() => window.open(`/print/crew-sheet/booking/${selectedBooking.id}`, '_blank')}
                        >
                          <BookOpen className="w-3.5 h-3.5 mr-2" /> Crew Sheet
                        </Button>
                        {selectedBooking.isOwnBooking !== false && new Date(selectedBooking.endDate) >= new Date(new Date().toDateString()) && (
                          <Button onClick={startBookingEdit} className="bg-[#1a5f6e] hover:bg-[#145260] text-white">
                            <Pencil className="w-3.5 h-3.5 mr-2" /> Edit Booking
                          </Button>
                        )}
                      </>
                    ) : null}
                  </DialogFooter>
                </div>
              ) : (
                /* ── Edit mode ── */
                bookingDetailLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">

                  {/* Trip Info */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Trip Details</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Check-in</Label>
                        <Input className="h-9" type="date" value={bookingEditForm.startDate} min={new Date().toISOString().split('T')[0]} onChange={e => setBookingEditForm(p => ({ ...p, startDate: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Check-out</Label>
                        <Input className="h-9" type="date" value={bookingEditForm.endDate} min={bookingEditForm.startDate || new Date().toISOString().split('T')[0]} onChange={e => setBookingEditForm(p => ({ ...p, endDate: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Destination</Label>
                        <Input className="h-9" value={bookingEditForm.destination} onChange={e => setBookingEditForm(p => ({ ...p, destination: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Guest Count</Label>
                        <div className="h-9 flex items-center rounded-md border bg-muted/40 px-3 text-sm gap-2">
                          <span className="font-medium text-foreground">{bookingFullDetail?.guests?.length ?? 0}</span>
                          <span className="text-[10px] text-muted-foreground">— based on guest list</span>
                        </div>
                      </div>
                      <div className="space-y-1.5 col-span-2">
                        <Label className="text-xs text-muted-foreground">Salesperson</Label>
                        <div className="h-9 flex items-center rounded-md border bg-muted/40 px-3 text-sm gap-2">
                          <span className="font-medium text-foreground">{bookingEditForm.salesperson || '—'}</span>
                          <span className="text-[10px] text-muted-foreground">— set by booking creator</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Payment */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payment</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Status</Label>
                        <Select value={bookingEditForm.status} onValueChange={v => setBookingEditForm(p => ({ ...p, status: v }))}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="partially_paid">Partially Paid</SelectItem>
                            <SelectItem value="fully_paid">Fully Paid</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Total Price (USD)</Label>
                        <Input className="h-9" type="number" value={bookingEditForm.totalPrice} onChange={e => setBookingEditForm(p => ({ ...p, totalPrice: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Deposit Paid (USD)</Label>
                        <div className="h-9 flex items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground gap-2">
                          <span className="font-medium text-foreground">${Number(bookingEditForm.depositPaid).toLocaleString()}</span>
                          <span className="text-[10px]">— via Finance approval only</span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Discount (%)</Label>
                        <Input className="h-9" type="number" min="0" max="100" value={bookingEditForm.discount} onChange={e => setBookingEditForm(p => ({ ...p, discount: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Deposit Due Date</Label>
                        <Input className="h-9" type="date" value={bookingEditForm.depositDueDate}
                          min={new Date().toISOString().split('T')[0]}
                          max={bookingEditForm.startDate || undefined}
                          onChange={e => {
                            const today = new Date().toISOString().split('T')[0]
                            let val = e.target.value
                            if (val < today) val = today
                            if (bookingEditForm.startDate && val > bookingEditForm.startDate) val = bookingEditForm.startDate
                            setBookingEditForm(p => ({
                              ...p,
                              depositDueDate: val,
                              finalDueDate: p.finalDueDate && val > p.finalDueDate ? val : p.finalDueDate,
                            }))
                          }} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Final Due Date</Label>
                        <Input className="h-9" type="date" value={bookingEditForm.finalDueDate}
                          min={bookingEditForm.depositDueDate || new Date().toISOString().split('T')[0]}
                          max={bookingEditForm.startDate || undefined}
                          onChange={e => {
                            const minVal = bookingEditForm.depositDueDate || new Date().toISOString().split('T')[0]
                            let val = e.target.value
                            if (val < minVal) val = minVal
                            if (bookingEditForm.startDate && val > bookingEditForm.startDate) val = bookingEditForm.startDate
                            setBookingEditForm(p => ({ ...p, finalDueDate: val }))
                          }} />
                      </div>
                    </div>
                  </div>

                  {/* Guests */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Guests</p>
                    <div className="space-y-2">
                      {(bookingFullDetail?.guests ?? []).map((g: any) => (
                        <div key={g.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${g.isLead ? 'border-amber-300 bg-amber-50/50' : ''}`}>
                          {/* Lead badge */}
                          <div className="shrink-0">
                            {g.isLead
                              ? <div className="flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5">
                                  <Crown className="h-3 w-3 text-amber-500" />
                                  <span className="text-[10px] font-bold text-amber-600">Lead</span>
                                </div>
                              : <button
                                  onClick={() => handleSetLead(g.id)}
                                  title="Set as lead guest"
                                  className="flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/30 px-2 py-0.5 hover:border-amber-400 hover:bg-amber-50 transition-colors"
                                >
                                  <Crown className="h-3 w-3 text-muted-foreground/40" />
                                  <span className="text-[10px] text-muted-foreground/50">Set lead</span>
                                </button>}
                          </div>
                          {/* Name */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {g.customer?.name}
                              {g.isLead && <span className="ml-1.5 text-[10px] text-amber-600 font-semibold">LEAD</span>}
                            </p>
                            <p className="text-[11px] text-muted-foreground">{g.customer?.email ?? g.customer?.phone ?? '—'}</p>
                          </div>
                          {/* Cabin */}
                          <Select
                            value={g.cabinId ?? 'none'}
                            onValueChange={v => handleCabinChange(g.id, v === 'none' ? '' : v)}
                          >
                            <SelectTrigger className="h-7 text-xs w-32 shrink-0">
                              <SelectValue placeholder="No cabin" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No cabin</SelectItem>
                              {(bookingFullDetail?.yacht?.cabins ?? []).map((c: any) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}{c.deck ? ` (${c.deck})` : ''}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {/* Edit + Remove */}
                          <button
                            onClick={() => { setGuestEditTarget(g); setGuestSheetOpen(true) }}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                            title="Edit guest details"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {!g.isLead && (
                            <button
                              onClick={() => handleRemoveGuest(g.id)}
                              className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                              title="Remove guest"
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}

                      {/* Add guest */}
                      <div className="rounded-lg border border-dashed p-2 space-y-1.5">
                        <div className="relative flex items-center gap-2">
                          <SearchIcon className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                          <Input
                            className="h-8 text-xs pl-7"
                            placeholder="Search customer to add..."
                            value={guestSearchQ}
                            disabled={addingGuest}
                            onChange={e => { setGuestSearchQ(e.target.value); searchGuests(e.target.value) }}
                          />
                          {(guestSearching || addingGuest) && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
                        </div>
                        {guestSearchRes.length > 0 && (
                          <div className="rounded-md border bg-background shadow-sm divide-y max-h-36 overflow-y-auto">
                            {guestSearchRes.map((c: any) => {
                              const alreadyAdded = (bookingFullDetail?.guests ?? []).some((g: any) => g.customerId === c.id)
                              const isBeingAdded = addingGuest
                              return (
                                <button
                                  key={c.id}
                                  disabled={alreadyAdded || isBeingAdded}
                                  onClick={() => handleAddGuest(c.id)}
                                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted transition-colors ${alreadyAdded || isBeingAdded ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  {isBeingAdded
                                    ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
                                    : <UserPlus className="h-3 w-3 text-muted-foreground shrink-0" />}
                                  <span className="font-medium">{c.name}</span>
                                  {c.email && <span className="text-muted-foreground">{c.email}</span>}
                                  {alreadyAdded && <span className="ml-auto text-muted-foreground italic">already added</span>}
                                  {isBeingAdded && !alreadyAdded && <span className="ml-auto text-muted-foreground italic">Adding...</span>}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <Textarea rows={3} className="resize-none text-sm" value={bookingEditForm.notes} onChange={e => setBookingEditForm(p => ({ ...p, notes: e.target.value }))} />
                  </div>

                  <DialogFooter className="gap-2 pt-1 sticky bottom-0 bg-background pb-1">
                    <Button variant="outline" onClick={() => setIsBookingEditing(false)} disabled={bookingSaving}>
                      <X className="w-3.5 h-3.5 mr-2" /> Cancel
                    </Button>
                    <Button onClick={saveBooking} disabled={bookingSaving} className="bg-[#1a5f6e] hover:bg-[#145260] text-white">
                      {bookingSaving ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-2" />}
                      Save Changes
                    </Button>
                  </DialogFooter>
                </div>
                )
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Open Trip Detail Dialog ── */}
      <Dialog open={otDetailOpen} onOpenChange={v => { setOtDetailOpen(v); if (!v) setIsOtEditing(false) }}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
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
                    const isClosed = otDetail.status === 'closed'
                    const isPaidStatus = (b: string | null) => b === 'partially_paid' || b === 'fully_paid' || b === 'completed' || b === 'confirmed'
                    const paid     = isClosed ? total : (otDetail.cabins?.filter((c: any) => c.guests?.length > 0 && isPaidStatus(c.bookingStatus)).length ?? 0)
                    const onHold   = isClosed ? 0     : (otDetail.cabins?.filter((c: any) => c.guests?.length > 0 && c.bookingStatus === 'on_hold').length ?? 0)
                    const pending  = isClosed ? 0     : (otDetail.cabins?.filter((c: any) => c.guests?.length > 0 && !isPaidStatus(c.bookingStatus) && c.bookingStatus !== 'on_hold').length ?? 0)
                    const avail    = isClosed ? 0     : (otDetail.cabins?.filter((c: any) => !c.guests?.length).length ?? 0)
                    const paidPct  = total ? (paid    / total) * 100 : 0
                    const holdPct  = total ? (onHold  / total) * 100 : 0
                    const pendPct  = total ? (pending / total) * 100 : 0
                    const availPct = total ? (avail   / total) * 100 : 100
                    return (
                      <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                        {/* Numbers row */}
                        <div className="grid grid-cols-5 divide-x text-center">
                          {[
                            { label: 'Total',               val: total,   color: 'text-foreground'  },
                            { label: 'Available',           val: avail,   color: 'text-slate-500'   },
                            { label: 'On Hold',             val: onHold,  color: 'text-green-600'   },
                            { label: 'Waiting Payment',     val: pending, color: 'text-amber-500'   },
                            { label: 'Booked',              val: paid,    color: 'text-red-500'     },
                          ].map(s => (
                            <div key={s.label} className="px-2">
                              <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
                              <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.label}</div>
                            </div>
                          ))}
                        </div>
                        {/* Progress bar */}
                        <div className="h-2.5 rounded-full overflow-hidden bg-muted flex">
                          {paid    > 0 && <div className="h-full bg-red-400 transition-all"   style={{ width: `${paidPct}%` }} />}
                          {pending > 0 && <div className="h-full bg-amber-400 transition-all" style={{ width: `${pendPct}%` }} />}
                          {onHold  > 0 && <div className="h-full bg-green-400 transition-all" style={{ width: `${holdPct}%` }} />}
                          {avail   > 0 && <div className="h-full bg-slate-200 transition-all" style={{ width: `${availPct}%` }} />}
                        </div>
                        {/* Legend */}
                        <div className="flex items-center gap-4 flex-wrap">
                          {[
                            { dot: 'border border-slate-400 bg-white', label: 'Available' },
                            { dot: 'bg-green-400',  label: 'On Hold' },
                            { dot: 'bg-amber-400',  label: 'Waiting for Payment' },
                            { dot: 'bg-red-400',    label: 'Booked' },
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
                    <div className="bg-muted/40 px-4 py-2 border-b flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Cabin Details</p>
                      {otDetail.status !== 'closed' && (
                        <button
                          onClick={() => window.open(`/print/crew-sheet/${otDetail.id}`, '_blank')}
                          className="flex items-center gap-1.5 text-[10px] font-semibold text-sky-600 hover:text-sky-700 hover:bg-sky-50 px-2 py-1 rounded-md transition-colors"
                        >
                          <BookOpen className="h-3 w-3" />
                          Download Crew Sheet
                        </button>
                      )}
                    </div>
                    <div className="divide-y">
                      {otDetail.status === 'closed' && (
                        <div className="px-4 py-2.5 flex items-center gap-2 bg-slate-50 border-b">
                          <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <p className="text-xs text-slate-500">{otDetail.closedReason ?? 'This trip has been closed'}</p>
                        </div>
                      )}
                      {otDetail.cabins?.map((c: any) => {
                        const isTripClosed = otDetail.status === 'closed'
                        const hasGuests    = c.guests?.length > 0
                        const isHold       = hasGuests && c.bookingStatus === 'on_hold'
                        const isPaid       = hasGuests && !isHold && (c.bookingStatus === 'partially_paid' || c.bookingStatus === 'fully_paid' || c.bookingStatus === 'completed' || c.bookingStatus === 'confirmed')
                        const isPending    = hasGuests && !isHold && !isPaid
                        const dotCls    = isHold    ? 'bg-green-400'
                                        : isPaid    ? 'bg-red-400'
                                        : isPending ? 'bg-amber-400'
                                        : isTripClosed ? 'bg-slate-300'
                                        : 'bg-white border border-slate-400'
                        const badgeCls  = isHold    ? 'bg-green-100 text-green-700 border border-green-200'
                                        : isPaid    ? 'bg-red-100 text-red-700 border border-red-200'
                                        : isPending ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                        : isTripClosed ? 'bg-slate-100 text-slate-400 border border-slate-200'
                                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                        const badgeLabel = isHold    ? 'On Hold'
                                         : isPaid    ? 'Booked'
                                         : isPending ? 'Waiting for Payment'
                                         : isTripClosed ? 'Closed'
                                         : 'Available'
                        return (
                          <div
                            key={c.id}
                            className="px-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer"
                            onClick={() => handleCabinClick(c)}
                          >
                            <div className="flex items-center gap-3">
                              {/* Status dot */}
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotCls}`} />
                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm">{c.name}</span>
                                  {c.deck    && <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-px">{c.deck}</span>}
                                  {c.bedType && <span className="text-[10px] text-muted-foreground">{c.bedType}</span>}
                                </div>
                                {hasGuests && (
                                  <div className="mt-1 flex flex-wrap gap-1 items-center">
                                    {c.guests.map((g: { id: string; bgId?: string; name: string }) => (
                                      <span key={g.id} className="text-[10px] bg-muted border rounded px-1.5 py-px text-foreground">
                                        {g.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {/* Badge + salesperson */}
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className={cn('text-[10px] font-semibold rounded-full px-2.5 py-1 whitespace-nowrap', badgeCls)}>
                                  {badgeLabel}
                                </span>
                                {c.salesperson && (
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                    by: {c.salesperson}
                                  </span>
                                )}
                              </div>
                            </div>
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
                    {canEdit && otDetail.status !== 'closed' && new Date(otDetail.endDate) >= new Date(new Date().toDateString()) && (
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
        open={guestSheetOpen}
        guestId={guestEditTarget?.customer?.id ?? null}
        onClose={() => { setGuestSheetOpen(false); setGuestEditTarget(null) }}
        onSaved={() => reloadBookingDetail()}
      />

      {/* ── New Booking Wizard ── */}
      <BookingWizard
        open={wizardOpen}
        onOpenChange={v => { setWizardOpen(v); if (!v) { setWizardOpenTripId(undefined); setWizardYachtId(undefined); setCompleteBookingId(undefined) } }}
        onSuccess={() => { fetchBookings(); fetchOpenTrips() }}
        preselectedDate={selectedDate}
        preselectedOpenTripId={wizardOpenTripId}
        preselectedYachtId={wizardYachtId}
        completeBookingId={completeBookingId}
      />

      {/* ── Waiting List Modal ── */}
      {wlBooking && (
        <WaitingListManager
          open={!!wlBooking}
          onOpenChange={v => !v && setWlBooking(null)}
          bookingId={wlBooking.id}
          bookingCode={wlBooking.code}
          startDate={wlBooking.startDate}
          endDate={wlBooking.endDate}
          yachtId={wlBooking.yachtId}
          openTripId={wlBooking.openTripId}
        />
      )}

      {/* ── Print Modal ── */}
      {printModalOpen && (
        <Dialog open onOpenChange={v => !v && setPrintModalOpen(false)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Printer className="w-4 h-4" /> Print Calendar</DialogTitle>
              <DialogDescription>Choose vessel and date range to print.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vessel</Label>
                <Select value={printYacht} onValueChange={setPrintYacht}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select vessel" />
                  </SelectTrigger>
                  <SelectContent>
                    {yachts.map(y => <SelectItem key={y.id} value={y.name}>{y.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">From</Label>
                  <input
                    type="month"
                    value={printFromMonth}
                    onChange={e => setPrintFromMonth(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">To</Label>
                  <input
                    type="month"
                    value={printToMonth}
                    min={printFromMonth}
                    onChange={e => setPrintToMonth(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPrintModalOpen(false)}>Cancel</Button>
              <Button onClick={handlePrint} className="gap-1.5"><Printer className="w-3.5 h-3.5" /> Print</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </div>
  )
}
