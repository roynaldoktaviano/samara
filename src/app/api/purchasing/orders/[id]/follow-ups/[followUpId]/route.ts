import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const WRITE_ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; followUpId: string }> }) {
  const { id, followUpId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, WRITE_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.purchaseFollowUp.findUnique({ where: { id: followUpId }, select: { orderId: true } })
  if (!existing || existing.orderId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.purchaseFollowUp.delete({ where: { id: followUpId } })
  return NextResponse.json({ ok: true })
}
