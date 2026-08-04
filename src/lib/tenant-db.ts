import { PrismaClient } from '@prisma/client'

const MAX_CLIENTS = 20

// Cached on globalThis, same reasoning as db.ts/central-db.ts: Next.js dev mode
// re-evaluates this module on hot reload, which would otherwise reset clientCache
// to a fresh empty Map on every edit while the previously cached PrismaClients
// (and their open connections) are orphaned — never disconnected, since nothing
// still references them. Over a long dev session this silently exhausts Neon's
// connection limit. Storing the Map (and the beforeExit listener flag) on
// globalThis lets both survive module reloads.
const globalForTenantDb = globalThis as unknown as {
  tenantDbClients: Map<string, PrismaClient> | undefined
  tenantDbShutdownRegistered: boolean | undefined
}

const clientCache = globalForTenantDb.tenantDbClients ?? new Map<string, PrismaClient>()
if (process.env.NODE_ENV !== 'production') globalForTenantDb.tenantDbClients = clientCache

export function getTenantDb(databaseUrl: string): PrismaClient {
  const existing = clientCache.get(databaseUrl)
  if (existing) {
    // Re-insert to mark as most-recently-used (Map iteration order = insertion order)
    clientCache.delete(databaseUrl)
    clientCache.set(databaseUrl, existing)
    return existing
  }

  // Evict least-recently-used client if at capacity
  if (clientCache.size >= MAX_CLIENTS) {
    const oldest = clientCache.entries().next().value
    if (oldest) {
      const [oldestUrl, oldestClient] = oldest as [string, PrismaClient]
      clientCache.delete(oldestUrl)
      oldestClient.$disconnect().catch(() => {})
    }
  }

  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
  clientCache.set(databaseUrl, client)
  return client
}

// Graceful shutdown — disconnect all cached clients. Guarded by the same globalThis
// flag so dev-mode hot reloads don't keep piling on duplicate beforeExit listeners.
if (typeof process !== 'undefined' && !globalForTenantDb.tenantDbShutdownRegistered) {
  process.on('beforeExit', () => {
    for (const client of clientCache.values()) {
      client.$disconnect().catch(() => {})
    }
  })
  if (process.env.NODE_ENV !== 'production') globalForTenantDb.tenantDbShutdownRegistered = true
}
