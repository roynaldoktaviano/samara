import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'
import { DETAIL_OMIT, ONBOARDING_HR_ROLES, ONBOARDING_INCLUDE } from '@/lib/onboarding-hr'

async function generateEmployeeNumber(db: Awaited<ReturnType<typeof getDb>>) {
  const prefix = 'EMP-'
  const last = await db.employee.findFirst({ where: { employeeNumber: { startsWith: prefix } }, orderBy: { employeeNumber: 'desc' }, select: { employeeNumber: true } })
  const seq = last ? (parseInt(last.employeeNumber.slice(prefix.length)) || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

/**
 * The conversion point: an APPROVED Onboarding Form becomes a real Employee (Probation, or
 * Freelance for the freelance form) carrying every field and document the joiner filled in
 * plus HR's internal fields. If the linked Candidate was already turned into an Employee the
 * old way (Convert to Employee), that record is filled in instead of creating a duplicate.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ONBOARDING_HR_ROLES)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params

  const form = await db.onboardingForm.findUnique({
    where: { id },
    include: { candidate: { select: { id: true, convertedEmployeeId: true } } },
  })
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (form.purpose === 'EMPLOYEE_UPDATE') return NextResponse.json({ error: 'This is an employee data form — it updates an existing employee' }, { status: 400 })
  if (form.status !== 'APPROVED') return NextResponse.json({ error: 'Approve the form before starting probation' }, { status: 400 })
  if (!form.joinDate) return NextResponse.json({ error: 'Set the join date first' }, { status: 400 })
  if (!form.roleId) return NextResponse.json({ error: 'Set the position first' }, { status: 400 })

  const isFreelance = form.formType === 'FREELANCE'
  // Joiner + HR data, ready for Employee. Undefined (not null) for empty values so filling an
  // existing employee never blanks something HR already typed there.
  const v = <T,>(x: T | null) => (x === null || (Array.isArray(x) && x.length === 0) ? undefined : x)
  const data = {
    fullName: form.fullName,
    nickName: v(form.nickName),
    gender: v(form.gender),
    birthDate: v(form.birthDate),
    placeOfBirth: v(form.placeOfBirth),
    nationality: v(form.nationality),
    religion: v(form.religion),
    nikPassport: v(form.nikPassport),
    motherName: v(form.motherName),
    maritalStatus: v(form.maritalStatus),
    phone: v(form.phone),
    personalEmail: v(form.personalEmail),
    address: v(form.address),
    addressCurrent: v(form.addressCurrent),
    emergencyContactName: v(form.emergencyContactName),
    emergencyContactPhone: v(form.emergencyContactPhone),
    emergencyContactRelation: v(form.emergencyContactRelation),
    npwp: v(form.npwp),
    kkNumber: v(form.kkNumber),
    bankName: v(form.bankName),
    bankAccountNumber: v(form.bankAccountNumber),
    bankAccountName: v(form.bankAccountName),
    bpjsKesehatanNumber: v(form.bpjsKesehatanNumber),
    bpjsTkNumber: v(form.bpjsTkNumber),
    ktpFiles: v(form.ktpFiles),
    kkFiles: v(form.kkFiles),
    npwpFiles: v(form.npwpFiles),
    photoFiles: v(form.photoFiles),
    ijazahFiles: v(form.ijazahFiles),
    certificateFiles: v(form.certificateFiles),
    seamanBookFiles: v(form.seamanBookFiles),
    bstFiles: v(form.bstFiles),
    medicalCheckupFiles: v(form.medicalCheckupFiles),
    roleId: form.roleId,
    department: v(form.department),
    locationId: v(form.locationId),
    legalEntityId: v(form.legalEntityId),
    businessUnitId: v(form.businessUnitId),
    managerId: v(form.managerId),
    employmentStatus: isFreelance ? 'Freelance' : 'Probation',
    joinDate: form.joinDate,
    contractStartDate: form.joinDate,
    contractEndDate: v(form.probationEndDate),
    ...(isFreelance
      ? { freelanceFee: v(form.freelanceFee), freelanceFeeType: v(form.freelanceFeeType) }
      : { basicSalary: v(form.basicSalary), allowance: v(form.allowance) }),
    isActive: true,
    updatedAt: new Date(),
  }

  const existingEmployeeId = form.candidate?.convertedEmployeeId ?? null
  const employeeNumber = existingEmployeeId ? null : await generateEmployeeNumber(db)
  const employee = await db.$transaction(async tx => {
    const emp = existingEmployeeId
      ? await tx.employee.update({ where: { id: existingEmployeeId }, data })
      : await tx.employee.create({ data: { ...data, id: crypto.randomUUID(), employeeNumber: employeeNumber! } })
    // Guarded on status so a double click can't create two employees.
    const done = await tx.onboardingForm.updateMany({
      where: { id, status: 'APPROVED' },
      data: { status: 'PROBATION_STARTED', employeeId: emp.id, probationStartedAt: new Date() },
    })
    if (done.count !== 1) throw new Error('ALREADY_STARTED')
    if (form.candidate) {
      await tx.candidate.update({ where: { id: form.candidate.id }, data: { status: 'HIRED', convertedEmployeeId: emp.id } })
    }
    return emp
  }).catch(err => {
    if (err instanceof Error && err.message === 'ALREADY_STARTED') return null
    throw err
  })
  if (!employee) return NextResponse.json({ error: 'Probation was already started for this form' }, { status: 409 })

  const updated = await db.onboardingForm.findUnique({ where: { id }, omit: DETAIL_OMIT, include: ONBOARDING_INCLUDE })
  return NextResponse.json({ form: updated, employee: { id: employee.id, employeeNumber: employee.employeeNumber } })
}
