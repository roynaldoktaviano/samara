import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { RECRUITMENT_REQUEST_INCLUDE } from '@/lib/hr/recruitment'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

// HR side — every Recruitment Request, with the candidates HR has linked to each.
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const requests = await db.recruitmentRequest.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      ...RECRUITMENT_REQUEST_INCLUDE,
      candidates: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, fullName: true, status: true, convertedEmployeeId: true,
          hrInterviewResult: true, userInterviewScheduledAt: true, userInterviewResult: true,
        },
      },
    },
  })
  return NextResponse.json(requests)
}
