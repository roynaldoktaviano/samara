import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSessionDb } from '@/lib/session-db'
import { centralDb } from '@/lib/central-db'
import bcrypt from 'bcryptjs'
import { logActivity } from '@/lib/activity'

const ALLOWED_ROLES = ['SALES', 'FINANCE', 'MARKETING', 'ADMIN', 'PURCHASING', 'WAREHOUSE', 'HR']

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!['ADMIN', 'SUPER_ADMIN'].includes(session?.user.role ?? '')) {
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
  if (!['ADMIN', 'SUPER_ADMIN'].includes(session?.user.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, email, password, role } = await req.json()
  if (!email || !password || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Only developer can create SUPER_ADMIN — never through this UI
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Cannot assign SUPER_ADMIN role through this interface' }, { status: 403 })
  }

  const tenantDb = getSessionDb(session)

  const normalizedEmail = email.toLowerCase().trim()
  const existing = await tenantDb.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(password, 12)

  // Create in tenant DB first
  let user: { id: string; name: string | null; email: string; role: string; createdAt: Date }
  try {
    user = await tenantDb.user.create({
      data: { name: name || null, email: normalizedEmail, password: hashed, role },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }

  // Register in central DB — if this fails, rollback tenant DB record
  const tenantId = (session!.user as { tenantId?: string })?.tenantId
  if (!tenantId) {
    await tenantDb.user.delete({ where: { id: user.id } }).catch(() => {})
    console.error('[users/POST] session has no tenantId — cannot register in central DB')
    return NextResponse.json({ error: 'Session error — please log out and log back in' }, { status: 400 })
  }

  try {
    const cu = await centralDb.centralUser.upsert({
      where: { email: normalizedEmail },
      update: { name: name || null, isActive: true },
      create: { email: normalizedEmail, name: name || null, isSuperAdmin: false },
    })
    await centralDb.userTenant.upsert({
      where: { userId_tenantId: { userId: cu.id, tenantId } },
      update: {},
      create: { userId: cu.id, tenantId },
    })
  } catch (err) {
    // Rollback: remove from tenant DB so the system stays consistent
    await tenantDb.user.delete({ where: { id: user.id } }).catch(() => {})
    console.error('[users/POST] central DB registration failed, rolled back:', err)
    return NextResponse.json({ error: 'Failed to register user — please try again' }, { status: 500 })
  }

  logActivity({
    userId:   session!.user.id,
    userName: session!.user.name ?? session!.user.email ?? 'Unknown',
    userRole: session!.user.role ?? '',
    action: 'CREATE', entity: 'User', entityId: user.id,
    detail: `Add user: ${user.name ?? user.email} (${user.role})`,
  }, tenantDb).catch(() => {})

  return NextResponse.json(user, { status: 201 })
}
