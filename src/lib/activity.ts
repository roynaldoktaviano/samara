import { db } from '@/lib/db'

interface LogParams {
  userId:   string
  userName: string
  userRole: string
  action:   string
  entity?:  string
  entityId?: string
  detail?:  string
}

export async function logActivity(params: LogParams): Promise<void> {
  try {
    await db.activityLog.create({ data: params })
  } catch (e) {
    console.error('[activity] log failed:', (e as Error).message, '| action:', params.action, '| user:', params.userId)
  }
}
