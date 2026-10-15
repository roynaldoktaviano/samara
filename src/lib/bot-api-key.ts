import { timingSafeEqual } from 'crypto'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { requireRole } from '@/lib/auth-guard'
import { centralDb } from '@/lib/central-db'
import { db as defaultDb } from '@/lib/db'
import { getTenantDb } from '@/lib/tenant-db'
import { resolveTenantDbUrl } from '@/lib/tenant-db-url'
import { BOT_KEY_PREFIX, signBotKeyPayload } from '@/lib/bot-api-key-sign'

// ── BOT API keys: header-based access to /api/bot/* for external analysis tools ─────────────
// A key is bound to one BOT user (in one tenant) and authenticates AS that user, so it gets
// exactly the BOT role's access — nothing more:
//  - middleware lets a `Bearer sbk_…` request through ONLY for GET/HEAD /api/bot/*; every other
//    path ignores the header (they use the NextAuth session), every write method is refused
//  - /api/bot/* serves the same whitelist + sensitive-field stripping (src/lib/bot-access.ts)
//
// Format: sbk_<base64url({t: tenantId|null, u: userId})>.<base64url(HMAC)>
// The HMAC covers the user's current password hash, so a key is revoked by changing that BOT
// user's password (or changing its role / deleting it). Setting BOT_API_KEY_SECRET to a new
// value revokes every key at once. No DB column is needed.

type KeyCheck = { ok: true; session: Session } | { ok: false; response: NextResponse }

const unauthorized = () => ({ ok: false as const, response: NextResponse.json({ error: 'Invalid API key' }, { status: 401 }) })

async function verifyBotApiKey(key: string): Promise<KeyCheck> {
  const body = key.slice(BOT_KEY_PREFIX.length)
  const dot = body.indexOf('.')
  if (dot < 1) return unauthorized()
  const payload = body.slice(0, dot), mac = body.slice(dot + 1)

  let parsed: { t?: string | null; u?: string }
  try { parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) } catch { return unauthorized() }
  if (!parsed?.u || typeof parsed.u !== 'string') return unauthorized()
  const tenantId = typeof parsed.t === 'string' ? parsed.t : null

  let tenantDb: typeof defaultDb
  try {
    tenantDb = tenantId ? getTenantDb(await resolveTenantDbUrl(tenantId)) : defaultDb
  } catch {
    return unauthorized() // tenant gone or deactivated
  }

  const user = await tenantDb.user.findUnique({
    where: { id: parsed.u },
    select: { id: true, email: true, name: true, role: true, password: true },
  }).catch(() => null)
  // Must still be a BOT account — a key can never carry any other role's access.
  if (!user || user.role !== 'BOT') return unauthorized()

  const expected = Buffer.from(signBotKeyPayload(payload, user.password))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return unauthorized()

  if (tenantId) {
    // Deactivating the central account (same switch as blocking a normal login) also kills the key.
    const link = await centralDb.userTenant.findFirst({
      where: { tenantId, user: { email: user.email } },
      select: { user: { select: { isActive: true } } },
    }).catch(() => null)
    if (link && !link.user.isActive) return unauthorized()
  }

  const session = {
    user: { id: user.id, email: user.email, name: user.name, role: 'BOT', tenantId: tenantId ?? undefined },
    expires: new Date(Date.now() + 60_000).toISOString(),
  } as unknown as Session
  return { ok: true, session }
}

/**
 * Auth for /api/bot/* routes: an `Authorization: Bearer sbk_…` key (always the BOT role), else
 * the normal NextAuth session limited to BOT / ADMIN / SUPER_ADMIN. When a key header is sent it
 * is the only credential considered — a browser cookie riding along can't widen access.
 */
export async function requireBotAccess(): Promise<KeyCheck> {
  const authz = (await headers()).get('authorization') ?? ''
  const m = authz.match(/^Bearer\s+(\S+)$/i)
  if (m && m[1].startsWith(BOT_KEY_PREFIX)) return verifyBotApiKey(m[1])
  return requireRole(['BOT', 'ADMIN', 'SUPER_ADMIN'])
}
