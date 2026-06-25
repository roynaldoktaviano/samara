import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { randomBytes } from 'crypto'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'SALES']

async function requireAccess() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!ALLOWED.includes(role)) return null
  return session
}

// GET — token status + stats
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    if (!await requireAccess()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await params
    const agent = await db.agent.findUnique({
      where: { id },
      select: {
        calendarToken: true,
        calendarActive: true,
        _count: { select: { calendarAccessLogs: true } },
        calendarAccessLogs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
    })
    if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const suspiciousCount = await db.calendarAccessLog.count({ where: { agentId: id, isSuspicious: true } })
    return NextResponse.json({
      hasToken:       !!agent.calendarToken,
      isActive:       agent.calendarActive,
      totalAccess:    agent._count.calendarAccessLogs,
      lastAccess:     agent.calendarAccessLogs[0]?.createdAt ?? null,
      suspiciousCount,
    })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// POST — generate / reset token
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const session = await requireAccess()
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await params
    const token = randomBytes(24).toString('hex')
    const agent = await db.agent.update({
      where: { id },
      data: { calendarToken: token, calendarActive: true },
      select: { id: true, name: true, calendarToken: true, calendarActive: true },
    })
    logActivity({
      userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'UPDATE', entity: 'Agent', entityId: id,
      detail: `Generate calendar token untuk agent: ${agent.name}`,
    }).catch(() => {})
    return NextResponse.json(agent)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 }) }
}

// PATCH — toggle active/inactive
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const session = await requireAccess()
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await params
    const { active } = await request.json()
    const agent = await db.agent.update({
      where: { id },
      data: { calendarActive: active },
      select: { id: true, name: true, calendarActive: true },
    })
    logActivity({
      userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'UPDATE', entity: 'Agent', entityId: id,
      detail: `${active ? 'Aktifkan' : 'Nonaktifkan'} calendar token untuk agent: ${agent.name}`,
    }).catch(() => {})
    return NextResponse.json(agent)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to update' }, { status: 500 }) }
}

// DELETE — revoke token
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const session = await requireAccess()
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await params
    const agent = await db.agent.update({
      where: { id },
      data: { calendarToken: null, calendarActive: false },
      select: { name: true },
    })
    logActivity({
      userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'UPDATE', entity: 'Agent', entityId: id,
      detail: `Revoke calendar token untuk agent: ${agent.name}`,
    }).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to revoke' }, { status: 500 }) }
}
