import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'

const HR_ROLES = ['ADMIN', 'SUPER_ADMIN', 'HR']

// Self-service overtime: any logged-in user files/views overtime claims for their own
// Employee record only (resolved via Employee.userId), mirroring
// src/app/api/hr/business-trips/mine/route.ts. The HR-only queue is
// src/app/api/hr/overtime/route.ts.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const employee = await db.employee.findUnique({
    where: { userId: session.user.id },
    select: { id: true, fullName: true },
  })
  if (!employee) return NextResponse.json({ linked: false, employee: null, requests: [] })

  const requests = await db.overtimeRequest.findMany({
    where: { employeeId: employee.id },
    orderBy: { requestedAt: 'desc' },
    include: { decidedBy: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ linked: true, employee, requests })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { date, hours, description, proofFileKeys } = await req.json() as {
    date?: string; hours?: number; description?: string; proofFileKeys?: string[]
  }

  const employee = await db.employee.findUnique({
    where: { userId: session.user.id },
    select: { id: true, fullName: true },
  })
  if (!employee) return NextResponse.json({ error: "Your account isn't linked to an HR employee profile yet. Ask an Admin to link it under Team." }, { status: 400 })

  if (!date) return NextResponse.json({ error: 'Please select a date' }, { status: 400 })
  if (!hours || hours <= 0) return NextResponse.json({ error: 'Hours must be greater than 0' }, { status: 400 })
  if (!description?.trim()) return NextResponse.json({ error: 'Please describe the work done' }, { status: 400 })

  const day = new Date(date)
  if (Number.isNaN(day.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })

  // The core rule: overtime is only payable on a weekend or a gazetted national holiday.
  const dow = day.getUTCDay()
  const isWeekend = dow === 0 || dow === 6
  if (!isWeekend) {
    const holiday = await db.nationalHoliday.findUnique({ where: { date: day } })
    if (!holiday) return NextResponse.json({ error: 'Overtime can only be requested for a weekend (Sat/Sun) or a national holiday date' }, { status: 400 })
  }

  const overtime = await db.overtimeRequest.create({
    data: {
      id: crypto.randomUUID(),
      employeeId: employee.id,
      date: day,
      hours,
      description: description.trim(),
      proofFileKeys: Array.isArray(proofFileKeys) ? proofFileKeys : [],
      requestedById: session.user.id,
      updatedAt: new Date(),
    },
    include: { decidedBy: { select: { id: true, name: true } } },
  })

  const title = 'Overtime request needs your approval'
  const body = `${employee.fullName} claimed ${hours}h overtime on ${date}.`
  const hrUsers = await db.user.findMany({ where: { role: { in: HR_ROLES as never[] } }, select: { id: true } })
  if (hrUsers.length) {
    await db.notification.createMany({
      data: hrUsers.map(u => ({ userId: u.id, type: 'OVERTIME_HR_APPROVAL_NEEDED', title, body })),
    }).catch(() => {})
    sendPushToUsers(db, hrUsers.map(u => u.id), { title, body }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'hr-overtime')

  return NextResponse.json(overtime, { status: 201 })
}
