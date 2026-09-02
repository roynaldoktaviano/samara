import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { withRetry } from '@/lib/db'
import { getMarketingPerformanceSnapshot } from '@/lib/marketing-performance'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '180', 10)
  // withRetry: the snapshot fires ~10 queries concurrently (see getMarketingPerformanceSnapshot),
  // which can transiently exceed the connection pool under load — retry once instead of a 500.
  const snapshot = await withRetry(db, () => getMarketingPerformanceSnapshot(db, Number.isFinite(days) && days > 0 ? days : 180))
  return NextResponse.json(snapshot)
}
