import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getTenantDb } from '@/lib/tenant-db'
import type { Session } from 'next-auth'

export async function getDb(existingSession?: Session | null) {
  const session = existingSession ?? await getServerSession(authOptions)
  const url = session?.user?.tenantDbUrl as string | undefined
  if (!url && session?.user?.id) {
    console.warn('[getDb] session has no tenantDbUrl for user', session.user.id, '— falling back to default DB')
  }
  return url ? getTenantDb(url) : db
}
