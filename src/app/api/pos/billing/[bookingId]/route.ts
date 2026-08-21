import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, bookingCode: true, startDate: true, endDate: true, status: true, customer: { select: { name: true } }, yacht: { select: { id: true, name: true } } },
  })
  if (!booking) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const sales = await db.cashierSale.findMany({
    where: { bookingId },
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      guest: { select: { customer: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ booking, sales })
}
