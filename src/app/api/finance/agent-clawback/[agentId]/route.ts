import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['FINANCE', 'ADMIN', 'SUPER_ADMIN']

async function requireAccess() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return null
  return session
}

// GET — one agent's clawback rate, current balance, and full ledger history.
export async function GET(_: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { agentId } = await params

  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, clawbackRatePerNight: true },
  })
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [entries, rates] = await Promise.all([
    db.agentClawbackEntry.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      include: { booking: { select: { bookingCode: true, startDate: true, endDate: true } } },
    }),
    db.agentClawbackRate.findMany({
      where: { agentId },
      orderBy: [{ yachtId: 'asc' }, { tripType: 'asc' }],
      include: { yacht: { select: { id: true, name: true } } },
    }),
  ])
  const balance = entries.reduce((sum, e) => sum + e.amount, 0)

  return NextResponse.json({ ...agent, clawbackBalance: balance, entries, rates })
}

// PATCH — Finance/Admin sets the $/night deduction rate for this agent. The rate only
// affects FUTURE bookings' automatic deductions — it never retroactively touches past entries.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const session = await requireAccess()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { agentId } = await params
  const body = await request.json().catch(() => ({}))
  const rate = Number(body.clawbackRatePerNight)
  if (!Number.isFinite(rate) || rate < 0) return NextResponse.json({ error: 'clawbackRatePerNight must be a non-negative number' }, { status: 400 })

  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { name: true } })
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await db.agent.update({
    where: { id: agentId },
    data: { clawbackRatePerNight: rate },
    select: { id: true, name: true, clawbackRatePerNight: true },
  })

  logActivity({
    userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
    userRole: (session.user as { role?: string }).role ?? '',
    action: 'UPDATE', entity: 'Agent', entityId: agentId,
    detail: `Set clawback rate for ${agent.name}: $${rate}/night`,
  }, db).catch(() => {})

  return NextResponse.json(updated)
}
