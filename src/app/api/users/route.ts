import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSessionDb } from '@/lib/session-db'
import { centralDb } from '@/lib/central-db'
import bcrypt from 'bcryptjs'
import { logActivity } from '@/lib/activity'

const STAFF_ROLES = ['SALES', 'FINANCE', 'MARKETING']

export async function GET() {
  const session = await getServerSession(authOptions)
  if (session?.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantDb = getSessionDb(session)
  const users = await tenantDb.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(users)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (session?.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, email, password, role } = await req.json()
  if (!email || !password || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Admin can only create staff, not other admins
  if (!STAFF_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Admin can only create SALES, FINANCE, or MARKETING users' }, { status: 403 })
  }

  const tenantDb = getSessionDb(session)

  const existing = await tenantDb.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(password, 10)
  const user = await tenantDb.user.create({
    data: { name: name || null, email, password: hashed, role },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  })

  // Auto-register staff in central DB under same tenant as the admin
  const tenantId = (session!.user as { tenantId?: string })?.tenantId
  if (tenantId) {
    const cu = await centralDb.centralUser.upsert({
      where: { email },
      update: { name: name || null, isActive: true },
      create: { email, name: name || null, isSuperAdmin: false },
    })
    await centralDb.userTenant.upsert({
      where: { userId_tenantId: { userId: cu.id, tenantId } },
      update: {},
      create: { userId: cu.id, tenantId },
    })
  }

  logActivity({
    userId:   session!.user.id,
    userName: session!.user.name ?? session!.user.email ?? 'Unknown',
    userRole: session!.user.role ?? '',
    action: 'CREATE', entity: 'User', entityId: user.id,
    detail: `Add user: ${user.name ?? user.email} (${user.role})`,
  }).catch(() => {})

  return NextResponse.json(user, { status: 201 })
}
