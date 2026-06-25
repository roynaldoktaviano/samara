import { db } from '@/lib/db'
import { getTenantDb } from '@/lib/tenant-db'
import { PrismaClient } from '@prisma/client'

// Returns the correct PrismaClient for the session's tenant.
// Falls back to main db (samara) for users without explicit tenantDbUrl.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSessionDb(session: any): PrismaClient {
  const url = session?.user?.tenantDbUrl as string | undefined
  return url ? getTenantDb(url) : db
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSessionTenantDbUrl(session: any): string | null {
  return session?.user?.tenantDbUrl ?? null
}
