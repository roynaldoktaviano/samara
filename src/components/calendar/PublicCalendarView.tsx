'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarSearch, X } from 'lucide-react'

/* ── Types ── */
interface PublicBooking {
  id: string; startDate: string; endDate: string; status: string
  tripType: string; yachtName: string; yachtId: string; openTripId: string | null
}
interface CabinStatus { id: string; name: string; bookingStatus: string | null }
interface PublicOpenTrip {
  id: string; title: string; startDate: string; endDate: string; status: string
  closedReason: string | null; spotsAvailable: number; maxCapacity: number
  yacht: { id: string; name: string }; cabinStatuses: CabinStatus[]
}
interface Yacht { id: string; name: string }

/* ── Constants ── */
const YACHT_PALETTE = ['#3b82f6','#f97316','#8b5cf6','#10b981','#ec4899','#06b6d4','#eab308','#ef4444']
const YACHT_ORDER   = ['Samara I','Samara II','Mischief','Otium']
const MONTH_NAMES   = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW_SHORT     = ['SU','MO','TU','WE','TH','FR','SA']
const DOW_LONG      = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAY_FULL      = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const DAY_H         = 44
const LANE_H        = 62

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  on_hold:        { bg: '#dcfce7', color: '#16a34a', label: 'On Hold'              },
  pending:        { bg: '#fef9c3', color: '#a16207', label: 'Waiting for Payment'  },
  confirmed:      { bg: '#fee2e2', color: '#dc2626', label: 'Confirmed'            },
  partially_paid: { bg: '#fee2e2', color: '#dc2626', label: 'Confirmed'            },
  fully_paid:     { bg: '#fee2e2', color: '#dc2626', label: 'Confirmed'            },
  completed:      { bg: '#fee2e2', color: '#dc2626', label: 'Confirmed'            },
  cancelled:      { bg: '#f1f5f9', color: '#64748b', label: 'Cancelled'            },
}
const STATUS_BADGE_BAR: Record<string, { bg: string; label: string }> = {
  on_hold:        { bg: 'rgba(34,197,94,0.85)',   label: 'ON HOLD'              },
  pending:        { bg: 'rgba(234,179,8,0.85)',   label: 'WAITING FOR PAYMENT'  },
  confirmed:      { bg: 'rgba(239,68,68,0.85)',   label: 'CONFIRMED'            },
  partially_paid: { bg: 'rgba(239,68,68,0.85)',   label: 'CONFIRMED'            },
  fully_paid:     { bg: 'rgba(239,68,68,0.85)',   label: 'CONFIRMED'            },
  completed:      { bg: 'rgba(239,68,68,0.85)',   label: 'CONFIRMED'            },
  cancelled:      { bg: 'rgba(148,163,184,0.85)', label: 'CANCELLED'            },
}

