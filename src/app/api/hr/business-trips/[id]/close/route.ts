import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { emitTenantEvent } from '@/lib/realtime-bus'

// Identity-based (only the trip's own requester can close it) — only reachable from
// APPROVED, and only once every reimbursement on the trip is PAID (or there are none),
// so nothing financial is left dangling once a trip is marked closed.
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.businessTrip.findUnique({
    where: { id },
    include: { employee: { select: { userId: true } }, reimbursements: { select: { status: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.employee.userId !== session.user.id) return NextResponse.json({ error: 'This trip is not yours' }, { status: 403 })
  if (existing.status !== 'APPROVED') return NextResponse.json({ error: 'Only an approved trip can be closed' }, { status: 409 })
  if (existing.reimbursements.some(r => r.status !== 'PAID')) {
    return NextResponse.json({ error: 'You still have a reimbursement waiting for payment — close it once that’s paid' }, { status: 409 })
  }

  const updated = await db.businessTrip.update({
    where: { id },
    data: { status: 'CLOSED', closedAt: new Date() },
  })

  emitTenantEvent(session.user.tenantId, 'hr-business-trips')

  return NextResponse.json(updated)
}
