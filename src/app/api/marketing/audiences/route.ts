import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const segments = await db.audienceSegment.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, description: true, sources: true, createdByName: true, createdAt: true, updatedAt: true },
  })
  return NextResponse.json(segments)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { name, description, sources } = await request.json()
  if (!name?.trim() || !sources) {
    return NextResponse.json({ error: 'name and sources are required' }, { status: 400 })
  }

  const segment = await db.audienceSegment.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      sources,
      createdByUserId: session!.user.id,
      createdByName: session!.user.name ?? session!.user.email ?? 'Unknown',
    },
  })

  logActivity({
    userId: session!.user.id,
    userName: session!.user.name ?? session!.user.email ?? 'Unknown',
    userRole: role,
    action: 'CREATE', entity: 'AudienceSegment', entityId: segment.id,
    detail: `Create audience: ${segment.name}`,
  }, db).catch(() => {})

  return NextResponse.json(segment, { status: 201 })
}
