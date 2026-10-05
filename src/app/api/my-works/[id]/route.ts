import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { parseTodoInput, attachmentsOf, deleteTodoFiles, restrictToProgress, referencedAssignees, notifyNewAssignees, notifyTaskCompleted, logEstimationChanges } from '@/lib/todo'
import { emitTenantEvent } from '@/lib/realtime-bus'

// The owner can change anything; an assignee (on the task or one of its sub tasks) can only
// update progress — see restrictToProgress. Anyone else gets 404 rather than 403 so ids of
// other users' tasks can't be probed.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params
  const me = session.user.id

  const existing = await db.todo.findFirst({
    where: { id, OR: [{ userId: me }, { assigneeIds: { has: me } }, { subAssigneeIds: { has: me } }] },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const isOwner = existing.userId === me

  const raw = await req.json().catch(() => ({}))
  const body = isOwner ? raw : restrictToProgress(raw, existing, me)
  const parsed = parseTodoInput(body, me, existing)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  // restrictToProgress already limits sub task edits to done ticks; keep the stored assignees.
  if (!isOwner && 'subtasks' in parsed.data) parsed.data.subAssigneeIds = existing.subAssigneeIds

  // Cross-check the range when only one end is being changed.
  const start = 'startDate' in parsed.data ? parsed.data.startDate as Date | null : existing.startDate
  const due = 'dueDate' in parsed.data ? parsed.data.dueDate as Date | null : existing.dueDate
  if (start && due && due < start) return NextResponse.json({ error: 'End date must be on or after the start date' }, { status: 400 })

  if (isOwner) {
    const known = new Set([...existing.assigneeIds, ...existing.subAssigneeIds])
    const ids = referencedAssignees(parsed.data).filter(i => !known.has(i))
    if (ids.length && await db.user.count({ where: { id: { in: ids } } }) !== ids.length) {
      return NextResponse.json({ error: 'Unknown assignee' }, { status: 400 })
    }
  }

  const todo = await db.todo.update({
    where: { id }, data: parsed.data,
    // Same shape as GET — the board shows who a task assigned to me is from.
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  if (isOwner && 'attachments' in parsed.data) {
    const kept = new Set(attachmentsOf(todo.attachments).map(a => a.url))
    await deleteTodoFiles(attachmentsOf(existing.attachments).filter(a => !kept.has(a.url)))
  }
  if (isOwner && ('assigneeIds' in parsed.data || 'subtasks' in parsed.data)) {
    await notifyNewAssignees(db, session.user, existing, todo)
  }
  if (!isOwner) await logEstimationChanges(db, session.user, existing, todo)
  if (existing.status !== 'DONE' && todo.status === 'DONE') {
    await notifyTaskCompleted(db, session.user, todo)
  }
  // Owner and every assignee may have this task open — let their boards refresh.
  if (todo.assigneeIds.length || todo.subAssigneeIds.length || existing.assigneeIds.length || existing.subAssigneeIds.length) {
    emitTenantEvent(session.user.tenantId, 'my-works')
  }
  return NextResponse.json({ todo })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params

  const existing = await db.todo.findFirst({ where: { id, userId: session.user.id }, select: { attachments: true, assigneeIds: true, subAssigneeIds: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await db.todo.delete({ where: { id } })
  await deleteTodoFiles(attachmentsOf(existing.attachments))
  if (existing.assigneeIds.length || existing.subAssigneeIds.length) emitTenantEvent(session.user.tenantId, 'my-works')
  return NextResponse.json({ ok: true })
}
