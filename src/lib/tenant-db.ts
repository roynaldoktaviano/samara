import { PrismaClient } from '@prisma/client'

const clientCache = new Map<string, PrismaClient>()

export function getTenantDb(databaseUrl: string): PrismaClient {
  if (clientCache.has(databaseUrl)) return clientCache.get(databaseUrl)!
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  clientCache.set(databaseUrl, client)
  return client
}
