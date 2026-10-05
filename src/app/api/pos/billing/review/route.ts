import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN']

// Cashier sales flagged at offline sync (a discount that no longer validated when the queued sale
// reached the server) — across every trip and walk-in, until someone marks them reviewed.
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const sales = await db.cashierSale.findMany({
    where: { needsReview: true },
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      yacht: { select: { name: true } },
      booking: { select: { bookingCode: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return NextResponse.json(sales)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { id } = await req.json().catch(() => ({}))
  if (typeof id !== 'string') return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const sale = await db.cashierSale.findUnique({ where: { id }, select: { needsReview: true } })
  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })

  // reviewNote is kept as history of why it was flagged.
  await db.cashierSale.update({
    where: { id },
    data: { needsReview: false, reviewedAt: new Date(), reviewedBy: session.user.name ?? session.user.email ?? session.user.id },
  })
  return NextResponse.json({ ok: true })
}
