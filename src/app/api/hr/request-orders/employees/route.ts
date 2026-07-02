import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Public, unauthenticated: minimal employee list for the Request Order requester picker.
// No HR-sensitive fields (no resignation data, no legal entity/role detail).
export async function GET() {
  const employees = await db.employee.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true, employeeNumber: true, department: true },
    orderBy: { fullName: 'asc' },
  })
  return NextResponse.json(employees)
}
