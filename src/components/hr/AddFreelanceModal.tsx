'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Ship } from 'lucide-react'
import { RupiahInput } from '@/components/ui/rupiah-input'

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
  const dates = `${new Date(b.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}–${new Date(b.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Ship className="h-4 w-4 text-amber-600" />
            <h3 className="font-bold text-sm">{editing ? 'Edit Freelance' : 'Add Freelance'}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name</label>
            <input autoFocus className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
              value={fullName} onChange={e => setFullName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone</label>
              <input className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</label>
              <input className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Covering Trip(s)</label>
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={tripYacht} onChange={e => { setTripYacht(e.target.value); setTripSearchOpen(true) }}
                className="h-8 border rounded-md px-2 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="">All yachts</option>
                {yachts.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
              <input
                type="date" value={tripDate} onChange={e => { setTripDate(e.target.value); setTripSearchOpen(true) }}
                className="h-8 border rounded-md px-2 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <div className="min-h-10 border rounded-lg p-1.5 flex flex-wrap gap-1.5 relative">
              {selectedTrips.map(t => (
                <span key={t.id} className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-800 rounded-full px-2.5 py-1">
                  {fmtTrip(t)}
                  <button type="button" onClick={() => removeTrip(t.id)}><X className="h-3 w-3" /></button>
                </span>
              ))}
              <div className="relative flex-1 min-w-[140px]">
                <input
                  value={tripSearch}
                  onChange={e => { setTripSearch(e.target.value); setTripSearchOpen(true) }}
                  onFocus={() => { setTripSearchOpen(true); searchTrips(tripSearch, tripYacht, tripDate) }}
                  onBlur={() => setTimeout(() => setTripSearchOpen(false), 150)}
                  placeholder="Search booking code or destination..."
                  className="h-7 w-full text-sm border-0 focus:outline-none px-1"
                />
                {tripSearchOpen && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {tripResults.filter(b => !selectedTrips.some(t => t.id === b.id)).length === 0 ? (
                      <p className="px-3 py-2.5 text-xs text-muted-foreground">No trips found</p>
                    ) : (
                      tripResults.filter(b => !selectedTrips.some(t => t.id === b.id)).map(b => (
                        <button key={b.id} type="button" onMouseDown={() => addTrip(b)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 border-b last:border-0">
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
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Replacing</label>
            <div className="relative">
              <input
                value={replacingSearch}
                onChange={e => { setReplacingSearch(e.target.value); setReplacingEmployeeId(''); setReplacingOpen(true) }}
                onFocus={() => setReplacingOpen(true)}
                onBlur={() => setTimeout(() => setReplacingOpen(false), 150)}
                placeholder="Search employee..."
                className="w-full h-10 border rounded-lg pl-3 pr-8 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              {replacingSearch && (
                <button type="button" onClick={clearReplacing} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {replacingOpen && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {replacingMatches.length === 0 ? (
                    <p className="px-3 py-2.5 text-xs text-muted-foreground">No employees found</p>
                  ) : (
                    replacingMatches.map(e => (
                      <button key={e.id} type="button" onMouseDown={() => pickReplacing(e)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 border-b last:border-0">
                        {e.fullName}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contract Until</label>
            <input type="date" className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
              value={contractEndDate} onChange={e => setContractEndDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fee</label>
            <div className="grid grid-cols-[1fr_120px] gap-1.5">
              <RupiahInput value={fee} onChange={setFee} />
              <select
                value={feeType} onChange={e => setFeeType(e.target.value)}
                className="h-9 border rounded-md px-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {FEE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50/80">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-white transition-colors">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 text-sm text-white rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Freelance'}
          </button>
        </div>
      </div>
    </div>
  )
}
