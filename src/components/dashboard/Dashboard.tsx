'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Anchor, Calendar, Users, DollarSign, X,
  TrendingUp, AlertCircle, Ship,
} from 'lucide-react'

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
const ACCENT = '#bdac7e'

const today = () => new Date().toISOString().split('T')[0]

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

const fmtMoney = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const STATUS_STYLES: Record<string, string> = {
  pending:        'bg-amber-100   text-amber-700   border-amber-200',
  partially_paid: 'bg-blue-100    text-blue-700    border-blue-200',
  fully_paid:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  completed:      'bg-purple-100  text-purple-700  border-purple-200',
  cancelled:      'bg-red-100     text-red-700     border-red-200',
}
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', partially_paid: 'Partially Paid',
  fully_paid: 'Fully Paid', completed: 'Completed', cancelled: 'Cancelled',
}

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
    ? fmtDate(dateFrom)
    : `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Dashboard</h3>
          <p className="text-muted-foreground text-sm">
            Trip aktif: <span className="font-semibold text-foreground">{filterLabel}</span>
          </p>
        </div>

        {/* ── Date filter panel ── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Presets */}
          {['today', 'week', 'month', 'next30'].map(p => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className="text-xs px-2.5 py-1 rounded-lg border transition-colors hover:bg-muted"
              style={
                (p === 'today' && isToday) ? { backgroundColor: ACCENT, borderColor: ACCENT, color: 'white' } : {}
              }
            >
              {p === 'today' ? 'Hari Ini' : p === 'week' ? 'Minggu Ini' : p === 'month' ? 'Bulan Ini' : '30 Hari'}
            </button>
          ))}

          {/* Mode toggle */}
          <div className="flex rounded-lg border overflow-hidden text-xs">
            {(['single', 'range'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="px-3 py-1 transition-colors"
                style={mode === m ? { backgroundColor: ACCENT, color: 'white' } : { color: '#6b7280' }}
              >
                {m === 'single' ? 'Tanggal' : 'Rentang'}
              </button>
            ))}
          </div>

          {/* Date inputs */}
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-8 text-xs w-36"
            />
            {mode === 'range' && (
              <>
                <span className="text-muted-foreground text-xs">–</span>
                <Input
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  onChange={e => setDateTo(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </>
            )}
          </div>

          {/* Clear */}
          {!isToday && (
            <button onClick={clearFilter} className="h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-muted text-muted-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: 'Trip Aktif',
            value: loading ? '—' : String(activeCount),
            sub: isSingleDay ? `di tanggal ${fmtDate(dateFrom)}` : `dalam rentang ini`,
            icon: <Ship className="h-4 w-4 text-muted-foreground" />,
          },
          {
            title: 'Total Revenue',
            value: loading ? '—' : fmtMoney(totalRevenue),
            sub: `${fmtMoney(totalPaid)} sudah dibayar`,
            icon: <DollarSign className="h-4 w-4 text-muted-foreground" />,
          },
          {
            title: 'Sisa Tagihan',
            value: loading ? '—' : fmtMoney(outstanding),
            sub: outstanding > 0 ? 'belum dilunasi' : 'semua lunas ✓',
            icon: <TrendingUp className="h-4 w-4 text-muted-foreground" />,
            accent: outstanding > 0,
          },
          {
            title: 'Total Tamu',
            value: loading ? '—' : String(totalGuests),
            sub: `dari ${activeCount} booking`,
            icon: <Users className="h-4 w-4 text-muted-foreground" />,
          },
        ].map(card => (
          <Card key={card.title} className={card.accent ? 'border-amber-200' : ''}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              {card.icon}
            </CardHeader>
            <CardContent>
              {loading
                ? <Skeleton className="h-7 w-24 mb-1" />
                : <div className="text-2xl font-bold" style={card.accent && outstanding > 0 ? { color: '#d97706' } : {}}>{card.value}</div>}
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
              Trip di Periode Ini
            </CardTitle>
            {!loading && (
              <span className="text-xs text-muted-foreground">
                {activeCount} trip ditemukan
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
              <p className="text-sm">Tidak ada trip aktif di periode ini</p>
              <p className="text-xs mt-1 opacity-60">Coba ubah rentang tanggal</p>
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
                  <div key={b.id} className="flex items-center gap-4 rounded-xl border px-4 py-3 hover:bg-muted/30 transition-colors">
                    {/* Icon */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${ACCENT}20` }}>
                      {b.tripType === 'OPEN_TRIP'
                        ? <Anchor className="h-4 w-4" style={{ color: ACCENT }} />
                        : <Ship className="h-4 w-4" style={{ color: ACCENT }} />}
                    </div>

                    {/* Trip info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">{b.bookingCode}</span>
                        <span className="font-semibold text-sm truncate">{tripName}</span>
                        {dest !== '—' && <span className="text-xs text-muted-foreground truncate">{dest}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        <span>{b.customer.name}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {b.guestCount} tamu</span>
                        <span>·</span>
                        <span>{fmtDate(b.startDate)} – {fmtDate(b.endDate)}</span>
                        {b.agent && <><span>·</span><span>via {b.agent.name}</span></>}
                      </div>
                    </div>

                    {/* Financial */}
                    <div className="text-right shrink-0">
                      <div className="font-semibold text-sm">{fmtMoney(b.totalPrice)}</div>
                      {!isFullyPaid && remaining > 0 && (
                        <div className="flex items-center gap-1 text-xs text-amber-600 justify-end mt-0.5">
                          <AlertCircle className="h-3 w-3" />
                          sisa {fmtMoney(remaining)}
                        </div>
                      )}
                      {isFullyPaid && (
                        <div className="text-xs text-emerald-600 mt-0.5">Lunas ✓</div>
                      )}
                    </div>

                    {/* Status */}
                    <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_STYLES[b.status] ?? ''}`}>
                      {STATUS_LABELS[b.status] ?? b.status}
                    </Badge>
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
