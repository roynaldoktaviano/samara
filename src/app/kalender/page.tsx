'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronLeft, ChevronRight, Ship, SlidersHorizontal, X } from 'lucide-react'

interface PublicBooking {
  id: string; yachtId: string; yachtName: string
  startDate: string; endDate: string
  tripType: 'PRIVATE_CHARTER' | 'OPEN_TRIP'; status: string
}
interface PublicCabin {
  id: string; name: string; bookingStatus: string | null
}
interface PublicOpenTrip {
  id: string; title: string; yachtId: string; yachtName: string
  startDate: string; endDate: string; status: string
  destination: string; maxCapacity: number; spotsAvailable: number
  cabins: PublicCabin[]
}

const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES   = ['SUN','MON','TUE','WED','THU','FRI','SAT']
const DAY_FULL    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const YACHT_ORDER = ['Samara I','Samara II','Mischief Voyage','Otium']
const YACHT_PAL   = ['#3b82f6','#f97316','#8b5cf6','#10b981','#ec4899','#06b6d4']

const LANE_H = 28
const DAY_H  = 32

/* ── Helpers ── */

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()} ${MONTH_FULL[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`
}

function bookingStatusColor(status: string): string {
  if (status === 'on_hold')                                                     return '#22c55e'
  if (status === 'pending' || status === 'waiting_for_payment' || status === 'process_payments') return '#eab308'
  if (status === 'confirmed' || status === 'partially_paid'
    || status === 'fully_paid' || status === 'completed')                      return '#ef4444'
  return '#64748b'
}

function cabinDotColor(bookingStatus: string | null, tripClosed: boolean): string {
  if (tripClosed) return '#ef4444'
  if (bookingStatus === null)                                                  return 'transparent'
  if (bookingStatus === 'on_hold')                                             return '#22c55e'
  if (bookingStatus === 'pending'
    || bookingStatus === 'waiting_for_payment'
    || bookingStatus === 'process_payments')                                   return '#eab308'
  return '#ef4444'
}

function stripeStyle(color: string): React.CSSProperties {
  return { background: `repeating-linear-gradient(45deg,${color} 0px,${color} 3px,${color}44 3px,${color}44 8px)` }
}

function buildWeeks(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay()
  const total    = new Date(year, month + 1, 0).getDate()
  const cells: number[] = []
  for (let i = 0; i < firstDay; i++) cells.push(0)
  for (let d = 1; d <= total; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(0)
  const rows: number[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
}

/* Returns events (bookings + open trips) that overlap a given date */
function getAgendaItems(
  year: number, month: number, day: number,
  bookings: PublicBooking[], openTrips: PublicOpenTrip[],
  yachtFilter: string,
) {
  const date = new Date(year, month, day)
  type Item =
    | { kind: 'charter';  id: string; yachtName: string; status: string; color: string; startDate: string; endDate: string }
    | { kind: 'opentrip'; id: string; yachtName: string; status: string; color: string; startDate: string; endDate: string; cabins: PublicCabin[] }
  const items: Item[] = []

  for (const b of bookings) {
    if (b.tripType !== 'PRIVATE_CHARTER') continue
    if (yachtFilter !== 'all' && b.yachtName !== yachtFilter) continue
    const s = new Date(b.startDate + 'T00:00:00')
    const e = new Date(b.endDate   + 'T00:00:00')
    if (date >= s && date <= e)
      items.push({ kind: 'charter', id: b.id, yachtName: b.yachtName, status: b.status, color: bookingStatusColor(b.status), startDate: b.startDate, endDate: b.endDate })
  }

  for (const t of openTrips) {
    if (yachtFilter !== 'all' && t.yachtName !== yachtFilter) continue
    const s = new Date(t.startDate + 'T00:00:00')
    const e = new Date(t.endDate   + 'T00:00:00')
    if (date >= s && date <= e) {
      const color = t.status === 'closed' ? '#94a3b8' : t.status === 'full' ? '#ef4444' : '#22c55e'
      items.push({ kind: 'opentrip', id: t.id, yachtName: t.yachtName, status: t.status, color, startDate: t.startDate, endDate: t.endDate, cabins: t.cabins })
    }
  }

  return items
}

/* Returns map of day → unique yacht colors for mini calendar dots */
function getDayYachtColors(
  year: number, month: number,
  bookings: PublicBooking[], openTrips: PublicOpenTrip[],
  yachtFilter: string, colorMap: Record<string, string>,
): Map<number, string[]> {
  const total = new Date(year, month + 1, 0).getDate()
  const map   = new Map<number, string[]>()
  for (let d = 1; d <= total; d++) {
    const items = getAgendaItems(year, month, d, bookings, openTrips, yachtFilter)
    if (items.length > 0) {
      const colors = [...new Set(items.map(i => colorMap[i.yachtName] ?? '#64748b'))]
      map.set(d, colors)
    }
  }
  return map
}

/* ── Desktop segment builder ── */

type Seg = {
  key: string; weekIdx: number; startCol: number; endCol: number
  isRealStart: boolean; isRealEnd: boolean
  label: string; color: string; isStripe: boolean
  tooltip: string; status: string
  lane: number; laneSpan: number
  openTripRef?: PublicOpenTrip
}

function buildSegments(
  year: number, month: number, weeks: number[][],
  bookings: PublicBooking[], openTrips: PublicOpenTrip[],
  colorMap: Record<string, string>, yachtFilter: string,
): Seg[][] {
  type RawSeg = Omit<Seg, 'lane' | 'laneSpan'>
  const raw: RawSeg[] = []

  const addSegs = (
    id: string, label: string, color: string, isStripe: boolean,
    eStart: Date, eEnd: Date, tooltip: string, status: string,
    openTripRef?: PublicOpenTrip,
  ) => {
    weeks.forEach((week, wi) => {
      const actual = week
        .map((d, col) => d > 0 ? { d, col } : null)
        .filter(Boolean) as { d: number; col: number }[]
      if (!actual.length) return
      const wStart = new Date(year, month, actual[0].d)
      const wEnd   = new Date(year, month, actual[actual.length - 1].d)
      if (eEnd < wStart || eStart > wEnd) return
      const sDate = eStart > wStart ? eStart : wStart
      const eDate = eEnd   < wEnd   ? eEnd   : wEnd
      const startCol = week.indexOf(sDate.getDate())
      const endCol   = week.indexOf(eDate.getDate())
      if (startCol === -1 || endCol === -1) return
      raw.push({
        key: `${id}-w${wi}`, weekIdx: wi, startCol, endCol,
        isRealStart: eStart.getTime() === sDate.getTime(),
        isRealEnd:   eEnd.getTime()   === eDate.getTime(),
        label, color, isStripe, tooltip, status, openTripRef,
      })
    })
  }

  bookings
    .filter(b => b.tripType === 'PRIVATE_CHARTER')
    .filter(b => yachtFilter === 'all' || b.yachtName === yachtFilter)
    .forEach(b => addSegs(
      b.id, `Booked · ${b.yachtName}`,
      bookingStatusColor(b.status), false,
      new Date(b.startDate + 'T00:00:00'), new Date(b.endDate + 'T00:00:00'),
      `${b.yachtName} · Booked`, b.status,
    ))

  openTrips
    .filter(t => yachtFilter === 'all' || t.yachtName === yachtFilter)
    .forEach(t => {
      const isClosed = t.status === 'closed'
      const isFull   = t.status === 'full' || (!isClosed && t.spotsAvailable === 0)
      const color    = isClosed ? '#94a3b8' : isFull ? '#ef4444' : '#22c55e'
      addSegs(
        t.id, `Booked · ${t.yachtName}`, color, true,
        new Date(t.startDate + 'T00:00:00'), new Date(t.endDate + 'T00:00:00'),
        `${t.yachtName} · Booked`, t.status, t,
      )
    })

  const result: Seg[][] = weeks.map(() => [])
  weeks.forEach((_, wi) => {
    const segs = raw
      .filter(s => s.weekIdx === wi)
      .sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol))
    const laneEnds: number[] = []
    segs.forEach(seg => {
      const span = 2
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
}

/* ── Page ── */

export default function PublicCalendarPage() {
  const [bookings,    setBookings]    = useState<PublicBooking[]>([])
  const [openTrips,   setOpenTrips]   = useState<PublicOpenTrip[]>([])
  const [loading,     setLoading]     = useState(true)
  const [current,     setCurrent]     = useState(new Date())
  const [yachtFilter, setYachtFilter] = useState('Samara I')
  const [filterOpen,  setFilterOpen]  = useState(false)
  const [selectedDay, setSelectedDay] = useState(new Date().getDate())
  const filterRef = useRef<HTMLDivElement>(null)

  const year  = current.getFullYear()
  const month = current.getMonth()
  const today = new Date()

  /* Reset selected day when navigating months */
  useEffect(() => {
    const maxDay = new Date(year, month + 1, 0).getDate()
    const todayInThisMonth =
      today.getFullYear() === year && today.getMonth() === month
    setSelectedDay(todayInThisMonth ? today.getDate() : Math.min(selectedDay, maxDay))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  useEffect(() => {
    fetch('/api/public/calendar')
      .then(r => r.json())
      .then(d => {
        setBookings(Array.isArray(d.bookings) ? d.bookings : [])
        setOpenTrips(Array.isArray(d.openTrips) ? d.openTrips : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node))
        setFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const yachtNames = useMemo(() => {
    const names = new Set([
      ...YACHT_ORDER,
      ...bookings.map(b => b.yachtName),
      ...openTrips.map(t => t.yachtName),
    ].filter(Boolean))
    return [...names].sort((a, b) => {
      const ai = YACHT_ORDER.indexOf(a), bi = YACHT_ORDER.indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }, [bookings, openTrips])

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {}
    yachtNames.forEach((n, i) => { map[n] = YACHT_PAL[i % YACHT_PAL.length] })
    return map
  }, [yachtNames])

  const weeks = useMemo(() => buildWeeks(year, month), [year, month])

  /* Desktop grid */
  const segsByWeek = useMemo(
    () => buildSegments(year, month, weeks, bookings, openTrips, colorMap, yachtFilter),
    [year, month, weeks, bookings, openTrips, colorMap, yachtFilter],
  )

  /* Mobile agenda */
  const agendaItems = useMemo(
    () => getAgendaItems(year, month, selectedDay, bookings, openTrips, yachtFilter),
    [year, month, selectedDay, bookings, openTrips, yachtFilter],
  )

  /* day → yacht colors (for mini calendar dots) */
  const dayYachtColors = useMemo(
    () => getDayYachtColors(year, month, bookings, openTrips, yachtFilter, colorMap),
    [year, month, bookings, openTrips, yachtFilter, colorMap],
  )

  const isToday = (d: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === d

  const navigate = (dir: 'prev' | 'next') =>
    setCurrent(d => { const n = new Date(d); n.setMonth(n.getMonth() + (dir === 'next' ? 1 : -1)); return n })

  const activeColor = yachtFilter !== 'all' ? colorMap[yachtFilter] : undefined

  /* Shared chrome pieces */
  const header = (
    <header className="bg-white border-b px-3 sm:px-6 py-2 flex items-center gap-2 sm:gap-3 shrink-0">
      <Ship className="w-4 h-4 text-[#bdac7e] shrink-0" />
      <span className="font-bold text-xs sm:text-sm text-slate-700 tracking-wide whitespace-nowrap">Samara Liveaboard</span>
      <span className="text-slate-200 hidden sm:inline">|</span>
      <span className="hidden sm:inline text-xs text-slate-400">Jadwal Ketersediaan</span>
      <div className="hidden md:flex items-center gap-4 ml-auto">
        {[
          { style: stripeStyle('#22c55e'), label: 'Open Trip' },
          { style: stripeStyle('#ef4444'), label: 'Full' },
          { style: stripeStyle('#94a3b8'), label: 'Closed' },
          { style: { backgroundColor: '#3b82f6', borderRadius: 2 } as React.CSSProperties, label: 'Private Charter' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className="w-5 h-2.5 rounded-sm inline-block shrink-0" style={l.style} />
            <span className="text-[11px] text-slate-500">{l.label}</span>
          </div>
        ))}
      </div>
    </header>
  )

  const statusLegend = (
    <div className="bg-white border-b px-3 sm:px-6 py-1.5 shrink-0">
      {/* Mobile: 2×2 grid */}
      <div className="flex sm:hidden flex-wrap gap-x-4 gap-y-1">
        {[
          { dot: null,      label: 'Available' },
          { dot: '#22c55e', label: 'On Hold' },
          { dot: '#eab308', label: 'Waiting for Payment' },
          { dot: '#ef4444', label: 'Confirmed / Paid' },
        ].map(({ dot, label }) => (
          <div key={label} className="flex items-center gap-1.5 w-[calc(50%-8px)]">
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
              backgroundColor: dot ?? 'transparent',
              border: dot ? undefined : '1.5px solid #94a3b8',
            }} />
            <span className="text-[10px] text-slate-500 whitespace-nowrap">{label}</span>
          </div>
        ))}
      </div>
      {/* Desktop: single row */}
      <div className="hidden sm:flex items-center gap-5">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap shrink-0">Status</span>
        {[
          { dot: null,      label: 'Available' },
          { dot: '#22c55e', label: 'On Hold' },
          { dot: '#eab308', label: 'Waiting for Payment' },
          { dot: '#ef4444', label: 'Confirmed / Paid' },
        ].map(({ dot, label }) => (
          <div key={label} className="flex items-center gap-1.5 shrink-0">
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
              backgroundColor: dot ?? 'transparent',
              border: dot ? undefined : '1.5px solid #94a3b8',
            }} />
            <span className="text-[11px] text-slate-500 whitespace-nowrap">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )

  const floatingFilter = (
    <div ref={filterRef} className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-50 flex flex-col items-end gap-2">
      {filterOpen && (
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 px-3 sm:px-4 py-3 flex flex-col gap-1 sm:gap-1.5 min-w-44 sm:min-w-48">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Filter Kapal</span>
            <button onClick={() => setFilterOpen(false)} className="p-0.5 rounded hover:bg-slate-100 text-slate-400">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {yachtNames.map(n => (
            <button key={n}
              onClick={() => { setYachtFilter(yachtFilter === n ? 'all' : n); setFilterOpen(false) }}
              className={[
                'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left',
                yachtFilter === n ? 'text-white' : 'text-slate-600 hover:bg-slate-100',
              ].join(' ')}
              style={yachtFilter === n ? { backgroundColor: colorMap[n] } : {}}>
              <span className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: yachtFilter === n ? 'rgba(255,255,255,0.7)' : colorMap[n] }} />
              {n}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setFilterOpen(v => !v)}
        className="flex items-center gap-2 pl-3.5 sm:pl-4 pr-4 sm:pr-5 py-2.5 sm:py-3 rounded-full shadow-lg text-xs sm:text-sm font-semibold transition-all active:scale-95"
        style={activeColor
          ? { backgroundColor: activeColor, color: '#fff' }
          : { backgroundColor: '#1e293b', color: '#fff' }}>
        <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        <span className="max-w-24 sm:max-w-none truncate">
          {yachtFilter === 'all' ? 'Filter' : yachtFilter}
        </span>
      </button>
    </div>
  )

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50">
      {header}
      {statusLegend}

      {/* ════════════════════════════════
          MOBILE  (< md)
          Mini calendar + agenda list
          ════════════════════════════════ */}
      <div className="md:hidden flex-1 min-h-0 flex flex-col overflow-hidden">

        {/* Mini calendar card */}
        <div className="bg-white mx-3 mt-3 rounded-2xl shadow-sm border shrink-0">

          {/* Year + month nav */}
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            {/* Year */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setCurrent(d => { const n = new Date(d); n.setFullYear(n.getFullYear() - 1); return n })}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-400">
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="bg-[#bdac7e] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full select-none">{year}</span>
              <button
                onClick={() => setCurrent(d => { const n = new Date(d); n.setFullYear(n.getFullYear() + 1); return n })}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-400">
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            {/* Month */}
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('prev')} className="p-1 rounded-full hover:bg-slate-100 text-slate-400">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold text-slate-800 w-28 text-center select-none">{MONTH_FULL[month]}</span>
              <button onClick={() => navigate('next')} className="p-1 rounded-full hover:bg-slate-100 text-slate-400">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            {/* Spacer */}
            <div className="w-16" />
          </div>

          {/* Day name row */}
          <div className="grid grid-cols-7 px-2 pb-1">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-0.5">{d[0]}</div>
            ))}
          </div>

          {/* Date cells */}
          <div className="grid grid-cols-7 px-2 pb-3">
            {weeks.flat().map((day, i) => {
              const isSelected  = day === selectedDay
              const isTodayCell = day > 0 && isToday(day)
              const yachtColors = day > 0 ? (dayYachtColors.get(day) ?? []) : []
              const isPast      = day > 0 && new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate())
              return (
                <button key={i}
                  onClick={() => day > 0 && setSelectedDay(day)}
                  disabled={day === 0}
                  className="flex flex-col items-center py-0.5 disabled:pointer-events-none">
                  <span className={[
                    'w-8 h-8 flex items-center justify-center rounded-full text-xs font-semibold transition-colors',
                    day === 0       ? 'text-transparent'
                    : isSelected    ? 'bg-[#bdac7e] text-white'
                    : isTodayCell   ? 'border border-[#bdac7e] text-[#bdac7e]'
                    : isPast        ? 'text-slate-300'
                    :                 'text-slate-700 hover:bg-slate-100',
                  ].join(' ')}>
                    {day > 0 ? day : ''}
                  </span>
                  {/* per-yacht colored dots */}
                  <div className="flex gap-0.5 justify-center mt-0.5 h-1.5">
                    {yachtColors.slice(0, 4).map((c, ci) => (
                      <span key={ci} className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.7)' : c }} />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Selected date label */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            {DAY_FULL[new Date(year, month, selectedDay).getDay()]}, {selectedDay} {MONTH_FULL[month]} {year}
          </p>
        </div>

        {/* Agenda list */}
        <div className="flex-1 overflow-y-auto px-3 pb-24">
          {loading ? (
            <div className="flex items-center justify-center h-24 text-slate-400 text-sm gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Loading...
            </div>
          ) : agendaItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 gap-1">
              <span className="text-slate-300 text-2xl">—</span>
              <span className="text-[12px] text-slate-400">No schedule</span>
            </div>
          ) : agendaItems.map(item => {
            const isClosed = item.status === 'closed'
            return (
              <div key={item.id}
                className="bg-white rounded-2xl shadow-sm border mb-2.5 overflow-hidden flex">
                {/* Color bar */}
                <div className="w-1 shrink-0" style={{ backgroundColor: item.color }} />
                <div className="flex-1 px-4 py-3">
                  {/* Yacht + badge */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm text-slate-800">{item.yachtName}</span>
                    <span className={[
                      'text-[10px] font-bold px-2 py-0.5 rounded-full',
                      item.kind === 'charter'
                        ? 'bg-slate-100 text-slate-500'
                        : isClosed
                          ? 'bg-slate-100 text-slate-500'
                          : item.status === 'full'
                            ? 'bg-red-50 text-red-500'
                            : 'bg-green-50 text-green-600',
                    ].join(' ')}>
                      {item.kind === 'charter' ? 'Private Charter' : isClosed ? 'Closed' : item.status === 'full' ? 'Full' : 'Open Trip'}
                    </span>
                  </div>

                  {/* Date range + status */}
                  <p className="text-[11px] text-slate-500 font-medium mb-1">
                    {fmtDate(item.startDate)} — {fmtDate(item.endDate)}
                  </p>
                  <p className="text-[11px] text-slate-400 mb-2 capitalize">
                    {item.status.replace(/_/g, ' ')}
                  </p>

                  {/* Cabin dots (open trips only) */}
                  {item.kind === 'opentrip' && item.cabins.length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {item.cabins.map(c => {
                        const dc = cabinDotColor(c.bookingStatus, isClosed)
                        const isAvail = c.bookingStatus === null && !isClosed
                        return (
                          <div key={c.id} className="flex items-center gap-1.5">
                            <span style={{
                              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                              backgroundColor: isAvail ? 'transparent' : dc,
                              border: isAvail ? '1.5px solid #94a3b8' : undefined,
                              display: 'inline-block',
                            }} />
                            <span className="text-[11px] font-semibold text-slate-600">{c.name}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ════════════════════════════════
          DESKTOP  (md+)
          Full month grid
          ════════════════════════════════ */}
      <div className="hidden md:flex flex-1 min-h-0 flex-col px-4 md:px-6 py-3">
        <div className="flex-1 min-h-0 bg-white rounded-xl border shadow-sm flex flex-col overflow-hidden">

          {/* Month + year header */}
          <div className="flex items-center justify-between px-4 py-1.5 border-b shrink-0">
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setCurrent(d => { const n = new Date(d); n.setFullYear(n.getFullYear() - 1); return n })}
                className="p-1 rounded hover:bg-slate-100 text-slate-400 transition-colors">
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="bg-[#bdac7e] text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-full select-none">{year}</span>
              <button
                onClick={() => setCurrent(d => { const n = new Date(d); n.setFullYear(n.getFullYear() + 1); return n })}
                className="p-1 rounded hover:bg-slate-100 text-slate-400 transition-colors">
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('prev')} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-semibold text-slate-700 w-32 text-center select-none">{MONTH_FULL[month]}</span>
              <button onClick={() => navigate('next')} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Active yacht indicator */}
            <div className="w-36 flex justify-end">
              {yachtFilter !== 'all' ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
                  style={{ backgroundColor: `${colorMap[yachtFilter]}18`, color: colorMap[yachtFilter] }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorMap[yachtFilter] }} />
                  {yachtFilter}
                </span>
              ) : (
                <span className="text-xs text-slate-400 font-medium">All Yachts</span>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center flex-1 text-slate-400 text-sm gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Loading schedule...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 border-b bg-slate-50 shrink-0">
                {DAY_NAMES.map(d => (
                  <div key={d} className="text-center text-[11px] font-medium text-slate-400 py-1.5">{d}</div>
                ))}
              </div>

              <div className="flex-1 min-h-0 flex flex-col border-l border-slate-200 overflow-y-auto">
                {weeks.map((week, wi) => {
                  const maxLaneEnd = segsByWeek[wi].length > 0
                    ? Math.max(...segsByWeek[wi].map(s => s.lane + s.laneSpan))
                    : 0
                  const minH = DAY_H + maxLaneEnd * LANE_H + 4

                  return (
                    <div key={wi} className="relative border-b border-slate-200 last:border-b-0"
                      style={{ flex: 1, minHeight: minH }}>
                      <div className="absolute inset-0 grid grid-cols-7">
                        {week.map((day, col) => {
                          const todayCell = day > 0 && isToday(day)
                          const pastDate  = day > 0
                            ? new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate())
                            : false
                          return (
                            <div key={col} className={[
                              'border-r border-slate-200 pt-1 pl-1',
                              day === 0 ? 'bg-slate-50/80' : pastDate ? 'bg-slate-50/50' : 'bg-white',
                            ].join(' ')}>
                              {day > 0 && (
                                <span className={[
                                  'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                                  todayCell ? 'bg-[#bdac7e] text-white' : pastDate ? 'text-slate-300' : 'text-slate-500',
                                ].join(' ')}>
                                  {day}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {segsByWeek[wi].map(seg => {
                        const lPct = (seg.startCol / 7) * 100
                        const wPct = ((seg.endCol - seg.startCol + 1) / 7) * 100
                        const lOff = seg.isRealStart ? 2 : 0
                        const rOff = seg.isRealEnd   ? 2 : 0
                        const top  = DAY_H + seg.lane * LANE_H

                        const barStyle: React.CSSProperties = {
                          position: 'absolute', top,
                          left:   `calc(${lPct}% + ${lOff}px)`,
                          width:  `calc(${wPct}% - ${lOff + rOff}px)`,
                          height: seg.laneSpan * LANE_H - 6,
                          borderRadius: seg.isRealStart && seg.isRealEnd ? 4
                            : seg.isRealStart ? '4px 0 0 4px'
                            : seg.isRealEnd   ? '0 4px 4px 0' : 0,
                          overflow: 'hidden', zIndex: 10, cursor: 'default',
                        }

                        if (seg.isStripe) {
                          const c = seg.color
                          barStyle.background    = `repeating-linear-gradient(45deg,${c} 0px,${c} 3px,${c}44 3px,${c}44 8px)`
                          barStyle.outline       = `1.5px solid ${seg.color}`
                          barStyle.outlineOffset = '-1px'
                        } else {
                          barStyle.backgroundColor = seg.color
                        }

                        return (
                          <div key={seg.key} style={barStyle} title={seg.tooltip}>
                            {seg.isRealStart && (
                              seg.isStripe ? (
                                <div style={{
                                  margin: '2px 3px',
                                  backgroundColor: 'rgba(255,255,255,0.93)',
                                  borderRadius: 3, padding: '2px 4px',
                                  display: 'flex', flexDirection: 'column', gap: 2,
                                  maxWidth: 'calc(100% - 6px)', overflow: 'hidden',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>
                                      {seg.label}
                                    </span>
                                    {seg.status === 'closed' && (
                                      <span style={{ fontSize: 8, fontWeight: 700, color: '#fff', backgroundColor: '#94a3b8', borderRadius: 3, padding: '1px 3px', whiteSpace: 'nowrap', flexShrink: 0 }}>CLOSED</span>
                                    )}
                                    {seg.status === 'full' && (
                                      <span style={{ fontSize: 8, fontWeight: 700, color: '#fff', backgroundColor: '#ef4444', borderRadius: 3, padding: '1px 3px', whiteSpace: 'nowrap', flexShrink: 0 }}>FULL</span>
                                    )}
                                  </div>
                                  {seg.openTripRef && seg.openTripRef.cabins.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 5px' }}>
                                      {seg.openTripRef.cabins.map(c => {
                                        const isClosed = seg.status === 'closed'
                                        const dc = cabinDotColor(c.bookingStatus, isClosed)
                                        const isAvail = c.bookingStatus === null && !isClosed
                                        return (
                                          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                                            <span style={{
                                              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                              backgroundColor: isAvail ? 'transparent' : dc,
                                              border: isAvail ? '1.5px solid #94a3b8' : undefined,
                                            }} />
                                            <span style={{ fontSize: 8, color: '#334155', whiteSpace: 'nowrap', fontWeight: 600 }}>{c.name}</span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span style={{
                                  fontSize: 9, fontWeight: 600, color: 'white',
                                  padding: '0 6px',
                                  lineHeight: `${seg.laneSpan * LANE_H - 6}px`,
                                  overflow: 'hidden', textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap', display: 'block',
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
            </>
          )}
        </div>
      </div>

      {floatingFilter}
    </div>
  )
}
