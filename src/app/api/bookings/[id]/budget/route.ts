import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { budgetTotal, canManageCollaboration, normalizeBudgetCurrency, parseBudgetItems } from '@/lib/collaboration-budget'

/**
 * PUT — replace a Collaboration Book's budget structure (currency + every line).
 * Body: { budgetCurrency: 'IDR' | 'USD', budgetItems: Array<{ name, amount }> }
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role ?? ''
  if (!session?.user?.id || !canManageCollaboration(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = await getDb(session)
  const { id } = await params

  const booking = await db.booking.findUnique({ where: { id }, select: { id: true, bookingCode: true, isCollaboration: true } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!booking.isCollaboration) return NextResponse.json({ error: 'Not a collaboration book' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const parsed = parseBudgetItems(body.budgetItems)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const currency = normalizeBudgetCurrency(body.budgetCurrency)

  const updated = await db.$transaction(async tx => {
    await tx.bookingBudgetItem.deleteMany({ where: { bookingId: id } })
    await tx.bookingBudgetItem.createMany({
      data: parsed.items.map((b, i) => ({ bookingId: id, name: b.name, amount: b.amount, sortOrder: i })),
    })
    return tx.booking.update({
      where: { id },
      data: { budgetCurrency: currency },
      select: {
        id: true, budgetCurrency: true,
        budgetItems: { select: { id: true, name: true, amount: true }, orderBy: { sortOrder: 'asc' } },
      },
    })
  })

  logActivity({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? 'Unknown',
    userRole: role,
    action: 'UPDATE', entity: 'Booking', entityId: id,
    detail: `Updated collaboration budget for ${booking.bookingCode} — ${parsed.items.length} item(s), total ${currency} ${budgetTotal(parsed.items)}`,
  }, db).catch(() => {})

  return NextResponse.json(updated)
}
