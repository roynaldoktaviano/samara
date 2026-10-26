'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { CalendarCheck } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'

interface EmployeeLite { id: string; fullName: string; employeeNumber: string; department: string | null; isCrew: boolean; locationId: string | null }
interface CellRecord { status: string; note: string | null; leaveRequestId: string | null }
interface HolidayInfo { name: string; excludedLocationIds: string[] }
interface AttendanceData {
  employees: EmployeeLite[]
  days: string[]
  records: Record<string, Record<string, CellRecord>>
  holidays: Record<string, HolidayInfo>
}

const STATUSES = ['HADIR', 'WFH', 'IZIN', 'SAKIT', 'CUTI', 'ALPHA', 'LIBUR'] as const

const STATUS_META: Record<string, { label: string; dot: string }> = {
  HADIR: { label: 'Present', dot: 'bg-success' },
  WFH: { label: 'WFH', dot: 'bg-sky-500' },
  IZIN: { label: 'Permission', dot: 'bg-warning' },
  SAKIT: { label: 'Sick', dot: 'bg-info' },
  CUTI: { label: 'Leave', dot: 'bg-purple-500' },
  ALPHA: { label: 'Absent', dot: 'bg-destructive' },
  LIBUR: { label: 'Day Off', dot: 'bg-muted-foreground/60' },
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
  // A select (rather than a bare number input) keeps this visually consistent with the
  // Month/Location dropdowns beside it and rules out garbage years — a few back for
  // historical recaps, one ahead for early planning.
  const yearOptions = useMemo(() => Array.from({ length: 6 }, (_, i) => now.getFullYear() - 4 + i), [now])

  const startDate = toYmd(new Date(year, month - 1, 1))
  const endDate = toYmd(new Date(year, month, 0))

  // Defaults to Office — boat crew work every day (including weekends) so the shore
  // staff recap is the more useful landing view; "All locations" is one click away.
  const [locationId, setLocationId] = useState('office')
  const [locations, setLocations] = useState<LocationLite[]>([])

  const [data, setData] = useState<AttendanceData | null>(null)
  const [loading, setLoading] = useState(true)

  const [cellPopover, setCellPopover] = useState<{ employeeId: string; date: string } | null>(null)
  const [cellNote, setCellNote] = useState('')
  const [saving, setSaving] = useState(false)

  const [bulkTarget, setBulkTarget] = useState<{ employeeId: string; fullName: string; isCrew: boolean } | null>(null)
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
    const holiday = data?.holidays[date]
    if (holiday) {
      const emp = data?.employees.find(e => e.id === employeeId)
      const excluded = !!emp?.locationId && holiday.excludedLocationIds.includes(emp.locationId)
      if (!excluded) return { status: 'LIBUR', note: holiday.name, leaveRequestId: null }
    }
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

  function openBulk(employeeId: string, fullName: string, isCrew: boolean) {
    setBulkTarget({ employeeId, fullName, isCrew })
    setBulkStatus('IZIN')
    setBulkStart(startDate)
    setBulkEnd(endDate)
    setBulkNote('')
  }

  async function saveBulk() {
    if (!bulkTarget || !data) return
    setBulkSaving(true)
    const dates = data.days.filter(d => d >= bulkStart && d <= bulkEnd && (bulkTarget.isCrew || !dayInfo(d).isWeekend))
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

      <div className="border rounded-xl bg-card px-4 py-3 flex items-center gap-5 flex-wrap">
        <div className="flex items-center gap-2">
          <Label htmlFor="attendance-month" className="text-xs font-medium text-muted-foreground">Month</Label>
          <NativeSelect id="attendance-month" value={month} onChange={e => setMonth(Number(e.target.value))} className="w-auto">
            {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </NativeSelect>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="attendance-year" className="text-xs font-medium text-muted-foreground">Year</Label>
          <NativeSelect id="attendance-year" value={year} onChange={e => setYear(Number(e.target.value))} className="w-auto">
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </NativeSelect>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="attendance-location" className="text-xs font-medium text-muted-foreground">Location</Label>
          <NativeSelect id="attendance-location" value={locationId} onChange={e => setLocationId(e.target.value)} className="w-auto">
            <option value="office">Office</option>
            <option value="">All locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </NativeSelect>
        </div>
        <div className="h-6 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-3.5 flex-wrap sm:ml-auto">
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
                    const holidayName = data.holidays[d]?.name
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
                    <td className="sticky left-0 bg-card px-4 py-2 z-10">
                      <button onClick={() => openBulk(emp.id, emp.fullName, emp.isCrew)} className="text-left hover:text-primary-strong transition-colors" title="Bulk edit this employee">
                        <p className="font-medium">{emp.fullName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{emp.employeeNumber}</p>
                      </button>
                    </td>
                    {data.days.map(d => {
                      const info = dayInfo(d)
                      const rec = statusFor(emp.id, d)
                      if (info.isWeekend && rec.status === 'HADIR' && !emp.isCrew) {
                        return <td key={d} className="px-1.5 py-2 text-center bg-muted/20">
                          <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-muted-foreground/30" title="Weekend — not a working day" />
                        </td>
                      }
                      return (
                        <td key={d} className="px-1.5 py-2 text-center">
                          <Popover open={cellPopover?.employeeId === emp.id && cellPopover?.date === d} onOpenChange={v => !v && setCellPopover(null)}>
                            <PopoverTrigger asChild>
                              <button onClick={() => openCell(emp.id, d)}
                                className={`h-3 w-3 rounded-full ${STATUS_META[rec.status]?.dot ?? 'bg-success'} ${rec.leaveRequestId ? 'ring-2 ring-offset-1 ring-offset-card ring-purple-300 dark:ring-purple-500/60' : ''} hover:scale-125 transition-transform`}
                                title={`${STATUS_META[rec.status]?.label ?? rec.status}${rec.note ? ` — ${rec.note}` : ''}`}
                                aria-label={`${emp.fullName}, ${d}: ${STATUS_META[rec.status]?.label ?? rec.status}${rec.note ? ` — ${rec.note}` : ''}`} />
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-3" align="center">
                              <p className="text-xs font-semibold mb-2">{emp.fullName} · {d}</p>
                              <div className="grid grid-cols-3 gap-1.5 mb-2">
                                {STATUSES.map(s => (
                                  <button key={s} onClick={() => saveCell(s)} disabled={saving} aria-pressed={rec.status === s}
                                    className={`flex flex-col items-center gap-1 px-1.5 py-1.5 rounded-md border text-[10px] transition-colors ${rec.status === s ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted'}`}>
                                    <span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[s].dot}`} />
                                    {STATUS_META[s].label}
                                  </button>
                                ))}
                              </div>
                              <Textarea rows={2} placeholder="Note (optional)" aria-label="Note (optional)" value={cellNote} onChange={e => setCellNote(e.target.value)}
                                className="min-h-12 px-2 py-1.5 text-xs md:text-xs resize-none" />
                              {rec.leaveRequestId && <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-1">Set automatically from an approved leave/WFH request.</p>}
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
      <Dialog open={!!bulkTarget} onOpenChange={o => { if (!o) setBulkTarget(null) }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm p-0 gap-0 overflow-hidden" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="font-bold text-sm pr-6">Bulk Edit — {bulkTarget?.fullName}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="attendance-bulk-from" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">From</Label>
                <Input id="attendance-bulk-from" type="date" value={bulkStart} min={startDate} max={endDate} onChange={e => setBulkStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="attendance-bulk-to" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">To</Label>
                <Input id="attendance-bulk-to" type="date" value={bulkEnd} min={startDate} max={endDate} onChange={e => setBulkEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <p id="attendance-bulk-status-label" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide leading-none">Status</p>
              <div role="group" aria-labelledby="attendance-bulk-status-label" className="grid grid-cols-3 gap-1.5">
                {STATUSES.map(s => (
                  <button key={s} type="button" onClick={() => setBulkStatus(s)} aria-pressed={bulkStatus === s}
                    className={`flex flex-col items-center gap-1 px-1.5 py-2 rounded-md border text-[11px] transition-colors ${bulkStatus === s ? 'border-primary bg-primary/10' : 'border-muted hover:bg-muted'}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[s].dot}`} />
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="attendance-bulk-note" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Note (optional)</Label>
              <Textarea id="attendance-bulk-note" rows={2} value={bulkNote} onChange={e => setBulkNote(e.target.value)} className="resize-none" />
            </div>
            {bulkTarget && !bulkTarget.isCrew && (
              <p className="text-[11px] text-muted-foreground">Weekends in this range are skipped automatically — they're never working days.</p>
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/50">
            <Button variant="outline" onClick={() => setBulkTarget(null)}>Cancel</Button>
            <Button onClick={saveBulk} loading={bulkSaving} className="font-semibold">
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
