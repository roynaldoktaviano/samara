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
