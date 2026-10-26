'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Anchor, Calendar, Users, DollarSign, X,
  TrendingUp, AlertCircle, Ship,
} from 'lucide-react'
import { getEffectiveBookingStatus } from '@/lib/booking-status'
import { formatDate, formatDateRange, formatMoney } from '@/lib/format'
import { BookingStatusBadge } from '@/components/ui/status-badge'

/* ── types ── */
interface BookingRecord {
  id: string
  bookingCode: string
  source: string
  tripType: string
  startDate: string
  endDate: string
  totalPrice: number
  depositPaid: number
  discount: number
  guestCount: number
  status: string
  destination?: string
  salesperson?: string
  yacht?: { id: string; name: string; model?: string }
  openTrip?: { id: string; title: string; destination?: string }
  customer: { id: string; name: string; email?: string; phone?: string }
  agent?: { id: string; name: string; company?: string }
}

/* ── helpers ── */
const ACCENT = 'var(--primary)'

const today = () => new Date().toISOString().split('T')[0]

/* filter: does booking overlap with [from, to]? */
function overlaps(b: BookingRecord, from: string, to: string) {
  const bStart = b.startDate.split('T')[0]
  const bEnd   = b.endDate.split('T')[0]
  return bStart <= to && bEnd >= from
}

/* quick range presets */
function getPreset(preset: string): [string, string] {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (preset === 'today') {
    const t = fmt(now)
    return [t, t]
  }
  if (preset === 'week') {
    const day = now.getDay()
    const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return [fmt(mon), fmt(sun)]
  }
  if (preset === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return [fmt(first), fmt(last)]
  }
  // next 30 days
  const end = new Date(now); end.setDate(now.getDate() + 30)
  return [fmt(now), fmt(end)]
}

