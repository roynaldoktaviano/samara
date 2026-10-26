'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Ship } from 'lucide-react'
import { RupiahInput } from '@/components/ui/rupiah-input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { formatDateRange } from '@/lib/format'

interface BookingLite {
  id: string; bookingCode: string; destination: string | null; startDate: string; endDate: string
  yacht: { name: string } | null; isOpenTrip: boolean
}
interface YachtLite { id: string; name: string }
interface EmployeeLite { id: string; fullName: string; employmentStatus: string | null; isActive: boolean }
export interface FreelanceEmployee {
  id: string
  fullName: string
  phone: string | null
  personalEmail: string | null
  contractEndDate: string | null
  freelanceFee: number | null
  freelanceFeeType: string | null
  replacingEmployeeId: string | null
  tripAssignments: { booking: BookingLite }[]
}

const FEE_TYPES = ['Per Day', 'Per Month']

// An Open Trip departure collapses several guests' individual bookings into one pick
// server-side (see /api/hr/bookings-lite) — labeled by the shared voyage, not by
// whichever single guest's booking code happened to represent the group, since showing
// that code here would misleadingly imply the freelancer is tied to one specific guest.
const fmtTrip = (b: BookingLite) => {
  const dates = formatDateRange(b.startDate, b.endDate)
  if (b.isOpenTrip) {
    return `Open Trip${b.yacht ? ` · ${b.yacht.name}` : ''}${b.destination ? ` · ${b.destination}` : ''} · ${dates}`
  }
  return `${b.bookingCode}${b.yacht ? ` · ${b.yacht.name}` : ''} · ${dates}`
}

