import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import type { PrismaClient } from '@prisma/client'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'SALES']

// Same ownership rule as agents/[id]/portal-password/route.ts — ADMIN/SUPER_ADMIN, or the
// salesperson this agent is assigned to.
async function requireAgentAccess(id: string, db: PrismaClient) {
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

// GET — { restricted: false } means this agent sees every category (default, no rows yet);
// { restricted: true, visibleCategoryIds } means an explicit allow-list is in effect.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const { id } = await params
    const access = await requireAgentAccess(id, db)
    if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status })

    const rows = await db.agentVisibleCategory.findMany({ where: { agentId: id }, select: { categoryId: true } })
    return NextResponse.json({ restricted: rows.length > 0, visibleCategoryIds: rows.map(r => r.categoryId) })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// PUT — replace the agent's visible-category set. `restricted: false` clears it entirely
// (back to "sees everything"); `restricted: true` sets it to exactly `categoryIds`.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const { id } = await params
    const access = await requireAgentAccess(id, db)
    if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status })

    const body = await request.json().catch(() => ({}))
    const restricted = body.restricted === true
    const categoryIds: string[] = Array.isArray(body.categoryIds) ? body.categoryIds.filter((v: unknown) => typeof v === 'string') : []

    await db.$transaction([
      db.agentVisibleCategory.deleteMany({ where: { agentId: id } }),
      ...(restricted && categoryIds.length > 0
        ? [db.agentVisibleCategory.createMany({ data: categoryIds.map(categoryId => ({ agentId: id, categoryId })) })]
        : []),
    ])

    return NextResponse.json({ ok: true })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to update' }, { status: 500 }) }
}
