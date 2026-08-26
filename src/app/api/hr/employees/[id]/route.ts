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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const {
    fullName, employeeNumber, legalEntityId, businessUnitId, locationId, department, roleId, level, isActive, resignedAt, resignStatus, resignReason, gender, employmentStatus, leaveBalance, leaveEntitlementPolicy, joinDate, contractStartDate, contractEndDate, managerId, userId, phone, address, birthDate,
    nikPassport, nationality, religion, placeOfBirth, motherName, personalEmail, maritalStatus, addressCurrent,
    emergencyContactName, emergencyContactPhone, emergencyContactRelation,
    npwp, kkNumber, bankName, bankAccountNumber, bankAccountName, bpjsKesehatanNumber, bpjsTkNumber,
    basicSalary, allowance, uangLayar, uangMakan, benefit,
    seamanBookFiles, bstFiles, medicalCheckupFiles, ijazahFiles, certificateFiles,
  } = await req.json()

  if (employeeNumber) {
    const dup = await db.employee.findFirst({ where: { employeeNumber: employeeNumber.trim(), NOT: { id } } })
    if (dup) return NextResponse.json({ error: `Employee number "${employeeNumber}" already exists` }, { status: 409 })
  }

  if (managerId !== undefined && managerId === id) {
    return NextResponse.json({ error: 'An employee cannot be their own manager' }, { status: 400 })
  }

  try {
    const employee = await db.employee.update({
      where: { id },
      data: {
        ...(fullName !== undefined && { fullName: fullName.trim() }),
        ...(employeeNumber !== undefined && { employeeNumber: employeeNumber.trim() }),
        ...(department !== undefined && { department: department?.trim() || null }),
        ...(legalEntityId !== undefined && { legalEntityId: legalEntityId || null }),
        ...(businessUnitId !== undefined && { businessUnitId: businessUnitId || null }),
        ...(locationId !== undefined && { locationId: locationId || null }),
        ...(roleId !== undefined && { roleId: roleId || null }),
        ...(level !== undefined && { level: level || null }),
        ...(gender !== undefined && { gender: gender?.trim() || null }),
        ...(employmentStatus !== undefined && { employmentStatus: employmentStatus?.trim() || null }),
        ...(leaveBalance !== undefined && { leaveBalance: leaveBalance !== '' ? parseInt(leaveBalance) : null }),
        ...(leaveEntitlementPolicy !== undefined && { leaveEntitlementPolicy: leaveEntitlementPolicy?.trim() || null }),
        ...(joinDate !== undefined && { joinDate: joinDate ? new Date(joinDate) : null }),
        ...(contractStartDate !== undefined && { contractStartDate: contractStartDate ? new Date(contractStartDate) : null }),
        ...(contractEndDate !== undefined && { contractEndDate: contractEndDate ? new Date(contractEndDate) : null }),
        ...(managerId !== undefined && { managerId: managerId || null }),
        ...(userId !== undefined && { userId: userId || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(address !== undefined && { address: address?.trim() || null }),
        ...(birthDate !== undefined && { birthDate: birthDate ? new Date(birthDate) : null }),
        ...(nikPassport !== undefined && { nikPassport: nikPassport?.trim() || null }),
        ...(nationality !== undefined && { nationality: nationality?.trim() || null }),
        ...(religion !== undefined && { religion: religion?.trim() || null }),
        ...(placeOfBirth !== undefined && { placeOfBirth: placeOfBirth?.trim() || null }),
        ...(motherName !== undefined && { motherName: motherName?.trim() || null }),
        ...(personalEmail !== undefined && { personalEmail: personalEmail?.trim() || null }),
        ...(maritalStatus !== undefined && { maritalStatus: maritalStatus || null }),
        ...(addressCurrent !== undefined && { addressCurrent: addressCurrent?.trim() || null }),
        ...(emergencyContactName !== undefined && { emergencyContactName: emergencyContactName?.trim() || null }),
        ...(emergencyContactPhone !== undefined && { emergencyContactPhone: emergencyContactPhone?.trim() || null }),
        ...(emergencyContactRelation !== undefined && { emergencyContactRelation: emergencyContactRelation?.trim() || null }),
        ...(npwp !== undefined && { npwp: npwp?.trim() || null }),
        ...(kkNumber !== undefined && { kkNumber: kkNumber?.trim() || null }),
        ...(bankName !== undefined && { bankName: bankName?.trim() || null }),
        ...(bankAccountNumber !== undefined && { bankAccountNumber: bankAccountNumber?.trim() || null }),
        ...(bankAccountName !== undefined && { bankAccountName: bankAccountName?.trim() || null }),
        ...(bpjsKesehatanNumber !== undefined && { bpjsKesehatanNumber: bpjsKesehatanNumber?.trim() || null }),
        ...(bpjsTkNumber !== undefined && { bpjsTkNumber: bpjsTkNumber?.trim() || null }),
        ...(basicSalary !== undefined && { basicSalary: toFloatOrNull(basicSalary) }),
        ...(allowance !== undefined && { allowance: toFloatOrNull(allowance) }),
        ...(uangLayar !== undefined && { uangLayar: toFloatOrNull(uangLayar) }),
        ...(uangMakan !== undefined && { uangMakan: toFloatOrNull(uangMakan) }),
        ...(benefit !== undefined && { benefit: toFloatOrNull(benefit) }),
        ...(seamanBookFiles !== undefined && { seamanBookFiles: Array.isArray(seamanBookFiles) ? seamanBookFiles : [] }),
        ...(bstFiles !== undefined && { bstFiles: Array.isArray(bstFiles) ? bstFiles : [] }),
        ...(medicalCheckupFiles !== undefined && { medicalCheckupFiles: Array.isArray(medicalCheckupFiles) ? medicalCheckupFiles : [] }),
        ...(ijazahFiles !== undefined && { ijazahFiles: Array.isArray(ijazahFiles) ? ijazahFiles : [] }),
        ...(certificateFiles !== undefined && { certificateFiles: Array.isArray(certificateFiles) ? certificateFiles : [] }),
        ...(isActive !== undefined && {
          isActive,
          // Reactivating clears any prior resignation record; deactivating records it from the payload.
          resignedAt: isActive ? null : (resignedAt ? new Date(resignedAt) : new Date()),
          resignStatus: isActive ? null : (resignStatus || null),
          resignReason: isActive ? null : (resignReason?.trim() || null),
        }),
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
    return NextResponse.json(employee)
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'This login account is already linked to another employee' }, { status: 409 })
    }
    throw err
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  await db.employee.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
