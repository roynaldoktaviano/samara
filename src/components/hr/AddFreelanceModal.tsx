'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Ship } from 'lucide-react'
import { RupiahInput } from '@/components/ui/rupiah-input'

interface BookingLite { id: string; bookingCode: string; destination: string | null; startDate: string; endDate: string; yacht: { name: string } | null }
interface EmployeeLite { id: string; fullName: string; employmentStatus: string | null; isActive: boolean }
export interface FreelanceEmployee {
  id: string
  fullName: string
  phone: string | null
  personalEmail: string | null
  contractEndDate: string | null
  freelanceFee: number | null
  replacingEmployeeId: string | null
  tripAssignments: { booking: BookingLite }[]
}

const fmtTrip = (b: BookingLite) => `${b.bookingCode}${b.yacht ? ` · ${b.yacht.name}` : ''} · ${new Date(b.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}–${new Date(b.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`

// A deliberately lighter form than the full Add/Edit Employee modal (no bank account,
// salary band, or document tabs — none of that applies to a one-off freelance
// engagement) — see the "Add Freelance" button next to "Add Employee" in
// EmployeesPage.tsx. Still creates/updates a real Employee row (employmentStatus:
// 'Freelance'), just through a narrower set of fields.
export default function AddFreelanceModal({ open, editing, employees, onClose, onSaved }: {
  open: boolean
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
  const [replacingEmployeeId, setReplacingEmployeeId] = useState(() => editing?.replacingEmployeeId ?? '')
  const [selectedTrips, setSelectedTrips] = useState<BookingLite[]>(() => editing?.tripAssignments.map(t => t.booking) ?? [])
  const [tripSearch, setTripSearch] = useState('')
  const [tripResults, setTripResults] = useState<BookingLite[]>([])
  const [tripSearchOpen, setTripSearchOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const searchTrips = useCallback(async (q: string) => {
    const res = await fetch(`/api/hr/bookings-lite${q ? `?search=${encodeURIComponent(q)}` : ''}`)
    if (res.ok) setTripResults(await res.json())
  }, [])

  useEffect(() => {
    if (!tripSearchOpen) return
    const t = setTimeout(() => searchTrips(tripSearch), 250)
    return () => clearTimeout(t)
  }, [tripSearch, tripSearchOpen, searchTrips])

  const addTrip = (b: BookingLite) => {
    if (!selectedTrips.some(t => t.id === b.id)) setSelectedTrips(prev => [...prev, b])
    setTripSearch(''); setTripSearchOpen(false)
  }
  const removeTrip = (id: string) => setSelectedTrips(prev => prev.filter(t => t.id !== id))

  const replacementOptions = employees.filter(e => e.isActive && e.employmentStatus !== 'Freelance' && e.id !== editing?.id)

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

  if (!open) return null

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
                  onFocus={() => { setTripSearchOpen(true); searchTrips(tripSearch) }}
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
            <select className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
              value={replacingEmployeeId} onChange={e => setReplacingEmployeeId(e.target.value)}>
              <option value="">— None —</option>
              {replacementOptions.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contract Until</label>
              <input type="date" className="w-full h-10 border rounded-lg px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
                value={contractEndDate} onChange={e => setContractEndDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fee</label>
              <RupiahInput value={fee} onChange={setFee} />
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
