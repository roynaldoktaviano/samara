import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const bands = await db.compensationBand.findMany({
    include: { role: { select: { id: true, title: true } } },
    orderBy: [{ role: { title: 'asc' } }, { level: 'asc' }],
  })
  return NextResponse.json(bands)
}

// Upsert on (roleId, level) — the settings screen edits one cell of a role×level grid
// at a time, so create-if-missing/update-if-present is simpler than separate add/edit flows.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { roleId, level, minSalary, maxSalary } = await req.json()
  if (!roleId || !level) return NextResponse.json({ error: 'roleId and level are required' }, { status: 400 })
  if (!['HIGH', 'MEDIUM', 'LOW'].includes(level)) return NextResponse.json({ error: 'Invalid level' }, { status: 400 })
  const min = parseFloat(minSalary) || 0
  const max = parseFloat(maxSalary) || 0
  if (max < min) return NextResponse.json({ error: 'Max salary cannot be less than min salary' }, { status: 400 })

  const band = await db.compensationBand.upsert({
    where: { roleId_level: { roleId, level } },
    update: { minSalary: min, maxSalary: max },
    create: { id: crypto.randomUUID(), roleId, level, minSalary: min, maxSalary: max },
    include: { role: { select: { id: true, title: true } } },
  })
  return NextResponse.json(band, { status: 201 })
}
