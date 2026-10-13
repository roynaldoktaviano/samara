import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getTenantDb } from '@/lib/tenant-db'
import { resolveTenantDbUrl } from '@/lib/tenant-db-url'
import type { Session } from 'next-auth'

export async function getDb(existingSession?: Session | null) {
  const session = existingSession ?? await getServerSession(authOptions)
  const tenantId = session?.user?.tenantId
  if (!tenantId) {
    if (session?.user?.id && !session.user.isSuperAdmin) {
      console.warn('[getDb] session has no tenantId for user', session.user.id, '— falling back to default DB')
    }
    return db
  }
  return getTenantDb(await resolveTenantDbUrl(tenantId))
}
