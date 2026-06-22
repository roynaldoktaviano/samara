import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as any).role
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const bookingCount = await db.booking.count()
  if (bookingCount > 0) {
    return NextResponse.json(
      { error: 'Cannot reset counters while bookings exist. Delete all bookings first.' },
      { status: 400 }
    )
  }

  await db.$executeRaw`DELETE FROM "Counter" WHERE key LIKE 'booking:%'`

  return NextResponse.json({ ok: true, message: 'Booking counters reset. Next booking will start from 0001.' })
}
