import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const VIEW_ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR', 'FINANCE']
// Rates feed the auto-suggested BPJS/PPh21 figures on every payroll run — compliance
// sensitive, so only Admin/Super Admin can change them.
const EDIT_ALLOWED = ['ADMIN', 'SUPER_ADMIN']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, VIEW_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const settings = await db.payrollSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} })
  return NextResponse.json(settings)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, EDIT_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()

  const {
    jkkRate, jkmRate, jhtCompanyRate, jhtEmployeeRate, jpCompanyRate, jpEmployeeRate, jpSalaryCap,
    bpjsKesehatanCompanyRate, bpjsKesehatanEmployeeRate, bpjsKesehatanSalaryCap,
    pph21Brackets, ptkpAmounts, positionCostDeductionRate, positionCostDeductionCapMonthly,
  } = body

  const settings = await db.payrollSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {
      jkkRate: jkkRate !== undefined ? Number(jkkRate) : undefined,
      jkmRate: jkmRate !== undefined ? Number(jkmRate) : undefined,
      jhtCompanyRate: jhtCompanyRate !== undefined ? Number(jhtCompanyRate) : undefined,
      jhtEmployeeRate: jhtEmployeeRate !== undefined ? Number(jhtEmployeeRate) : undefined,
      jpCompanyRate: jpCompanyRate !== undefined ? Number(jpCompanyRate) : undefined,
      jpEmployeeRate: jpEmployeeRate !== undefined ? Number(jpEmployeeRate) : undefined,
      jpSalaryCap: jpSalaryCap !== undefined ? Number(jpSalaryCap) : undefined,
      bpjsKesehatanCompanyRate: bpjsKesehatanCompanyRate !== undefined ? Number(bpjsKesehatanCompanyRate) : undefined,
      bpjsKesehatanEmployeeRate: bpjsKesehatanEmployeeRate !== undefined ? Number(bpjsKesehatanEmployeeRate) : undefined,
      bpjsKesehatanSalaryCap: bpjsKesehatanSalaryCap !== undefined ? Number(bpjsKesehatanSalaryCap) : undefined,
      pph21Brackets: pph21Brackets !== undefined ? pph21Brackets : undefined,
      ptkpAmounts: ptkpAmounts !== undefined ? ptkpAmounts : undefined,
      positionCostDeductionRate: positionCostDeductionRate !== undefined ? Number(positionCostDeductionRate) : undefined,
      positionCostDeductionCapMonthly: positionCostDeductionCapMonthly !== undefined ? Number(positionCostDeductionCapMonthly) : undefined,
      updatedById: session.user.id,
    },
  })
  return NextResponse.json(settings)
}
