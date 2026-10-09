import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { parseTodoInput, todoUploadPrefix, referencedAssignees, notifyNewAssignees, applyRecurrenceSchedule, spawnRecurringTodos } from '@/lib/todo'
import { emitTenantEvent } from '@/lib/realtime-bus'

// "My Works" — one board per user: their own Todo rows plus tasks other people assigned to
// them (on the task or one of its sub tasks). `?scope=assigned` returns only the latter (sidebar
// badge). No role gate beyond being logged in.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const me = session.user.id
  const assigned = req.nextUrl.searchParams.get('scope') === 'assigned'

  // Repeating tasks whose next date has arrived appear right away, without waiting for the tick.
  const mine = { OR: [{ userId: me }, { assigneeIds: { has: me } }, { subAssigneeIds: { has: me } }] }
  if (await spawnRecurringTodos(db, session.user.tenantId, mine).catch(() => 0)) emitTenantEvent(session.user.tenantId, 'my-works')

  const todos = await db.todo.findMany({
    where: assigned
      ? { userId: { not: me }, OR: [{ assigneeIds: { has: me } }, { subAssigneeIds: { has: me } }] }
      : mine,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  return NextResponse.json({ todos, uploadPrefix: todoUploadPrefix(me) })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json().catch(() => ({}))
  if (!('title' in body)) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  const parsed = parseTodoInput(body, session.user.id)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const recurrenceError = applyRecurrenceSchedule(parsed.data)
  if (recurrenceError) return NextResponse.json({ error: recurrenceError }, { status: 400 })

  const ids = referencedAssignees(parsed.data)
  if (ids.length && await db.user.count({ where: { id: { in: ids } } }) !== ids.length) {
    return NextResponse.json({ error: 'Unknown assignee' }, { status: 400 })
  }

  // New tasks go to the top of their status column.
  const status = (parsed.data.status as string | undefined) ?? 'TODO'
  const first = await db.todo.findFirst({
    where: { userId: session.user.id, status: status as never },
    orderBy: { sortOrder: 'asc' }, select: { sortOrder: true },
  })

  const todo = await db.todo.create({
    data: {
      ...(parsed.data as object),
      title: parsed.data.title as string,
      userId: session.user.id,
      sortOrder: (first?.sortOrder ?? 1) - 1,
    },
  })
  if (ids.length) {
    await notifyNewAssignees(db, session.user, null, todo)
    emitTenantEvent(session.user.tenantId, 'my-works')
  }
  return NextResponse.json({ todo }, { status: 201 })
}
