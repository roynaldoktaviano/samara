import { jwtVerify } from 'jose'
import type { NextRequest } from 'next/server'
import type { PrismaClient } from '@prisma/client'
import { resolveTenantById } from '@/lib/resolve-tenant'

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
  // Epoch ms of Agent.portalPasswordSetAt at the moment this token was issued. Compared
  // against the current DB value on every request so resetting a password immediately
  // invalidates any token issued before the reset, even though the JWT itself is still
  // cryptographically valid for up to 30 days.
  pwv: number
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
      pwv: (payload.pwv as number) ?? 0,
    }
  } catch {
    return null
  }
}

export interface AgentPortalSession {
  db: PrismaClient
  tenantId: string | null
  agent: { id: string; name: string }
}

/**
 * The one place every agent-portal data route should call to authorize a request — verifies
 * the JWT, then re-checks the Agent row fresh from the DB (portalActive + password version)
 * so a revoked/deactivated/password-reset agent is cut off immediately, not just at their
 * next login. A pure JWT-signature check alone (verifyAgentPortalAccess) is NOT enough for
 * routes that return real data — only use that directly for cases that don't need live state.
 */
export async function resolveAgentPortalSession(req: NextRequest): Promise<AgentPortalSession | null> {
  const payload = await verifyAgentPortalAccess(req)
  if (!payload) return null

  const db = await resolveTenantById(payload.tenantId)
  if (!db) return null

  const agent = await db.agent.findUnique({
    where: { id: payload.agentId },
    select: { id: true, name: true, portalActive: true, portalPasswordSetAt: true },
  })
  if (!agent?.portalActive) return null

  const currentPwv = agent.portalPasswordSetAt ? agent.portalPasswordSetAt.getTime() : 0
  if (currentPwv !== payload.pwv) return null

  return { db, tenantId: payload.tenantId, agent: { id: agent.id, name: agent.name } }
}
