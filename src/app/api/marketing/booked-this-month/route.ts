import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { guestsBookedInMonths } from '@/lib/marketing'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

/** Who the "exclude guests who booked" audience toggle currently drops.
 * ?current=1 → rolling current month (WITA); ?months=2026-10,2026-09 → fixed months.
 * No params = current month only (old behaviour). */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const sp = req.nextUrl.searchParams
  const months = (sp.get('months') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const current = sp.has('current') ? sp.get('current') === '1' : months.length === 0
  return NextResponse.json(await guestsBookedInMonths(db, { current, months }))
}
