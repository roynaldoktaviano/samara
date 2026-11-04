import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { CANDIDATE_INCLUDE } from '@/lib/candidate-include'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const candidates = await db.candidate.findMany({
    orderBy: { createdAt: 'desc' },
    include: CANDIDATE_INCLUDE,
  })
  return NextResponse.json(candidates)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const {
    fullName, appliedRoleId, phone, email, source, resumeFiles, expectedSalary, location, readyJoinDate,
    additionalDocuments, notes, assessmentScore, skills, languages, recruitmentRequestId,
  } = await req.json()
  if (!fullName?.trim()) return NextResponse.json({ error: 'Full name is required' }, { status: 400 })

  // The applied role always comes from the same Roles master Recruitment Requests use:
  // linked to a request → that request's role (locked); not linked yet (candidate came in
  // before anyone asked for the position) → picked from Roles directly, linked later.
  let roleId: string | null = null
  if (recruitmentRequestId) {
    const request = await db.recruitmentRequest.findUnique({ where: { id: recruitmentRequestId }, select: { roleId: true, status: true } })
    if (!request) return NextResponse.json({ error: 'Recruitment request not found' }, { status: 404 })
    if (request.status !== 'APPROVED') return NextResponse.json({ error: 'Candidates can only be linked to an approved recruitment request' }, { status: 409 })
    if (appliedRoleId && appliedRoleId !== request.roleId) {
      return NextResponse.json({ error: 'That recruitment request is for a different role' }, { status: 400 })
    }
    roleId = request.roleId
  } else if (appliedRoleId) {
    const role = await db.employeeRole.findUnique({ where: { id: appliedRoleId }, select: { id: true } })
    if (!role) return NextResponse.json({ error: 'That role no longer exists' }, { status: 400 })
    roleId = role.id
  }

  const candidate = await db.candidate.create({
    data: {
      id: crypto.randomUUID(),
      fullName: fullName.trim(),
      appliedRoleId: roleId,
      recruitmentRequestId: recruitmentRequestId || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      source: source?.trim() || null,
      resumeFiles: Array.isArray(resumeFiles) ? resumeFiles : [],
      expectedSalary: expectedSalary !== undefined && expectedSalary !== '' && expectedSalary !== null ? Number(expectedSalary) : null,
      location: location?.trim() || null,
      readyJoinDate: readyJoinDate ? new Date(readyJoinDate) : null,
      additionalDocuments: Array.isArray(additionalDocuments) ? additionalDocuments : [],
      notes: notes?.trim() || null,
      assessmentScore: assessmentScore !== undefined && assessmentScore !== '' && assessmentScore !== null ? Number(assessmentScore) : null,
      skills: Array.isArray(skills) ? skills : [],
      languages: Array.isArray(languages) ? languages : [],
      updatedAt: new Date(),
    },
    include: CANDIDATE_INCLUDE,
  })
  return NextResponse.json(candidate, { status: 201 })
}
