import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { centralDb } from '@/lib/central-db'

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
    include: { _count: { select: { users: true } } },
  })
  return NextResponse.json(tenants)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !isSuperAdmin(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, slug, databaseUrl, directUrl, domain } = await req.json()
  if (!name || !slug || !databaseUrl) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const tenant = await centralDb.tenant.create({
    data: { name, slug, databaseUrl, directUrl, domain },
  })
  return NextResponse.json(tenant)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !isSuperAdmin(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...data } = await req.json()
  const tenant = await centralDb.tenant.update({ where: { id }, data })
  return NextResponse.json(tenant)
}
