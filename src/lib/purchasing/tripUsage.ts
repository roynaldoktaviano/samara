// Which trip a usage (pemakaian) movement belongs to — shared by Finance › Trip Stats and
// Purchasing › Trip Usage so both charge the same movement to the same trip.
//
// A movement is charged to the trip it's linked to (openTripId / tripBookingId, set from the
// Transfer / PO trip picker); an unlinked one falls back by date to the trip on that yacht
// running when it happened, else the next one to depart (supplies loaded ahead of a trip).
// Open Trips absorbed into a Private Charter have no row of their own — the charter's row
// stands for them (same rule as renumberTripYear()).

interface OpenTripLike { id: string; startDate: Date; endDate: Date; status: string; closedReason: string | null }
interface CharterLike { id: string; bookingCode: string; startDate: Date; endDate: Date }

export function buildTripResolver(openTrips: OpenTripLike[], charters: CharterLike[]) {
  const absorbedInto = new Map<string, string>()
  for (const t of openTrips) {
    if (t.status !== 'closed' || !t.closedReason) continue
    const c = charters.find(c => t.closedReason!.trimEnd().endsWith(` ${c.bookingCode}`))
    if (c) absorbedInto.set(t.id, c.id)
  }
  const isAbsorbed = (t: { id: string }) => absorbedInto.has(t.id)

  const windows = [
    ...openTrips.filter(t => !isAbsorbed(t)).map(t => ({ id: t.id, startDate: t.startDate, endDate: t.endDate })),
    ...charters.map(c => ({ id: c.id, startDate: c.startDate, endDate: c.endDate })),
  ].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
  const dayStart = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const tripByDate = (when: Date) => {
    const day = dayStart(when)
    return windows.find(w => day >= dayStart(w.startDate) && day <= dayStart(w.endDate))
      ?? windows.find(w => dayStart(w.startDate) > day)
  }

  /** tripId undefined = unassigned. byDate = not linked on its Transfer/PO, placed by date. */
  const resolve = (m: { openTripId: string | null; tripBookingId: string | null; createdAt: Date }) => {
    const linked = m.openTripId ? (absorbedInto.get(m.openTripId) ?? m.openTripId) : m.tripBookingId
    const tripId = linked && windows.some(w => w.id === linked) ? linked : (!linked ? tripByDate(m.createdAt)?.id : undefined)
    return { tripId, byDate: !linked }
  }

  return { isAbsorbed, resolve }
}
