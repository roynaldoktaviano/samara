import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

// Email campaigns not yet claimed as any campaign's EMAIL channel — the pick-list for
// "link an existing email campaign" in the Channels tab.
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const emails = await db.emailCampaign.findMany({
    where: { channel: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, status: true },
  })
  return NextResponse.json(emails)
}
