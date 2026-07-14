import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

function makePrisma() {
  return new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

export const db = globalForPrisma.prisma ?? makePrisma()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/**
 * Wraps a Prisma call with automatic reconnect on P1017 (server closed connection).
 * Takes the client explicitly — in multi-tenant routes `fn` runs against a tenant-specific
 * PrismaClient (from getDb/getTenantDb), not this module's default `db`, so the client that
 * gets disconnected/reconnected on retry must be the same one the query actually used.
 */
export async function withRetry<T>(client: { $disconnect: () => Promise<void>; $connect: () => Promise<void> }, fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (e: any) {
      const isConnErr = e?.code === 'P1017' || e?.code === 'P1001' || e?.message?.includes('Server has closed')
      if (isConnErr && i < retries) {
        await client.$disconnect().catch(() => {})
        await client.$connect().catch(() => {})
        continue
      }
      throw e
    }
  }
  throw new Error('Unreachable')
}
