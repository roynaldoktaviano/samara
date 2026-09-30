import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { TODO_STATUSES } from '@/lib/todo'

// Kanban drop: rewrites one status column's order (and moves the dragged card into it).
// Body: { status, ids: string[] } — ids in their new top-to-bottom order.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json().catch(() => ({}))
  const status = body.status
  const ids: unknown = body.ids
  if (!TODO_STATUSES.includes(status) || !Array.isArray(ids) || !ids.every(i => typeof i === 'string')) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const owned = await db.todo.findMany({ where: { id: { in: ids as string[] }, userId: session.user.id }, select: { id: true, status: true, completedAt: true } })
  const byId = new Map(owned.map(t => [t.id, t]))
  const done = status === 'DONE'

  await db.$transaction((ids as string[]).filter(id => byId.has(id)).map((id, index) => {
    const t = byId.get(id)!
    return db.todo.update({
      where: { id },
      data: t.status === status
        ? { sortOrder: index }
        : { sortOrder: index, status, completed: done, completedAt: done ? (t.completedAt ?? new Date()) : null },
    })
  }))
  return NextResponse.json({ ok: true })
}
