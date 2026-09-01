import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['FINANCE', 'ADMIN', 'SUPER_ADMIN']

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  // Optional ?businessTripId= — lets a notification click resolve straight to the
  // relevant reimbursement(s) for that trip.
  const businessTripId = new URL(request.url).searchParams.get('businessTripId')

  const reimbursements = await db.businessTripReimbursement.findMany({
    where: businessTripId ? { businessTripId } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      businessTrip: {
        select: {
          destination: true, purpose: true, startDate: true, endDate: true,
          employee: { select: { fullName: true, employeeNumber: true } },
        },
      },
      requestedBy: { select: { name: true } },
      paidBy: { select: { name: true } },
    },
  })

  return NextResponse.json(reimbursements)
}
