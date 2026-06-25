import { PrismaClient } from '@prisma/client'

const clientCache = new Map<string, PrismaClient>()
const MAX_CLIENTS = 20

export function getTenantDb(databaseUrl: string): PrismaClient {
  if (clientCache.has(databaseUrl)) return clientCache.get(databaseUrl)!

  // Evict oldest client if at capacity
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

// Graceful shutdown — disconnect all cached clients
if (typeof process !== 'undefined') {
  process.on('beforeExit', () => {
    for (const client of clientCache.values()) {
      client.$disconnect().catch(() => {})
    }
  })
}
