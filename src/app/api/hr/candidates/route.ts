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
  const candidates = await db.candidate.findMany({
    orderBy: { createdAt: 'desc' },
    include: { appliedRole: { select: { id: true, title: true } } },
  })
  return NextResponse.json(candidates)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { fullName, appliedRoleId, phone, email, source, resumeFiles, notes } = await req.json()
  if (!fullName?.trim()) return NextResponse.json({ error: 'Full name is required' }, { status: 400 })

  const candidate = await db.candidate.create({
    data: {
      id: crypto.randomUUID(),
      fullName: fullName.trim(),
      appliedRoleId: appliedRoleId || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      source: source?.trim() || null,
      resumeFiles: Array.isArray(resumeFiles) ? resumeFiles : [],
      notes: notes?.trim() || null,
      updatedAt: new Date(),
    },
    include: { appliedRole: { select: { id: true, title: true } } },
  })
  return NextResponse.json(candidate, { status: 201 })
}
