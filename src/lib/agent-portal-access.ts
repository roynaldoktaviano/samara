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

/** Who is signed into the portal: a travel Agent, or a press/media contact (MediaAccount). */
export type PortalRole = 'agent' | 'media'

export interface AgentPortalPayload {
  role: PortalRole
  /** Agent.id for role 'agent', MediaAccount.id for role 'media'. */
  subjectId: string
  name: string
  tenantId: string | null
  // Epoch ms of portalPasswordSetAt at the moment this token was issued. Compared against
  // the current DB value on every request so resetting a password immediately invalidates
  // any token issued before the reset, even though the JWT itself is still
  // cryptographically valid for up to 30 days.
  pwv: number
}

/** Verifies the agent-portal-access cookie on a request, returning its payload or null if missing/invalid. */
export async function verifyAgentPortalAccess(req: NextRequest): Promise<AgentPortalPayload | null> {
  const cookie = req.cookies.get(AGENT_PORTAL_COOKIE)?.value
  if (!cookie) return null
  try {
    const { payload } = await jwtVerify(cookie, getAgentPortalSecret())
    // Tokens issued before media accounts existed carry only agentId/agentName — treat as agent.
    const role: PortalRole = payload.role === 'media' ? 'media' : 'agent'
    const subjectId = (role === 'media' ? payload.mediaAccountId : payload.agentId) as string | undefined
    if (!subjectId) return null
    return {
      role,
      subjectId,
      name: ((payload.name ?? payload.agentName) as string) ?? '',
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
  role: PortalRole
  account: { id: string; name: string }
}

/**
 * The one place every agent-portal data route should call to authorize a request — verifies
 * the JWT, then re-checks the Agent / MediaAccount row fresh from the DB (portalActive +
 * password version) so a revoked/deactivated/password-reset account is cut off immediately,
 * not just at their next login. A pure JWT-signature check alone (verifyAgentPortalAccess) is
 * NOT enough for routes that return real data.
 */
export async function resolveAgentPortalSession(req: NextRequest): Promise<AgentPortalSession | null> {
  const payload = await verifyAgentPortalAccess(req)
  if (!payload) return null

  const db = await resolveTenantById(payload.tenantId)
  if (!db) return null

  const select = { id: true, name: true, portalActive: true, portalPasswordSetAt: true } as const
  const account = payload.role === 'media'
    ? await db.mediaAccount.findUnique({ where: { id: payload.subjectId }, select })
    : await db.agent.findUnique({ where: { id: payload.subjectId }, select })
  if (!account?.portalActive) return null

  const currentPwv = account.portalPasswordSetAt ? account.portalPasswordSetAt.getTime() : 0
  if (currentPwv !== payload.pwv) return null

  return { db, tenantId: payload.tenantId, role: payload.role, account: { id: account.id, name: account.name } }
}

/**
 * Media-category allow-list for this session. An empty array means unrestricted (every
 * category) — same convention for agents (AgentVisibleCategory) and media (MediaAccountVisibleCategory).
 */
export async function getVisibleCategoryIds(session: AgentPortalSession): Promise<string[]> {
  const rows = session.role === 'media'
    ? await session.db.mediaAccountVisibleCategory.findMany({ where: { mediaAccountId: session.account.id }, select: { categoryId: true } })
    : await session.db.agentVisibleCategory.findMany({ where: { agentId: session.account.id }, select: { categoryId: true } })
  return rows.map(r => r.categoryId)
}
