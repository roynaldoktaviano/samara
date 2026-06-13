import { db } from '@/lib/db'

/**
 * Atomically increments a named counter and returns the new value.
 * Uses PostgreSQL INSERT ... ON CONFLICT DO UPDATE which is fully atomic —
 * no race conditions even under concurrent requests.
 */
export async function nextVal(key: string): Promise<number> {
  const result = await db.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "Counter" (key, value)
    VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE
    SET value = "Counter".value + 1
    RETURNING value
  `
  return Number(result[0].value)
}
