'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { CalendarCheck, Loader2, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface EmployeeLite { id: string; fullName: string; employeeNumber: string; department: string | null }
interface CellRecord { status: string; note: string | null; leaveRequestId: string | null }
interface AttendanceData {
  employees: EmployeeLite[]
  days: string[]
  records: Record<string, Record<string, CellRecord>>
  holidays: Record<string, string>
}

const STATUSES = ['HADIR', 'IZIN', 'SAKIT', 'CUTI', 'ALPHA', 'LIBUR'] as const

const STATUS_META: Record<string, { label: string; dot: string }> = {
  HADIR: { label: 'Present', dot: 'bg-emerald-500' },
  IZIN: { label: 'Permission', dot: 'bg-amber-500' },
  SAKIT: { label: 'Sick', dot: 'bg-blue-500' },
  CUTI: { label: 'Leave', dot: 'bg-purple-500' },
  ALPHA: { label: 'Absent', dot: 'bg-red-500' },
  LIBUR: { label: 'Day Off', dot: 'bg-gray-400' },
}

// Parsed as UTC so the grid's day-of-week labeling never shifts with the viewer's local
// timezone — these are plain calendar-day identifiers ("2026-08-26"), not instants.
function dayInfo(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return { day: d, weekdayLabel: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow], isWeekend: dow === 0 || dow === 6 }
}

function pad(n: number) { return String(n).padStart(2, '0') }
function toYmd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

interface LocationLite { id: string; name: string }

