'use client'

/**
 * Phone layout for the Trip Calendar (< md). Two screens:
 *  - Month: compact month grid where each trip is drawn as a pill spanning its days, with the
 *    selected day's trips as cards underneath.
 *  - Day ("Schedule"): horizontal day strip + a numbered timeline of every trip on that day.
 * It's purely presentational — CalendarViewFixed builds the event list (already filtered by
 * yacht/type) and owns every dialog, so tapping a trip opens the same detail as desktop.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronLeft, ChevronRight, Plus, CalendarPlus, CalendarDays, Ship } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDateRange } from '@/lib/format'

export interface MobileCalendarEvent {
  key: string
  start: string      // YYYY-MM-DD, inclusive
  end: string        // YYYY-MM-DD, inclusive
  title: string
  subtitle?: string
  kindLabel: string  // "Charter", "Open Trip", "Docking"…
  duration: string   // "4 days"
  color: string      // solid fill that keeps white text readable (status bar colour)
  barColor?: string  // colour in the multi-yacht view (the yacht's colour) — falls back to `color`
  barLabel?: string  // short text on the bar in the multi-yacht view ("Otium · De Pret") — falls back to `title`
  badge?: React.ReactNode
  onOpen: () => void
}

export interface MobileCalendarAction { label: string; icon?: React.ElementType; onClick: () => void }

type TripFilter = 'all' | 'PRIVATE_CHARTER' | 'OPEN_TRIP'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAY_SHORT = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const TRIP_FILTERS: { val: TripFilter; label: string }[] = [
  { val: 'all', label: 'All' },
  { val: 'PRIVATE_CHARTER', label: 'Charter' },
  { val: 'OPEN_TRIP', label: 'Open Trip' },
]

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const localToday = () => { const t = new Date(); return ymd(t.getFullYear(), t.getMonth(), t.getDate()) }
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
/** Today if it falls in that month, otherwise the 1st. */
const defaultDayFor = (y: number, m: number) => {
  const t = new Date()
  return t.getFullYear() === y && t.getMonth() === m ? localToday() : ymd(y, m, 1)
}
const pillBackground = (color: string) => `linear-gradient(90deg, color-mix(in srgb, ${color} 72%, white), ${color})`

