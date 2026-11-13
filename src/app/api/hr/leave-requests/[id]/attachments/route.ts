import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'
import { matchEmployeesToYachts } from '@/lib/payroll'
import { resolveYachtCrewApprovers } from '@/lib/leave-request'

// A sick leave request's doctor's letter — kept out of every list response (they're data
// URLs) and fetched only when someone opens it. Visible to HR/Admin, the employee, their
// manager, and the Captain / Cruise Director of their yacht (the people who approve it).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const role = (session.user as { role?: string }).role ?? ''

  const r = await db.leaveRequest.findUnique({
    where: { id },
    select: {
      attachments: true,
      employee: { select: { id: true, userId: true, manager: { select: { userId: true } }, location: { select: { name: true } } } },
    },
  })
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const me = session.user.id
  let allowed = roleMatches(role, ['ADMIN', 'SUPER_ADMIN', 'HR'])
    || r.employee.userId === me
    || r.employee.manager?.userId === me
  if (!allowed) {
    const yachts = await db.yacht.findMany({ select: { id: true, name: true } })
    const yachtId = matchEmployeesToYachts([{ id: r.employee.id, locationName: r.employee.location?.name ?? null }], yachts).get(r.employee.id)
    if (yachtId) {
      const { captain, cd } = await resolveYachtCrewApprovers(db, yachtId)
      allowed = captain?.id === me || cd?.id === me
    }
  }
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  return NextResponse.json({ attachments: r.attachments })
}
