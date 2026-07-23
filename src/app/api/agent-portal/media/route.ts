import { NextRequest, NextResponse } from 'next/server'
import { resolveAgentPortalSession } from '@/lib/agent-portal-access'

export async function GET(request: NextRequest) {
  const session = await resolveAgentPortalSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db } = session

  try {
    const { searchParams } = new URL(request.url)
    const yachtId = searchParams.get('yachtId')

    // Zero rows = unrestricted (sees every category); otherwise an explicit allow-list —
    // filtered here too (not just in the /categories tab list) so a restricted category's
    // files never leave the server for this agent's session at all.
    const visible = await db.agentVisibleCategory.findMany({
      where: { agentId: session.agent.id },
      select: { categoryId: true },
    })
    const visibleCategoryIds = visible.map(v => v.categoryId)

    const files = await db.mediaFile.findMany({
      where: {
        ...(yachtId ? { OR: [{ yachtId }, { yachtId: null }] } : { yachtId: null }),
        ...(visibleCategoryIds.length > 0 ? { categoryId: { in: visibleCategoryIds } } : {}),
      },
      select: {
        id: true, yachtId: true, categoryId: true, type: true, name: true, url: true,
        sizeBytes: true, mimeType: true, folderId: true,
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    })
    return NextResponse.json(files)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to fetch media' }, { status: 500 }) }
}
