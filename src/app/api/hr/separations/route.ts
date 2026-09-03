import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const employees = await db.employee.findMany({
    where: { isActive: false },
    orderBy: { resignedAt: 'desc' },
    include: {
      role: { select: { title: true } },
      location: { select: { name: true } },
      assets: { select: { id: true, isReturned: true } },
      separation: true,
    },
  })

  const rows = employees.map(e => ({
    id: e.id,
    employeeNumber: e.employeeNumber,
    fullName: e.fullName,
    department: e.department,
    position: e.role?.title ?? null,
    location: e.location?.name ?? null,
    joinDate: e.joinDate,
    resignedAt: e.resignedAt,
    resignStatus: e.resignStatus,
    resignReason: e.resignReason,
    assetsTotal: e.assets.length,
    assetsReturned: e.assets.filter(a => a.isReturned).length,
    clearanceCompletedAt: e.separation?.clearanceCompletedAt ?? null,
    paklaringNumber: e.separation?.paklaringNumber ?? null,
    paklaringIssuedAt: e.separation?.paklaringIssuedAt ?? null,
  }))

  return NextResponse.json(rows)
}
