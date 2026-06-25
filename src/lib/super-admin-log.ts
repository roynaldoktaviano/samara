import { centralDb } from '@/lib/central-db'

export function logSuperAdmin({
  adminEmail,
  action,
  targetType,
  targetId,
  detail,
}: {
  adminEmail: string
  action: string
  targetType: 'tenant' | 'user'
  targetId?: string
  detail?: string
}) {
  centralDb.superAdminLog.create({
    data: { adminEmail, action, targetType, targetId, detail },
  }).catch(e => console.error('[super-admin-log] failed:', e))
}
