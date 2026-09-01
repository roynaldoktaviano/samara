import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

// HR only lists/decides here — nobody files a business trip on an employee's behalf,
// requests always come from the self-service src/app/api/hr/business-trips/mine/route.ts.
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const trips = await db.businessTrip.findMany({
    orderBy: { requestedAt: 'desc' },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true } },
      requestedBy: { select: { id: true, name: true } },
      managerApprovedBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
      reimbursements: { select: { id: true, amount: true, status: true } },
    },
  })

  return NextResponse.json(trips)
}
