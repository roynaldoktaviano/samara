'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Ship, ArrowLeft } from 'lucide-react'

const MISCHIEF_YACHT_ID = 'cmpdh6a430012oejj0cvknldm'
const MISCHIEF_LOGO_URL = 'https://mischiefvoyage.com/wp-content/uploads/2023/11/cropped-logo-mischief-2.png'

const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES   = ['SUN','MON','TUE','WED','THU','FRI','SAT']

type DayStatus = 'booked' | 'past' | 'available'

const STATUS_DOT: Record<DayStatus, string> = {
  booked: 'bg-red-500',
  past: 'bg-slate-300',
  available: 'bg-emerald-500',
}
const STATUS_CELL: Record<DayStatus, string> = {
  booked: 'bg-red-500 text-white',
  past: 'bg-slate-200 text-slate-500',
  available: 'bg-emerald-500 text-white',
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

function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function dayStatus(ds: string, bookedDates: Set<string>, todayStr: string): DayStatus {
  if (bookedDates.has(ds)) return 'booked'
  if (ds < todayStr) return 'past'
  return 'available'
}

/* ── Mini month grid — used in the year overview, click the title to drill in ── */
function MiniMonth({ year, month, bookedDates, todayStr, onSelect }: {
  year: number; month: number; bookedDates: Set<string>; todayStr: string
  onSelect: (month: number) => void
}) {
  const weeks = useMemo(() => buildWeeks(year, month), [year, month])
  return (
    <div className="bg-white rounded-xl border shadow-sm p-2.5">
      <button onClick={() => onSelect(month)} className="w-full text-center text-xs font-bold text-slate-700 mb-1.5 hover:text-[#bdac7e] transition-colors">
        {MONTH_FULL[month]}
      </button>
      <div className="grid grid-cols-7 gap-y-0.5">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[8px] font-semibold text-slate-400">{d[0]}</div>
        ))}
        {weeks.flat().map((day, i) => {
          if (day === 0) return <div key={i} />
          const ds = dateStr(year, month, day)
          const status = dayStatus(ds, bookedDates, todayStr)
          const isToday = ds === todayStr
          return (
            <div key={i} className="flex items-center justify-center py-0.5">
              <span className={[
                'w-full aspect-square max-w-[18px] flex items-center justify-center rounded-full text-[9px] font-semibold',
                STATUS_CELL[status],
                isToday ? 'ring-1 ring-offset-1 ring-[#bdac7e]' : '',
              ].join(' ')}>
                {day}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-4 justify-center mt-5 flex-wrap">
      {([['available', 'Available'], ['booked', 'Booked'], ['past', 'Past']] as const).map(([key, label]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded-full shrink-0 ${STATUS_DOT[key]}`} />
          <span className="text-xs text-slate-500">{label}</span>
        </div>
      ))}
    </div>
  )
}

export default function KapalCalendarPage() {
  const { yachtId } = useParams<{ yachtId: string }>()
  const [yachtName, setYachtName] = useState<string | null>(null)
  const [bookedDates, setBookedDates] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [current, setCurrent] = useState(new Date())
  const [viewMode, setViewMode] = useState<'year' | 'month'>('year')

  useEffect(() => {
    fetch(`/api/public/yacht-calendar/${yachtId}`)
      .then(async r => {
        if (!r.ok) { setNotFound(true); return null }
        return r.json()
      })
      .then(d => {
        if (!d) return
        setYachtName(d.yachtName)
        setBookedDates(new Set<string>(d.bookedDates ?? []))
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [yachtId])

  const today = new Date()
  const todayStr = dateStr(today.getFullYear(), today.getMonth(), today.getDate())
  const year  = current.getFullYear()
  const month = current.getMonth()
  const weeks = useMemo(() => buildWeeks(year, month), [year, month])

  const navigateMonth = (dir: 'prev' | 'next') =>
    setCurrent(d => { const n = new Date(d); n.setMonth(n.getMonth() + (dir === 'next' ? 1 : -1)); return n })

  const navigateYear = (dir: 'prev' | 'next') =>
    setCurrent(d => { const n = new Date(d); n.setFullYear(n.getFullYear() + (dir === 'next' ? 1 : -1)); return n })

  const selectMonth = (m: number) => {
    setCurrent(d => { const n = new Date(d); n.setMonth(m); return n })
    setViewMode('month')
  }

  if (notFound) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-400 text-sm">Calendar not found</p>
      </div>
    )
  }

  const isMischief = yachtId === MISCHIEF_YACHT_ID

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" onContextMenu={e => e.preventDefault()}>
      <header className="bg-white border-b px-4 py-3 flex items-center justify-center shrink-0">
        {isMischief ? (
          <img src={MISCHIEF_LOGO_URL} alt="Mischief" className="h-9 w-auto object-contain" />
        ) : (
          <div className="flex items-center gap-2">
            <Ship className="w-4 h-4 text-[#bdac7e] shrink-0" />
            <span className="font-bold text-sm text-slate-700 tracking-wide">
              {yachtName ?? 'Loading...'}
            </span>
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-2 text-slate-400 text-sm">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading...
        </div>
      ) : viewMode === 'year' ? (
        /* ── Year overview ── */
        <div className="flex-1 px-4 py-4 max-w-5xl w-full mx-auto">
          <div className="flex items-center justify-center gap-2 mb-4">
            <button onClick={() => navigateYear('prev')} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="bg-[#bdac7e] text-white text-sm font-bold px-4 py-1 rounded-full select-none">{year}</span>
            <button onClick={() => navigateYear('next')} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {MONTH_FULL.map((_, m) => (
              <MiniMonth key={m} year={year} month={m} bookedDates={bookedDates} todayStr={todayStr} onSelect={selectMonth} />
            ))}
          </div>

          <Legend />
        </div>
      ) : (
        /* ── Single month detail ── */
        <div className="flex-1 flex flex-col px-4 py-4 max-w-md w-full mx-auto">
          <button onClick={() => setViewMode('year')} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#bdac7e] transition-colors mb-3 self-start">
            <ArrowLeft className="w-3.5 h-3.5" /> {year}
          </button>

          <div className="bg-white rounded-xl border shadow-sm flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b">
              <button onClick={() => navigateMonth('prev')} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold text-slate-700">{MONTH_FULL[month]} {year}</span>
              <button onClick={() => navigateMonth('next')} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 border-b bg-slate-50">
              {DAY_NAMES.map(d => (
                <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1.5">{d[0]}</div>
              ))}
            </div>

            <div className="p-2 flex flex-col gap-1">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 h-10">
                  {week.map((day, col) => {
                    if (day === 0) return <div key={col} />
                    const ds = dateStr(year, month, day)
                    const status = dayStatus(ds, bookedDates, todayStr)
                    const prevDay = week[col - 1]
                    const nextDay = week[col + 1]
                    const prevSameStatus = col > 0 && prevDay > 0 && dayStatus(dateStr(year, month, prevDay), bookedDates, todayStr) === status
                    const nextSameStatus = col < 6 && nextDay > 0 && dayStatus(dateStr(year, month, nextDay), bookedDates, todayStr) === status
                    const isToday = ds === todayStr
                    return (
                      <div
                        key={col}
                        className={[
                          'flex items-center justify-center text-sm font-semibold',
                          STATUS_CELL[status],
                          !prevSameStatus ? 'rounded-l-full' : '',
                          !nextSameStatus ? 'rounded-r-full' : '',
                          isToday ? 'ring-2 ring-inset ring-[#bdac7e]' : '',
                        ].join(' ')}
                      >
                        {day}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <Legend />
        </div>
      )}
    </div>
  )
}
