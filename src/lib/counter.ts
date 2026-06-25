import { db as defaultDb } from '@/lib/db'
import type { PrismaClient } from '@prisma/client'

/**
 * Atomically increments a named counter in the given DB and returns the new value.
 * Uses PostgreSQL INSERT ... ON CONFLICT DO UPDATE — fully atomic, no race conditions.
 * Always pass the tenant-specific PrismaClient (db from getDb()) so each tenant's
 * counter sequence is isolated. Falls back to the default Samara DB only if omitted.
 * Starts at 1 on first call for a given key (no separate init step needed).
 */
export async function nextVal(key: string, prisma?: PrismaClient): Promise<number> {
  const client = prisma ?? defaultDb
  const result = await client.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "Counter" (key, value)
    VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE
    SET value = "Counter".value + 1
    RETURNING value
  `
  return Number(result[0].value)
}
