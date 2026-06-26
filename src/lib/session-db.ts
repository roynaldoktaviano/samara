import { db } from '@/lib/db'
import { getTenantDb } from '@/lib/tenant-db'
import { PrismaClient } from '@prisma/client'

// Returns the correct PrismaClient for the session's tenant.
// Falls back to main db (samara) for users without explicit tenantDbUrl.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSessionDb(session: any): PrismaClient {
  const url = session?.user?.tenantDbUrl as string | undefined
  if (!url) {
    console.warn('[session-db] no tenantDbUrl in session — falling back to default DB. userId:', session?.user?.id)
  }
  return url ? getTenantDb(url) : db
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSessionTenantDbUrl(session: any): string | null {
  return session?.user?.tenantDbUrl ?? null
}
