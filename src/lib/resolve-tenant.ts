import type { PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'
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
  const fromDefault = await finder(db).catch(() => null)
  if (fromDefault) return { db, record: fromDefault }

  const tenants = await centralDb.tenant.findMany({
    where: { isActive: true },
    select: { databaseUrl: true },
  }).catch(() => [])

  for (const t of tenants) {
    if (t.databaseUrl === defaultUrl) continue
    const tdb = getTenantDb(t.databaseUrl)
    const record = await finder(tdb).catch(() => null)
    if (record) return { db: tdb, record }
  }
  return null
}

/**
 * For unauthenticated routes that identify the tenant directly by slug (query
 * param, form field) rather than by scanning — e.g. a webhook or an internal
 * kiosk-style form shared by multiple tenants. Falls back to 'samara' when no
 * slug is given, to keep existing integrations (WordPress webhooks, bookmarked
 * links) working unchanged.
 */
export async function resolveTenantBySlug(slug: string | null | undefined): Promise<PrismaClient | null> {
  const resolvedSlug = slug?.trim() || 'samara'
  const tenant = await centralDb.tenant.findUnique({
    where: { slug: resolvedSlug },
    select: { databaseUrl: true, isActive: true },
  }).catch(() => null)
  if (!tenant || !tenant.isActive) return null
  return tenant.databaseUrl === process.env.DATABASE_URL ? db : getTenantDb(tenant.databaseUrl)
}