export default function AttendanceRecapPage() {
  const now = useMemo(() => new Date(), [])
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-12

  const startDate = toYmd(new Date(year, month - 1, 1))
  const endDate = toYmd(new Date(year, month, 0))

  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<LocationLite[]>([])

  const [data, setData] = useState<AttendanceData | null>(null)
  const [loading, setLoading] = useState(true)

  const [cellPopover, setCellPopover] = useState<{ employeeId: string; date: string } | null>(null)
  const [cellNote, setCellNote] = useState('')
  const [saving, setSaving] = useState(false)

  const [bulkTarget, setBulkTarget] = useState<{ employeeId: string; fullName: string } | null>(null)
  const [bulkStatus, setBulkStatus] = useState<string>('IZIN')
  const [bulkStart, setBulkStart] = useState('')
  const [bulkEnd, setBulkEnd] = useState('')
  const [bulkNote, setBulkNote] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ start: startDate, end: endDate })
    if (locationId) params.set('locationId', locationId)
    const res = await fetch(`/api/hr/attendance?${params}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [startDate, endDate, locationId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/hr/work-locations').then(r => r.ok ? r.json() : []).then((locs: LocationLite[]) => setLocations(locs)).catch(() => {})
  }, [])

  function statusFor(employeeId: string, date: string): CellRecord {
    const explicit = data?.records[employeeId]?.[date]
    if (explicit) return explicit
    const holidayName = data?.holidays[date]
    if (holidayName) return { status: 'LIBUR', note: holidayName, leaveRequestId: null }
    return { status: 'HADIR', note: null, leaveRequestId: null }
  }

  async function setCell(employeeId: string, dates: string[], status: string, note: string) {
    const res = await fetch('/api/hr/attendance', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, dates, status, note }),
    })
    return res.ok
  }

  function openCell(employeeId: string, date: string) {
    setCellNote(statusFor(employeeId, date).note ?? '')
    setCellPopover({ employeeId, date })
  }

  async function saveCell(status: string) {
    if (!cellPopover) return
    setSaving(true)
    const ok = await setCell(cellPopover.employeeId, [cellPopover.date], status, cellNote)
    setSaving(false)
    if (ok) { setCellPopover(null); load() }
  }

  function openBulk(employeeId: string, fullName: string) {
    setBulkTarget({ employeeId, fullName })
    setBulkStatus('IZIN')
    setBulkStart(startDate)
    setBulkEnd(endDate)
    setBulkNote('')
  }

  async function saveBulk() {
    if (!bulkTarget || !data) return
    setBulkSaving(true)
    const dates = data.days.filter(d => d >= bulkStart && d <= bulkEnd && !dayInfo(d).isWeekend)
    const ok = await setCell(bulkTarget.employeeId, dates, bulkStatus, bulkNote)
    setBulkSaving(false)
    if (ok) { setBulkTarget(null); load() }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Attendance Recap</h2>
          <p className="text-muted-foreground text-sm mt-1">Everyone is Present by default — mark exceptions below. Approved leave requests fill in Leave automatically.</p>
        </div>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Month</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="h-9 border rounded-md px-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500">
            {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Year</label>
          <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
            className="h-9 w-24 border rounded-md px-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Work Location</label>
          <select value={locationId} onChange={e => setLocationId(e.target.value)}
            className="h-9 border rounded-md px-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500">
            <option value="">All locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3 ml-auto flex-wrap">
          {STATUSES.map(s => (
            <div key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[s].dot}`} />
              {STATUS_META[s].label}
            </div>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <div className="rounded-lg border h-64 bg-muted/30 animate-pulse" />
      ) : data.employees.length === 0 ? (
        <div className="rounded-xl border py-12 text-center text-muted-foreground text-sm">
          <CalendarCheck className="h-8 w-8 mx-auto mb-2 opacity-20" />
          No employees match this filter.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse w-full">
              <thead>
                <tr className="border-b">
                  <th className="sticky left-0 bg-muted/50 px-4 py-2.5 text-left font-medium text-muted-foreground text-xs z-10 min-w-[200px]">Employee</th>
                  {data.days.map(d => {
                    const info = dayInfo(d)
                    const holidayName = data.holidays[d]
                    return (
                      <th key={d} className={`px-1.5 py-2 text-center font-medium text-xs whitespace-nowrap ${info.isWeekend || holidayName ? 'bg-muted/40 text-muted-foreground/60' : 'text-muted-foreground'}`}
                        title={holidayName}>
                        <div>{info.weekdayLabel}</div>
                        <div>{info.day}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.employees.map(emp => (
                  <tr key={emp.id} className="hover:bg-muted/10">
                    <td className="sticky left-0 bg-white px-4 py-2 z-10">
                      <button onClick={() => openBulk(emp.id, emp.fullName)} className="text-left hover:text-amber-700 transition-colors" title="Bulk edit this employee">
                        <p className="font-medium">{emp.fullName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{emp.employeeNumber}</p>
                      </button>
                    </td>
                    {data.days.map(d => {
                      const info = dayInfo(d)
                      const rec = statusFor(emp.id, d)
                      if (info.isWeekend && rec.status === 'HADIR') {
                        return <td key={d} className="px-1.5 py-2 text-center bg-muted/20">
                          <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-muted-foreground/30" title="Weekend — not a working day" />
                        </td>
                      }
                      return (
                        <td key={d} className="px-1.5 py-2 text-center">
                          <Popover open={cellPopover?.employeeId === emp.id && cellPopover?.date === d} onOpenChange={v => !v && setCellPopover(null)}>
                            <PopoverTrigger asChild>
                              <button onClick={() => openCell(emp.id, d)}
                                className={`h-3 w-3 rounded-full ${STATUS_META[rec.status]?.dot ?? 'bg-emerald-500'} ${rec.leaveRequestId ? 'ring-2 ring-offset-1 ring-purple-300' : ''} hover:scale-125 transition-transform`}
                                title={`${STATUS_META[rec.status]?.label ?? rec.status}${rec.note ? ` — ${rec.note}` : ''}`} />
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-3" align="center">
                              <p className="text-xs font-semibold mb-2">{emp.fullName} · {d}</p>
                              <div className="grid grid-cols-3 gap-1.5 mb-2">
                                {STATUSES.map(s => (
                                  <button key={s} onClick={() => saveCell(s)} disabled={saving}
                                    className={`flex flex-col items-center gap-1 px-1.5 py-1.5 rounded-md border text-[10px] transition-colors ${rec.status === s ? 'border-amber-400 bg-amber-50' : 'border-transparent hover:bg-muted'}`}>
                                    <span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[s].dot}`} />
                                    {STATUS_META[s].label}
                                  </button>
                                ))}
                              </div>
                              <textarea rows={2} placeholder="Note (optional)" value={cellNote} onChange={e => setCellNote(e.target.value)}
                                className="w-full border rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none" />
                              {rec.leaveRequestId && <p className="text-[10px] text-purple-600 mt-1">Set automatically from an approved leave request.</p>}
                            </PopoverContent>
                          </Popover>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk edit modal */}
      {bulkTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-sm">Bulk Edit — {bulkTarget.fullName}</h3>
              <button onClick={() => setBulkTarget(null)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">From</label>
                  <input type="date" value={bulkStart} min={startDate} max={endDate} onChange={e => setBulkStart(e.target.value)}
                    className="w-full h-9 border rounded-md px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">To</label>
                  <input type="date" value={bulkEnd} min={startDate} max={endDate} onChange={e => setBulkEnd(e.target.value)}
                    className="w-full h-9 border rounded-md px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {STATUSES.map(s => (
                    <button key={s} onClick={() => setBulkStatus(s)}
                      className={`flex flex-col items-center gap-1 px-1.5 py-2 rounded-md border text-[11px] transition-colors ${bulkStatus === s ? 'border-amber-400 bg-amber-50' : 'border-muted hover:bg-muted'}`}>
                      <span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[s].dot}`} />
                      {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Note (optional)</label>
                <textarea rows={2} value={bulkNote} onChange={e => setBulkNote(e.target.value)}
                  className="w-full border rounded-md px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none" />
              </div>
              <p className="text-[11px] text-muted-foreground">Weekends in this range are skipped automatically — they're never working days.</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
              <button onClick={() => setBulkTarget(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
              <button onClick={saveBulk} disabled={bulkSaving}
                className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                {bulkSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
