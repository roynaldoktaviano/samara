import { jwtVerify } from 'jose'
import type { NextRequest } from 'next/server'

export const CAL_ACCESS_COOKIE = 'cal-access'

// Computed lazily (not at module load) so a missing env var fails the request at runtime
// with a clear error, rather than silently signing/verifying with a guessable fallback.
export function getCalAccessSecret(): Uint8Array {
  const secret = process.env.SSO_JWT_SECRET
  if (!secret) throw new Error('SSO_JWT_SECRET is not configured')
  return new TextEncoder().encode(secret)
}

export interface CalAccessPayload {
  agentId: string
  agentName: string
  tenantId: string | null | undefined
}

/** Verifies the cal-access cookie on a request, returning its payload or null if missing/invalid. */
export async function verifyCalAccess(req: NextRequest): Promise<CalAccessPayload | null> {
  const cookie = req.cookies.get(CAL_ACCESS_COOKIE)?.value
  if (!cookie) return null
  try {
    const { payload } = await jwtVerify(cookie, getCalAccessSecret())
    return {
      agentId: payload.agentId as string,
      agentName: payload.agentName as string,
      tenantId: payload.tenantId as string | null | undefined,
    }
  } catch {
    return null
  }
}
