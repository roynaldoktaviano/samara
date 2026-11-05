import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

// GET/PUT handlers for a SystemSetting row that holds a JSON list of User ids — shared by
// HR › Recruitment's "Notification Recipients" and "Approvers" pickers. GET returns the
// current picks (minus users that no longer exist) plus every user to choose from; PUT
// replaces the list.
export function userListSettingHandlers(key: string) {
  async function GET() {
    const session = await getServerSession(authOptions)
    const role = (session?.user as { role?: string })?.role ?? ''
    if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const db = await getDb(session)

    const [row, users] = await Promise.all([
      db.systemSetting.findUnique({ where: { key } }).catch(() => null),
      db.user.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, email: true, role: true } }),
    ])
    let userIds: string[] = []
    try {
      const parsed = row?.textValue ? JSON.parse(row.textValue) : []
      if (Array.isArray(parsed)) userIds = parsed.filter((v): v is string => typeof v === 'string')
    } catch { /* treat as empty */ }
    const existing = new Set(users.map(u => u.id))
    return NextResponse.json({ userIds: userIds.filter(id => existing.has(id)), users })
  }

  async function PUT(req: NextRequest) {
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
      where: { key },
      create: { key, textValue: JSON.stringify(userIds), updatedBy },
      update: { textValue: JSON.stringify(userIds), updatedBy },
    })

    return NextResponse.json({ userIds })
  }

  return { GET, PUT }
}
