const DATE_OVERRIDABLE_STATUSES = new Set(['confirmed', 'partially_paid', 'fully_paid'])

/**
 * Derives a display-only status for bookings whose trip dates have started/ended.
 * Never touches the stored status — 'on_trip' covers [startDate, endDate), 'completed'
 * kicks in on the trip's last day. Only applies to confirmed/paid statuses; pending,
 * on_hold, cancelled, and manually-set completed bookings pass through unchanged.
 */
export function getEffectiveBookingStatus(status: string, startDate: string, endDate: string): string {
  if (!DATE_OVERRIDABLE_STATUSES.has(status)) return status
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(startDate.split('T')[0] + 'T00:00:00')
  const end   = new Date(endDate.split('T')[0]   + 'T00:00:00')
  if (today >= end)   return 'completed'
  if (today >= start) return 'on_trip'
  return status
}

/* ─── Booking status presentation — single source of truth ──────────────────
   Every screen (Bookings, Calendar, Dashboard, WhatsApp panel, public calendar…)
   reads label + colour from here. Colours are design tokens, so they follow
   dark mode and tenant theming. `color` is a CSS colour usable in inline styles
   (dots, borders); `bar` is a solid fill that keeps white text readable in both
   themes (calendar bars); `badge` is the className for a pill/badge. */
export type BookingStatusKey =
  | 'pending' | 'on_hold' | 'confirmed' | 'partially_paid'
  | 'fully_paid' | 'on_trip' | 'completed' | 'cancelled'

type BookingStatusStyle = { label: string; badge: string; color: string; bar: string }

export const BOOKING_STATUS: Record<BookingStatusKey, BookingStatusStyle> = {
  pending:        { label: 'Pending',        badge: 'bg-warning/15 text-warning border-warning/30',             color: 'var(--warning)', bar: 'color-mix(in srgb, var(--warning), black var(--status-bar-shade))' },
  on_hold:        { label: 'On Hold',        badge: 'bg-success/15 text-success border-success/30',             color: 'var(--success)', bar: 'color-mix(in srgb, var(--success), black var(--status-bar-shade))' },
  partially_paid: { label: 'Partially Paid', badge: 'bg-info/15 text-info border-info/30',                      color: 'var(--info)', bar: 'color-mix(in srgb, var(--info), black var(--status-bar-shade))' },
  confirmed:      { label: 'Confirmed',      badge: 'bg-destructive/15 text-destructive border-destructive/30', color: 'var(--destructive)', bar: 'color-mix(in srgb, var(--destructive), black var(--status-bar-shade))' },
  fully_paid:     { label: 'Fully Paid',     badge: 'bg-destructive/15 text-destructive border-destructive/30', color: 'var(--destructive)', bar: 'color-mix(in srgb, var(--destructive), black var(--status-bar-shade))' },
  on_trip:        { label: 'On Trip',        badge: 'bg-muted text-muted-foreground border-border',             color: 'var(--muted-foreground)', bar: 'color-mix(in srgb, var(--muted-foreground), black var(--status-bar-shade))' },
  completed:      { label: 'Completed',      badge: 'bg-muted text-muted-foreground border-border',             color: 'var(--muted-foreground)', bar: 'color-mix(in srgb, var(--muted-foreground), black var(--status-bar-shade))' },
  cancelled:      { label: 'Cancelled',      badge: 'bg-muted text-muted-foreground/80 border-border',          color: 'var(--muted-foreground)', bar: 'color-mix(in srgb, var(--muted-foreground), black var(--status-bar-shade))' },
}

const UNKNOWN_STATUS: BookingStatusStyle = { label: '', badge: 'bg-muted text-muted-foreground border-border', color: 'var(--muted-foreground)', bar: 'color-mix(in srgb, var(--muted-foreground), black var(--status-bar-shade))' }

export function bookingStatusStyle(status: string): BookingStatusStyle {
  return BOOKING_STATUS[status as BookingStatusKey] ?? { ...UNKNOWN_STATUS, label: status.replace(/_/g, ' ') }
}
