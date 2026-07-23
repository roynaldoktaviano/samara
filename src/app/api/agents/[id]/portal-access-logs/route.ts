import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'SALES']

// Same ownership rule as agents/[id]/portal-password/route.ts — ADMIN/SUPER_ADMIN, or the
// salesperson this agent is assigned to (they're the one who can set/reset its password,
// so they should be able to see its login history too).
async function requireAgentAccess(id: string, db: Awaited<ReturnType<typeof getDb>>) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const isSuperAdmin = (session?.user as { isSuperAdmin?: boolean })?.isSuperAdmin === true
  if (!session?.user?.id || !ALLOWED.includes(role)) return { ok: false as const, status: 403 }
  if (isSuperAdmin || role === 'ADMIN') return { ok: true as const }
  const agent = await db.agent.findUnique({ where: { id }, select: { salespersonId: true } })
  if (!agent) return { ok: false as const, status: 404 }
  if (agent.salespersonId !== session.user.id) return { ok: false as const, status: 403 }
  return { ok: true as const }
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const { id } = await params
    const access = await requireAgentAccess(id, db)
    if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status })

    const logs = await db.portalAccessLog.findMany({
      where: { agentId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, ip: true, userAgent: true, isSuspicious: true, createdAt: true },
    })

    const totalAccess     = logs.length
    const suspiciousCount = logs.filter(l => l.isSuspicious).length
    const lastAccess      = logs[0]?.createdAt ?? null

    return NextResponse.json({
      totalAccess,
      suspiciousCount,
      lastAccess,
      recentLogs: logs.slice(0, 20),
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
