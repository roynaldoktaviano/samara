import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { sendPushToUser } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'

const TODO_COMMENT_MAX_LENGTH = 5000
const author = { select: { id: true, name: true, email: true } }

// Same visibility as the board: owner, task assignees and sub task assignees. Anyone else 404s.
const visibleTo = (id: string, me: string) => ({ id, OR: [{ userId: me }, { assigneeIds: { has: me } }, { subAssigneeIds: { has: me } }] })

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params

  const todo = await db.todo.findFirst({ where: visibleTo(id, session.user.id), select: { id: true } })
  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const comments = await db.todoComment.findMany({ where: { todoId: id }, orderBy: { createdAt: 'asc' }, include: { user: author } })
  return NextResponse.json({ comments })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params
  const me = session.user.id

  const todo = await db.todo.findFirst({ where: visibleTo(id, me), select: { id: true, title: true, userId: true, assigneeIds: true, subAssigneeIds: true } })
  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { body } = await req.json().catch(() => ({}))
  const text = typeof body === 'string' ? body.trim() : ''
  if (!text) return NextResponse.json({ error: 'Comment is empty' }, { status: 400 })
  if (text.length > TODO_COMMENT_MAX_LENGTH) return NextResponse.json({ error: 'Comment is too long' }, { status: 400 })

  const comment = await db.todoComment.create({ data: { todoId: id, userId: me, body: text }, include: { user: author } })

  // Let everyone else on the task know.
  const others = [...new Set([todo.userId, ...todo.assigneeIds, ...todo.subAssigneeIds])].filter(u => u !== me)
  if (others.length) {
    const title = `New comment on: ${todo.title}`
    const msg = `${session.user.name || 'Someone'}: ${text.length > 120 ? text.slice(0, 117) + '...' : text}`
    await db.notification.createMany({ data: others.map(userId => ({ userId, type: 'TASK_COMMENT', title, body: msg })) }).catch(() => {})
    await Promise.all(others.map(u => sendPushToUser(db, u, { title, body: msg, url: '/' }).catch(() => {})))
    emitTenantEvent(session.user.tenantId, 'my-works')
  }
  return NextResponse.json({ comment }, { status: 201 })
}
