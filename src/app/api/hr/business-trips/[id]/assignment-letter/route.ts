import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const HR_ROLES = ['ADMIN', 'SUPER_ADMIN', 'HR']

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

// Fetches (issuing on first call) the assignment letter ("Surat Tugas") for one APPROVED
// business trip. The number is assigned once and reused on every reprint — see
// BusinessTrip.assignmentLetterNumber. Viewable by HR/Admin or by the trip's own requester
// (the employee needs their own copy to travel with).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const trip = await db.businessTrip.findUnique({
    where: { id },
    include: {
      employee: { select: { fullName: true, employeeNumber: true, department: true, userId: true, role: { select: { title: true } } } },
      decidedBy: { select: { id: true, name: true, role: true, employeeProfile: { select: { role: { select: { title: true } } } } } },
    },
  })
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = trip.employee.userId === userId
  if (!isOwner && !roleMatches(role, HR_ROLES)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (trip.status !== 'APPROVED' && trip.status !== 'CLOSED') {
    return NextResponse.json({ error: 'An assignment letter can only be issued for an approved business trip' }, { status: 400 })
  }

  let assignmentLetterNumber = trip.assignmentLetterNumber
  let assignmentLetterIssuedAt = trip.assignmentLetterIssuedAt
  if (!assignmentLetterNumber) {
    const issuedCount = await db.businessTrip.count({ where: { assignmentLetterNumber: { not: null } } })
    const now = new Date()
    assignmentLetterNumber = `${String(issuedCount + 1).padStart(3, '0')}/HR-ST/${ROMAN_MONTHS[now.getMonth()]}/${now.getFullYear()}`
    assignmentLetterIssuedAt = now
    await db.businessTrip.update({
      where: { id },
      data: { assignmentLetterNumber, assignmentLetterIssuedAt, assignmentLetterIssuedById: userId },
    })
  }

  const issuerTitle = trip.decidedBy?.employeeProfile?.role?.title
    ?? (trip.decidedBy?.role === 'HR' ? 'Human Resources Manager'
      : trip.decidedBy?.role === 'SUPER_ADMIN' ? 'Management'
      : trip.decidedBy ? 'Administrator' : null)

  return NextResponse.json({
    destination: trip.destination,
    purpose: trip.purpose,
    remark: trip.remark,
    startDate: trip.startDate,
    endDate: trip.endDate,
    employee: {
      fullName: trip.employee.fullName,
      employeeNumber: trip.employee.employeeNumber,
      position: trip.employee.role?.title ?? null,
      department: trip.employee.department,
    },
    issuer: trip.decidedBy ? { name: trip.decidedBy.name, title: issuerTitle } : null,
    assignmentLetterNumber,
    assignmentLetterIssuedAt,
  })
}
