import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['FINANCE', 'ADMIN', 'SUPER_ADMIN']

// POST — a manual ledger entry (Finance recording new debt owed, or a manual adjustment).
// Automatic per-booking deductions are created server-side at booking creation instead
// (see src/app/api/bookings/route.ts) — this endpoint is for the human-entered side only.
export async function POST(request: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { agentId } = await params

  const body = await request.json().catch(() => ({}))
  const amount = Number(body.amount)
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (!Number.isFinite(amount) || amount === 0) return NextResponse.json({ error: 'amount must be a non-zero number' }, { status: 400 })
  if (!note) return NextResponse.json({ error: 'A note explaining this entry is required' }, { status: 400 })

  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { name: true } })
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const entry = await db.agentClawbackEntry.create({
    data: {
      agentId, amount, note,
      createdByUserId: session.user.id,
      createdByName: session.user.name ?? session.user.email ?? 'Unknown',
    },
  })

  logActivity({
    userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
    userRole: role, action: amount > 0 ? 'CREATE' : 'UPDATE', entity: 'Agent', entityId: agentId,
    detail: `Clawback ${amount > 0 ? 'debt added' : 'adjustment'} for ${agent.name}: ${amount > 0 ? '+' : ''}$${amount} — ${note}`,
  }, db).catch(() => {})

  return NextResponse.json(entry, { status: 201 })
}
