import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR', 'FINANCE']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const periods = await db.payrollPeriod.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    include: {
      _count: { select: { entries: true } },
      submittedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true } },
      paidBy: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json(periods)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { year, month, cutoffDate, payDate, notes } = await req.json()
  if (!year || !month) return NextResponse.json({ error: 'Year and month are required' }, { status: 400 })

  const existing = await db.payrollPeriod.findUnique({ where: { year_month: { year, month } } })
  if (existing) return NextResponse.json({ error: `A payroll period for ${month}/${year} already exists` }, { status: 409 })

  const period = await db.payrollPeriod.create({
    data: {
      id: crypto.randomUUID(),
      year, month,
      cutoffDate: cutoffDate ? new Date(cutoffDate) : null,
      payDate: payDate ? new Date(payDate) : null,
      notes: notes?.trim() || null,
      createdById: session.user.id,
    },
  })

  return NextResponse.json(period, { status: 201 })
}
