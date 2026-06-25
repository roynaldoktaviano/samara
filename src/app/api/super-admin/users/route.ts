import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import bcrypt from 'bcryptjs'

async function checkSuperAdmin() {
  const session = await getServerSession(authOptions)
  if (!(session?.user as { isSuperAdmin?: boolean })?.isSuperAdmin) return null
  return session
}

// GET /api/super-admin/users?tenantId=xxx
export async function GET(req: NextRequest) {
  if (!await checkSuperAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenantId = new URL(req.url).searchParams.get('tenantId')
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })

  const userTenants = await centralDb.userTenant.findMany({
    where: { tenantId },
    include: { user: { select: { id: true, email: true, name: true, isActive: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(userTenants.map(ut => ut.user))
}

// POST — create user in tenant DB + register in central
export async function POST(req: NextRequest) {
  if (!await checkSuperAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tenantId, email, name, password, role } = await req.json()
  if (!tenantId || !email || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const tenant = await centralDb.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const hashed = await bcrypt.hash(password, 12)

  // Create user in tenant DB
  const tenantDb = getTenantDb(tenant.databaseUrl)
  // Super admin always assigns ADMIN role
  const tenantUser = await tenantDb.user.create({
    data: { email, name, password: hashed, role: 'ADMIN' },
  })

  // Register in central DB
  const centralUser = await centralDb.centralUser.upsert({
    where: { email },
    update: { name, isActive: true },
    create: { email, name, isSuperAdmin: false },
  })
  await centralDb.userTenant.upsert({
    where: { userId_tenantId: { userId: centralUser.id, tenantId } },
    update: {},
    create: { userId: centralUser.id, tenantId },
  })

  return NextResponse.json({ id: tenantUser.id, email: tenantUser.email, role: tenantUser.role })
}

// DELETE /api/super-admin/users?email=xxx&tenantId=xxx
export async function DELETE(req: NextRequest) {
  if (!await checkSuperAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, tenantId } = await req.json()

  const tenant = await centralDb.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  // Remove from tenant DB
  const tenantDb = getTenantDb(tenant.databaseUrl)
  await tenantDb.user.delete({ where: { email } }).catch(() => {})

  // Remove from central
  const cu = await centralDb.centralUser.findUnique({ where: { email } })
  if (cu) {
    await centralDb.userTenant.deleteMany({ where: { userId: cu.id, tenantId } })
  }

  return NextResponse.json({ ok: true })
}
