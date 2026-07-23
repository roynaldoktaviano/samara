import { NextRequest, NextResponse } from 'next/server'
import { resolveAgentPortalSession } from '@/lib/agent-portal-access'

// Returns every persisted folder (all yachts, all depths) for categories this agent can see —
// the client builds the tree/breadcrumb from parentId. Same visibility filter as
// /api/agent-portal/media, for the same reason: a restricted category's folders shouldn't
// leave the server for this agent's session either.
export async function GET(request: NextRequest) {
  const session = await resolveAgentPortalSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db } = session

  try {
    const visible = await db.agentVisibleCategory.findMany({
      where: { agentId: session.agent.id },
      select: { categoryId: true },
    })
    const visibleCategoryIds = visible.map(v => v.categoryId)

    const folders = await db.mediaFolder.findMany({
      where: visibleCategoryIds.length > 0 ? { categoryId: { in: visibleCategoryIds } } : undefined,
      select: { id: true, name: true, parentId: true, yachtId: true, categoryId: true },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(folders)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 }) }
}
