import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

// Owner picker for Campaigns/Content Studio — same shape/pattern as /api/purchasing/team.
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const users = await db.user.findMany({
    where: { role: { in: ['ADMIN', 'MARKETING', 'SALES_MARKETING'] } },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(users)
}
