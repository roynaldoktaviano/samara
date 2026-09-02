import type { PrismaClient } from '@prisma/client'
import { db, withRetry } from '@/lib/db'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'

/**
 * For unauthenticated, token-based public routes (guest-form, booking-form,
 * agent calendar) — there's no session to read tenantDbUrl from, so the tenant
 * has to be found by scanning. Tries the default tenant first (fast path, the
 * common case), then every other active tenant, returning the PrismaClient the
 * record was actually found in so follow-up writes land in the same database.
 *
 * Scan is O(active tenants) per request — fine at the tenant counts this app
 * runs today. If tenant count grows into the dozens+, replace with a central
 * token→tenant registry for O(1) lookup instead.
 */
export async function resolveTenantByLookup<T>(
  finder: (client: PrismaClient) => Promise<T | null>
): Promise<{ db: PrismaClient; record: T } | null> {
  const defaultUrl = process.env.DATABASE_URL
  // withRetry absorbs a transient connection blip (e.g. Neon's compute waking from
  // idle-suspend). Anything else that throws here is a real bug (a bad `select`, a
  // missing relation, etc.) — swallowing that as a plain "not found" makes it look
  // to the guest like an expired/invalid link with zero trace of the actual cause,
  // so it's logged loudly before falling through to the tenant scan below.
  const fromDefault = await withRetry(db, () => finder(db)).catch(err => {
    console.error('[resolveTenantByLookup] default DB lookup threw:', err)
    return null
  })
  if (fromDefault) return { db, record: fromDefault }

  const tenants = await centralDb.tenant.findMany({
    where: { isActive: true },
    select: { databaseUrl: true },
  }).catch(() => [])

  for (const t of tenants) {
    if (t.databaseUrl === defaultUrl) continue
    const tdb = getTenantDb(t.databaseUrl)
    const record = await withRetry(tdb, () => finder(tdb)).catch(err => {
      console.error('[resolveTenantByLookup] tenant DB lookup threw:', err)
      return null
    })
    if (record) return { db: tdb, record }
  }
  return null
}

/**
 * Same slug resolution as resolveTenantBySlug, but also returns the tenant's
 * central-registry id — needed by callers that look up a per-tenant secret
 * (getTenantSecret) after resolving the tenant, which resolveTenantBySlug's
 * PrismaClient-only return can't support. resolveTenantBySlug itself is kept
 * as a thin wrapper below so its many existing callers (guest-form, booking
 * form, etc., which only need the client) are untouched.
 */
export async function resolveTenantBySlugFull(
  slug: string | null | undefined,
): Promise<{ db: PrismaClient; tenant: { id: string; slug: string } } | null> {
  const resolvedSlug = slug?.trim() || 'samara'
  const tenant = await centralDb.tenant.findUnique({
    where: { slug: resolvedSlug },
    select: { id: true, slug: true, databaseUrl: true, isActive: true },
  }).catch(() => null)
  if (!tenant || !tenant.isActive) return null
  const tdb = tenant.databaseUrl === process.env.DATABASE_URL ? db : getTenantDb(tenant.databaseUrl)
  return { db: tdb, tenant: { id: tenant.id, slug: tenant.slug } }
}

/**
 * For unauthenticated routes that identify the tenant directly by slug (query
 * param, form field) rather than by scanning — e.g. a webhook or an internal
 * kiosk-style form shared by multiple tenants. Falls back to 'samara' when no
 * slug is given, to keep existing integrations (WordPress webhooks, bookmarked
 * links) working unchanged.
 */
export async function resolveTenantBySlug(slug: string | null | undefined): Promise<PrismaClient | null> {
  return (await resolveTenantBySlugFull(slug))?.db ?? null
}

/**
 * Resolves a tenant's PrismaClient from a central-registry tenant id (or null for the
 * default tenant) — the shape already embedded in JWT payloads issued by cal-access and
 * agent-portal-access. Used by every route that re-derives its tenant DB from a cookie
 * on each request, instead of re-scanning all tenants.
 */
export async function resolveTenantById(tenantId: string | null): Promise<PrismaClient | null> {
  if (!tenantId) return db
  const tenant = await centralDb.tenant.findUnique({ where: { id: tenantId }, select: { databaseUrl: true } })
  if (!tenant) return null
  return tenant.databaseUrl === process.env.DATABASE_URL ? db : getTenantDb(tenant.databaseUrl)
}

/**
 * For the public Request Order page: tenant is identified by an unguessable
 * per-tenant token (Tenant.requestOrderToken) rather than a plain, guessable
 * slug. Central-DB lookup is O(1) since Tenant rows live there directly —
 * no need to scan tenant databases the way resolveTenantByLookup does.
 */
export async function resolveTenantByRequestOrderToken(
  token: string | null | undefined,
): Promise<{ db: PrismaClient; tenant: { id: string; slug: string } } | null> {
  if (!token) return null
  const tenant = await centralDb.tenant.findUnique({
    where: { requestOrderToken: token },
    select: { id: true, slug: true, databaseUrl: true, isActive: true },
  }).catch(() => null)
  if (!tenant || !tenant.isActive) return null
  const tdb = tenant.databaseUrl === process.env.DATABASE_URL ? db : getTenantDb(tenant.databaseUrl)
  return { db: tdb, tenant: { id: tenant.id, slug: tenant.slug } }
}
