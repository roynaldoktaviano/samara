'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Ship } from 'lucide-react'

const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES  = ['SUN','MON','TUE','WED','THU','FRI','SAT']

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

export default function KapalCalendarPage() {
  const { yachtId } = useParams<{ yachtId: string }>()
  const [yachtName, setYachtName] = useState<string | null>(null)
  const [bookedDates, setBookedDates] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [current, setCurrent] = useState(new Date())

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

  const year  = current.getFullYear()
  const month = current.getMonth()
  const today = new Date()
  const weeks = useMemo(() => buildWeeks(year, month), [year, month])

  const isBookedDay = (d: number) => d > 0 && bookedDates.has(dateStr(year, month, d))

  const isToday = (d: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === d

  const navigateMonth = (dir: 'prev' | 'next') =>
    setCurrent(d => { const n = new Date(d); n.setMonth(n.getMonth() + (dir === 'next' ? 1 : -1)); return n })

  const navigateYear = (dir: 'prev' | 'next') =>
    setCurrent(d => { const n = new Date(d); n.setFullYear(n.getFullYear() + (dir === 'next' ? 1 : -1)); return n })

  if (notFound) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-400 text-sm">Calendar not found</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" onContextMenu={e => e.preventDefault()}>
      <header className="bg-white border-b px-4 py-3 flex items-center gap-2 shrink-0">
        <Ship className="w-4 h-4 text-[#bdac7e] shrink-0" />
        <span className="font-bold text-sm text-slate-700 tracking-wide">
          {yachtName ?? 'Loading...'}
        </span>
      </header>

      <div className="flex-1 flex flex-col px-4 py-4 max-w-md w-full mx-auto">
        <div className="bg-white rounded-xl border shadow-sm flex flex-col overflow-hidden">

          {/* Year nav */}
          <div className="flex items-center justify-center gap-1 px-4 pt-3 pb-1">
            <button onClick={() => navigateYear('prev')} className="p-1 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="bg-[#bdac7e] text-white text-[11px] font-bold px-3 py-0.5 rounded-full select-none">{year}</span>
            <button onClick={() => navigateYear('next')} className="p-1 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Month nav */}
          <div className="flex items-center justify-between px-4 pb-2.5 border-b">
            <button onClick={() => navigateMonth('prev')} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-slate-700">{MONTH_FULL[month]}</span>
            <button onClick={() => navigateMonth('next')} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 border-b bg-slate-50">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1.5">{d[0]}</div>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Loading...
            </div>
          ) : (
            <div className="p-2 flex flex-col gap-1">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 h-10">
                  {week.map((day, col) => {
                    if (day === 0) return <div key={col} />
                    const booked     = isBookedDay(day)
                    const prevBooked = col > 0 && isBookedDay(week[col - 1])
                    const nextBooked = col < 6 && isBookedDay(week[col + 1])
                    const todayCell  = isToday(day)
                    return (
                      <div
                        key={col}
                        className={[
                          'flex items-center justify-center text-sm font-semibold',
                          booked
                            ? [
                                'bg-red-500 text-white',
                                !prevBooked ? 'rounded-l-full' : '',
                                !nextBooked ? 'rounded-r-full' : '',
                              ].join(' ')
                            : todayCell
                              ? 'text-[#bdac7e]'
                              : 'text-slate-700',
                        ].join(' ')}
                      >
                        {todayCell && !booked ? (
                          <span className="w-7 h-7 flex items-center justify-center rounded-full border border-[#bdac7e]">{day}</span>
                        ) : day}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 justify-center mt-4">
          <span className="w-3.5 h-3.5 rounded-md bg-red-500 shrink-0" />
          <span className="text-xs text-slate-500">Booked</span>
        </div>
      </div>
    </div>
  )
}
