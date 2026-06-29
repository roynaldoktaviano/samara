import { db as defaultDb } from '@/lib/db'
import type { PrismaClient } from '@prisma/client'

interface LogParams {
  userId:   string
  userName: string
  userRole: string
  action:   string
  entity?:  string
  entityId?: string
  detail?:  string
}

export async function logActivity(params: LogParams, prisma?: PrismaClient): Promise<void> {
  const client = prisma ?? defaultDb
  try {
    await client.activityLog.create({ data: params })
  } catch (e) {
    console.error('[activity] log failed:', (e as Error).message, '| action:', params.action, '| user:', params.userId)
  }
}
