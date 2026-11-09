import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { activeSuperAdmin, signSuperAdminTicket } from '@/lib/super-admin-enter'

// POST → a ticket back to the Super Admin dashboard, only for an ERP session that a super admin
// opened via "Open ERP" (and only while that super admin account is still active).
export async function POST() {
  const session = await getServerSession(authOptions)
  const id = session?.user?.enteredBySuperAdminId
  if (!id || !(await activeSuperAdmin(id))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ ticket: signSuperAdminTicket({ mode: 'return', superAdminId: id }) })
}
