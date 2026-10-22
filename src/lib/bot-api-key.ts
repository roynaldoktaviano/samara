import { createHash, timingSafeEqual } from 'crypto'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { logActivity } from '@/lib/activity'
import { requireRole } from '@/lib/auth-guard'
import { centralDb } from '@/lib/central-db'
import { getDb } from '@/lib/get-db'
import { exceedsRateLimit } from '@/lib/rate-limit'
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

type Via = 'key' | 'session'
type KeyCheck = { ok: true; session: Session; via: Via } | { ok: false; response: NextResponse }

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
  return { ok: true, session, via: 'key' }
}

/**
 * Auth for /api/bot/* routes: an `Authorization: Bearer sbk_…` key (always the BOT role), else
 * the normal NextAuth session limited to BOT / ADMIN / SUPER_ADMIN. When a key header is sent it
 * is the only credential considered — a browser cookie riding along can't widen access.
 */
export async function requireBotAccess(): Promise<KeyCheck> {
  const authz = (await headers()).get('authorization') ?? ''
  const m = authz.match(/^Bearer\s+(\S+)$/i)
  const auth: KeyCheck = m && m[1].startsWith(BOT_KEY_PREFIX)
    ? await verifyBotApiKey(m[1])
    : await requireRole(['BOT', 'ADMIN', 'SUPER_ADMIN']).then(r => (r.ok ? { ...r, via: 'session' as const } : r))
  if (!auth.ok || auth.session.user.role !== 'BOT') return auth

  // Throttle BOT accounts (ADMIN previewing the API is not limited): requests per minute, and a
  // rolling hourly cap on rows returned so the whole customer/lead base can't be paged out at once.
  const uid = auth.session.user.id
  if (exceedsRateLimit(`bot:req:${uid}`, BOT_REQUESTS_PER_MIN, 60_000)) {
    return { ok: false, response: NextResponse.json({ error: `Rate limit: max ${BOT_REQUESTS_PER_MIN} requests per minute` }, { status: 429, headers: { 'Retry-After': '60' } }) }
  }
  const rows = rowBuckets.get(uid)
  if (rows && rows.resetAt > Date.now() && rows.count >= BOT_ROWS_PER_HOUR) {
    const retry = Math.ceil((rows.resetAt - Date.now()) / 1000)
    return { ok: false, response: NextResponse.json({ error: `Volume limit: max ${BOT_ROWS_PER_HOUR} rows per hour` }, { status: 429, headers: { 'Retry-After': String(retry) } }) }
  }
  return auth
}

// ── BOT throttling + audit log ──────────────────────────────────────────────────────────────
// In-memory, per process — same caveat as src/lib/rate-limit.ts (fine for the single Node server).
const BOT_REQUESTS_PER_MIN = 60
const BOT_ROWS_PER_HOUR = 10_000
// Rows within one hour that flag the account as doing a bulk pull (logged once per window).
const BOT_BULK_ALERT_ROWS = 2_000
const ROW_WINDOW_MS = 60 * 60 * 1000
const rowBuckets = new Map<string, { count: number; resetAt: number; alerted: boolean }>()

/**
 * Call after a successful /api/bot response: counts the rows toward the hourly volume cap and
 * writes one ActivityLog row per BOT call (action BOT_API, entity = resource, detail = path,
 * row count, key vs session). Crossing BOT_BULK_ALERT_ROWS in an hour adds a BOT_API_BULK_ALERT.
 * No-op for ADMIN / SUPER_ADMIN previewing the API.
 */
export async function recordBotCall(
  auth: Extract<KeyCheck, { ok: true }>,
  url: URL,
  resource: string,
  rowCount: number,
  method: 'GET' | 'POST' = 'GET',
): Promise<void> {
  const { user } = auth.session
  if (user.role !== 'BOT') return

  const now = Date.now()
  let bucket = rowBuckets.get(user.id)
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + ROW_WINDOW_MS, alerted: false }
    rowBuckets.set(user.id, bucket)
  }
  bucket.count += rowCount

  const userName = user.name || user.email || 'Bot'
  const db = await getDb(auth.session).catch(() => undefined)
  await logActivity({
    userId: user.id, userName, userRole: 'BOT', action: 'BOT_API', entity: resource,
    detail: `${method} ${url.pathname}${url.search} · ${rowCount} rows · via ${auth.via}`,
  }, db)

  if (!bucket.alerted && bucket.count >= BOT_BULK_ALERT_ROWS) {
    bucket.alerted = true
    console.warn('[api/bot] bulk pull alert:', user.email, bucket.count, 'rows this hour')
    await logActivity({
      userId: user.id, userName, userRole: 'BOT', action: 'BOT_API_BULK_ALERT', entity: resource,
      detail: `${bucket.count} rows read within 1 hour (alert at ${BOT_BULK_ALERT_ROWS}, hard cap ${BOT_ROWS_PER_HOUR}) · via ${auth.via}`,
    }, db)
  }
}
