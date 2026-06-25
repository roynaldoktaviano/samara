import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export async function POST() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role
  if (role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const db = await getDb(session)

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
