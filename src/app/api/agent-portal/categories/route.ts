import { NextRequest, NextResponse } from 'next/server'
import { resolveAgentPortalSession } from '@/lib/agent-portal-access'

// Drives the portal's Media Kit tab bar — zero AgentVisibleCategory rows means unrestricted
// (every category shows), otherwise only the agent's explicit allow-list.
export async function GET(request: NextRequest) {
  const session = await resolveAgentPortalSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db } = session

  try {
    const visible = await db.agentVisibleCategory.findMany({
      where: { agentId: session.agent.id },
      select: { categoryId: true },
    })

    const categories = await db.mediaCategory.findMany({
      where: visible.length > 0 ? { id: { in: visible.map(v => v.categoryId) } } : undefined,
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json(categories)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 }) }
}
