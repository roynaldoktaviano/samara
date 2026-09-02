import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

// HR only lists/decides here — nobody files an overtime claim on an employee's behalf,
// requests always come from the self-service src/app/api/hr/overtime/mine/route.ts.
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const requests = await db.overtimeRequest.findMany({
    orderBy: { requestedAt: 'desc' },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true } },
      requestedBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(requests)
}
