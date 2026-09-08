import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

// Lightweight Booking search for the Freelance trip-coverage picker (see
// EmployeesPage.tsx) — a purpose-built minimal endpoint rather than reusing the full
// /api/bookings (which carries pricing/payment/agent data HR doesn't need here and is
// scoped to SALES's own bookings for that role). Excludes cancelled trips since a
// freelancer can't cover one that isn't happening. Also returns the yacht list so the
// picker's yacht filter doesn't need a second round-trip to the much heavier /api/yachts.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const search = req.nextUrl.searchParams.get('search')?.trim()
  const yachtId = req.nextUrl.searchParams.get('yachtId')?.trim()
  const date = req.nextUrl.searchParams.get('date')?.trim() // a single day the trip must cover

  // A freelancer can only cover a trip that hasn't finished yet — excludes anything that
  // already ended, whether or not a specific `date` filter is also applied.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const requestedDate = date ? new Date(date) : null
  const endNotBefore = requestedDate && requestedDate > today ? requestedDate : today

  const [rows, yachts] = await Promise.all([
    db.booking.findMany({
      where: {
        status: { notIn: ['cancelled'] },
        endDate: { gte: endNotBefore },
        ...(yachtId && { yachtId }),
        ...(requestedDate && { startDate: { lte: requestedDate } }),
        ...(search && {
          OR: [
            { bookingCode: { contains: search, mode: 'insensitive' } },
            { destination: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { startDate: 'asc' },
      take: 300,
      select: {
        id: true, bookingCode: true, destination: true, startDate: true, endDate: true,
        openTripId: true, yacht: { select: { name: true } },
      },
    }),
    db.yacht.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  // An Open Trip departure is shared by one Booking row per guest party (same yacht,
  // same dates, same openTripId) — surfacing each of those separately here just shows the
  // same voyage over and over under different guests' booking codes. Collapse each group
  // down to a single pick (any one of its bookings — dates/yacht are identical across the
  // group, so it's a faithful stand-in for "this departure" as a FreelanceTripAssignment
  // target); private-charter bookings (no openTripId) have no group to collapse.
  const groups = new Map<string, typeof rows>()
  for (const b of rows) {
    const key = b.openTripId ?? b.id
    const list = groups.get(key) ?? []
    list.push(b)
    groups.set(key, list)
  }
  const bookings = [...groups.values()]
    .map(group => ({ ...group[0], isOpenTrip: group[0].openTripId != null }))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .slice(0, 100)

  return NextResponse.json({ bookings, yachts })
}
