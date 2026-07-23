import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import bcrypt from 'bcryptjs'
import type { PrismaClient } from '@prisma/client'
import type { Session } from 'next-auth'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'SALES']

// Only ADMIN/SUPER_ADMIN, or the salesperson this agent is assigned to, may
// view/change that agent's portal password — unlike agents/[id]/route.ts's PATCH,
// which only enforces this client-side via canActOnAgent().
async function requireAgentAccess(id: string, db: PrismaClient) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const isSuperAdmin = (session?.user as { isSuperAdmin?: boolean })?.isSuperAdmin === true
  if (!session?.user?.id || !ALLOWED.includes(role)) return { ok: false as const, status: 403 }
  if (isSuperAdmin || role === 'ADMIN') return { ok: true as const, session }
  const agent = await db.agent.findUnique({ where: { id }, select: { salespersonId: true } })
  if (!agent) return { ok: false as const, status: 404 }
  if (agent.salespersonId !== session.user.id) return { ok: false as const, status: 403 }
  return { ok: true as const, session }
}

// GET — password status (never the hash itself)
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const { id } = await params
    const access = await requireAgentAccess(id, db)
    if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status })
    const agent = await db.agent.findUnique({
      where: { id },
      select: { portalPasswordHash: true, portalActive: true, portalPasswordSetAt: true, portalPasswordSetById: true },
    })
    if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    let setByName: string | null = null
    if (agent.portalPasswordSetById) {
      const setBy = await db.user.findUnique({ where: { id: agent.portalPasswordSetById }, select: { name: true, email: true } })
      setByName = setBy?.name ?? setBy?.email ?? null
    }
    return NextResponse.json({
      hasPassword: !!agent.portalPasswordHash,
      isActive: agent.portalActive,
      setAt: agent.portalPasswordSetAt,
      setByName,
    })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// POST — set / reset password
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const { id } = await params
    const access = await requireAgentAccess(id, db)
    if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status })
    const session = access.session as Session

    const { password } = await request.json().catch(() => ({}))
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password minimal 8 karakter' }, { status: 400 })
    }

    const portalPasswordHash = await bcrypt.hash(password, 12)
    const agent = await db.agent.update({
      where: { id },
      data: {
        portalPasswordHash,
        portalPasswordSetAt: new Date(),
        portalPasswordSetById: session.user.id,
        portalActive: true,
      },
      select: { id: true, name: true, portalActive: true },
    })
    logActivity({
      userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'UPDATE', entity: 'Agent', entityId: id,
      detail: `Set/reset password agent portal untuk agent: ${agent.name}`,
    }, db).catch(() => {})
    return NextResponse.json({ ok: true, isActive: agent.portalActive })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to set password' }, { status: 500 }) }
}

// PATCH — toggle active/inactive (without clearing the hash)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const { id } = await params
    const access = await requireAgentAccess(id, db)
    if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status })
    const session = access.session as Session

    const { active } = await request.json()
    const agent = await db.agent.update({
      where: { id },
      data: { portalActive: !!active },
      select: { id: true, name: true, portalActive: true },
    })
    logActivity({
      userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'UPDATE', entity: 'Agent', entityId: id,
      detail: `${active ? 'Aktifkan' : 'Nonaktifkan'} akses agent portal untuk agent: ${agent.name}`,
    }, db).catch(() => {})
    return NextResponse.json(agent)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to update' }, { status: 500 }) }
}

// DELETE — clear password entirely
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const { id } = await params
    const access = await requireAgentAccess(id, db)
    if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status })
    const session = access.session as Session

    const agent = await db.agent.update({
      where: { id },
      data: { portalPasswordHash: null, portalActive: false, portalPasswordSetAt: null, portalPasswordSetById: null },
      select: { name: true },
    })
    logActivity({
      userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string }).role ?? '',
      action: 'UPDATE', entity: 'Agent', entityId: id,
      detail: `Hapus password agent portal untuk agent: ${agent.name}`,
    }, db).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to clear' }, { status: 500 }) }
}
