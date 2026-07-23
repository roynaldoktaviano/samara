import { NextRequest, NextResponse } from 'next/server'
import { verifyAgentPortalAccess } from '@/lib/agent-portal-access'
import { resolveTenantById } from '@/lib/resolve-tenant'

export async function GET(request: NextRequest) {
  const payload = await verifyAgentPortalAccess(request)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await resolveTenantById(payload.tenantId)
  if (!db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const yachtId = searchParams.get('yachtId')

    const files = await db.mediaFile.findMany({
      where: yachtId ? { OR: [{ yachtId }, { yachtId: null }] } : { yachtId: null },
      select: {
        id: true, yachtId: true, category: true, type: true, name: true, url: true,
        sizeBytes: true, mimeType: true, folder: true,
      },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    })
    return NextResponse.json(files)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to fetch media' }, { status: 500 }) }
}
