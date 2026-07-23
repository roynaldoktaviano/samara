import { NextRequest, NextResponse } from 'next/server'
import { resolveAgentPortalSession } from '@/lib/agent-portal-access'

// Called on portal mount so a page refresh doesn't force re-login, and so an agent whose
// portalActive was flipped off (or password was reset) after login gets bounced out promptly.
export async function GET(request: NextRequest) {
  try {
    const session = await resolveAgentPortalSession(request)
    if (!session) return NextResponse.json({ valid: false })
    return NextResponse.json({ valid: true, agentName: session.agent.name })
  } catch {
    return NextResponse.json({ valid: false })
  }
}