/* ── Helpers ── */
function bookingBarColor(status: string) {
  if (status === 'on_hold') return '#22c55e'
  if (status === 'pending') return '#eab308'
  if (['confirmed','partially_paid','fully_paid','completed'].includes(status)) return '#ef4444'
  return '#94a3b8'
}
function buildColorMap(yachts: Yacht[]): Record<string, string> {
  const sorted = [...yachts].sort((a, b) => a.name.localeCompare(b.name))
  const map: Record<string, string> = {}
  sorted.forEach((y, i) => { map[y.name] = YACHT_PALETTE[i % YACHT_PALETTE.length] })
  return map
}
function weeksOf(year: number, month: number): number[][] {
  const weeks: number[][] = []
  const first = new Date(year, month, 1).getDay()
  const days  = new Date(year, month + 1, 0).getDate()
  let week: number[] = Array(first).fill(0)
  for (let d = 1; d <= days; d++) {
    week.push(d)
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length) weeks.push([...week, ...Array(7 - week.length).fill(0)])
  return weeks
}
function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
function fmtFilterDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d} ${MONTH_NAMES[parseInt(m) - 1]?.slice(0, 3)} ${y}`
}

function getEventsForDate(day: number, year: number, month: number, bookings: PublicBooking[], trips: PublicOpenTrip[]) {
  const target = dateStr(year, month, day)
  return {
    bookings: bookings.filter(b => {
      const s = b.startDate.split('T')[0]
      const e = b.endDate.split('T')[0]
      return target >= s && target <= e
    }),
    trips: trips.filter(t => {
      const s = t.startDate.split('T')[0]
      const e = t.endDate.split('T')[0]
      return target >= s && target <= e
    }),
  }
}
function sortYachts(yachts: Yacht[]) {
  return [...yachts].sort((a, b) => {
    const ai = YACHT_ORDER.findIndex(n => a.name.toLowerCase().includes(n.toLowerCase()))
    const bi = YACHT_ORDER.findIndex(n => b.name.toLowerCase().includes(n.toLowerCase()))
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
}

/* ── Segment builder (desktop) ── */
interface Segment {
  key: string; weekIdx: number; startCol: number; endCol: number
  isRealStart: boolean; isRealEnd: boolean; lane: number; laneSpan: number
  color: string; isStripe: boolean; label: string
  bookingRef?: PublicBooking; openTripRef?: PublicOpenTrip
}
function buildSegments(bookings: PublicBooking[], openTrips: PublicOpenTrip[], colorMap: Record<string, string>, year: number, month: number): Segment[] {
  const weeks = weeksOf(year, month)
  const raw: Omit<Segment, 'lane' | 'laneSpan'>[] = []
  const add = (id: string, label: string, color: string, isStripe: boolean, start: Date, end: Date, bookingRef?: PublicBooking, openTripRef?: PublicOpenTrip) => {
    weeks.forEach((week, wi) => {
      const firstDay = week.find(d => d > 0)!
      const lastDay  = week.filter(d => d > 0).at(-1)!
      const mStart = new Date(year, month, firstDay)
      const mEnd   = new Date(year, month, lastDay)
      if (end < mStart || start > mEnd) return
      const sDate = start < mStart ? mStart : start
      const eDate = end   > mEnd   ? mEnd   : end
      const startCol = week.indexOf(sDate.getDate())
      const endCol   = week.indexOf(eDate.getDate())
      if (startCol === -1 || endCol === -1) return
      raw.push({ key: `${id}-w${wi}`, weekIdx: wi, startCol, endCol, isRealStart: start.getTime() === sDate.getTime(), isRealEnd: end.getTime() === eDate.getTime(), color, isStripe, label, bookingRef, openTripRef })
    })
  }
  bookings.filter(b => b.tripType === 'PRIVATE_CHARTER').forEach(b => add(b.id, `${b.yachtName} · ${b.status.toUpperCase()}`, bookingBarColor(b.status), false, new Date(b.startDate.split('T')[0] + 'T00:00:00'), new Date(b.endDate.split('T')[0] + 'T00:00:00'), b, undefined))
  openTrips.forEach(t => {
    const isFull  = t.status === 'full' || (t.status !== 'closed' && t.spotsAvailable === 0)
    const otColor = t.status === 'closed' ? '#94a3b8' : isFull ? '#ef4444' : '#22c55e'
    add(t.id, t.title, otColor, true, new Date(t.startDate.split('T')[0] + 'T00:00:00'), new Date(t.endDate.split('T')[0] + 'T00:00:00'), undefined, t)
  })
  const laned: Segment[] = []
  const weekLanes: Record<number, { endCol: number; lane: number }[]> = {}
  raw.sort((a, b) => a.weekIdx - b.weekIdx || a.startCol - b.startCol).forEach(seg => {
    const used = weekLanes[seg.weekIdx] ?? []
    let lane = 0
    while (used.some(u => u.lane === lane && u.endCol >= seg.startCol)) lane++
    used.push({ endCol: seg.endCol, lane })
    weekLanes[seg.weekIdx] = used
    laned.push({ ...seg, lane, laneSpan: 1 })
  })
  return laned
}

/* ════════════════════════════════════════
   Mobile View
════════════════════════════════════════ */
function MobileView({ data, loading, year, month, yachtFilter, setFilter, prev, next, filteredBookings, filteredOpenTrips, colorMap, filterStart, filterEnd, setFilterStart, setFilterEnd }: {
  data: { bookings: PublicBooking[]; openTrips: PublicOpenTrip[]; yachts: Yacht[] } | null
  loading: boolean; year: number; month: number
  yachtFilter: string; setFilter: (v: string) => void
  prev: () => void; next: () => void
  filteredBookings: PublicBooking[]; filteredOpenTrips: PublicOpenTrip[]
  colorMap: Record<string, string>
  filterStart: string; filterEnd: string
  setFilterStart: (v: string) => void; setFilterEnd: (v: string) => void
}) {
  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
  const [selectedDay,   setSelectedDay]   = useState(() => isCurrentMonth ? now.getDate() : 1)
  const [filterOpen,    setFilterOpen]    = useState(false)
  const [dateFilterOpen, setDateFilterOpen] = useState(false)

  useEffect(() => {
    setSelectedDay(year === now.getFullYear() && month === now.getMonth() ? now.getDate() : 1)
  }, [year, month])

  // Auto-select filterStart day when in this month
  useEffect(() => {
    if (filterStart) {
      const d = new Date(filterStart)
      if (d.getFullYear() === year && d.getMonth() === month) {
        setSelectedDay(d.getDate())
      }
    }
  }, [filterStart, year, month])

  const weeks     = useMemo(() => weeksOf(year, month), [year, month])
  const todayDay  = isCurrentMonth ? now.getDate() : -1
  const yachts    = useMemo(() => sortYachts(data?.yachts ?? []), [data?.yachts])

  const eventsForDay = useMemo(
    () => getEventsForDate(selectedDay, year, month, filteredBookings, filteredOpenTrips),
    [selectedDay, year, month, filteredBookings, filteredOpenTrips],
  )

  // Booking color highlights per day
  const dateHighlights = useMemo(() => {
    const map: Record<number, { color: string; id: string }> = {}
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const mark = (day: number, color: string, id: string, allowOverwrite = true) => {
      if (allowOverwrite || !map[day]) map[day] = { color, id }
    }
    filteredBookings.filter(b => b.tripType === 'PRIVATE_CHARTER').forEach(b => {
      const color = bookingBarColor(b.status)
      const s = b.startDate.split('T')[0]
      const e = b.endDate.split('T')[0]
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = dateStr(year, month, d)
        if (ds >= s && ds <= e) mark(d, color, b.id)
      }
    })
    filteredOpenTrips.forEach(t => {
      const isFull = t.status === 'full' || (t.status !== 'closed' && t.spotsAvailable === 0)
      const color  = t.status === 'closed' ? '#94a3b8' : isFull ? '#ef4444' : '#22c55e'
      const s = t.startDate.split('T')[0]
      const e = t.endDate.split('T')[0]
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = dateStr(year, month, d)
        if (ds >= s && ds <= e) mark(d, color, t.id, false)
      }
    })
    return map
  }, [filteredBookings, filteredOpenTrips, year, month])

  // Filter range highlights per day
  const filterHighlights = useMemo(() => {
    if (!filterStart) return {} as Record<number, boolean>
    const fEnd = filterEnd || filterStart
    const map: Record<number, boolean> = {}
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = dateStr(year, month, d)
      if (ds >= filterStart && ds <= fEnd) map[d] = true
    }
    return map
  }, [filterStart, filterEnd, year, month])

  const selectedDateLabel = useMemo(() => {
    const dow = new Date(year, month, selectedDay).getDay()
    return `${DAY_FULL[dow]}, ${selectedDay} ${MONTH_NAMES[month]} ${year}`
  }, [selectedDay, year, month])

  const fabLabel = yachtFilter.split(' ').map((w, i) => i === 0 ? w[0] + '.' : w).join('')
  const filterActive = !!(filterStart || filterEnd)
  const fEnd = filterEnd || filterStart

  return (
    <div style={{ height: '100dvh', backgroundColor: '#f5f7fa', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ backgroundColor: 'white', padding: '16px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 30, fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>{MONTH_NAMES[month]}</span>
              {yachtFilter && (
                <span style={{ fontSize: 11, fontWeight: 700, color: colorMap[yachtFilter] ?? '#1a5f6e', backgroundColor: (colorMap[yachtFilter] ?? '#1a5f6e') + '1a', borderRadius: 8, padding: '2px 8px', alignSelf: 'center' }}>
                  {yachtFilter}
                </span>
              )}
              <div style={{ display: 'flex', gap: 2 }}>
                <button onClick={prev} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronLeft size={15} color="#64748b" />
                </button>
                <button onClick={next} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronRight size={15} color="#64748b" />
                </button>
              </div>
            </div>
            <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500 }}>{year}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {/* Date filter toggle */}
            <button
              onClick={() => setDateFilterOpen(v => !v)}
              style={{
                width: 36, height: 36, borderRadius: 10,
                border: filterActive ? '2px solid #1a5f6e' : '1px solid #e2e8f0',
                background: filterActive ? '#e0f2f7' : 'white',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <CalendarSearch size={17} color={filterActive ? '#1a5f6e' : '#64748b'} />
            </button>
            <img src="https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png.webp" alt="Samara Liveaboard" style={{ height: 30, width: 'auto', objectFit: 'contain' }} />
          </div>
        </div>

        {/* Date filter panel */}
        {dateFilterOpen && (
          <div style={{ marginBottom: 12, padding: '10px 12px', backgroundColor: '#f0f9fb', borderRadius: 12, border: '1px solid #bae6fd' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1a5f6e', letterSpacing: '0.05em' }}>DATE FILTER</span>
              {filterActive && (
                <button
                  onClick={() => { setFilterStart(''); setFilterEnd('') }}
                  style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                >
                  <X size={12} /> Clear
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3, fontWeight: 600 }}>FROM</div>
                <input
                  type="date"
                  value={filterStart}
                  onChange={e => setFilterStart(e.target.value)}
                  style={{ width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: filterStart ? '1.5px solid #1a5f6e' : '1px solid #e2e8f0', backgroundColor: 'white', boxSizing: 'border-box' as const }}
                />
              </div>
              <div style={{ color: '#94a3b8', fontSize: 14, paddingTop: 16, flexShrink: 0 }}>→</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3, fontWeight: 600 }}>TO</div>
                <input
                  type="date"
                  value={filterEnd}
                  min={filterStart}
                  onChange={e => setFilterEnd(e.target.value)}
                  style={{ width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: filterEnd ? '1.5px solid #1a5f6e' : '1px solid #e2e8f0', backgroundColor: 'white', boxSizing: 'border-box' as const }}
                />
              </div>
            </div>
            {filterActive && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#1a5f6e', fontWeight: 600 }}>
                {filterStart === fEnd
                  ? `Showing: ${fmtFilterDate(filterStart)}`
                  : `Showing: ${fmtFilterDate(filterStart)}${fEnd ? ` → ${fmtFilterDate(fEnd)}` : ''}`}
              </div>
            )}
          </div>
        )}

        {/* DOW labels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
          {DOW_SHORT.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', paddingBottom: 4, letterSpacing: '0.04em' }}>{d}</div>
          ))}
        </div>

        {/* Mini calendar */}
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
            {week.map((day, di) => {
              const isToday    = day === todayDay
              const isSelected = day === selectedDay && day > 0
              const hl         = day > 0 ? (dateHighlights[day] ?? null) : null
              const inFilt     = day > 0 && !!filterHighlights[day]
              const ds         = day > 0 ? dateStr(year, month, day) : ''
              const isFiltSt   = !!filterStart && ds === filterStart
              const isFiltEnd  = !!fEnd && ds === fEnd
              const prevDay    = di > 0 ? week[di - 1] : 0
              const nextDay    = di < 6 ? week[di + 1] : 0
              const prevHl     = prevDay > 0 ? (dateHighlights[prevDay] ?? null) : null
              const nextHl     = nextDay > 0 ? (dateHighlights[nextDay] ?? null) : null
              const hasPrev    = !!(hl && prevHl && prevHl.id === hl.id)
              const hasNext    = !!(hl && nextHl && nextHl.id === hl.id)
              const isRange    = hasPrev || hasNext

              // Filter range bar edges
              const prevFilt   = prevDay > 0 && !!filterHighlights[prevDay]
              const nextFilt   = nextDay > 0 && !!filterHighlights[nextDay]
              const fHasPrev   = inFilt && prevFilt
              const fHasNext   = inFilt && nextFilt

              return (
                <div key={di} onClick={() => day > 0 && setSelectedDay(day)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3px 0', position: 'relative', cursor: day > 0 ? 'pointer' : 'default' }}>

                  {/* Booking range bar */}
                  {hl && isRange && (
                    <div style={{
                      position: 'absolute', top: 3, height: 36, zIndex: 0,
                      left:  hasPrev ? '0%'  : '50%',
                      right: hasNext ? '0%'  : '50%',
                      backgroundColor: hl.color,
                      opacity: isSelected ? 0.4 : 0.18,
                      borderRadius: hasPrev && hasNext ? 0 : !hasPrev ? '18px 0 0 18px' : '0 18px 18px 0',
                    }} />
                  )}

                  {/* Filter range bar (below booking bar layer) */}
                  {inFilt && (
                    <div style={{
                      position: 'absolute', top: 3, height: 36, zIndex: 1,
                      left:  fHasPrev ? '0%' : '50%',
                      right: fHasNext ? '0%' : '50%',
                      backgroundColor: 'rgba(26,95,110,0.12)',
                      borderRadius: fHasPrev && fHasNext ? 0 : !fHasPrev ? '18px 0 0 18px' : '0 18px 18px 0',
                      pointerEvents: 'none',
                    }} />
                  )}

                  {/* Date circle */}
                  <span style={{
                    position: 'relative', zIndex: 2,
                    width: 36, height: 36, borderRadius: '50%',
                    backgroundColor: isSelected ? '#1a5f6e' : hl ? hl.color : isToday ? '#e0f2f7' : 'transparent',
                    color: isSelected ? 'white' : hl ? 'white' : isToday ? '#1a5f6e' : day > 0 ? (di === 0 ? '#94a8b8' : '#1e293b') : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: (isToday || isSelected || !!hl) ? 700 : 400,
                    transition: 'background-color 0.15s',
                    // Filter ring: outer glow ring for start/end, lighter for middle
                    boxShadow: inFilt && !isSelected
                      ? (isFiltSt || isFiltEnd)
                        ? '0 0 0 2px white, 0 0 0 4px #1a5f6e'
                        : '0 0 0 1.5px rgba(26,95,110,0.45)'
                      : 'none',
                  }}>
                    {day > 0 ? day : ''}
                  </span>
                </div>
              )
            })}
          </div>
        ))}

        <div style={{ height: 1, backgroundColor: '#f1f5f9', marginTop: 8 }} />
      </div>

      {/* ── Schedule section ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px 8px', flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Schedule</p>
          <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{selectedDateLabel}</p>
          {filterActive && (() => {
            const ds = dateStr(year, month, selectedDay)
            const inRange = ds >= filterStart && ds <= fEnd
            return inRange ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, fontWeight: 600, color: '#1a5f6e', backgroundColor: '#e0f2f7', borderRadius: 6, padding: '2px 8px' }}>
                <CalendarSearch size={11} /> In filtered range
              </div>
            ) : (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: '#94a3b8', backgroundColor: '#f1f5f9', borderRadius: 6, padding: '2px 8px' }}>
                Outside filter range
              </div>
            )
          })()}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 80px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>Loading schedule…</div>
          ) : eventsForDay.bookings.length + eventsForDay.trips.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🗓</div>
              <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>No schedule on this date</p>
            </div>
          ) : (
            <>
              {eventsForDay.trips.map(t => {
                const nights   = Math.round((new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / 86400000)
                const isClosed = t.status === 'closed'
                const isFull   = t.status === 'full' || (!isClosed && t.spotsAvailable === 0)
                return (
                  <div key={t.id} style={{ backgroundColor: 'white', borderRadius: 14, padding: '14px 16px', marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{t.title}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>{t.yacht.name} · {nights + 1}D/{nights}N · Open Trip</p>
                      </div>
                      {isClosed ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', backgroundColor: '#f1f5f9', borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>CLOSED</span>
                      ) : isFull ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', backgroundColor: '#fee2e2', borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>FULL</span>
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', backgroundColor: '#dcfce7', borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>AVAILABLE</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                      {t.cabinStatuses.map(c => {
                        const bs = c.bookingStatus
                        const dotColor = isClosed ? '#ef4444' : bs === null ? '#ffffff' : bs === 'on_hold' ? '#22c55e' : bs === 'pending' ? '#eab308' : '#ef4444'
                        const dotBorder = dotColor === '#ffffff' ? '1.5px solid #94a3b8' : 'none'
                        return (
                          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: dotColor, border: dotBorder, flexShrink: 0, boxSizing: 'border-box' }} />
                            <span style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>{c.name}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {eventsForDay.bookings.filter(b => b.tripType === 'PRIVATE_CHARTER').map(b => {
                const badge    = STATUS_BADGE[b.status] ?? { bg: '#f1f5f9', color: '#64748b', label: b.status }
                const barColor = bookingBarColor(b.status)
                return (
                  <div key={b.id} style={{ backgroundColor: 'white', borderRadius: 14, padding: '14px 16px', marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${barColor}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{b.yachtName}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>Private Charter</p>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: badge.color, backgroundColor: badge.bg, borderRadius: 6, padding: '3px 10px', whiteSpace: 'nowrap', flexShrink: 0 }}>{badge.label}</span>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>

      {/* ── FAB yacht filter ── */}
      {filterOpen && (
        <div onClick={() => setFilterOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
      )}
      <div style={{ position: 'fixed', bottom: 24, right: 20, zIndex: 99, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {filterOpen && (
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: '8px 6px', boxShadow: '0 4px 24px rgba(0,0,0,0.13)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 150 }}>
            {yachts.map(y => (
              <button key={y.id} onClick={() => { setFilter(y.name); setFilterOpen(false) }}
                style={{
                  padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'left',
                  cursor: 'pointer', border: 'none',
                  background: yachtFilter === y.name ? colorMap[y.name] : '#f8fafc',
                  color: yachtFilter === y.name ? 'white' : '#334155',
                }}>
                {y.name}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => setFilterOpen(v => !v)}
          style={{
            height: 44, paddingLeft: 18, paddingRight: 18, borderRadius: 22,
            backgroundColor: colorMap[yachtFilter] ?? '#1a5f6e',
            border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 18px rgba(0,0,0,0.22)',
            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.8)', lineHeight: 1 }}>Yacht</span>
          <span style={{ width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.3)' }} />
          <span style={{ fontSize: 13, fontWeight: 800, color: 'white', lineHeight: 1 }}>
            {yachtFilter}
          </span>
        </button>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════
   Main component
════════════════════════════════════════ */
export function PublicCalendarView() {
  const [data, setData]          = useState<{ bookings: PublicBooking[]; openTrips: PublicOpenTrip[]; yachts: Yacht[] } | null>(null)
  const [loading, setLoading]    = useState(true)
  const [yachtFilter, setFilter] = useState<string>('')
  const [vH, setVH]              = useState(0)
  const [isMobile, setIsMobile]  = useState(false)
  const [mounted, setMounted]    = useState(false)
  const [filterStart, setFilterStart] = useState('')
  const [filterEnd,   setFilterEnd]   = useState('')

  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  useEffect(() => {
    const update = () => { setVH(window.innerHeight); setIsMobile(window.innerWidth < 768) }
    update()
    setMounted(true)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    fetch('/api/public/calendar')
      .then(r => r.json())
      .then(d => {
        setData(d); setLoading(false)
        const sorted = sortYachts(d.yachts ?? [])
        if (sorted.length > 0) setFilter(sorted[0].name)
      })
      .catch(() => setLoading(false))
  }, [])

  // Auto-navigate to the filter start month
  useEffect(() => {
    if (filterStart) {
      const d = new Date(filterStart)
      setYear(d.getFullYear())
      setMonth(d.getMonth())
    }
  }, [filterStart])

  const colorMap = useMemo(() => buildColorMap(data?.yachts ?? []), [data?.yachts])

  const filteredBookings = useMemo(
    () => !data || !yachtFilter ? [] : data.bookings.filter(b => b.yachtName === yachtFilter),
    [data, yachtFilter],
  )
  const allOpenTrips = useMemo(
    () => !data || !yachtFilter ? [] : data.openTrips.filter(t =>
      t.yacht.name === yachtFilter &&
      !(t.status === 'closed' && t.closedReason?.toLowerCase().includes('private'))
    ),
    [data, yachtFilter],
  )

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  if (!mounted) return null

  if (isMobile) {
    return (
      <MobileView
        data={data} loading={loading} year={year} month={month}
        yachtFilter={yachtFilter} setFilter={setFilter}
        prev={prev} next={next}
        filteredBookings={filteredBookings} filteredOpenTrips={allOpenTrips}
        colorMap={colorMap}
        filterStart={filterStart} filterEnd={filterEnd}
        setFilterStart={setFilterStart} setFilterEnd={setFilterEnd}
      />
    )
  }

  /* ── Desktop ── */
  const segments      = buildSegments(filteredBookings, allOpenTrips, colorMap, year, month)
  const weeks         = weeksOf(year, month)
  const sortedYachts  = sortYachts(data?.yachts ?? [])
  const baseRowH      = vH > 0 ? Math.max(Math.floor((vH - 228) / weeks.length), 80) : 120
  const segsByWeek: Record<number, Segment[]> = {}
  segments.forEach(s => { segsByWeek[s.weekIdx] = [...(segsByWeek[s.weekIdx] ?? []), s] })
  const maxLanes: Record<number, number> = {}
  segments.forEach(s => { maxLanes[s.weekIdx] = Math.max(maxLanes[s.weekIdx] ?? 0, s.lane + 1) })
  const todayStr  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const fEnd      = filterEnd || filterStart
  const filterActive = !!(filterStart || filterEnd)

  return (
    <div style={{ height: '100dvh', backgroundColor: '#f8fafc', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png.webp" alt="Samara Liveaboard" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
          <div style={{ width: 1, height: 32, backgroundColor: '#e2e8f0' }} />
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Vessel Schedule</p>
            <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>Samara Liveaboard — Availability Schedule</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>

        {/* LEFT: month nav + date filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={prev} style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={16} color="#475569" />
            </button>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', minWidth: 148, textAlign: 'center' }}>{MONTH_NAMES[month]} {year}</span>
            <button onClick={next} style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={16} color="#475569" />
            </button>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 24, backgroundColor: '#e2e8f0', flexShrink: 0 }} />

          {/* Date range filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarSearch size={14} color={filterActive ? '#1a5f6e' : '#94a3b8'} style={{ flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>FROM</span>
              <input
                type="date"
                value={filterStart}
                onChange={e => setFilterStart(e.target.value)}
                style={{
                  fontSize: 12, padding: '4px 8px', borderRadius: 6,
                  border: filterStart ? '1.5px solid #1a5f6e' : '1px solid #e2e8f0',
                  backgroundColor: filterStart ? '#e0f2f7' : 'white',
                  color: filterStart ? '#1a5f6e' : '#475569',
                  outline: 'none', cursor: 'pointer',
                }}
              />
            </div>
            <span style={{ color: '#94a3b8', fontSize: 13, paddingTop: 13, flexShrink: 0 }}>→</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>TO</span>
              <input
                type="date"
                value={filterEnd}
                min={filterStart}
                onChange={e => setFilterEnd(e.target.value)}
                style={{
                  fontSize: 12, padding: '4px 8px', borderRadius: 6,
                  border: filterEnd ? '1.5px solid #1a5f6e' : '1px solid #e2e8f0',
                  backgroundColor: filterEnd ? '#e0f2f7' : 'white',
                  color: filterEnd ? '#1a5f6e' : '#475569',
                  outline: 'none', cursor: 'pointer',
                }}
              />
            </div>
            {filterActive && (
              <button
                onClick={() => { setFilterStart(''); setFilterEnd('') }}
                style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 13, flexShrink: 0 }}
                title="Clear date filter"
              >
                <X size={11} color="#64748b" />
              </button>
            )}
          </div>
        </div>

        {/* RIGHT: yacht filters */}
        {data && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {sortedYachts.map(y => (
              <button key={y.id} onClick={() => setFilter(y.name)}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: yachtFilter === y.name ? `2px solid ${colorMap[y.name]}` : '1px solid #e2e8f0',
                  background: yachtFilter === y.name ? colorMap[y.name] : 'white',
                  color: yachtFilter === y.name ? 'white' : '#475569',
                }}>
                {y.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Calendar */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '8px 16px 0' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#94a3b8', fontSize: 14 }}>Loading schedule…</div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
              {DOW_LONG.map(d => <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>{d}</div>)}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {weeks.map((week, wi) => {
                const segs    = segsByWeek[wi] ?? []
                const maxLane = maxLanes[wi] ?? 0
                const rowH    = Math.max(baseRowH, DAY_H + maxLane * LANE_H + 8)
                return (
                  <div key={wi} style={{ position: 'relative', height: rowH, flexShrink: 0, borderBottom: wi < weeks.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', height: '100%' }}>
                      {week.map((day, di) => {
                        const ds        = day > 0 ? `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}` : ''
                        const isToday   = ds === todayStr
                        const inFilt    = day > 0 && !!filterStart && ds >= filterStart && ds <= fEnd
                        const isFiltSt  = day > 0 && !!filterStart && ds === filterStart
                        const isFiltEnd = day > 0 && !!fEnd && ds === fEnd
                        const isSingle  = filterStart === fEnd || !fEnd

                        // Determine range bar edges within this row
                        const prevDay   = di > 0 ? week[di - 1] : 0
                        const nextDay   = di < 6 ? week[di + 1] : 0
                        const prevDs    = prevDay > 0 ? `${year}-${String(month+1).padStart(2,'0')}-${String(prevDay).padStart(2,'0')}` : ''
                        const nextDs    = nextDay > 0 ? `${year}-${String(month+1).padStart(2,'0')}-${String(nextDay).padStart(2,'0')}` : ''
                        const prevInFilt = prevDay > 0 && !!filterStart && prevDs >= filterStart && prevDs <= fEnd
                        const nextInFilt = nextDay > 0 && !!filterStart && nextDs >= filterStart && nextDs <= fEnd

                        return (
                          <div key={di} style={{
                            borderRight: di < 6 ? '1px solid #f1f5f9' : 'none',
                            padding: '5px 6px',
                            backgroundColor: di === 0 ? '#fafafa' : 'white',
                            position: 'relative',
                          }}>
                            {/* Filter range bar behind date */}
                            {inFilt && !isSingle && (
                              <div style={{
                                position: 'absolute',
                                top: 4, height: 24,
                                left:  prevInFilt || isFiltSt  ? (isFiltSt  ? '50%' : '0')   : '0',
                                right: nextInFilt || isFiltEnd ? (isFiltEnd ? '50%' : '0') : '0',
                                backgroundColor: 'rgba(26,95,110,0.1)',
                                zIndex: 0,
                                // no border-radius so it joins adjacent cells seamlessly
                              }} />
                            )}
                            {day > 0 && (
                              <span style={{
                                fontSize: 12,
                                fontWeight: isToday || isFiltSt || isFiltEnd ? 700 : 500,
                                color: (isFiltSt || isFiltEnd) ? 'white'
                                  : isToday ? '#1a5f6e'
                                  : inFilt ? '#1a5f6e'
                                  : di === 0 ? '#94a3b8' : '#475569',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 24, height: 24, borderRadius: '50%',
                                backgroundColor: (isFiltSt || isFiltEnd) ? '#1a5f6e'
                                  : isToday ? '#e0f2f7'
                                  : 'transparent',
                                position: 'relative', zIndex: 1,
                                // Ring for in-range days (not start/end)
                                boxShadow: inFilt && !isFiltSt && !isFiltEnd
                                  ? '0 0 0 1.5px rgba(26,95,110,0.35)'
                                  : 'none',
                              }}>
                                {day}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {segs.map(seg => {
                      const lPct   = (seg.startCol / 7) * 100
                      const wPct   = ((seg.endCol - seg.startCol + 1) / 7) * 100
                      const lOff   = seg.isRealStart ? 3 : 0
                      const rOff   = seg.isRealEnd   ? 3 : 0
                      const top    = DAY_H + seg.lane * LANE_H
                      const ot     = seg.openTripRef
                      const bk     = seg.bookingRef
                      const nights = ot ? Math.round((new Date(ot.endDate).getTime() - new Date(ot.startDate).getTime()) / 86400000) : 0
                      const barStyle: React.CSSProperties = {
                        position: 'absolute', top,
                        left: `calc(${lPct}% + ${lOff}px)`,
                        width: `calc(${wPct}% - ${lOff + rOff}px)`,
                        height: LANE_H - 8,
                        borderRadius: seg.isRealStart && seg.isRealEnd ? 4 : seg.isRealStart ? '4px 0 0 4px' : seg.isRealEnd ? '0 4px 4px 0' : 0,
                        overflow: 'hidden', display: 'flex', alignItems: 'flex-start', zIndex: 10, cursor: 'default',
                      }
                      if (seg.isStripe) {
                        const gap = `${seg.color}44`
                        barStyle.background = `repeating-linear-gradient(45deg,${seg.color} 0px,${seg.color} 3px,${gap} 3px,${gap} 8px)`
                        barStyle.outline = `1.5px solid ${seg.color}`; barStyle.outlineOffset = '-1px'
                      } else { barStyle.backgroundColor = seg.color }
                      return (
                        <div key={seg.key} style={barStyle}>
                          {!seg.isRealStart && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 8px', overflow: 'hidden' }}>
                              <span style={{ fontSize: 10, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: seg.isStripe ? '#111827' : 'rgba(255,255,255,0.9)', textShadow: seg.isStripe ? 'none' : '0 1px 2px rgba(0,0,0,0.25)' }}>
                                {ot ? `↳ ${ot.title}` : bk ? `↳ ${bk.yachtName}` : '↳'}
                              </span>
                            </div>
                          )}
                          {seg.isRealStart && ot && (
                            <div style={{ margin: '3px 6px', backgroundColor: 'rgba(255,255,255,0.93)', borderRadius: 5, padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 'calc(100% - 12px)', overflow: 'hidden', alignSelf: 'flex-start' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>{ot.title}</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', flexShrink: 0 }}>{ot.yacht.name}</span>
                                <span style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>{nights + 1}D/{nights}N</span>
                                {ot.status === 'closed' && !ot.closedReason?.includes('Private Charter') && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', backgroundColor: '#64748b', borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap', flexShrink: 0 }}>CLOSED</span>}
                                {ot.status === 'full' && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', backgroundColor: '#ef4444', borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap', flexShrink: 0 }}>FULL</span>}
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px' }}>
                                {ot.cabinStatuses.map(c => {
                                  const bs = c.bookingStatus
                                  const dotColor = ot.status === 'closed' ? '#ef4444' : bs === null ? '#ffffff' : bs === 'on_hold' ? '#22c55e' : bs === 'pending' ? '#eab308' : '#ef4444'
                                  const dotBorder = dotColor === '#ffffff' ? '1.5px solid #475569' : 'none'
                                  return (
                                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                      <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: dotColor, border: dotBorder, flexShrink: 0, boxSizing: 'border-box' }} />
                                      <span style={{ fontSize: 11, color: '#334155', whiteSpace: 'nowrap', fontWeight: 600 }}>{c.name}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          {seg.isRealStart && bk && !ot && (() => {
                            const badge = STATUS_BADGE_BAR[bk.status] ?? { bg: 'rgba(0,0,0,0.25)', label: bk.status.toUpperCase() }
                            return (
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 14px', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}>{bk.yachtName}</span>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: 'white', background: badge.bg, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: 0.4 }}>{badge.label}</span>
                                </div>
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>Private Charter</span>
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div style={{ padding: '8px 0', display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'center' }}>
          {[
            { color: '#ef4444', label: 'Booked / Confirmed', border: 'none' },
            { color: '#eab308', label: 'Pending Payment', border: 'none' },
            { color: '#22c55e', label: 'On Hold', border: 'none' },
            { color: '#ffffff', label: 'Cabin Available', border: '1.5px solid #475569' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: l.color, border: l.border, flexShrink: 0, boxSizing: 'border-box' as const }} />
              <span style={{ fontSize: 11, color: '#64748b' }}>{l.label}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 24, height: 10, borderRadius: 3, background: 'repeating-linear-gradient(45deg,#22c55e 0,#22c55e 3px,#22c55e44 3px,#22c55e44 8px)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#64748b' }}>Open Trip</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#1a5f6e', flexShrink: 0, boxShadow: '0 0 0 1.5px rgba(26,95,110,0.4)' }} />
            <span style={{ fontSize: 11, color: '#64748b' }}>Date Filter</span>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#cbd5e1' }}>© {new Date().getFullYear()} Samara Liveaboard</span>
        </div>
      </div>
    </div>
  )
}
