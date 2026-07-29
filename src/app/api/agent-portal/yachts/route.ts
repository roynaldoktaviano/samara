import { NextRequest, NextResponse } from 'next/server'
import { resolveAgentPortalSession } from '@/lib/agent-portal-access'

export async function GET(request: NextRequest) {
  const session = await resolveAgentPortalSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db } = session

  try {
    const yachts = await db.yacht.findMany({
      where: { deletedAt: null, status: { not: 'maintenance' } },
      select: {
        id: true, name: true, tagline: true, type: true, image: true,
        description: true, capacity: true, cabinCount: true, length: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    return NextResponse.json(yachts)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to fetch yachts' }, { status: 500 }) }
}
