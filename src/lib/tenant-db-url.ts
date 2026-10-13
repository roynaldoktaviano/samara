import { centralDb } from '@/lib/central-db'

// Resolves a tenant's DB connection string server-side from its central-registry id.
// The URL is never put on the session or JWT (GET /api/auth/session is readable by every
// logged-in browser), and resolving it fresh means a rotated DB password takes effect
// without forcing everyone to log in again. Cached per instance.
const TTL_MS = 10 * 60 * 1000
const urlCache = new Map<string, { url: string; expiresAt: number }>()

export async function resolveTenantDbUrl(tenantId: string): Promise<string> {
  const hit = urlCache.get(tenantId)
  if (hit && hit.expiresAt > Date.now()) return hit.url
  try {
    const tenant = await centralDb.tenant.findUnique({
      where: { id: tenantId },
      select: { databaseUrl: true, isActive: true },
    })
    if (!tenant || !tenant.isActive) {
      urlCache.delete(tenantId)
      throw new Error(`tenant ${tenantId} not found or inactive`)
    }
    urlCache.set(tenantId, { url: tenant.databaseUrl, expiresAt: Date.now() + TTL_MS })
    return tenant.databaseUrl
  } catch (e) {
    // Central DB blip: keep serving the last known URL rather than failing every request.
    // Never fall back to the default DB here — that would route a tenant's reads/writes
    // into another tenant's database.
    if (hit) return hit.url
    throw e
  }
}
