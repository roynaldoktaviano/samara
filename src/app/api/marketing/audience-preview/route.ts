import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { resolveAudience, type AudienceSources } from '@/lib/marketing'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

/** Resolves a proposed audience filter into a count + sample — used while composing a campaign, before it's saved. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const audienceSources = (await req.json()) as AudienceSources
  const audience = await resolveAudience(db, audienceSources)

  return NextResponse.json({ count: audience.length, sample: audience.slice(0, 20) })
}
