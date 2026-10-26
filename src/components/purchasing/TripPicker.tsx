'use client'

import { useState } from 'react'
import { Ship, Search, X } from 'lucide-react'
import { formatDate, formatDateRange } from '@/lib/format'

// Shared "which trip is this for" picker (Kapal → Trip) for Purchase Requests (incl. the
// public /request-order form), Purchase Orders, Service Orders and Stock Transfers. Options
// come from /api/purchasing/trips (or /api/hr/request-orders/trips) — see
// listUpcomingTrips() in src/lib/purchasing/tripLink.ts: one row per departure, upcoming
// only, soonest first. The trip number is kept low-key — it's only there for Finance/
// Accounting reporting.

export interface TripOption {
  kind: 'charter' | 'openTrip'; id: string; tripNumber: number | null
  startDate: string; endDate: string
  yacht: { id: string; name: string } | null
  label: string
}

// "2026/#5" — the year is the trip-numbering year, bucketed by endDate in UTC like
// renumberTripYear() in src/lib/openTripNumbering.ts, so a Dec 31–Jan 3 trip reads 2027/#1.
export const tripNo = (t: TripOption) => t.tripNumber != null ? `${new Date(t.endDate).getUTCFullYear()}/#${t.tripNumber}` : null
export const tripKindLabel = (t: TripOption) => t.kind === 'charter' ? 'Private Charter' : 'Open Trip'
// "Samara 1 · 2026/#5" — used wherever a record's trip is shown in a list/detail.
export const tripShortLabel = (t: TripOption) => `${t.yacht?.name ?? '—'} · ${tripNo(t) ?? 'Trip'}`
export const tripDates = (t: TripOption) => formatDateRange(t.startDate, t.endDate)

// Request-body fields for a picked trip — Private Charters link the booking, Open Trips the
// departure itself. `bookingField` is 'bookingId' on Purchase Orders, 'tripBookingId' elsewhere.
export function tripLinkBody(t: TripOption | null, bookingField: 'bookingId' | 'tripBookingId' = 'tripBookingId') {
  return {
    [bookingField]: t?.kind === 'charter' ? t.id : '',
    openTripId: t?.kind === 'openTrip' ? t.id : '',
  }
}

