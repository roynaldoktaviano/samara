import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

const ALLOWED = ['FINANCE', 'ADMIN', 'SUPER_ADMIN']

async function requireAccess() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return null
  return session
}

// PATCH — change the $/night value of an existing override (yacht/trip type stay fixed;
// delete + re-create instead if those need to change).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ agentId: string; rateId: string }> }) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { agentId, rateId } = await params

  const body = await request.json().catch(() => ({}))
  const ratePerNight = Number(body.ratePerNight)
  if (!Number.isFinite(ratePerNight) || ratePerNight < 0) return NextResponse.json({ error: 'ratePerNight must be a non-negative number' }, { status: 400 })

  const existing = await db.agentClawbackRate.findUnique({ where: { id: rateId } })
  if (!existing || existing.agentId !== agentId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await db.agentClawbackRate.update({
    where: { id: rateId },
    data: { ratePerNight },
    include: { yacht: { select: { id: true, name: true } } },
  })

  logActivity({
    userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
    userRole: (session.user as { role?: string }).role ?? '',
    action: 'UPDATE', entity: 'Agent', entityId: agentId,
    detail: `Updated clawback rate override (${updated.yacht?.name ?? 'any yacht'} / ${updated.tripType ?? 'any trip type'}) to $${ratePerNight}/night`,
  }, db).catch(() => {})

  return NextResponse.json(updated)
}

// DELETE — remove an override (that combination falls back to the next-broadest match,
// or the agent's global clawbackRatePerNight if nothing else applies).
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ agentId: string; rateId: string }> }) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { agentId, rateId } = await params

  const existing = await db.agentClawbackRate.findUnique({ where: { id: rateId } })
  if (!existing || existing.agentId !== agentId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.agentClawbackRate.delete({ where: { id: rateId } })

  logActivity({
    userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
    userRole: (session.user as { role?: string }).role ?? '',
    action: 'DELETE', entity: 'Agent', entityId: agentId,
    detail: 'Removed a clawback rate override',
  }, db).catch(() => {})

  return NextResponse.json({ ok: true })
}
