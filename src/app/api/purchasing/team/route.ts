import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const users = await db.user.findMany({
    where: { role: { in: ['ADMIN', 'PURCHASING', 'WAREHOUSE'] } },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(users)
}
