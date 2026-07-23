import { NextRequest, NextResponse } from 'next/server'
import { verifyAgentPortalAccess } from '@/lib/agent-portal-access'
import { resolveTenantById } from '@/lib/resolve-tenant'

// Called on portal mount so a page refresh doesn't force re-login, and so an agent whose
// portalActive was flipped off after login gets bounced out promptly.
export async function GET(request: NextRequest) {
  try {
    const payload = await verifyAgentPortalAccess(request)
    if (!payload) return NextResponse.json({ valid: false })

    const db = await resolveTenantById(payload.tenantId)
    if (!db) return NextResponse.json({ valid: false })

    const agent = await db.agent.findUnique({
      where: { id: payload.agentId },
      select: { name: true, portalActive: true },
    })
    if (!agent?.portalActive) return NextResponse.json({ valid: false })

    return NextResponse.json({ valid: true, agentName: agent.name })
  } catch {
    return NextResponse.json({ valid: false })
  }
}
