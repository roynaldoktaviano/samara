import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { canManageCollaboration } from '@/lib/collaboration-budget'
import { parseContractUrls } from '@/lib/collaboration-contracts-server'

/**
 * PUT — replace a Collaboration Book's contract files.
 * Body: { collaborationContracts: string[] } (R2 URLs from POST /api/bookings/collaboration-contracts, max 3)
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
  const parsed = parseContractUrls(body.collaborationContracts)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const updated = await db.booking.update({
    where: { id },
    data: { collaborationContracts: parsed.urls },
    select: { id: true, collaborationContracts: true },
  })

  logActivity({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? 'Unknown',
    userRole: role,
    action: 'UPDATE', entity: 'Booking', entityId: id,
    detail: `Updated collaboration contracts for ${booking.bookingCode} — ${parsed.urls.length} file(s)`,
  }, db).catch(() => {})

  return NextResponse.json(updated)
}
