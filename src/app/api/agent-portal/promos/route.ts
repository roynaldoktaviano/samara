import { NextRequest, NextResponse } from 'next/server'
import { resolveAgentPortalSession } from '@/lib/agent-portal-access'

// GET — the single active promo for a scope: no `yachtId` param returns the "General" promo
// (shown right after login); `?yachtId=<id>` returns that yacht's promo (shown when an agent
// picks it). Returns null when no draft in that scope is currently active.
export async function GET(request: NextRequest) {
  const session = await resolveAgentPortalSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db } = session

  try {
    const { searchParams } = new URL(request.url)
    const yachtId = searchParams.get('yachtId')

    const promo = await db.promo.findFirst({
      where: { yachtId: yachtId || null, isActive: true },
      select: { id: true, title: true, description: true, imageUrl: true, ctaLabel: true, ctaUrl: true },
    })
    return NextResponse.json(promo)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to fetch promo' }, { status: 500 }) }
}
