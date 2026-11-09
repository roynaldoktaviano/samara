import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { centralDb } from '@/lib/central-db'
import { resolveTenantDbUrl } from '@/lib/tenant-db-url'
import { activeSuperAdmin, ensureTenantSuperAdminUser, signSuperAdminTicket } from '@/lib/super-admin-enter'

// POST { tenantId } → a 60-second single-use ticket the dashboard trades for a tenant ERP
// session (signIn('super-admin-ticket')). The tenant user is created here, not at sign-in,
// so a problem (e.g. the email already belongs to a staff account) reaches the dashboard as a
// readable error instead of a generic failed login.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const superAdmin = await activeSuperAdmin(session.user.id)
  if (!superAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tenantId } = await req.json().catch(() => ({})) as { tenantId?: string }
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
  const tenant = await centralDb.tenant.findUnique({ where: { id: tenantId }, select: { id: true, isActive: true } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  if (!tenant.isActive) return NextResponse.json({ error: 'This tenant is inactive' }, { status: 400 })

  try {
    await ensureTenantSuperAdminUser(await resolveTenantDbUrl(tenant.id), superAdmin)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not prepare the ERP account' }, { status: 409 })
  }
  return NextResponse.json({ ticket: signSuperAdminTicket({ mode: 'enter', superAdminId: superAdmin.id, tenantId: tenant.id }) })
}