/* ── Component ── */
export default function Dashboard() {
  const [bookings, setBookings] = useState<BookingRecord[]>([])
  const [loading,  setLoading]  = useState(true)

  /* filter state */
  const [mode,    setMode]    = useState<'single' | 'range'>('single')
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo,   setDateTo]   = useState(today())

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bookings')
      if (res.ok) setBookings(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  /* sync dateTo when single mode or dateFrom changes */
  useEffect(() => {
    if (mode === 'single') setDateTo(dateFrom)
  }, [mode, dateFrom])

  const applyPreset = (preset: string) => {
    const [f, t] = getPreset(preset)
    setDateFrom(f)
    setDateTo(t)
    if (f !== t) setMode('range')
    else setMode('single')
  }

  const clearFilter = () => {
    setDateFrom(today())
    setDateTo(today())
    setMode('single')
  }

  /* derived data */
  const filtered = bookings.filter(b =>
    b.status !== 'cancelled' && overlaps(b, dateFrom, dateTo)
  )

  const totalRevenue   = filtered.reduce((s, b) => s + b.totalPrice, 0)
  const totalPaid      = filtered.reduce((s, b) => s + b.depositPaid, 0)
  const totalGuests    = filtered.reduce((s, b) => s + b.guestCount, 0)
  const outstanding    = totalRevenue - totalPaid
  const activeCount    = filtered.length

  const isToday = dateFrom === today() && dateTo === today()
  const isSingleDay = dateFrom === dateTo
  const filterLabel = isSingleDay
    ? formatDate(dateFrom, 'medium', { utc: true })
    : formatDateRange(dateFrom, dateTo, { utc: true })

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Dashboard</h3>
          <p className="text-muted-foreground text-sm">
            Active trips: <span className="font-semibold text-foreground">{filterLabel}</span>
          </p>
        </div>

        {/* ── Date filter panel ── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Presets */}
          {['today', 'week', 'month', 'next30'].map(p => (
            <button
              key={p}
              type="button"
              onClick={() => applyPreset(p)}
              className="text-xs px-2.5 py-1 rounded-lg border transition-colors hover:bg-muted"
              style={
                (p === 'today' && isToday) ? { backgroundColor: ACCENT, borderColor: ACCENT, color: 'var(--primary-foreground)' } : {}
              }
            >
              {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : '30 Days'}
            </button>
          ))}

          {/* Mode toggle */}
          <div role="group" aria-label="Date filter mode" className="flex rounded-lg border overflow-hidden text-xs">
            {(['single', 'range'] as const).map(m => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className="px-3 py-1 transition-colors"
                style={mode === m ? { backgroundColor: ACCENT, color: 'var(--primary-foreground)' } : { color: 'var(--muted-foreground)' }}
              >
                {m === 'single' ? 'Single' : 'Range'}
              </button>
            ))}
          </div>

          {/* Date inputs */}
          <div className="flex items-center gap-1">
            <Input
              type="date"
              aria-label={mode === 'range' ? 'From date' : 'Date'}
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-8 text-xs w-32 sm:w-36"
            />
            {mode === 'range' && (
              <>
                <span className="text-muted-foreground text-xs">–</span>
                <Input
                  type="date"
                  aria-label="To date"
                  value={dateTo}
                  min={dateFrom}
                  onChange={e => setDateTo(e.target.value)}
                  className="h-8 text-xs w-32 sm:w-36"
                />
              </>
            )}
          </div>

          {/* Clear */}
          {!isToday && (
            <Button type="button" variant="outline" size="icon" onClick={clearFilter} aria-label="Clear date filter" className="size-8 text-muted-foreground">
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: 'Active Trips',
            value: loading ? '—' : String(activeCount),
            sub: isSingleDay ? `on ${formatDate(dateFrom, 'medium', { utc: true })}` : 'in this range',
            icon: <Ship className="h-4 w-4 text-muted-foreground" />,
          },
          {
            title: 'Total Revenue',
            value: loading ? '—' : formatMoney(totalRevenue, { currency: 'USD', decimals: 0 }),
            sub: `${formatMoney(totalPaid, { currency: 'USD', decimals: 0 })} paid`,
            icon: <DollarSign className="h-4 w-4 text-muted-foreground" />,
          },
          {
            title: 'Outstanding',
            value: loading ? '—' : formatMoney(outstanding, { currency: 'USD', decimals: 0 }),
            sub: outstanding > 0 ? 'unpaid balance' : 'all settled ✓',
            icon: <TrendingUp className="h-4 w-4 text-muted-foreground" />,
            accent: outstanding > 0,
          },
          {
            title: 'Total Guests',
            value: loading ? '—' : String(totalGuests),
            sub: `across ${activeCount} booking${activeCount !== 1 ? 's' : ''}`,
            icon: <Users className="h-4 w-4 text-muted-foreground" />,
          },
        ].map(card => (
          <Card key={card.title} className={card.accent ? 'border-warning/30' : ''}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              {card.icon}
            </CardHeader>
            <CardContent>
              {loading
                ? <Skeleton className="h-7 w-24 mb-1" />
                : <div className="text-2xl font-bold" style={card.accent && outstanding > 0 ? { color: 'var(--warning)' } : {}}>{card.value}</div>}
              <p className="text-xs text-muted-foreground">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Trip list ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Trips in This Period
            </CardTitle>
            {!loading && (
              <span className="text-xs text-muted-foreground">
                {activeCount} trip(s) found
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No active trips in this period</p>
              <p className="text-xs mt-1 opacity-60">Try changing the date range</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(b => {
                const tripName = b.tripType === 'OPEN_TRIP'
                  ? (b.openTrip?.title ?? '—')
                  : (b.yacht?.name ?? '—')
                const dest = b.destination ?? b.openTrip?.destination ?? '—'
                const remaining = b.totalPrice - b.depositPaid
                const isFullyPaid = b.status === 'fully_paid' || b.status === 'completed'

                return (
                  <div key={b.id} className="flex items-start sm:items-center gap-3 rounded-xl border px-3 sm:px-4 py-3 hover:bg-muted/30 transition-colors">
                    {/* Icon */}
                    <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full mt-0.5 sm:mt-0"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                      {b.tripType === 'OPEN_TRIP'
                        ? <Anchor className="h-4 w-4" style={{ color: ACCENT }} />
                        : <Ship className="h-4 w-4" style={{ color: ACCENT }} />}
                    </div>

                    {/* Trip info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">{b.bookingCode}</span>
                        <span className="font-semibold text-sm truncate">{tripName}</span>
                        {dest !== '—' && <span className="text-xs text-muted-foreground truncate hidden sm:inline">{dest}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0 mt-0.5 text-xs text-muted-foreground">
                        <span>{b.customer.name}</span>
                        <span className="hidden sm:inline">·</span>
                        <span className="hidden sm:flex items-center gap-1"><Users className="h-3 w-3" /> {b.guestCount} guests</span>
                        <span className="hidden sm:inline">·</span>
                        <span>{formatDateRange(b.startDate, b.endDate, { utc: true })}</span>
                        {b.agent && <><span className="hidden sm:inline">·</span><span className="hidden sm:inline">via {b.agent.name}</span></>}
                      </div>
                    </div>

                    {/* Financial + Status stacked on mobile */}
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <div className="font-semibold text-sm">{formatMoney(b.totalPrice, { currency: 'USD', decimals: 0 })}</div>
                      {!isFullyPaid && remaining > 0 && (
                        <div className="flex items-center gap-1 text-xs text-warning">
                          <AlertCircle className="h-3 w-3" />
                          <span className="hidden sm:inline">bal </span>{formatMoney(remaining, { currency: 'USD', decimals: 0 })}
                        </div>
                      )}
                      {isFullyPaid && (
                        <div className="text-xs text-success">Settled ✓</div>
                      )}
                      {(() => {
                        const effStatus = getEffectiveBookingStatus(b.status, b.startDate, b.endDate)
                        return (
                          <BookingStatusBadge status={effStatus} />
                        )
                      })()}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
