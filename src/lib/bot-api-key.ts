import { createHash, timingSafeEqual } from 'crypto'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { requireRole } from '@/lib/auth-guard'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { resolveTenantDbUrl } from '@/lib/tenant-db-url'

// ── BOT API key: header-based access to /api/bot/* for external analysis tools ──────────────
// The key lives in the server env, so rotating it = editing .env + restart:
//   BOT_API_KEY        = sbk_<random>          (the value the bot sends as `Bearer …`)
//   BOT_API_KEY_USER   = email of a BOT-role user — the key authenticates AS that user
//   BOT_API_KEY_TENANT = tenant slug (optional, default "samara")
// It gets exactly the BOT role's access, nothing more:
//  - middleware lets a `Bearer sbk_…` request through ONLY for GET/HEAD /api/bot/*; every other
//    path ignores the header (they use the NextAuth session), every write method is refused
//  - /api/bot/* serves the same whitelist + sensitive-field stripping (src/lib/bot-access.ts)
// Unset BOT_API_KEY = key access disabled. Deactivating the user or changing its role also
// blocks the key.

export const BOT_KEY_PREFIX = 'sbk_'

type KeyCheck = { ok: true; session: Session } | { ok: false; response: NextResponse }

const unauthorized = () => ({ ok: false as const, response: NextResponse.json({ error: 'Invalid API key' }, { status: 401 }) })

// Hash both sides first so the comparison is constant-time regardless of length.
const digest = (s: string) => createHash('sha256').update(s).digest()

async function verifyBotApiKey(key: string): Promise<KeyCheck> {
  const expected = process.env.BOT_API_KEY
  const email = process.env.BOT_API_KEY_USER
  if (!expected || !email || !expected.startsWith(BOT_KEY_PREFIX)) return unauthorized()
  if (!timingSafeEqual(digest(key), digest(expected))) return unauthorized()

  const slug = process.env.BOT_API_KEY_TENANT || 'samara'
  const tenant = await centralDb.tenant.findUnique({ where: { slug }, select: { id: true, isActive: true } }).catch(() => null)
  if (!tenant?.isActive) return unauthorized()
  let tenantDb
  try { tenantDb = getTenantDb(await resolveTenantDbUrl(tenant.id)) } catch { return unauthorized() }

  const user = await tenantDb.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true },
  }).catch(() => null)
  // Must be a BOT account — the key can never carry any other role's access.
  if (!user || user.role !== 'BOT') return unauthorized()

  // Deactivating the central account (same switch as blocking a normal login) also kills the key.
  const link = await centralDb.userTenant.findFirst({
    where: { tenantId: tenant.id, user: { email } },
    select: { user: { select: { isActive: true } } },
  }).catch(() => null)
  if (link && !link.user.isActive) return unauthorized()

  const session = {
    user: { id: user.id, email: user.email, name: user.name, role: 'BOT', tenantId: tenant.id },
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
