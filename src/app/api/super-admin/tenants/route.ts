import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { parseTenantFeatures } from '@/lib/tenant-features'
import { logSuperAdmin } from '@/lib/super-admin-log'
import { setTenantSecrets, getTenantSecretStatus } from '@/lib/tenant-secrets'
import crypto from 'crypto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSuperAdmin(session: any) {
  return session?.user?.isSuperAdmin === true
}

export async function GET() {
  const session = await getServerSession(authOptions)
  console.log('[tenants] session.user:', JSON.stringify(session?.user))
  if (!session || !isSuperAdmin(session)) return NextResponse.json({ error: 'Unauthorized', user: session?.user }, { status: 401 })

  const tenants = await centralDb.tenant.findMany({
    orderBy: { createdAt: 'asc' },
  })

  // Get actual user count from each tenant DB (not central UserTenant count)
  const tenantsWithCount = await Promise.all(
    tenants.map(async (tenant) => {
      const tenantDb = getTenantDb(tenant.databaseUrl)
      const userCount = await tenantDb.user.count({ where: { role: 'ADMIN' } }).catch(() => 0)
      const secretsStatus = await getTenantSecretStatus(tenant.id)
      const { secrets: _secrets, ...tenantSafe } = tenant
      return { ...tenantSafe, _count: { users: userCount }, secretsStatus }
    })
  )

  return NextResponse.json(tenantsWithCount)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !isSuperAdmin(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, slug, databaseUrl, directUrl, domain } = await req.json()
  if (!name || !slug || !databaseUrl) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (!/^[a-z0-9-]{2,50}$/.test(slug)) return NextResponse.json({ error: 'Slug must be 2–50 lowercase letters, numbers, or hyphens' }, { status: 400 })

  const tenant = await centralDb.tenant.create({
    data: { name, slug, databaseUrl, directUrl, domain },
  })
  logSuperAdmin({ adminEmail: session.user!.email!, action: 'CREATE_TENANT', targetType: 'tenant', targetId: tenant.id, detail: `Created tenant: ${name} (${slug})` })
  return NextResponse.json(tenant)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !isSuperAdmin(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, features, secrets, regenerateRequestOrderToken, ...rest } = await req.json()
  const data = {
    ...rest,
    ...(features !== undefined ? { features: parseTenantFeatures(features) } : {}),
    ...(regenerateRequestOrderToken ? { requestOrderToken: crypto.randomBytes(24).toString('hex') } : {}),
  }
  try {
    if (secrets !== undefined) {
      await setTenantSecrets(id, secrets)
    }
    const tenant = Object.keys(data).length > 0
      ? await centralDb.tenant.update({ where: { id }, data })
      : await centralDb.tenant.findUnique({ where: { id } })
    const actionLabel = regenerateRequestOrderToken ? 'REGENERATE_REQUEST_ORDER_TOKEN' : (secrets !== undefined ? 'UPDATE_SECRETS' : (features !== undefined ? 'TOGGLE_FEATURE' : 'UPDATE_TENANT'))
    const detail = regenerateRequestOrderToken ? 'Regenerated request-order link token' : (secrets !== undefined ? `Updated secrets: ${Object.keys(secrets).join(', ')}` : JSON.stringify(features ?? rest))
    logSuperAdmin({ adminEmail: session.user!.email!, action: actionLabel, targetType: 'tenant', targetId: id, detail })
    const { secrets: _secrets, ...tenantSafe } = tenant ?? {}
    return NextResponse.json(tenantSafe)
  } catch (e) {
    console.error('[super-admin/tenants PATCH]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to update tenant' }, { status: 500 })
  }
}
