import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'SALES']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const leads = await db.agentLead.findMany({
    orderBy: { name: 'asc' },
    include: {
      contacts: { orderBy: { createdAt: 'asc' } },
      promotedAgent: { select: { id: true, name: true } },
      promotedBy: { select: { name: true } },
    },
  })
  return NextResponse.json(leads)
}
