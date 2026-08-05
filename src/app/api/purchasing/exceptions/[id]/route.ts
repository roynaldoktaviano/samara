import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { resolution } = await req.json()
  if (!resolution?.trim()) return NextResponse.json({ error: 'Resolution text is required' }, { status: 400 })

  const exc = await db.inventoryException.findUnique({ where: { id } })
  if (!exc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (exc.status === 'RESOLVED') return NextResponse.json({ error: 'Already resolved' }, { status: 400 })

  const updated = await db.inventoryException.update({
    where: { id },
    data: { status: 'RESOLVED', resolution: resolution.trim(), resolvedById: session.user.id, resolvedAt: new Date() },
    include: { resolvedBy: { select: { id: true, name: true } } },
  })

  return NextResponse.json(updated)
}
