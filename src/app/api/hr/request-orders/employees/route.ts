import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantByRequestOrderToken } from '@/lib/resolve-tenant'

// Public, unauthenticated: minimal employee list for the Request Order requester picker.
// No HR-sensitive fields (no resignation data, no legal entity/role detail).
// `?token=<per-tenant token>` identifies which company's employees to show.
export async function GET(request: NextRequest) {
  const resolved = await resolveTenantByRequestOrderToken(request.nextUrl.searchParams.get('token'))
  if (!resolved) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  const { db } = resolved
  const employees = await db.employee.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true, employeeNumber: true, department: true },
    orderBy: { fullName: 'asc' },
  })
  return NextResponse.json(employees)
}
