import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { taskParticipants } from '@/lib/todo'
import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'

// Activity section of a task: comments + automatic estimation-change entries (written by
// logEstimationChanges in src/lib/todo.ts). Open to the owner and anyone assigned to the task
// or one of its sub tasks; everyone else gets 404, same as the task route.
async function load(id: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  const db = await getDb(session)
  const me = session.user.id
  const todo = await db.todo.findFirst({
    where: { id, OR: [{ userId: me }, { assigneeIds: { has: me } }, { subAssigneeIds: { has: me } }] },
    select: { id: true, title: true, userId: true, assigneeIds: true, subAssigneeIds: true },
  })
  return { session, db, me, todo }
}

const include = { user: { select: { id: true, name: true, email: true } } }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await load((await params).id)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.todo) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const activities = await ctx.db.todoActivity.findMany({ where: { todoId: ctx.todo.id }, orderBy: { createdAt: 'asc' }, include })
  return NextResponse.json({ activities })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await load((await params).id)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { session, db, me, todo } = ctx
  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'Comment is empty' }, { status: 400 })
  if (text.length > 5000) return NextResponse.json({ error: 'Comment is too long (max 5000 characters)' }, { status: 400 })

  const activity = await db.todoActivity.create({ data: { todoId: todo.id, userId: me, kind: 'COMMENT', body: text }, include })

  // Bell + push to everyone else on the task.
  const others = taskParticipants(todo).filter(u => u !== me)
  if (others.length) {
    const title = `New comment: ${todo.title}`
    const preview = `${session.user.name || 'Someone'}: ${text.length > 120 ? text.slice(0, 120) + '…' : text}`
    await db.notification.createMany({ data: others.map(userId => ({ userId, type: 'TASK_COMMENT', title, body: preview })) }).catch(() => {})
    sendPushToUsers(db, others, { title, body: preview, url: '/' }).catch(() => {})
  }
  emitTenantEvent(session.user.tenantId, 'my-works')
  return NextResponse.json({ activity }, { status: 201 })
}

// Authors can delete their own comments; estimation entries are a permanent record.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await load((await params).id)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.todo) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const activityId = req.nextUrl.searchParams.get('activityId') ?? ''
  const { count } = await ctx.db.todoActivity.deleteMany({ where: { id: activityId, todoId: ctx.todo.id, userId: ctx.me, kind: 'COMMENT' } })
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  emitTenantEvent(ctx.session.user.tenantId, 'my-works')
  return NextResponse.json({ ok: true })
}
