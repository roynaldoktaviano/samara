import { jwtVerify } from 'jose'
import type { NextRequest } from 'next/server'

export const AGENT_PORTAL_COOKIE = 'agent-portal-access'

// Separate cookie name + payload shape from cal-access.ts's CAL_ACCESS_COOKIE so the two
// public, non-NextAuth agent sessions (calendar-link access vs. full portal login) can
// never be confused for one another, even though both sign with SSO_JWT_SECRET.
export function getAgentPortalSecret(): Uint8Array {
  const secret = process.env.SSO_JWT_SECRET
  if (!secret) throw new Error('SSO_JWT_SECRET is not configured')
  return new TextEncoder().encode(secret)
}

export interface AgentPortalPayload {
  agentId: string
  agentName: string
  tenantId: string | null
}

/** Verifies the agent-portal-access cookie on a request, returning its payload or null if missing/invalid. */
export async function verifyAgentPortalAccess(req: NextRequest): Promise<AgentPortalPayload | null> {
  const cookie = req.cookies.get(AGENT_PORTAL_COOKIE)?.value
  if (!cookie) return null
  try {
    const { payload } = await jwtVerify(cookie, getAgentPortalSecret())
    return {
      agentId: payload.agentId as string,
      agentName: payload.agentName as string,
      tenantId: (payload.tenantId as string | null) ?? null,
    }
  } catch {
    return null
  }
}
