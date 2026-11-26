import { NextRequest, NextResponse } from 'next/server'
import { resolveAgentPortalSession, getVisibleCategoryIds } from '@/lib/agent-portal-access'

// Drives the portal's resource tabs — zero visible-category rows means unrestricted
// (every category shows), otherwise only the account's explicit allow-list.
export async function GET(request: NextRequest) {
  const session = await resolveAgentPortalSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db } = session

  try {
    const visibleCategoryIds = await getVisibleCategoryIds(session)

    const categories = await db.mediaCategory.findMany({
      where: visibleCategoryIds.length > 0 ? { id: { in: visibleCategoryIds } } : undefined,
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json(categories)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 }) }
}