// A deliberately lighter form than the full Add/Edit Employee modal (no bank account,
// salary band, or document tabs — none of that applies to a one-off freelance
// engagement) — see the "Add Freelance" button next to "Add Employee" in
// EmployeesPage.tsx. Still creates/updates a real Employee row (employmentStatus:
// 'Freelance'), just through a narrower set of fields.
export default function AddFreelanceModal({ editing, employees, onClose, onSaved }: {
  editing: FreelanceEmployee | null
  employees: EmployeeLite[]
  onClose: () => void
  onSaved: () => void
}) {
  // Lazy initializers read `editing` once, at mount — the parent remounts this component
  // fresh (via `key`) whenever a different record is opened, so there's no need for a
  // reset-on-prop-change effect here.
  const [fullName, setFullName] = useState(() => editing?.fullName ?? '')
  const [phone, setPhone] = useState(() => editing?.phone ?? '')
  const [email, setEmail] = useState(() => editing?.personalEmail ?? '')
  const [contractEndDate, setContractEndDate] = useState(() => editing?.contractEndDate ? editing.contractEndDate.slice(0, 10) : '')
  const [fee, setFee] = useState(() => editing?.freelanceFee != null ? String(editing.freelanceFee) : '')
  const [feeType, setFeeType] = useState(() => editing?.freelanceFeeType ?? 'Per Day')
  const [replacingEmployeeId, setReplacingEmployeeId] = useState(() => editing?.replacingEmployeeId ?? '')
  const [selectedTrips, setSelectedTrips] = useState<BookingLite[]>(() => editing?.tripAssignments.map(t => t.booking) ?? [])
  const [tripSearch, setTripSearch] = useState('')
  const [tripYacht, setTripYacht] = useState('')
  const [tripDate, setTripDate] = useState('')
  const [tripResults, setTripResults] = useState<BookingLite[]>([])
  const [yachts, setYachts] = useState<YachtLite[]>([])
  const [tripSearchOpen, setTripSearchOpen] = useState(false)
  const [replacingSearch, setReplacingSearch] = useState(() => editing ? employees.find(e => e.id === editing.replacingEmployeeId)?.fullName ?? '' : '')
  const [replacingOpen, setReplacingOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const searchTrips = useCallback(async (q: string, yachtId: string, date: string) => {
    const params = new URLSearchParams()
    if (q) params.set('search', q)
    if (yachtId) params.set('yachtId', yachtId)
    if (date) params.set('date', date)
    const res = await fetch(`/api/hr/bookings-lite?${params}`)
    if (res.ok) {
      const data = await res.json()
      setTripResults(data.bookings)
      setYachts(data.yachts)
    }
  }, [])

  // Fetches the yacht filter's options up front, so it's populated the moment the modal
  // opens rather than staying empty until the trip search box is first focused.
  useEffect(() => { searchTrips('', '', '') }, [searchTrips])

  useEffect(() => {
    if (!tripSearchOpen) return
    const t = setTimeout(() => searchTrips(tripSearch, tripYacht, tripDate), 250)
    return () => clearTimeout(t)
  }, [tripSearch, tripYacht, tripDate, tripSearchOpen, searchTrips])

  const addTrip = (b: BookingLite) => {
    if (!selectedTrips.some(t => t.id === b.id)) setSelectedTrips(prev => [...prev, b])
    setTripSearch(''); setTripSearchOpen(false)
  }
  const removeTrip = (id: string) => setSelectedTrips(prev => prev.filter(t => t.id !== id))

  const replacementOptions = employees.filter(e => e.isActive && e.employmentStatus !== 'Freelance' && e.id !== editing?.id)
  const replacingMatches = replacementOptions.filter(e => e.fullName.toLowerCase().includes(replacingSearch.toLowerCase()))
  const pickReplacing = (e: EmployeeLite) => { setReplacingEmployeeId(e.id); setReplacingSearch(e.fullName); setReplacingOpen(false) }
  const clearReplacing = () => { setReplacingEmployeeId(''); setReplacingSearch('') }

  async function save() {
    if (!fullName.trim()) { setError('Full name is required'); return }
    setSaving(true); setError('')
    const body = {
      fullName: fullName.trim(),
      phone: phone.trim() || undefined,
      personalEmail: email.trim() || undefined,
      employmentStatus: 'Freelance',
      contractEndDate: contractEndDate || null,
      freelanceFee: fee || null,
      freelanceFeeType: fee ? feeType : null,
      replacingEmployeeId: replacingEmployeeId || null,
      tripBookingIds: selectedTrips.map(t => t.id),
    }
    const res = await fetch(editing ? `/api/hr/employees/${editing.id}` : '/api/hr/employees', {
      method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'An error occurred'); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md p-0 gap-0 overflow-hidden" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader className="flex-row items-center gap-2 text-left px-6 py-4 border-b">
          <Ship className="h-4 w-4 text-primary-strong" />
          <DialogTitle className="font-bold text-sm">{editing ? 'Edit Freelance' : 'Add Freelance'}</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{error}</p>}

          <div className="space-y-1.5">
            <Label htmlFor="freelance-full-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name</Label>
            <Input id="freelance-full-name" autoFocus className="h-10"
              value={fullName} onChange={e => setFullName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="freelance-phone" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone</Label>
              <Input id="freelance-phone" className="h-10"
                value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="freelance-email" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</Label>
              <Input id="freelance-email" className="h-10"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="freelance-trip-search" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Covering Trip(s)</Label>
            <div className="grid grid-cols-2 gap-1.5">
              <NativeSelect
                value={tripYacht} onChange={e => { setTripYacht(e.target.value); setTripSearchOpen(true) }}
                aria-label="Filter trips by yacht" className="h-8 text-xs md:text-xs"
              >
                <option value="">All yachts</option>
                {yachts.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
              </NativeSelect>
              <Input
                type="date" value={tripDate} onChange={e => { setTripDate(e.target.value); setTripSearchOpen(true) }}
                aria-label="Filter trips by date" className="h-8 px-2 text-xs md:text-xs"
              />
            </div>
            <div className="min-h-10 border rounded-lg p-1.5 flex flex-wrap gap-1.5 relative">
              {selectedTrips.map(t => (
                <span key={t.id} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary-strong rounded-full px-2.5 py-1">
                  {fmtTrip(t)}
                  <button type="button" onClick={() => removeTrip(t.id)} aria-label={`Remove ${fmtTrip(t)}`}><X className="h-3 w-3" /></button>
                </span>
              ))}
              <div className="relative flex-1 min-w-[140px]">
                {/* Borderless on purpose: it sits inside the chip container, which draws the border. */}
                <input
                  id="freelance-trip-search"
                  value={tripSearch}
                  onChange={e => { setTripSearch(e.target.value); setTripSearchOpen(true) }}
                  onFocus={() => { setTripSearchOpen(true); searchTrips(tripSearch, tripYacht, tripDate) }}
                  onBlur={() => setTimeout(() => setTripSearchOpen(false), 150)}
                  placeholder="Search booking code or destination…"
                  className="h-7 w-full text-sm border-0 focus:outline-none px-1"
                />
                {tripSearchOpen && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {tripResults.filter(b => !selectedTrips.some(t => t.id === b.id)).length === 0 ? (
                      <p className="px-3 py-2.5 text-xs text-muted-foreground">No trips found</p>
                    ) : (
                      tripResults.filter(b => !selectedTrips.some(t => t.id === b.id)).map(b => (
                        <button key={b.id} type="button" onMouseDown={() => addTrip(b)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-primary/10 border-b last:border-0">
                          {fmtTrip(b)}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="freelance-replacing" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Replacing</Label>
            <div className="relative">
              <Input
                id="freelance-replacing"
                value={replacingSearch}
                onChange={e => { setReplacingSearch(e.target.value); setReplacingEmployeeId(''); setReplacingOpen(true) }}
                onFocus={() => setReplacingOpen(true)}
                onBlur={() => setTimeout(() => setReplacingOpen(false), 150)}
                placeholder="Search employee…"
                className="h-10 pr-8"
              />
              {replacingSearch && (
                <Button type="button" variant="ghost" size="icon" onClick={clearReplacing} aria-label="Clear"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 size-6 text-muted-foreground">
                  <X className="size-3.5" />
                </Button>
              )}
              {replacingOpen && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {replacingMatches.length === 0 ? (
                    <p className="px-3 py-2.5 text-xs text-muted-foreground">No employees found</p>
                  ) : (
                    replacingMatches.map(e => (
                      <button key={e.id} type="button" onMouseDown={() => pickReplacing(e)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-primary/10 border-b last:border-0">
                        {e.fullName}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="freelance-contract-until" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contract Until</Label>
            <Input id="freelance-contract-until" type="date" className="h-10"
              value={contractEndDate} onChange={e => setContractEndDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <p id="freelance-fee-label" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide leading-none">Fee</p>
            <div role="group" aria-labelledby="freelance-fee-label" className="grid grid-cols-[1fr_120px] gap-1.5">
              <RupiahInput title="Fee amount" value={fee} onChange={setFee} />
              <NativeSelect value={feeType} onChange={e => setFeeType(e.target.value)} aria-label="Fee type">
                {FEE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </NativeSelect>
            </div>
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t bg-muted/50">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} className="font-semibold">
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Freelance'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
