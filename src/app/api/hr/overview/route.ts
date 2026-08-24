import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { estimateExitExposure } from '@/lib/hr/severance'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

// Contracts within this many days of contractEndDate are flagged as "expiring soon" —
// matches the ≤120 day window from the HR requirements checklist.
const CONTRACT_WARNING_DAYS = 120

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const [activeEmployees, allEmployees, pendingLeaveCount, talentPoolCount] = await Promise.all([
    db.employee.count({ where: { isActive: true } }),
    db.employee.findMany({
      where: { isActive: true },
      select: {
        id: true, fullName: true, employeeNumber: true, contractEndDate: true, joinDate: true,
        basicSalary: true, allowance: true, uangLayar: true, uangMakan: true,
        location: { select: { name: true } },
        legalEntity: { select: { name: true } },
        role: { select: { title: true } },
      },
    }),
    db.leaveRequest.count({ where: { status: 'PENDING' } }),
    db.candidate.count({ where: { status: { notIn: ['HIRED', 'REJECTED'] } } }),
  ])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const warningCutoff = new Date(today)
  warningCutoff.setDate(warningCutoff.getDate() + CONTRACT_WARNING_DAYS)

  const contractsExpiring = allEmployees
    .filter(e => e.contractEndDate && e.contractEndDate >= today && e.contractEndDate <= warningCutoff)
    .map(e => ({
      id: e.id,
      fullName: e.fullName,
      employeeNumber: e.employeeNumber,
      role: e.role?.title ?? null,
      contractEndDate: e.contractEndDate,
      daysLeft: Math.ceil((e.contractEndDate!.getTime() - today.getTime()) / 86400000),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft)

  const anyContractDatesSet = allEmployees.some(e => e.contractEndDate)

  const monthlyEmployerCost = allEmployees.reduce(
    (sum, e) => sum + (e.basicSalary ?? 0) + (e.allowance ?? 0) + (e.uangLayar ?? 0) + (e.uangMakan ?? 0),
    0,
  )

  const anySalaryDataSet = allEmployees.some(e => e.basicSalary != null || e.allowance != null)
  const estimatedExitExposure = allEmployees.reduce(
    (sum, e) => sum + estimateExitExposure(e.joinDate, e.basicSalary, e.allowance, today),
    0,
  )

  const countBy = (getKey: (e: (typeof allEmployees)[number]) => string | null) => {
    const map = new Map<string, number>()
    for (const e of allEmployees) {
      const key = getKey(e) ?? 'Unassigned'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }

  return NextResponse.json({
    activeEmployees,
    contractsExpiring,
    contractsExpiringCount: contractsExpiring.length,
    anyContractDatesSet,
    monthlyEmployerCost,
    pendingLeaveCount,
    estimatedExitExposure,
    anySalaryDataSet,
    talentPoolCount,
    headcountByLocation: countBy(e => e.location?.name ?? null),
    headcountByLegalEntity: countBy(e => e.legalEntity?.name ?? null),
  })
}
