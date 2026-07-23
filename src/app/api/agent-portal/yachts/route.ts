import { NextRequest, NextResponse } from 'next/server'
import { verifyAgentPortalAccess } from '@/lib/agent-portal-access'
import { resolveTenantById } from '@/lib/resolve-tenant'

export async function GET(request: NextRequest) {
  const payload = await verifyAgentPortalAccess(request)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await resolveTenantById(payload.tenantId)
  if (!db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const yachts = await db.yacht.findMany({
      where: { deletedAt: null, status: { not: 'maintenance' } },
      select: {
        id: true, name: true, tagline: true, type: true, image: true,
        description: true, capacity: true, cabinCount: true, length: true,
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(yachts)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to fetch yachts' }, { status: 500 }) }
}
