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
// freelancer can't cover one that isn't happening.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const search = req.nextUrl.searchParams.get('search')?.trim()

  const bookings = await db.booking.findMany({
    where: {
      status: { notIn: ['cancelled'] },
      ...(search && {
        OR: [
          { bookingCode: { contains: search, mode: 'insensitive' } },
          { destination: { contains: search, mode: 'insensitive' } },
        ],
      }),
    },
    orderBy: { startDate: 'desc' },
    take: 100,
    select: { id: true, bookingCode: true, destination: true, startDate: true, endDate: true, yacht: { select: { name: true } } },
  })
  return NextResponse.json(bookings)
}
