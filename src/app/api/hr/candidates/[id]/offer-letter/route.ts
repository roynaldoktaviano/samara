import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

// Fetches (issuing on first call) the offering letter for one candidate. The number is
// assigned once and reused on every reprint — same pattern as
// EmployeeSeparation.paklaringNumber (see .../separations/[employeeId]/paklaring/route.ts).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const userId = session?.user?.id
  if (!userId || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const candidate = await db.candidate.findUnique({
    where: { id },
    include: { appliedRole: { select: { title: true } } },
  })
  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  if (candidate.status !== 'OFFER') return NextResponse.json({ error: 'This candidate has not reached the Offer stage yet' }, { status: 400 })

  let { offerLetterNumber, offerLetterIssuedAt } = candidate
  if (!offerLetterNumber) {
    const issuedCount = await db.candidate.count({ where: { offerLetterNumber: { not: null } } })
    const now = new Date()
    offerLetterNumber = `${String(issuedCount + 1).padStart(3, '0')}/HR-OFFER/${ROMAN_MONTHS[now.getMonth()]}/${now.getFullYear()}`
    offerLetterIssuedAt = now
    await db.candidate.update({
      where: { id },
      data: { offerLetterNumber, offerLetterIssuedAt: now, offerLetterIssuedById: userId },
    })
  }

  return NextResponse.json({
    fullName: candidate.fullName,
    position: candidate.appliedRole?.title ?? null,
    location: candidate.location,
    expectedSalary: candidate.expectedSalary,
    readyJoinDate: candidate.readyJoinDate,
    offerLetterNumber,
    offerLetterIssuedAt,
  })
}
