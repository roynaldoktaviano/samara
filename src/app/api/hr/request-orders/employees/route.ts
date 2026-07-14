import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantBySlug } from '@/lib/resolve-tenant'

// Public, unauthenticated: minimal employee list for the Request Order requester picker.
// No HR-sensitive fields (no resignation data, no legal entity/role detail).
// `?tenant=<slug>` selects which company's employees to show; defaults to 'samara'.
export async function GET(request: NextRequest) {
  const db = await resolveTenantBySlug(request.nextUrl.searchParams.get('tenant'))
  if (!db) return NextResponse.json({ error: 'Unknown or inactive tenant' }, { status: 400 })
  const employees = await db.employee.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true, employeeNumber: true, department: true },
    orderBy: { fullName: 'asc' },
  })
  return NextResponse.json(employees)
}
