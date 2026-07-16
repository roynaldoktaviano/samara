import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'SALES']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { status } = await req.json()
  if (status !== 'NEW' && status !== 'DISCARDED') return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const existing = await db.agentLead.findUnique({ where: { id }, select: { status: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'PROMOTED') return NextResponse.json({ error: 'This lead has already been promoted to an Agent' }, { status: 409 })

  const updated = await db.agentLead.update({
    where: { id },
    data: { status, discardedAt: status === 'DISCARDED' ? new Date() : null },
  })
  return NextResponse.json(updated)
}
