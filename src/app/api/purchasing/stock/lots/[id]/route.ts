import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const lot = await db.stockLot.findUnique({ where: { id } })
  if (!lot) return NextResponse.json({ error: 'Lot not found' }, { status: 404 })

  const { batch, expiresAt } = await req.json()
  const updated = await db.stockLot.update({
    where: { id },
    data: {
      batch: batch === undefined ? undefined : (batch?.trim() || null),
      expiresAt: expiresAt === undefined ? undefined : (expiresAt ? new Date(expiresAt) : null),
    },
  })

  return NextResponse.json(updated)
}