export default function MobileCalendar({
  year, month, onMonthChange, events, yachts, yachtFilter, onYachtFilter, tripFilter, onTripFilter, actions, onNewBookingOnDate,
}: {
  year: number
  month: number
  onMonthChange: (year: number, month: number) => void
  events: MobileCalendarEvent[]
  yachts: { name: string; color: string }[]
  yachtFilter: string
  onYachtFilter: (name: string) => void
  tripFilter: TripFilter
  onTripFilter: (f: TripFilter) => void
  actions: MobileCalendarAction[]
  // Only passed for roles that can book — shown on an empty, future day.
  onNewBookingOnDate?: (date: string) => void
}) {
  const [rawSelected, setSelected] = useState(() => defaultDayFor(year, month))
  // Month changed (swipe, picker, or from outside) — the selected day falls back into the visible month.
  const selected = rawSelected.startsWith(`${year}-${pad(month + 1)}`) ? rawSelected : defaultDayFor(year, month)
  const [screen, setScreen] = useState<'month' | 'day'>('month')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(year)
  const [dir, setDir] = useState(1)
  const today = localToday()

  const goMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1)
    setDir(delta > 0 ? 1 : -1)
    onMonthChange(d.getFullYear(), d.getMonth())
  }

  // The day screen gets a history entry so the phone's back gesture returns to the month.
  useEffect(() => {
    const onPop = () => setScreen('month')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const openDay = (date?: string) => {
    if (date) setSelected(date)
    if (screen !== 'day') window.history.pushState({ calendarDay: true }, '')
    setScreen('day')
  }
  const closeDay = () => {
    if ((window.history.state as { calendarDay?: boolean } | null)?.calendarDay) window.history.back()
    else setScreen('month')
  }

  const selectedEvents = useMemo(
    () => events.filter(e => e.start <= selected && e.end >= selected).sort((a, b) => a.start.localeCompare(b.start)),
    [events, selected],
  )

  const selDate = new Date(selected + 'T00:00:00')
  const selLabel = selDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const canBookSelected = !!onNewBookingOnDate && selected > today

  return (
    <div className="-mx-3 -mt-3 sm:mx-0 sm:mt-0 min-h-[calc(100dvh-3rem)] bg-card px-4 pt-5 pb-10">
      {screen === 'month' ? (
        <>
          {/* Header — month picker + add */}
          <div className="flex items-start justify-between gap-3">
            <button type="button" onClick={() => { setPickerYear(year); setPickerOpen(v => !v) }} aria-expanded={pickerOpen}
              className="text-left -ml-1 px-1 rounded-lg active:bg-muted/60">
              <span className="flex items-center gap-1.5 text-[28px] leading-none font-bold tracking-tight">
                {MONTH_FULL[month]}
                <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', pickerOpen && 'rotate-180')} />
              </span>
              <span className="block mt-1.5 text-sm text-muted-foreground tabular-nums">{year}</span>
            </button>
            <div className="flex items-center gap-1 pt-1">
              <Button type="button" variant="ghost" size="icon" onClick={() => goMonth(-1)} aria-label="Previous month" className="size-8 rounded-full text-muted-foreground">
                <ChevronLeft className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => goMonth(1)} aria-label="Next month" className="size-8 rounded-full text-muted-foreground">
                <ChevronRight className="size-4" />
              </Button>
              {actions.length > 0 && (
                actions.length === 1 ? (
                  <Button type="button" size="sm" onClick={actions[0].onClick} className="ml-1 h-8 rounded-full px-3 text-xs shadow-sm">
                    <Plus className="size-3.5" /> {actions[0].label}
                  </Button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" size="sm" className="ml-1 h-8 rounded-full px-3 text-xs shadow-sm">
                        <Plus className="size-3.5" /> Add
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-48">
                      {actions.map(a => {
                        const Icon = a.icon ?? Plus
                        return (
                          <DropdownMenuItem key={a.label} onSelect={a.onClick} className="py-2.5">
                            <Icon className="size-4" /> {a.label}
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              )}
            </div>
          </div>

          {/* Month picker */}
          <AnimatePresence initial={false}>
            {pickerOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }} className="overflow-hidden">
                <div className="mt-4 rounded-2xl bg-muted/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Button type="button" variant="ghost" size="icon" onClick={() => setPickerYear(y => y - 1)} aria-label="Previous year" className="size-8 rounded-full">
                      <ChevronLeft className="size-4" />
                    </Button>
                    <span className="text-sm font-semibold tabular-nums">{pickerYear}</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setPickerYear(y => y + 1)} aria-label="Next year" className="size-8 rounded-full">
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {MONTH_SHORT.map((m, i) => {
                      const active = pickerYear === year && i === month
                      return (
                        <button key={m} type="button" aria-pressed={active}
                          onClick={() => { setDir(pickerYear * 12 + i >= year * 12 + month ? 1 : -1); onMonthChange(pickerYear, i); setPickerOpen(false) }}
                          className={cn('h-9 rounded-xl text-sm font-medium transition-colors',
                            active ? 'bg-primary text-primary-foreground' : 'text-foreground/80 active:bg-muted')}>
                          {m}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filters — yacht dropdown + trip type, one row */}
          <div className="mt-5 flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Filter by yacht"
                  className="h-9 shrink-0 max-w-[45%] inline-flex items-center gap-1.5 rounded-full bg-muted/60 pl-3 pr-2.5 text-xs font-medium active:bg-muted">
                  {yachtFilter
                    ? <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: yachts.find(y => y.name === yachtFilter)?.color }} />
                    : <Ship className="size-3.5 shrink-0 text-muted-foreground" />}
                  <span className="truncate">{yachtFilter || 'All yachts'}</span>
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-48">
                <DropdownMenuRadioGroup value={yachtFilter} onValueChange={onYachtFilter}>
                  <DropdownMenuRadioItem value="" className="py-2.5">
                    <Ship className="size-3.5 text-muted-foreground" /> All yachts
                  </DropdownMenuRadioItem>
                  {yachts.map(y => (
                    <DropdownMenuRadioItem key={y.name} value={y.name} className="py-2.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: y.color }} /> {y.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <div role="group" aria-label="Trip type" className="flex-1 min-w-0 grid grid-cols-3 rounded-full bg-muted/60 p-1">
              {TRIP_FILTERS.map(f => (
                <button key={f.val} type="button" aria-pressed={tripFilter === f.val} onClick={() => onTripFilter(f.val)}
                  className={cn('h-7 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors',
                    tripFilter === f.val ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Month grid */}
          <MonthGrid year={year} month={month} dir={dir} events={events} selected={selected} today={today}
            onSelect={setSelected} onSwipe={goMonth} />

          {/* Selected day's trips */}
          <div className="mt-6 flex items-center justify-between">
            <h3 className="text-base font-semibold">{selected === today ? "Today's schedule" : selLabel}</h3>
            <button type="button" onClick={() => openDay()} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary-strong">
              Day view <ChevronRight className="size-3.5" />
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {selectedEvents.length === 0 ? (
              <EmptyDay canBook={canBookSelected} onBook={() => onNewBookingOnDate?.(selected)} />
            ) : selectedEvents.map(ev => (
              <button key={ev.key} type="button" onClick={ev.onOpen}
                className="w-full text-left rounded-2xl bg-muted/50 px-4 py-3.5 active:bg-muted transition-colors">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-2.5 shrink-0 rounded-full border-2" style={{ borderColor: ev.color }} />
                  <span className="truncate tabular-nums">{formatDateRange(ev.start, ev.end, { utc: true })} · {ev.duration}</span>
                  {ev.badge && <span className="ml-auto shrink-0">{ev.badge}</span>}
                </div>
                <p className="mt-1.5 text-[15px] font-semibold truncate">{ev.title}</p>
                {ev.subtitle && <p className="mt-0.5 text-xs text-muted-foreground truncate">{ev.subtitle}</p>}
              </button>
            ))}
          </div>
        </>
      ) : (
        <DayScreen year={year} month={month} selected={selected} today={today} events={events} dayEvents={selectedEvents}
          onSelect={setSelected} onBack={closeDay} onMonth={goMonth}
          canBook={canBookSelected} onBook={() => onNewBookingOnDate?.(selected)} />
      )}
    </div>
  )
}

/* ── Month grid ─────────────────────────────────────────────────────────────────────────
   Single yacht (trips never overlap): each trip is a pill behind the day numbers.
   All yachts / overlapping trips: each trip becomes a labelled bar in its own lane under the
   numbers (up to MAX_LANES; the rest are summarised as "+n" on the day). */

const MAX_LANES = 3
const BAR_TOP = 36   // px — bars start under the day number
const BAR_H = 15     // px — tall enough for a 9px label
const BAR_STEP = 17  // px per lane (bar + 2px gap)

type Seg = { key: string; startCol: number; endCol: number; realStart: boolean; realEnd: boolean; color: string; barColor: string; label: string; lane: number }

function MonthGrid({ year, month, dir, events, selected, today, onSelect, onSwipe }: {
  year: number; month: number; dir: number
  events: MobileCalendarEvent[]
  selected: string; today: string
  onSelect: (date: string) => void
  onSwipe: (delta: number) => void
}) {
  const weeks = useMemo(() => {
    const first = new Date(year, month, 1).getDay()
    const cells: number[] = [...Array(first).fill(0), ...Array.from({ length: daysIn(year, month) }, (_, i) => i + 1)]
    while (cells.length % 7) cells.push(0)
    const rows: number[][] = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
    return rows
  }, [year, month])

  const layout = useMemo(() => weeks.map(week => {
    const real = week.filter(d => d > 0)
    const wStart = ymd(year, month, real[0])
    const wEnd = ymd(year, month, real[real.length - 1])
    const inWeek = events
      .filter(e => e.start <= wEnd && e.end >= wStart)
      .sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end))
    const laneEnds: number[] = []
    const segs: Seg[] = []
    for (const e of inWeek) {
      const s = e.start > wStart ? e.start : wStart
      const en = e.end < wEnd ? e.end : wEnd
      const startCol = week.indexOf(Number(s.slice(8)))
      const endCol = week.indexOf(Number(en.slice(8)))
      if (startCol < 0 || endCol < 0) continue
      let lane = laneEnds.findIndex(end => end < startCol)
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(endCol) } else laneEnds[lane] = endCol
      segs.push({ key: e.key, startCol, endCol, realStart: e.start >= wStart, realEnd: e.end <= wEnd, color: e.color, barColor: e.barColor ?? e.color, label: e.barLabel ?? e.title, lane })
    }
    // Trips that didn't get a visible lane, counted per day column.
    const hidden: Record<number, number> = {}
    for (const sg of segs) if (sg.lane >= MAX_LANES) for (let c = sg.startCol; c <= sg.endCol; c++) hidden[c] = (hidden[c] ?? 0) + 1
    return { segs, laneCount: laneEnds.length, hidden }
  }), [weeks, events, year, month])

  const barMode = layout.some(w => w.laneCount > 1)
  const touch = useRef<{ x: number; y: number } | null>(null)

  return (
    <div className="mt-5 select-none"
      onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
      onTouchEnd={e => {
        const t = touch.current; touch.current = null
        if (!t) return
        const dx = e.changedTouches[0].clientX - t.x
        const dy = e.changedTouches[0].clientY - t.y
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1)
      }}>
      <div className="grid grid-cols-7 pb-2">
        {WEEKDAY_SHORT.map(d => (
          <span key={d} className="text-center text-[11px] font-medium tracking-wide text-muted-foreground">{d}</span>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={`${year}-${month}`}
          initial={{ opacity: 0, x: dir * 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -28 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}>
          {weeks.map((week, wi) => {
            const { segs, laneCount, hidden } = layout[wi]
            const shownLanes = Math.min(laneCount, MAX_LANES)
            const rowHeight = barMode ? Math.max(48, BAR_TOP + shownLanes * BAR_STEP + 8) : 48
            const onPill = (col: number) => !barMode && segs.some(p => col >= p.startCol && col <= p.endCol)
            return (
              <div key={wi} className="relative grid grid-cols-7" style={{ height: rowHeight }}>
                {segs.filter(sg => sg.lane < MAX_LANES).map(sg => {
                  const inset = barMode ? 2 : 4
                  const horizontal = {
                    left: `calc(${(sg.startCol / 7) * 100}% + ${sg.realStart ? inset : 0}px)`,
                    right: `calc(${((6 - sg.endCol) / 7) * 100}% + ${sg.realEnd ? inset : 0}px)`,
                  }
                  return barMode ? (
                    <span key={sg.key} aria-hidden
                      className={cn('absolute z-20 pointer-events-none overflow-hidden whitespace-nowrap px-1.5 text-[9px] font-semibold text-white',
                        sg.realStart ? 'rounded-l-md' : '', sg.realEnd ? 'rounded-r-md' : '')}
                      style={{ ...horizontal, top: BAR_TOP + sg.lane * BAR_STEP, height: BAR_H, lineHeight: `${BAR_H}px`, backgroundColor: sg.barColor, textOverflow: 'ellipsis' }}>
                      {sg.label}
                    </span>
                  ) : (
                    <span key={sg.key} aria-hidden
                      className={cn('absolute top-1.5 bottom-1.5', sg.realStart && 'rounded-l-full', sg.realEnd && 'rounded-r-full')}
                      style={{ ...horizontal, background: pillBackground(sg.color), boxShadow: `0 4px 12px -6px ${sg.color}` }} />
                  )
                })}
                {week.map((d, col) => {
                  if (!d) return <span key={col} />
                  const date = ymd(year, month, d)
                  const isSel = date === selected
                  const isToday = date === today
                  const pill = onPill(col)
                  return (
                    <button key={col} type="button" onClick={() => onSelect(date)} aria-pressed={isSel}
                      aria-label={new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                      className={cn('relative z-10 flex justify-center', barMode ? 'items-start pt-0.5' : 'items-center')}>
                      <span className={cn('rounded-full flex items-center justify-center text-sm tabular-nums transition-colors',
                        barMode ? 'size-8' : 'size-9',
                        isSel ? 'bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/40 ring-2 ring-card'
                          : pill ? 'text-white font-medium'
                          : isToday ? cn('text-primary-strong font-bold', barMode && 'ring-1 ring-primary')
                          : 'text-foreground')}>
                        {d}
                      </span>
                      {isToday && !isSel && !barMode && (
                        <span className={cn('absolute bottom-1 size-1 rounded-full', pill ? 'bg-white' : 'bg-primary')} />
                      )}
                      {hidden[col] > 0 && (
                        <span className="absolute bottom-0 inset-x-0 text-center text-[9px] font-semibold leading-none text-muted-foreground">+{hidden[col]}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ── Day screen: day strip + numbered timeline ────────────────────────────────────────── */

function DayScreen({ year, month, selected, today, events, dayEvents, onSelect, onBack, onMonth, canBook, onBook }: {
  year: number; month: number; selected: string; today: string
  events: MobileCalendarEvent[]; dayEvents: MobileCalendarEvent[]
  onSelect: (date: string) => void
  onBack: () => void
  onMonth: (delta: number) => void
  canBook: boolean; onBook: () => void
}) {
  const stripRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>('[data-selected="true"]')
    const strip = stripRef.current
    if (el && strip) strip.scrollTo({ left: el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' })
  }, [selected])

  const days = Array.from({ length: daysIn(year, month) }, (_, i) => ymd(year, month, i + 1))
  const busy = new Set(days.filter(d => events.some(e => e.start <= d && e.end >= d)))

  return (
    <>
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="Back to month" className="-ml-2 size-9 rounded-full">
          <ChevronLeft className="size-5" />
        </Button>
        <h2 className="text-2xl font-bold tracking-tight">Schedule</h2>
        <div className="ml-auto flex items-center">
          <Button type="button" variant="ghost" size="icon" onClick={() => onMonth(-1)} aria-label="Previous month" className="size-8 rounded-full text-muted-foreground">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium text-muted-foreground tabular-nums">{MONTH_SHORT[month]} {year}</span>
          <Button type="button" variant="ghost" size="icon" onClick={() => onMonth(1)} aria-label="Next month" className="size-8 rounded-full text-muted-foreground">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div ref={stripRef} className="relative mt-5 -mx-4 px-4 flex gap-3 overflow-x-auto pt-1 pb-5 [scrollbar-width:none] snap-x">
        {days.map(d => {
          const date = new Date(d + 'T00:00:00')
          const isSel = d === selected
          return (
            <button key={d} type="button" data-selected={isSel} onClick={() => onSelect(d)} aria-pressed={isSel}
              className={cn('relative snap-center shrink-0 w-[60px] h-[74px] rounded-2xl flex flex-col items-center justify-center transition-all',
                isSel ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/35 -translate-y-0.5' : 'bg-muted/60 text-foreground active:bg-muted')}>
              <span className="text-xl font-semibold tabular-nums leading-none">{date.getDate()}</span>
              <span className={cn('mt-1.5 text-[10px] font-medium uppercase tracking-wide', isSel ? 'opacity-85' : 'text-muted-foreground')}>
                {WEEKDAY_SHORT[date.getDay()]}
              </span>
              {busy.has(d) && <span className={cn('absolute bottom-2 size-1 rounded-full', isSel ? 'bg-primary-foreground' : 'bg-primary')} />}
              {d === today && !isSel && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-destructive" aria-label="Today" />}
            </button>
          )
        })}
      </div>

      <p className="mt-1 mb-4 text-xs text-muted-foreground">
        {new Date(selected + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        {' · '}{dayEvents.length} trip{dayEvents.length === 1 ? '' : 's'}
      </p>

      {dayEvents.length === 0 ? (
        <EmptyDay canBook={canBook} onBook={onBook} />
      ) : (
        <ol>
          {dayEvents.map((ev, i) => {
            const last = i === dayEvents.length - 1
            return (
              <li key={ev.key} className={cn('relative pl-10', !last && 'pb-7')}>
                {!last && (
                  <span aria-hidden className="absolute left-[11px] top-7 bottom-1 w-0.5 rounded-full"
                    style={{ background: `linear-gradient(to bottom, ${ev.color}, color-mix(in srgb, ${dayEvents[i + 1].color} 35%, transparent))` }} />
                )}
                <span className="absolute left-0 top-0 size-6 rounded-full flex items-center justify-center text-[11px] font-semibold text-white"
                  style={{ background: pillBackground(ev.color) }}>
                  {i + 1}
                </span>
                <button type="button" onClick={ev.onOpen} className="w-full text-left rounded-lg -my-1 py-1 active:bg-muted/50">
                  <p className="text-sm text-muted-foreground tabular-nums leading-6">{formatDateRange(ev.start, ev.end, { utc: true })} · {ev.duration}</p>
                  <p className="mt-1.5 text-base font-semibold leading-snug">{ev.title}</p>
                  {ev.subtitle && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ev.subtitle}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{ev.kindLabel}</span>
                    {ev.badge}
                  </div>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </>
  )
}

function EmptyDay({ canBook, onBook }: { canBook: boolean; onBook: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed px-4 py-8 text-center">
      <CalendarDays className="mx-auto size-8 text-muted-foreground/40" />
      <p className="mt-2 text-sm text-muted-foreground">No trips on this day</p>
      {canBook && (
        <Button type="button" variant="outline" size="sm" onClick={onBook} className="mt-3 rounded-full">
          <CalendarPlus className="size-3.5" /> New booking on this date
        </Button>
      )}
    </div>
  )
}
