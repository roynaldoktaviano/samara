import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

const ALLOWED = ['FINANCE', 'ADMIN', 'SUPER_ADMIN']
const TRIP_TYPES = ['OPEN_TRIP', 'PRIVATE_CHARTER']

// POST — a scoped clawback rate override for this agent (yacht and/or trip type specific).
// null yachtId/tripType means "any" for that dimension — see AgentClawbackRate in schema.
export async function POST(request: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { agentId } = await params

  const body = await request.json().catch(() => ({}))
  const yachtId = typeof body.yachtId === 'string' && body.yachtId ? body.yachtId : null
  const tripType = TRIP_TYPES.includes(body.tripType) ? body.tripType : null
  const ratePerNight = Number(body.ratePerNight)
  if (!Number.isFinite(ratePerNight) || ratePerNight < 0) return NextResponse.json({ error: 'ratePerNight must be a non-negative number' }, { status: 400 })

  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { name: true } })
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (yachtId) {
    const yacht = await db.yacht.findUnique({ where: { id: yachtId }, select: { id: true } })
    if (!yacht) return NextResponse.json({ error: 'Invalid yacht' }, { status: 400 })
  }

  const existing = await db.agentClawbackRate.findFirst({ where: { agentId, yachtId, tripType } })
  if (existing) return NextResponse.json({ error: 'A rate for this yacht/trip type combination already exists — edit or delete it instead' }, { status: 409 })

  const rate = await db.agentClawbackRate.create({
    data: { agentId, yachtId, tripType, ratePerNight },
    include: { yacht: { select: { id: true, name: true } } },
  })

  logActivity({
    userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
    userRole: role, action: 'CREATE', entity: 'Agent', entityId: agentId,
    detail: `Added clawback rate override for ${agent.name}: ${rate.yacht?.name ?? 'any yacht'} / ${tripType ?? 'any trip type'} = $${ratePerNight}/night`,
  }, db).catch(() => {})

  return NextResponse.json(rate, { status: 201 })
}
