import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { estimateExitExposure } from '@/lib/hr/severance'
import { countWeekdaysInMonth } from '@/lib/payroll'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

// Contracts within this many days of contractEndDate are flagged as "expiring soon" —
// matches the ≤120 day window from the HR requirements checklist.
const CONTRACT_WARNING_DAYS = 120

// Legal/compliance documents (company + per-yacht) within this many days of expiryDate —
// mirrors DOC_WARNING_DAYS in notifications/reminders/route.ts, the cron that actually
// nags HR about these; kept as a separate constant since this is just the dashboard read.
const DOC_WARNING_DAYS = 30

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const [activeEmployees, allEmployees, pendingLeaveCount, talentPoolCount, expiringDocuments, freelanceEmployees] = await Promise.all([
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
    db.legalDocument.findMany({
      where: { expiryDate: { not: null } },
      select: {
        id: true, name: true, expiryDate: true,
        legalEntity: { select: { name: true } },
        yacht: { select: { name: true } },
      },
      orderBy: { expiryDate: 'asc' },
    }),
    db.employee.findMany({
      where: { isActive: true, employmentStatus: 'Freelance' },
      select: {
        id: true, fullName: true,
        replacingEmployee: { select: { fullName: true } },
        tripAssignments: {
          select: { booking: { select: { id: true, bookingCode: true, openTripId: true, destination: true, startDate: true, endDate: true, yacht: { select: { name: true } } } } },
        },
      },
    }),
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

  const docWarningCutoff = new Date(today)
  docWarningCutoff.setDate(docWarningCutoff.getDate() + DOC_WARNING_DAYS)
  const documentsExpiring = expiringDocuments
    .filter(d => d.expiryDate! <= docWarningCutoff)
    .map(d => ({
      id: d.id,
      name: d.name,
      ownerName: d.legalEntity?.name ?? d.yacht?.name ?? 'Unknown',
      ownerType: d.legalEntity ? 'Company' as const : 'Yacht' as const,
      expiryDate: d.expiryDate,
      daysLeft: Math.ceil((d.expiryDate!.getTime() - today.getTime()) / 86400000),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft)

  // uangMakan is a per-day rate (Payroll multiplies it by actual Attendance Recap days
  // present) — this dashboard total is a rough estimate only, so it just assumes a full
  // working month rather than pulling real attendance data.
  const workingDaysThisMonth = countWeekdaysInMonth(today.getFullYear(), today.getMonth() + 1)
  const monthlyEmployerCost = allEmployees.reduce(
    (sum, e) => sum + (e.basicSalary ?? 0) + (e.allowance ?? 0) + (e.uangLayar ?? 0) + (e.uangMakan ?? 0) * workingDaysThisMonth,
    0,
  )

  const anySalaryDataSet = allEmployees.some(e => e.basicSalary != null || e.allowance != null)
  const estimatedExitExposure = allEmployees.reduce(
    (sum, e) => sum + estimateExitExposure(e.joinDate, e.basicSalary, e.allowance, today),
    0,
  )

  // One row per (freelancer, covered trip) — a freelancer covering 3 trips shows up 3
  // times, once per trip, so "which trip" and "covering since when" both read as plain
  // per-row facts rather than a nested list crammed into one cell.
  const freelanceCoverage = freelanceEmployees
    .flatMap(f => f.tripAssignments.map(t => ({
      freelanceId: f.id,
      freelanceName: f.fullName,
      replacingName: f.replacingEmployee?.fullName ?? null,
      bookingId: t.booking.id,
      // Open Trip departures are shared by several guests' individual bookings (same
      // yacht, same dates) — showing one arbitrary guest's code here would misleadingly
      // imply the freelancer is tied to that one guest rather than the whole voyage.
      bookingLabel: t.booking.openTripId != null ? 'Open Trip' : t.booking.bookingCode,
      destination: t.booking.destination,
      yachtName: t.booking.yacht?.name ?? null,
      startDate: t.booking.startDate,
      endDate: t.booking.endDate,
    })))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

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
    documentsExpiring,
    documentsExpiringCount: documentsExpiring.length,
    monthlyEmployerCost,
    pendingLeaveCount,
    estimatedExitExposure,
    anySalaryDataSet,
    talentPoolCount,
    freelanceCoverage,
    headcountByLocation: countBy(e => e.location?.name ?? null),
    headcountByLegalEntity: countBy(e => e.legalEntity?.name ?? null),
  })
}
