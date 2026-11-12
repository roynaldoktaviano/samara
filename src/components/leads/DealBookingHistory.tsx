'use client'

import { useEffect, useState } from 'react'
import { Calendar, Loader2, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BookingStatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'
import { formatDateRange, formatMoney } from '@/lib/format'

// Same row shape as GET /api/customers/[id] → tripHistory.
interface TripRow {
  id: string
  bookingCode: string
  startDate: string
  endDate: string
  status: string
  totalPrice: number
  currency?: string
  dealName?: string | null
  tripTitle?: string
  destination?: string
  isWaitingList?: boolean
}

/**
 * A lead's booking history, read from the Guest it became — so the Sales Pipeline, the Leads
 * detail and the Guest page all list the same bookings under the same deal names
 * (src/lib/deal-name.ts). Shows a "no bookings yet" note when the lead has no guest profile.
 */
export default function DealBookingHistory({ guestId, currentBookingId, onOpenBooking, onOpenGuest }: {
  guestId: string | null | undefined
  currentBookingId?: string | null
  onOpenBooking?: (bookingId: string) => void
  onOpenGuest?: (guestId: string) => void
}) {
  const [rows, setRows] = useState<TripRow[] | null>(null)
  const [guestName, setGuestName] = useState<string | null>(null)

  useEffect(() => {
    setRows(null)
    if (!guestId) return
    let alive = true
    fetch(`/api/customers/${guestId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!alive) return
        setGuestName(d?.name ?? null)
        setRows(((d?.tripHistory ?? []) as TripRow[]).filter(t => !t.isWaitingList))
      })
      .catch(() => alive && setRows([]))
    return () => { alive = false }
  }, [guestId])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Booking history</p>
        {guestId && onOpenGuest && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onOpenGuest(guestId)}>
            <UserRound className="h-3.5 w-3.5" /> {guestName ? `Guest: ${guestName}` : 'Guest profile'}
          </Button>
        )}
      </div>
      {!guestId ? (
        <p className="text-xs text-muted-foreground">No booking yet — once one is made for this lead it shows here, with the guest profile.</p>
      ) : rows === null ? (
        <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Guest profile exists but has no bookings yet.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map(t => (
            <button key={t.id} type="button" disabled={!onOpenBooking} onClick={() => onOpenBooking?.(t.id)}
              className={cn('w-full text-left rounded-lg border p-2.5 transition-colors enabled:hover:bg-muted/40',
                t.id === currentBookingId && 'border-primary/40 bg-primary/5')}>
              <p className="text-sm font-medium text-primary leading-snug break-words">{t.dealName || t.tripTitle || t.destination || t.bookingCode}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <span className="font-mono">{t.bookingCode}</span>
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDateRange(t.startDate, t.endDate)}</span>
                <span className="tabular-nums">{formatMoney(t.totalPrice, { currency: t.currency || 'USD' })}</span>
                <BookingStatusBadge status={t.status} size="sm" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