export function TripPicker({ trips, value, onChange, suggestedYachtId, yachtFromLocation = false }: {
  trips: TripOption[]
  value: TripOption | null
  onChange: (t: TripOption | null) => void
  // Yacht of the delivery/destination location when it's a vessel — preselects the Kapal
  // dropdown (still changeable).
  suggestedYachtId?: string | null
  // No Kapal dropdown: the trip list is just suggestedYachtId's trips (the delivery location
  // decides the yacht). A non-vessel location (no yacht) lists every yacht's trips instead.
  yachtFromLocation?: boolean
}) {
  // Derived, not synced: the picked trip's yacht wins, then a manual Kapal choice, then the
  // suggestion from the delivery location.
  const [pickedYachtId, setPickedYachtId] = useState<string | null>(null)
  const yachtId = value?.yacht?.id ?? pickedYachtId ?? suggestedYachtId ?? ''

  // Yachts that have upcoming trips, plus the current value's yacht (an existing record may
  // point at a trip that has since passed, which the upcoming-only list no longer contains).
  const yachts = [...new Map([...trips, ...(value ? [value] : [])].filter(t => t.yacht).map(t => [t.yacht!.id, t.yacht!])).values()]
    .sort((a, b) => a.name.localeCompare(b.name))

  if (yachtFromLocation) {
    return (
      <div className="space-y-2">
        <TripCombobox value={value} trips={trips} yachtId={suggestedYachtId ?? ''} allYachts={!suggestedYachtId} onChange={onChange} />
        {value && <TripSummary value={value} />}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select className="w-full h-9 border rounded-md px-3 text-sm bg-background focus:ring-1 focus:ring-ring/50 focus:border-ring outline-none transition" value={yachtId}
          onChange={e => { setPickedYachtId(e.target.value); if (value) onChange(null) }}>
          <option value="">Select yacht…</option>
          {yachts.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <TripCombobox value={value} trips={trips} yachtId={yachtId} onChange={onChange} />
      </div>
      {value && <TripSummary value={value} />}
    </div>
  )
}

function TripSummary({ value }: { value: TripOption }) {
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 text-xs space-y-0.5">
      <p><span className="text-muted-foreground">Yacht:</span> <span className="font-semibold">{value.yacht?.name ?? '—'}</span></p>
      <p><span className="text-muted-foreground">Trip No.:</span> {tripNo(value) ?? '—'} <span className="text-muted-foreground">({tripKindLabel(value)})</span></p>
      <p><span className="text-muted-foreground">Dates:</span> {tripDates(value)}</p>
      <p className="truncate"><span className="text-muted-foreground">{value.kind === 'charter' ? 'Guest:' : 'Trip:'}</span> {value.label}</p>
    </div>
  )
}

function TripCombobox({ value, trips, yachtId, allYachts = false, onChange }: {
  value: TripOption | null; trips: TripOption[]; yachtId: string; allYachts?: boolean; onChange: (t: TripOption | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  // No cap — a yacht can have years of future charters booked. Already soonest-first.
  const opts = trips.filter(t => allYachts || t.yacht?.id === yachtId).filter(t => {
    if (!q) return true
    return t.label.toLowerCase().includes(q)
      || (allYachts && !!t.yacht?.name.toLowerCase().includes(q))
      || (t.tripNumber != null && (tripNo(t)!.includes(q) || String(t.tripNumber) === q))
      || formatDate(t.startDate).toLowerCase().includes(q)
  })

  return (
    <>
      <button type="button" disabled={!yachtId && !allYachts} onClick={() => { setOpen(true); setSearch('') }}
        className="w-full h-9 border rounded-md px-3 text-sm text-left flex items-center justify-between bg-background focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring transition disabled:opacity-50 disabled:cursor-not-allowed">
        <span className={`truncate ${value ? '' : 'text-muted-foreground'}`}>
          {value ? tripDates(value) : (yachtId || allYachts) ? 'Select trip…' : 'Select a yacht first'}
        </span>
        <Ship className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setOpen(false)}>
          <div className="bg-card rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b shrink-0">
              <h3 className="font-semibold text-lg">Select Trip</h3>
              <button type="button" onClick={() => setOpen(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-4 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input autoFocus className="w-full h-9 border rounded-md px-2.5 pl-8 text-sm focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring"
                  placeholder="Search guest, trip name, date…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {value && (
                <button type="button" onClick={() => { onChange(null); setOpen(false); setSearch('') }}
                  className="w-full text-left px-5 py-2.5 text-sm text-muted-foreground hover:bg-muted border-b transition-colors">
                  Clear selection
                </button>
              )}
              {opts.length === 0 && (
                <p className="px-5 py-6 text-sm text-muted-foreground text-center">{allYachts ? 'No upcoming trips' : 'No upcoming trips for this yacht'}</p>
              )}
              {opts.map(t => (
                <button key={`${t.kind}:${t.id}`} type="button" onClick={() => { onChange(t); setOpen(false); setSearch('') }}
                  className={`w-full text-left px-5 py-3 text-sm hover:bg-muted flex items-start gap-2.5 border-b last:border-0 transition-colors ${value?.kind === t.kind && value.id === t.id ? 'bg-primary/10' : ''}`}>
                  <Ship className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium truncate">{tripDates(t)}</span>
                    <span className="block text-xs text-muted-foreground truncate mt-0.5">{allYachts && t.yacht ? `${t.yacht.name} · ` : ''}{tripKindLabel(t)} · {t.label}</span>
                  </span>
                  {tripNo(t) && <span className="shrink-0 text-[11px] text-muted-foreground/70 tabular-nums mt-0.5">{tripNo(t)}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
