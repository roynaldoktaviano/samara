import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params

  const segment = await db.audienceSegment.findUnique({ where: { id } })
  if (!segment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(segment)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params

  const { name, description, sources } = await req.json()
  if (!name?.trim() || !sources) {
    return NextResponse.json({ error: 'name and sources are required' }, { status: 400 })
  }

  const segment = await db.audienceSegment.update({
    where: { id },
    data: { name: name.trim(), description: description?.trim() || null, sources },
  }).catch(() => null)
  if (!segment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  logActivity({
    userId: session!.user.id,
    userName: session!.user.name ?? session!.user.email ?? 'Unknown',
    userRole: role,
    action: 'UPDATE', entity: 'AudienceSegment', entityId: segment.id,
    detail: `Update audience: ${segment.name}`,
  }, db).catch(() => {})

  return NextResponse.json(segment)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params

  const segment = await db.audienceSegment.delete({ where: { id } }).catch(() => null)
  if (!segment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  logActivity({
    userId: session!.user.id,
    userName: session!.user.name ?? session!.user.email ?? 'Unknown',
    userRole: role,
    action: 'DELETE', entity: 'AudienceSegment', entityId: segment.id,
    detail: `Delete audience: ${segment.name}`,
  }, db).catch(() => {})

  return NextResponse.json({ ok: true })
}
