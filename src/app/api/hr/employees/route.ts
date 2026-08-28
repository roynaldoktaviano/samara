import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

function toFloatOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = parseFloat(v as string)
  return Number.isNaN(n) ? null : n
}

async function generateEmployeeNumber(db: Awaited<ReturnType<typeof getDb>>) {
  const prefix = 'EMP-'
  const last = await db.employee.findFirst({ where: { employeeNumber: { startsWith: prefix } }, orderBy: { employeeNumber: 'desc' }, select: { employeeNumber: true } })
  const seq = last ? (parseInt(last.employeeNumber.slice(prefix.length)) || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const employees = await db.employee.findMany({
    orderBy: { fullName: 'asc' },
    include: {
      legalEntity: true,
      businessUnit: true,
      location: { select: { id: true, name: true } },
      role: true,
      manager: { select: { id: true, fullName: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  })
  return NextResponse.json(employees)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const {
    fullName, employeeNumber, legalEntityId, businessUnitId, locationId, department, roleId, level, gender, employmentStatus, leaveBalance, leaveEntitlementPolicy, joinDate, contractStartDate, contractEndDate, managerId, userId, phone, address, birthDate,
    nikPassport, nationality, religion, placeOfBirth, motherName, personalEmail, maritalStatus, addressCurrent,
    emergencyContactName, emergencyContactPhone, emergencyContactRelation,
    npwp, kkNumber, bankName, bankAccountNumber, bankAccountName, bpjsKesehatanNumber, bpjsTkNumber,
    basicSalary, allowance, uangLayar, uangMakan, thr, otherIncome,
    seamanBookFiles, bstFiles, medicalCheckupFiles, ijazahFiles, certificateFiles, contractFiles,
  } = await req.json()
  if (!fullName?.trim()) return NextResponse.json({ error: 'Full name is required' }, { status: 400 })

  const number = employeeNumber?.trim() || await generateEmployeeNumber(db)
  const existing = await db.employee.findUnique({ where: { employeeNumber: number } })
  if (existing) return NextResponse.json({ error: `Employee number "${number}" already exists` }, { status: 409 })

  try {
    const employee = await db.employee.create({
      data: {
        id: crypto.randomUUID(),
        employeeNumber: number,
        fullName: fullName.trim(),
        department: department?.trim() || null,
        legalEntityId: legalEntityId || null,
        businessUnitId: businessUnitId || null,
        locationId: locationId || null,
        roleId: roleId || null,
        level: level || null,
        gender: gender?.trim() || null,
        employmentStatus: employmentStatus?.trim() || null,
        leaveBalance: leaveBalance !== undefined && leaveBalance !== '' ? parseInt(leaveBalance) : null,
        leaveEntitlementPolicy: leaveEntitlementPolicy?.trim() || null,
        joinDate: joinDate ? new Date(joinDate) : null,
        contractStartDate: contractStartDate ? new Date(contractStartDate) : null,
        contractEndDate: contractEndDate ? new Date(contractEndDate) : null,
        managerId: managerId || null,
        userId: userId || null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        nikPassport: nikPassport?.trim() || null,
        nationality: nationality?.trim() || null,
        religion: religion?.trim() || null,
        placeOfBirth: placeOfBirth?.trim() || null,
        motherName: motherName?.trim() || null,
        personalEmail: personalEmail?.trim() || null,
        maritalStatus: maritalStatus || null,
        addressCurrent: addressCurrent?.trim() || null,
        emergencyContactName: emergencyContactName?.trim() || null,
        emergencyContactPhone: emergencyContactPhone?.trim() || null,
        emergencyContactRelation: emergencyContactRelation?.trim() || null,
        npwp: npwp?.trim() || null,
        kkNumber: kkNumber?.trim() || null,
        bankName: bankName?.trim() || null,
        bankAccountNumber: bankAccountNumber?.trim() || null,
        bankAccountName: bankAccountName?.trim() || null,
        bpjsKesehatanNumber: bpjsKesehatanNumber?.trim() || null,
        bpjsTkNumber: bpjsTkNumber?.trim() || null,
        basicSalary: toFloatOrNull(basicSalary),
        allowance: toFloatOrNull(allowance),
        uangLayar: toFloatOrNull(uangLayar),
        uangMakan: toFloatOrNull(uangMakan),
        thr: toFloatOrNull(thr),
        otherIncome: Array.isArray(otherIncome) ? otherIncome : [],
        seamanBookFiles: Array.isArray(seamanBookFiles) ? seamanBookFiles : [],
        bstFiles: Array.isArray(bstFiles) ? bstFiles : [],
        medicalCheckupFiles: Array.isArray(medicalCheckupFiles) ? medicalCheckupFiles : [],
        ijazahFiles: Array.isArray(ijazahFiles) ? ijazahFiles : [],
        certificateFiles: Array.isArray(certificateFiles) ? certificateFiles : [],
        contractFiles: Array.isArray(contractFiles) ? contractFiles : [],
        updatedAt: new Date(),
      },
      include: {
        legalEntity: true,
        businessUnit: true,
        location: { select: { id: true, name: true } },
        role: true,
        manager: { select: { id: true, fullName: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    })
    return NextResponse.json(employee, { status: 201 })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'This login account is already linked to another employee' }, { status: 409 })
    }
    throw err
  }
}
