import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')
  const entity = searchParams.get('entity')
  const action = searchParams.get('action')
  const from   = searchParams.get('from')
  const to     = searchParams.get('to')
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit  = 10

  const where: Record<string, unknown> = {}
  if (userId) where.userId = userId
  if (entity) where.entity = entity
  if (action) where.action = action
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to + 'T23:59:59.999Z') } : {}),
    }
  }

  const [logs, total] = await Promise.all([
    db.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.activityLog.count({ where }),
  ])

  return NextResponse.json({ logs, total, page, limit })
}
