import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { fullName, appliedRoleId, phone, email, source, resumeFiles, notes, status } = await req.json()

  const candidate = await db.candidate.update({
    where: { id },
    data: {
      ...(fullName !== undefined && { fullName: fullName.trim() }),
      ...(appliedRoleId !== undefined && { appliedRoleId: appliedRoleId || null }),
      ...(phone !== undefined && { phone: phone?.trim() || null }),
      ...(email !== undefined && { email: email?.trim() || null }),
      ...(source !== undefined && { source: source?.trim() || null }),
      ...(resumeFiles !== undefined && { resumeFiles: Array.isArray(resumeFiles) ? resumeFiles : [] }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
      ...(status !== undefined && { status }),
    },
    include: { appliedRole: { select: { id: true, title: true } } },
  })
  return NextResponse.json(candidate)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  await db.candidate.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
