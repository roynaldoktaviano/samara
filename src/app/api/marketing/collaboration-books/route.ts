import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { budgetTotal, canManageCollaboration } from '@/lib/collaboration-budget'

/**
 * GET — Collaboration Book report: every collaboration booking whose trip starts in
 * [from, to] (YYYY-MM-DD, both optional), with its budget lines and total.
 * Cancelled ones are included but flagged so the UI can leave them out of the totals.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role ?? ''
  if (!session?.user?.id || !canManageCollaboration(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = await getDb(session)

  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const startDate: { gte?: Date; lte?: Date } = {}
  if (from && !isNaN(Date.parse(from))) startDate.gte = new Date(`${from}T00:00:00.000Z`)
  if (to && !isNaN(Date.parse(to))) startDate.lte = new Date(`${to}T23:59:59.999Z`)

  const bookings = await db.booking.findMany({
    where: { isCollaboration: true, ...(Object.keys(startDate).length > 0 && { startDate }) },
    select: {
      id: true, bookingCode: true, tripType: true, status: true, startDate: true, endDate: true,
      guestCount: true, complimentaryReason: true, budgetCurrency: true, createdAt: true,
      salesperson: true,
      yacht: { select: { name: true } },
      openTrip: { select: { title: true } },
      customer: { select: { name: true } },
      budgetItems: { select: { id: true, name: true, amount: true }, orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { startDate: 'desc' },
    take: 1000,
  })

  return NextResponse.json(bookings.map(b => ({
    id: b.id,
    bookingCode: b.bookingCode,
    tripType: b.tripType,
    status: b.status,
    cancelled: b.status === 'cancelled',
    startDate: b.startDate,
    endDate: b.endDate,
    guestCount: b.guestCount,
    purpose: b.complimentaryReason,
    currency: b.budgetCurrency ?? 'IDR',
    createdByName: b.salesperson,
    vessel: b.yacht?.name ?? null,
    openTripTitle: b.openTrip?.title ?? null,
    leadGuest: b.customer?.name ?? null,
    items: b.budgetItems,
    total: budgetTotal(b.budgetItems),
  })))
}
