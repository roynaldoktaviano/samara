import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { RECRUITMENT_NOTIFY_KEY, getRecruitmentNotifyUserIds } from '@/lib/hr/recruitment'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

// Who besides HR gets told about every new Recruitment Request (e.g. management).
// GET returns the current picks plus every user to choose from; PUT replaces the list.
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const [userIds, users] = await Promise.all([
    getRecruitmentNotifyUserIds(db),
    db.user.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, email: true, role: true } }),
  ])
  // Drop picks whose user no longer exists so the count shown matches who actually gets it.
  const existing = new Set(users.map(u => u.id))
  return NextResponse.json({ userIds: userIds.filter(id => existing.has(id)), users })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json() as { userIds?: unknown }
  if (!Array.isArray(body.userIds) || !body.userIds.every(v => typeof v === 'string')) {
    return NextResponse.json({ error: 'userIds must be a list of user ids' }, { status: 400 })
  }
  const requested = [...new Set(body.userIds as string[])]
  const found = await db.user.findMany({ where: { id: { in: requested } }, select: { id: true } })
  const userIds = found.map(u => u.id)

  const updatedBy = session.user.name ?? session.user.email ?? 'HR'
  await db.systemSetting.upsert({
    where: { key: RECRUITMENT_NOTIFY_KEY },
    create: { key: RECRUITMENT_NOTIFY_KEY, textValue: JSON.stringify(userIds), updatedBy },
    update: { textValue: JSON.stringify(userIds), updatedBy },
  })

  return NextResponse.json({ userIds })
}
